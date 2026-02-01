/**
 * Mutation Log - Tracks DOM Changes for Ghost State Detection (V3 Advanced)
 * 
 * PROBLEM SOLVED:
 * Static DOM snapshots miss transient events. If a user clicks "Submit" and 
 * a success toast appears for 2 seconds and vanishes, the next snapshot 
 * might miss it entirely. The LLM won't know if the action succeeded.
 * 
 * SOLUTION:
 * Maintain a running buffer of "important" DOM changes over the last 5 seconds.
 * Send this mutation log alongside the JSON tree so the LLM can see:
 * - "Added text: 'Saved Successfully'" 
 * - "Removed button: 'Submit'"
 * - "Error appeared: 'Invalid email'"
 * 
 * This gives the LLM temporal awareness - it can see what happened between
 * snapshots, preventing it from hallucinating success when errors occurred.
 * 
 * Reference: DOM_EXTRACTION_ARCHITECTURE.md
 */

export interface MutationEntry {
  /** Timestamp when mutation occurred */
  timestamp: number;
  
  /** Type of mutation: 'added', 'removed', 'changed' */
  type: 'added' | 'removed' | 'changed';
  
  /** Category: 'text', 'element', 'error', 'success', 'warning', 'loading' */
  category: 'text' | 'element' | 'error' | 'success' | 'warning' | 'loading' | 'form';
  
  /** Human-readable description */
  description: string;
  
  /** Optional element tag/role */
  elementType?: string;
}

/** Maximum entries to keep in the buffer */
const MAX_ENTRIES = 50;

/** How long to keep entries (5 seconds) */
const ENTRY_TTL_MS = 5000;

/** Buffer of recent mutations */
let mutationBuffer: MutationEntry[] = [];

/** MutationObserver instance */
let observer: MutationObserver | null = null;

/** Whether the logger is active */
let isActive = false;

// =============================================================================
// MUTATION DETECTION PATTERNS
// =============================================================================

/** Patterns that indicate success messages */
const SUCCESS_PATTERNS = [
  /success/i,
  /saved/i,
  /completed/i,
  /done/i,
  /thank you/i,
  /confirmed/i,
  /submitted/i,
  /updated/i,
  /created/i,
  /sent/i,
];

/** Patterns that indicate error messages */
const ERROR_PATTERNS = [
  /error/i,
  /failed/i,
  /invalid/i,
  /incorrect/i,
  /wrong/i,
  /required/i,
  /missing/i,
  /cannot/i,
  /unable/i,
  /problem/i,
  /issue/i,
];

/** Patterns that indicate warning messages */
const WARNING_PATTERNS = [
  /warning/i,
  /caution/i,
  /attention/i,
  /notice/i,
  /important/i,
];

/** Patterns that indicate loading states */
const LOADING_PATTERNS = [
  /loading/i,
  /please wait/i,
  /processing/i,
  /submitting/i,
  /saving/i,
  /\.{3}$/,  // Ends with ...
];

/**
 * Categorize text content based on patterns
 */
function categorizeText(text: string): MutationEntry['category'] {
  if (ERROR_PATTERNS.some(p => p.test(text))) return 'error';
  if (SUCCESS_PATTERNS.some(p => p.test(text))) return 'success';
  if (WARNING_PATTERNS.some(p => p.test(text))) return 'warning';
  if (LOADING_PATTERNS.some(p => p.test(text))) return 'loading';
  return 'text';
}

/**
 * Check if a node is a meaningful text node (not just whitespace/scripts)
 */
function isMeaningfulNode(node: Node): boolean {
  // Skip script, style, meta tags
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as Element;
    const tag = el.tagName.toLowerCase();
    if (['script', 'style', 'meta', 'link', 'noscript', 'svg', 'path'].includes(tag)) {
      return false;
    }
  }
  
  // For text nodes, check if it has meaningful content
  if (node.nodeType === Node.TEXT_NODE) {
    const text = node.textContent?.trim() || '';
    return text.length >= 3 && text.length <= 200;
  }
  
  // For element nodes, check if they have visible text
  if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    const text = el.innerText?.trim() || '';
    return text.length >= 3 && text.length <= 200;
  }
  
  return false;
}

/**
 * Check if element looks like a toast/notification/alert
 */
function looksLikeNotification(el: unknown): boolean {
  // Guard: MutationObserver can hand us Text nodes or other non-Elements.
  if (!(el instanceof Element)) return false;

  const className =
    typeof (el as any).className === 'string' ? ((el as any).className as string).toLowerCase() : '';
  const role = el.getAttribute('role')?.toLowerCase() || '';
  const ariaLive = el.getAttribute('aria-live');
  
  // Check common notification indicators
  if (role === 'alert' || role === 'status' || role === 'alertdialog') return true;
  if (ariaLive === 'polite' || ariaLive === 'assertive') return true;
  if (className.includes('toast')) return true;
  if (className.includes('notification')) return true;
  if (className.includes('alert')) return true;
  if (className.includes('snackbar')) return true;
  if (className.includes('message')) return true;
  if (className.includes('banner')) return true;
  
  return false;
}

/**
 * Add a mutation entry to the buffer
 */
function addEntry(entry: Omit<MutationEntry, 'timestamp'>): void {
  const fullEntry: MutationEntry = {
    ...entry,
    timestamp: Date.now(),
  };
  
  mutationBuffer.push(fullEntry);
  
  // Trim to max size
  if (mutationBuffer.length > MAX_ENTRIES) {
    mutationBuffer = mutationBuffer.slice(-MAX_ENTRIES);
  }
  
  // Log for debugging
  console.log(`[MutationLog] ${entry.type}: ${entry.description}`);
}

