/**
 * DOM Waiting Utilities for Browser Automation
 * 
 * Provides adaptive waiting for DOM changes, element appearance,
 * and DOM stabilization detection.
 * 
 * Addresses the issue where the agent fails to properly detect
 * DOM changes after actions (like dropdown menus appearing).
 */

import { callRPC } from './pageRPC';
import { sleep } from './utils';

/**
 * Configuration for DOM waiting
 */
export interface DOMWaitConfig {
  /** Minimum wait time in ms (default: 500) */
  minWait?: number;
  /** Maximum wait time in ms (default: 10000) */
  maxWait?: number;
  /** How long to wait for DOM to stabilize (no changes) in ms (default: 300) */
  stabilityThreshold?: number;
  /** Polling interval in ms (default: 100) */
  pollInterval?: number;
}

const DEFAULT_CONFIG: Required<DOMWaitConfig> = {
  minWait: 500,
  maxWait: 10000,
  stabilityThreshold: 300,
  pollInterval: 100,
};

/**
 * DOM Change Tracker
 * Tracks what elements appeared/disappeared after an action
 */
export interface DOMChangeReport {
  /** Elements that appeared after the action */
  addedElements: ElementInfo[];
  /** Elements that disappeared after the action */
  removedElements: ElementInfo[];
  /** Total number of DOM mutations observed */
  mutationCount: number;
  /** Time taken for DOM to stabilize in ms */
  stabilizationTime: number;
  /** Whether a dropdown/menu was detected */
  dropdownDetected: boolean;
  /** The dropdown menu items if detected */
  dropdownItems?: DropdownItem[];
}

export interface ElementInfo {
  /** Element ID if assigned */
  id?: string;
  /** Tag name */
  tagName: string;
  /** Role attribute */
  role?: string;
  /** Aria-label or name */
  name?: string;
  /** Text content (truncated) */
  text?: string;
  /** Whether the element is interactive */
  interactive: boolean;
  /** For virtual elements (text nodes), store click coordinates */
  virtualCoordinates?: { x: number; y: number };
  /** Indicates this is a virtual element created from a text node */
  isVirtual?: boolean;
}

export interface DropdownItem {
  id?: string;
  text: string;
  role?: string;
  interactive: boolean;
}

/**
 * Get a snapshot of current interactive elements
 * Used for tracking what changed after an action
 */
export async function getInteractiveElementSnapshot(): Promise<Map<string, ElementInfo>> {
  try {
    const snapshot = await callRPC('getInteractiveElementSnapshot', [], 3);
    if (!snapshot || !Array.isArray(snapshot)) {
      return new Map();
    }
    
    const map = new Map<string, ElementInfo>();
    for (const el of snapshot) {
      const key = el.id || `${el.tagName}-${el.text?.substring(0, 20)}`;
      map.set(key, {
        id: el.id,
        tagName: el.tagName,
        role: el.role,
        name: el.name,
        text: el.text,
        interactive: el.interactive,
        virtualCoordinates: el.virtualCoordinates,
        isVirtual: el.isVirtual,
      });
    }
    return map;
  } catch (error) {
    console.warn('Failed to get interactive element snapshot:', error);
    return new Map();
  }
}

/**
 * Compare two element snapshots and return the changes
 * Also detects elements that became visible (were hidden before, now visible)
 */
export function compareDOMSnapshots(
  before: Map<string, ElementInfo>,
  after: Map<string, ElementInfo>
): { added: ElementInfo[]; removed: ElementInfo[] } {
  const added: ElementInfo[] = [];
  const removed: ElementInfo[] = [];
  
  // Find added elements (in after but not in before)
  for (const [key, element] of after) {
    if (!before.has(key)) {
      added.push(element);
    }
  }
  
  // Find removed elements (in before but not in after)
  for (const [key, element] of before) {
    if (!after.has(key)) {
      removed.push(element);
    }
  }
  
  // Also detect elements that might have been hidden before but are now visible
  // This helps detect dropdown menu items that were in the DOM but hidden
  // Menu items often don't have stable IDs, so we use text+role+position as fallback
  const afterByTextRole = new Map<string, ElementInfo>();
  for (const [, element] of after) {
    // Only consider interactive elements with text (likely menu items)
    if (element.interactive && element.text && element.text.trim().length > 0) {
      const textRoleKey = `${element.tagName}-${element.role || 'no-role'}-${element.text.trim().substring(0, 50)}`;
      // Keep the first element with this text+role combination
      if (!afterByTextRole.has(textRoleKey)) {
        afterByTextRole.set(textRoleKey, element);
      }
    }
  }
  
  // Check if any of these text+role combinations are new (not in before snapshot)
  for (const [textRoleKey, element] of afterByTextRole) {
    // Check if this element was in the before snapshot
    const beforeKey = element.id || `${element.tagName}-${element.text?.substring(0, 20)}`;
    if (!before.has(beforeKey)) {
      // Also check by text+role to catch elements that were hidden
      let foundInBefore = false;
      for (const [, beforeElement] of before) {
        if (beforeElement.text === element.text && 
            beforeElement.tagName === element.tagName && 
            beforeElement.role === element.role) {
          foundInBefore = true;
          break;
        }
      }
      
      // If not found in before, this is a newly visible element (likely a menu item)
      if (!foundInBefore) {
        // Check if we already added this element
        const alreadyAdded = added.some(e => 
          (e.id && e.id === element.id) || 
          (e.text === element.text && e.tagName === element.tagName && e.role === element.role)
        );
        if (!alreadyAdded) {
          added.push(element);
        }
      }
    }
  }
  
  return { added, removed };
}

