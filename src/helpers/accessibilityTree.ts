/**
 * Accessibility Tree Extraction Helper for Thin Client Architecture
 * 
 * Extracts accessibility tree via Chrome DevTools Protocol Accessibility.getFullAXTree.
 * Falls back to DOM approach if accessibility extraction fails.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §5.1 (Task 4: Basic Accessibility Tree Extraction)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan)
 * Reference: Chrome DevTools Protocol - Accessibility.getFullAXTree
 */

import { AccessibilityTree, AXNode } from '../types/accessibility';
import { attachDebugger } from './chromeDebugger';

/**
 * Get accessibility tree for a given tab using Chrome DevTools Protocol
 * 
 * @param tabId - The tab ID to extract accessibility tree from
 * @returns Promise<AccessibilityTree> - The accessibility tree structure
 * @throws Error if accessibility extraction fails
 */
export async function getAccessibilityTree(tabId: number): Promise<AccessibilityTree> {
  try {
    // Check if debugger is already attached
    const targets = await chrome.debugger.getTargets();
    const isAttached = targets.some(
      (target) => target.tabId === tabId && target.attached
    );

    // Attach debugger if not already attached
    if (!isAttached) {
      await attachDebugger(tabId);
    }

    // Enable Accessibility domain
    await chrome.debugger.sendCommand({ tabId }, 'Accessibility.enable');

    // Call Accessibility.getFullAXTree
    const response = await chrome.debugger.sendCommand(
      { tabId },
      'Accessibility.getFullAXTree',
      {}
    ) as { nodes?: AXNode[] };

    if (!response.nodes || response.nodes.length === 0) {
      throw new Error('Accessibility tree is empty');
    }

    // Find root node (node without parentId)
    const rootNode = response.nodes.find((node) => !node.parentId);

    return {
      nodes: response.nodes,
      rootNodeId: rootNode?.nodeId,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to extract accessibility tree:', errorMessage);
    throw new Error(`Accessibility extraction failed: ${errorMessage}`);
  }
}

/**
 * Check if accessibility tree extraction is available
 * 
 * @param tabId - The tab ID to check
 * @returns Promise<boolean> - True if accessibility extraction is available
 */
export async function isAccessibilityAvailable(tabId: number): Promise<boolean> {
  try {
    const targets = await chrome.debugger.getTargets();
    const isAttached = targets.some(
      (target) => target.tabId === tabId && target.attached
    );

    if (!isAttached) {
      await attachDebugger(tabId);
    }

    await chrome.debugger.sendCommand({ tabId }, 'Accessibility.enable');
    return true;
  } catch (error) {
    console.warn('Accessibility API not available:', error);
    return false;
  }
}
