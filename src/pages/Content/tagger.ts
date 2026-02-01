/**
 * Persistent Element Tagger - "Tag & Freeze" Strategy (V2)
 * 
 * This module ensures every interactive element has a stable `data-llm-id` attribute
 * that persists across re-renders. This solves the "Element with id X not found" errors
 * on dynamic sites like Google where IDs calculated during extraction become stale.
 * 
 * V2 UPGRADES:
 * - Uses query-selector-shadow-dom library to pierce Shadow DOM boundaries
 * - Tracks whether element is inside a Shadow Root (is_in_shadow)
 * - Tracks frame ID for iframe support
 * - Supports distributed extraction across frames
 * 
 * The key insight: Instead of calculating IDs during extraction (which can drift),
 * we inject permanent IDs into the DOM itself. The ID is physically stamped on the element.
 * 
 * Reference: DOM_EXTRACTION_ARCHITECTURE.md
 */

// V2: Use query-selector-shadow-dom for Shadow DOM piercing
import { querySelectorAllDeep, querySelectorDeep } from 'query-selector-shadow-dom';

/** The attribute name for our stable element IDs */
export const LLM_ID_ATTR = 'data-llm-id';

/** Attribute to mark elements inside Shadow DOM */
export const SHADOW_ATTR = 'data-llm-in-shadow';

/** Attribute for frame identification */
export const FRAME_ATTR = 'data-llm-frame-id';

/** Counter for generating unique IDs - persists across tagging calls */
let uniqueIdCounter = 1;

/** Set of already-tagged elements (WeakSet to allow GC) */
const taggedElements = new WeakSet<Element>();

/** MutationObserver instance for auto-tagging new elements */
let observer: MutationObserver | null = null;

/** Current frame ID (set on initialization) */
let currentFrameId = 0;

/**
 * Interactive element selectors - elements that can be acted upon by the LLM
 * V2: These work with querySelectorAllDeep to pierce Shadow DOM
 */
const INTERACTIVE_SELECTORS = [
  'a[href]',              // Links with actual hrefs
  'button',               // Buttons
  'input',                // All input types
  'textarea',             // Text areas
  'select',               // Dropdowns
  '[role="button"]',      // ARIA buttons
  '[role="link"]',        // ARIA links
  '[role="menuitem"]',    // Menu items
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',      // Select options
  '[role="tab"]',         // Tabs
  '[role="treeitem"]',    // Tree items
  '[role="checkbox"]',    // ARIA checkboxes
  '[role="radio"]',       // ARIA radios
  '[role="switch"]',      // Toggle switches
  '[role="combobox"]',    // Comboboxes
  '[role="listbox"]',     // Listboxes
  '[role="textbox"]',     // ARIA textboxes
  '[role="searchbox"]',   // Search inputs
  '[role="spinbutton"]',  // Number spinners
  '[role="slider"]',      // Sliders
  '[onclick]',            // Elements with click handlers
  '[tabindex]:not([tabindex="-1"])', // Focusable elements
  '[contenteditable="true"]',        // Editable content
].join(', ');

/**
 * Check if an element is inside a Shadow DOM
 * V2: New function to detect Shadow DOM containment
 */
function isInShadowDom(el: Element): boolean {
  let parent = el.parentNode;
  while (parent) {
    if (parent instanceof ShadowRoot) {
      return true;
    }
    parent = parent.parentNode;
  }
  return false;
}

/**
 * Get the Shadow Root that contains this element (if any)
 */
function getContainingShadowRoot(el: Element): ShadowRoot | null {
  let parent = el.parentNode;
  while (parent) {
    if (parent instanceof ShadowRoot) {
      return parent;
    }
    parent = parent.parentNode;
  }
  return null;
}

/**
 * Check if an element is visible and can be interacted with
 */
function isVisibleAndInteractive(el: Element): boolean {
  // Must be an HTMLElement to check computed style
  if (!(el instanceof HTMLElement)) return false;
  
  try {
    const style = window.getComputedStyle(el);
    
    // Skip hidden elements
    if (style.display === 'none') return false;
    if (style.visibility === 'hidden') return false;
    if (style.opacity === '0') return false;
    
    // Skip elements with aria-hidden
    if (el.getAttribute('aria-hidden') === 'true') return false;
    
    // Skip elements with hidden attribute
    if (el.hasAttribute('hidden')) return false;
    
    // Skip input type="hidden"
    if (el.tagName === 'INPUT' && (el as HTMLInputElement).type === 'hidden') return false;
    
    // Check if element has dimensions (not zero-sized)
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return false;
    
    return true;
  } catch (error) {
    // If we can't determine visibility, assume not visible
    console.debug('[Tagger] Error checking visibility:', error);
    return false;
  }
}