/**
 * Process mutations from the MutationObserver
 */
function processMutations(mutations: MutationRecord[]): void {
  for (const mutation of mutations) {
    // Handle added nodes
    if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
      mutation.addedNodes.forEach(node => {
        if (!isMeaningfulNode(node)) return;
        
        let text = '';
        let elementType = '';
        
        if (node.nodeType === Node.TEXT_NODE) {
          text = node.textContent?.trim() || '';
        } else if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          text = el.innerText?.trim() || '';
          elementType = el.tagName.toLowerCase();
          
          // Prioritize notifications
          if (looksLikeNotification(el)) {
            const category = categorizeText(text);
            addEntry({
              type: 'added',
              category,
              description: `${category === 'error' ? 'Error' : category === 'success' ? 'Success' : 'Alert'}: "${text.substring(0, 50)}"`,
              elementType: 'notification',
            });
            return;
          }
        }
        
        if (text.length >= 3) {
          const category = categorizeText(text);
          const desc = text.length > 50 ? text.substring(0, 47) + '...' : text;
          
          // Only log meaningful changes (errors, success, form-related)
          if (category !== 'text' || looksLikeNotification(node)) {
            addEntry({
              type: 'added',
              category,
              description: `Added ${category}: "${desc}"`,
              elementType,
            });
          }
        }
      });
    }
    
    // Handle removed nodes
    if (mutation.type === 'childList' && mutation.removedNodes.length > 0) {
      mutation.removedNodes.forEach(node => {
        if (!isMeaningfulNode(node)) return;
        
        if (node.nodeType === Node.ELEMENT_NODE) {
          const el = node as HTMLElement;
          const text = el.innerText?.trim() || '';
          const elementType = el.tagName.toLowerCase();
          
          // Only log removal of buttons, forms, and notifications
          if (['button', 'form', 'input'].includes(elementType) || looksLikeNotification(el)) {
            const desc = text.length > 50 ? text.substring(0, 47) + '...' : text;
            addEntry({
              type: 'removed',
              category: 'element',
              description: `Removed ${elementType}: "${desc}"`,
              elementType,
            });
          }
        }
      });
    }
    
    // Handle attribute changes (for aria-*, disabled state changes)
    if (mutation.type === 'attributes') {
      const el = mutation.target as HTMLElement;
      const attr = mutation.attributeName;
      
      // Track important attribute changes
      if (attr === 'disabled') {
        const isDisabled = el.hasAttribute('disabled');
        const name = el.innerText?.trim().substring(0, 30) || el.getAttribute('name') || el.tagName;
        addEntry({
          type: 'changed',
          category: 'form',
          description: `${isDisabled ? 'Disabled' : 'Enabled'}: "${name}"`,
          elementType: el.tagName.toLowerCase(),
        });
      }
      
      if (attr === 'aria-invalid' && el.getAttribute('aria-invalid') === 'true') {
        const name = el.getAttribute('name') || el.getAttribute('aria-label') || 'input';
        addEntry({
          type: 'changed',
          category: 'error',
          description: `Validation error on: "${name}"`,
          elementType: el.tagName.toLowerCase(),
        });
      }
    }
  }
}

// =============================================================================
// PUBLIC API
// =============================================================================

/**
 * Start the mutation logger
 * Should be called when the content script initializes
 */
export function startMutationLogger(): void {
  if (isActive) return;
  
  observer = new MutationObserver(processMutations);
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['disabled', 'aria-invalid', 'aria-hidden', 'class'],
  });
  
  isActive = true;
  console.log('[MutationLog] Started mutation logging');
}

/**
 * Stop the mutation logger
 */
export function stopMutationLogger(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  isActive = false;
  console.log('[MutationLog] Stopped mutation logging');
}

/**
 * Get recent mutations (last 5 seconds)
 * 
 * @param maxEntries - Maximum number of entries to return (default 10)
 * @returns Array of formatted mutation strings for LLM consumption
 */
export function getRecentMutations(maxEntries = 10): string[] {
  const now = Date.now();
  
  // Filter to entries within TTL
  const recentEntries = mutationBuffer.filter(
    entry => now - entry.timestamp <= ENTRY_TTL_MS
  );
  
  // Return most recent entries as formatted strings
  return recentEntries
    .slice(-maxEntries)
    .map(entry => {
      const age = Math.round((now - entry.timestamp) / 1000);
      return `[${age}s ago] ${entry.description}`;
    });
}

/**
 * Get recent mutations as structured data
 */
export function getRecentMutationsStructured(maxEntries = 10): MutationEntry[] {
  const now = Date.now();
  
  return mutationBuffer
    .filter(entry => now - entry.timestamp <= ENTRY_TTL_MS)
    .slice(-maxEntries);
}

/**
 * Clear the mutation buffer
 */
export function clearMutationBuffer(): void {
  mutationBuffer = [];
}

/**
 * Check if any errors were detected recently
 */
export function hasRecentErrors(): boolean {
  const now = Date.now();
  return mutationBuffer.some(
    entry => entry.category === 'error' && now - entry.timestamp <= ENTRY_TTL_MS
  );
}

/**
 * Check if any success messages were detected recently
 */
export function hasRecentSuccess(): boolean {
  const now = Date.now();
  return mutationBuffer.some(
    entry => entry.category === 'success' && now - entry.timestamp <= ENTRY_TTL_MS
  );
}

/**
 * Get a summary of recent mutations for the LLM payload
 */
export function getMutationSummary(): {
  recent_events: string[];
  has_errors: boolean;
  has_success: boolean;
} {
  return {
    recent_events: getRecentMutations(10),
    has_errors: hasRecentErrors(),
    has_success: hasRecentSuccess(),
  };
}
