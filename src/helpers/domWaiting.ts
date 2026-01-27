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
  
  const menuItems = addedElements.filter(el => 
    el.role === 'menuitem' || 
    el.role === 'option' ||
    el.role === 'menuitemcheckbox' ||
    el.role === 'menuitemradio' ||
    (el.interactive && (el.tagName === 'LI' || el.tagName === 'A'))
  );
  
  // If we have 2+ menu items appearing at once, likely a dropdown
  const isDropdown = menuItems.length >= 2;
  
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
 * Uses polling to detect when mutations stop occurring
 */
export async function waitForDOMStabilization(
  config: DOMWaitConfig = {}
): Promise<{ stabilizationTime: number; timedOut: boolean }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  const startTime = Date.now();
  let lastChangeTime = startTime;
  let previousSnapshot: Map<string, ElementInfo> | null = null;
  
  // Initial wait
  await sleep(cfg.minWait);
  
  while (Date.now() - startTime < cfg.maxWait) {
    const currentSnapshot = await getInteractiveElementSnapshot();
    
    if (previousSnapshot) {
      const { added, removed } = compareDOMSnapshots(previousSnapshot, currentSnapshot);
      
      if (added.length > 0 || removed.length > 0) {
        // DOM changed, reset stability timer
        lastChangeTime = Date.now();
      } else if (Date.now() - lastChangeTime >= cfg.stabilityThreshold) {
        // DOM has been stable for the threshold period
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