/**
 * Tag a single element with a stable ID if it's interactive and visible
 * V2: Also tracks Shadow DOM containment and frame ID
 * 
 * @param el - Element to potentially tag
 * @returns true if element was tagged, false otherwise
 */
function tagElement(el: Element): boolean {
  // Skip if already tagged
  if (el.hasAttribute(LLM_ID_ATTR)) return false;
  if (taggedElements.has(el)) return false;
  
  // Skip if not visible/interactive
  if (!isVisibleAndInteractive(el)) return false;
  
  // Assign the permanent ID
  const id = String(uniqueIdCounter++);
  el.setAttribute(LLM_ID_ATTR, id);
  
  // V2: Track if element is inside Shadow DOM
  const inShadow = isInShadowDom(el);
  if (inShadow) {
    el.setAttribute(SHADOW_ATTR, 'true');
  }
  
  // V2: Track frame ID
  el.setAttribute(FRAME_ATTR, String(currentFrameId));
  
  taggedElements.add(el);
  
  return true;
}

/**
 * Ensure all interactive elements in a subtree have stable IDs.
 * V2: Uses querySelectorAllDeep to pierce Shadow DOM boundaries.
 * This is idempotent - calling it multiple times is safe.
 * 
 * @param root - Root element to search within (defaults to document.body)
 * @returns Number of newly tagged elements
 */
export function ensureStableIds(root: Element | Document = document): number {
  // Guard against invalid root
  if (!root) {
    console.warn('[Tagger] ensureStableIds called with null/undefined root');
    return 0;
  }
  
  // Get the actual root element
  const rootElement = root instanceof Document ? root.body : root;
  if (!rootElement) {
    console.warn('[Tagger] No root element available for tagging');
    return 0;
  }
  
  let taggedCount = 0;
  let shadowCount = 0;
  
  try {
    // V2: Use querySelectorAllDeep to find elements INSIDE Shadow DOMs
    // This is the key upgrade - standard querySelectorAll stops at shadow boundaries
    const candidates = querySelectorAllDeep(INTERACTIVE_SELECTORS, rootElement);
    
    candidates.forEach(el => {
      if (tagElement(el)) {
        taggedCount++;
        if (isInShadowDom(el)) {
          shadowCount++;
        }
      }
    });
    
    // Also check if root itself is interactive
    if (rootElement instanceof Element && rootElement.matches(INTERACTIVE_SELECTORS)) {
      if (tagElement(rootElement)) {
        taggedCount++;
      }
    }
    
    if (taggedCount > 0) {
      console.debug(`[Tagger] Tagged ${taggedCount} new elements (${shadowCount} in Shadow DOM, total IDs: ${uniqueIdCounter - 1})`);
    }
  } catch (error) {
    console.error('[Tagger] Error during tagging:', error);
    
    // V2: Fallback to standard querySelectorAll if library fails
    try {
      console.warn('[Tagger] Falling back to standard querySelectorAll');
      const fallbackCandidates = rootElement.querySelectorAll(INTERACTIVE_SELECTORS);
      fallbackCandidates.forEach(el => {
        if (tagElement(el)) {
          taggedCount++;
        }
      });
    } catch (fallbackError) {
      console.error('[Tagger] Fallback also failed:', fallbackError);
    }
  }
  
  return taggedCount;
}

/**
 * Start the MutationObserver to automatically tag new elements as they appear.
 * This is crucial for dynamic sites that load content after initial page load.
 * 
 * The observer is debounced to avoid excessive tagging during rapid DOM changes.
 */