/**
 * Detect if added elements look like a dropdown/menu
 */
export function detectDropdownMenu(addedElements: ElementInfo[]): {
  isDropdown: boolean;
  items: DropdownItem[];
} {
  // Common dropdown patterns:
  // 1. Multiple elements with role="menuitem" or role="option"
  // 2. Elements inside a container with role="menu" or role="listbox"
  // 3. Multiple clickable elements that appeared at once
  // 4. Elements with text like "New/Search", "Dashboard", etc. that appear together (menu items)
  
  const menuItems = addedElements.filter(el => {
    // Check for explicit menu roles
    if (el.role === 'menuitem' || 
        el.role === 'option' ||
        el.role === 'menuitemcheckbox' ||
        el.role === 'menuitemradio') {
      return true;
    }
    
    // Check for interactive elements that look like menu items
    if (el.interactive && (el.tagName === 'LI' || el.tagName === 'A' || el.tagName === 'BUTTON')) {
      // If it has text content, it's likely a menu item
      if (el.text && el.text.trim().length > 0) {
        return true;
      }
    }
    
    // Check for elements with text that suggests they're menu items
    // (e.g., "New/Search", "Dashboard", "Visits", "Records")
    if (el.text && el.text.trim().length > 0 && el.text.trim().length < 50) {
      // Short text with common menu item patterns
      const text = el.text.trim().toLowerCase();
      if (text.includes('/') || // "New/Search"
          text === 'dashboard' ||
          text === 'visits' ||
          text === 'records' ||
          el.interactive) {
        return true;
      }
    }
    
    return false;
  });
  
  // If we have 2+ menu items appearing at once, likely a dropdown
  // Also check if we have at least 1 menu item with text (might be a single-item menu)
  const isDropdown = menuItems.length >= 2 || 
                     (menuItems.length >= 1 && menuItems.some(item => item.text && item.text.trim().length > 0));
  
  const items: DropdownItem[] = menuItems.map(el => ({
    id: el.id,
    text: el.text || el.name || '',
    role: el.role,
    interactive: el.interactive,
  }));
  
  return { isDropdown, items };
}

/**
 * Wait for DOM to stabilize (no changes for a period of time)
 * CRITICAL FIX: Dynamic Stability Check (Section 3.3) - Enhanced with network idle detection
 * Uses polling to detect when mutations stop occurring AND network requests complete
 * 
 * Reference: PRODUCTION_READINESS.md §3.3 (The "Dynamic Stability" Check)
 */
export async function waitForDOMStabilization(
  config: DOMWaitConfig = {}
): Promise<{ stabilizationTime: number; timedOut: boolean }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  const startTime = Date.now();
  let lastChangeTime = startTime;
  let previousSnapshot: Map<string, ElementInfo> | null = null;
  let mutationCount = 0;
  
  // CRITICAL FIX: Track network activity for dynamic stability check
  // Monitor network requests (if available via Performance API)
  const checkNetworkIdle = async (): Promise<boolean> => {
    try {
      // Use RPC to check network activity in content script context
      // Performance API is only available in content script, not background
      const networkStatus = await callRPC('checkNetworkIdle', [], 1);
      if (typeof networkStatus === 'boolean') {
        return networkStatus;
      }
      // Fallback: assume idle if we can't check
      return true;
    } catch (error) {
      // If RPC fails, assume network is idle (don't block on network check failures)
      console.warn('Network idle check failed, assuming idle:', error);
      return true;
    }
  };
  
  // Initial wait
  await sleep(cfg.minWait);
  
  while (Date.now() - startTime < cfg.maxWait) {
    const currentSnapshot = await getInteractiveElementSnapshot();
    const networkIdle = await checkNetworkIdle();
    
    if (previousSnapshot) {
      const { added, removed } = compareDOMSnapshots(previousSnapshot, currentSnapshot);
      
      if (added.length > 0 || removed.length > 0) {
        // DOM changed, reset stability timer
        lastChangeTime = Date.now();
        mutationCount += added.length + removed.length;
      } else if (
        Date.now() - lastChangeTime >= cfg.stabilityThreshold &&
        networkIdle
      ) {
        // DOM has been stable for the threshold period AND network is idle
        return {
          stabilizationTime: Date.now() - startTime,
          timedOut: false,
        };
      }
    }
    
    previousSnapshot = currentSnapshot;
    await sleep(cfg.pollInterval);
  }
  
  // Timed out waiting for stabilization
  return {
    stabilizationTime: Date.now() - startTime,
    timedOut: true,
  };
}

/**
 * Wait for DOM changes and return a report of what changed
 * This is the main function to call after executing an action
 */
export async function waitForDOMChangesAfterAction(
  beforeSnapshot: Map<string, ElementInfo>,
  config: DOMWaitConfig = {}
): Promise<DOMChangeReport> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  // Wait for DOM to stabilize
  const { stabilizationTime, timedOut } = await waitForDOMStabilization(cfg);
  
  if (timedOut) {
    console.warn('DOM stabilization timed out after', cfg.maxWait, 'ms');
  }
  
  // Get the final snapshot
  const afterSnapshot = await getInteractiveElementSnapshot();
  
  // Compare snapshots
  const { added, removed } = compareDOMSnapshots(beforeSnapshot, afterSnapshot);
  
  // Detect dropdown menus
  const { isDropdown, items } = detectDropdownMenu(added);
  
  return {
    addedElements: added,
    removedElements: removed,
    mutationCount: added.length + removed.length,
    stabilizationTime,
    dropdownDetected: isDropdown,
    dropdownItems: isDropdown ? items : undefined,
  };
}

/**
 * Wait for a specific element to appear
 */
export async function waitForElement(
  selector: string | { role?: string; text?: string; id?: number },
  config: DOMWaitConfig = {}
): Promise<{ found: boolean; waitTime: number; element?: ElementInfo }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = Date.now();
  
  while (Date.now() - startTime < cfg.maxWait) {
    const snapshot = await getInteractiveElementSnapshot();
    
    for (const [, element] of snapshot) {
      let matches = true;
      
      if (typeof selector === 'string') {
        // Simple text/name matching
        matches = (
          element.text?.toLowerCase().includes(selector.toLowerCase()) ||
          element.name?.toLowerCase().includes(selector.toLowerCase())
        ) || false;
      } else {
        // Object-based matching
        if (selector.role && element.role !== selector.role) {
          matches = false;
        }
        if (selector.text && !element.text?.toLowerCase().includes(selector.text.toLowerCase())) {
          matches = false;
        }
        if (selector.id !== undefined && element.id !== String(selector.id)) {
          matches = false;
        }
      }
      
      if (matches) {
        return {
          found: true,
          waitTime: Date.now() - startTime,
          element,
        };
      }
    }
    
    await sleep(cfg.pollInterval);
  }
  
  return {
    found: false,
    waitTime: Date.now() - startTime,
  };
}

/**
 * Format DOM change report for logging/debugging
 */
export function formatDOMChangeReport(report: DOMChangeReport): string {
  const lines: string[] = [
    `DOM Changes (${report.stabilizationTime}ms):`,
    `  Added: ${report.addedElements.length} elements`,
    `  Removed: ${report.removedElements.length} elements`,
  ];
  
  if (report.dropdownDetected && report.dropdownItems) {
    lines.push(`  Dropdown detected with ${report.dropdownItems.length} items:`);
    for (const item of report.dropdownItems.slice(0, 5)) {
      lines.push(`    - ${item.text || item.id || 'Unknown'}`);
    }
    if (report.dropdownItems.length > 5) {
      lines.push(`    ... and ${report.dropdownItems.length - 5} more`);
    }
  }
  
  if (report.addedElements.length > 0 && !report.dropdownDetected) {
    lines.push('  Added elements:');
    for (const el of report.addedElements.slice(0, 5)) {
      lines.push(`    - ${el.tagName} "${el.text?.substring(0, 30) || el.name || el.id || 'Unknown'}"`);
    }
  }
  
  return lines.join('\n');
}