export function startAutoTagger(): void {
  // Don't start if already running
  if (observer) {
    console.debug('[Tagger] Auto-tagger already running');
    return;
  }
  
  // Guard against invalid document state
  if (typeof document === 'undefined' || !document.body) {
    console.warn('[Tagger] Cannot start auto-tagger - document not ready');
    return;
  }
  
  // Debounce timer
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;
  const DEBOUNCE_MS = 100; // Wait 100ms after mutations settle
  
  /**
   * Handle mutations - debounced to batch rapid changes
   */
  function handleMutations(mutations: MutationRecord[]): void {
    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }
    
    // Schedule tagging after debounce period
    debounceTimer = setTimeout(() => {
      // Only re-tag if there were actual node additions
      const hasAddedNodes = mutations.some(m => m.addedNodes.length > 0);
      
      if (hasAddedNodes) {
        ensureStableIds();
      }
    }, DEBOUNCE_MS);
  }
  
  // Create the observer
  observer = new MutationObserver(handleMutations);
  
  // Start observing
  observer.observe(document.body, {
    childList: true,    // Watch for added/removed nodes
    subtree: true,      // Watch entire subtree
    // We don't need attributes - we only care about new elements
  });
  
  // Do initial tagging
  ensureStableIds();
  
  console.log('[Tagger] Auto-tagger started');
}

/**
 * Stop the MutationObserver
 */
export function stopAutoTagger(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
    console.log('[Tagger] Auto-tagger stopped');
  }
}

/**
 * Get the stable ID for an element
 * 
 * @param el - Element to get ID for
 * @returns The stable ID or null if not tagged
 */
export function getStableId(el: Element): string | null {
  return el.getAttribute(LLM_ID_ATTR);
}

/**
 * Find an element by its stable ID
 * 
 * @param id - The stable ID to search for
 * @returns The element or null if not found
 */
export function findElementByStableId(id: string): Element | null {
  return document.querySelector(`[${LLM_ID_ATTR}="${id}"]`);
}

/**
 * Get all elements with stable IDs
 * 
 * @returns NodeList of all tagged elements
 */
export function getAllTaggedElements(): NodeListOf<Element> {
  return document.querySelectorAll(`[${LLM_ID_ATTR}]`);
}

/**
 * Reset the tagger state (for testing or page unload)
 * This clears the counter and stops auto-tagging.
 */
export function resetTagger(): void {
  stopAutoTagger();
  uniqueIdCounter = 1;
  currentFrameId = 0;
  // Note: We can't clear taggedElements WeakSet, but that's fine
  // as elements will be garbage collected anyway
  console.log('[Tagger] Tagger state reset');
}

/**
 * Get current ID counter value (for debugging)
 */
export function getCurrentIdCounter(): number {
  return uniqueIdCounter;
}

/**
 * V2: Set the frame ID for this context.
 * Called when content script initializes to identify which frame it's in.
 * 
 * @param frameId - Unique frame identifier (0 = main frame)
 */
export function setFrameId(frameId: number): void {
  currentFrameId = frameId;
  console.debug(`[Tagger] Frame ID set to ${frameId}`);
}

/**
 * V2: Get the current frame ID
 */
export function getFrameId(): number {
  return currentFrameId;
}

/**
 * V2: Check if an element is inside a Shadow DOM (exported for use by semanticTree)
 */
export { isInShadowDom };

/**
 * V2: Get all tagged elements with their metadata
 * Returns an array of objects with element info including shadow/frame data
 */
export function getTaggedElementsMetadata(): Array<{
  id: string;
  element: Element;
  isInShadow: boolean;
  frameId: number;
}> {
  const elements = getAllTaggedElements();
  const result: Array<{
    id: string;
    element: Element;
    isInShadow: boolean;
    frameId: number;
  }> = [];
  
  elements.forEach(el => {
    const id = el.getAttribute(LLM_ID_ATTR);
    if (id) {
      result.push({
        id,
        element: el,
        isInShadow: el.getAttribute(SHADOW_ATTR) === 'true',
        frameId: parseInt(el.getAttribute(FRAME_ATTR) || '0', 10),
      });
    }
  });
  
  return result;
}

/**
 * V2: Find element by ID using querySelectorDeep (pierces Shadow DOM)
 */
export function findElementByIdDeep(id: string): Element | null {
  try {
    return querySelectorDeep(`[${LLM_ID_ATTR}="${id}"]`);
  } catch {
    // Fallback to standard querySelector
    return document.querySelector(`[${LLM_ID_ATTR}="${id}"]`);
  }
}
