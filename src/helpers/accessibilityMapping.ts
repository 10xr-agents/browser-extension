/**
 * Accessibility-DOM Element Mapping Helper for Thin Client Architecture
 * 
 * Creates reliable bidirectional mapping between accessibility nodes and DOM elements
 * for action execution. Actions can target elements via accessibility tree mapping.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §7.1 (Task 6: Accessibility-DOM Element Mapping)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 3)
 */

import type { AXNode } from '../types/accessibility';

/**
 * Mapping from accessibility node ID to DOM element index
 * Used for action targeting when accessibility mapping is available
 */
export interface AccessibilityMapping {
  axNodeIdToElementIndex: Map<string, number>; // Map from axNodeId to DOM element index
  elementIndexToAXNodeId: Map<number, string>; // Reverse mapping
  axNodeIdToBackendDOMNodeId: Map<string, number>; // Map from axNodeId to backendDOMNodeId
  backendDOMNodeIdToAXNodeId: Map<number, string>; // Reverse mapping
}

/**
 * Create bidirectional mapping between accessibility nodes and DOM elements
 * 
 * @param accessibilityElements - Filtered accessibility elements from Task 5
 * @param elementMapping - Existing mapping from getSimplifiedDom (axNodeId to index)
 * @returns AccessibilityMapping with bidirectional maps
 */
export function createAccessibilityMapping(
  accessibilityElements: Array<{ axNodeId: string; backendDOMNodeId?: number }>,
  elementMapping?: Map<string, number>
): AccessibilityMapping {
  const axNodeIdToElementIndex = new Map<string, number>();
  const elementIndexToAXNodeId = new Map<number, string>();
  const axNodeIdToBackendDOMNodeId = new Map<string, number>();
  const backendDOMNodeIdToAXNodeId = new Map<number, string>();

  accessibilityElements.forEach((element, index) => {
    // Use elementMapping if available, otherwise use array index
    const elementIndex = elementMapping?.get(element.axNodeId) ?? index;
    
    axNodeIdToElementIndex.set(element.axNodeId, elementIndex);
    elementIndexToAXNodeId.set(elementIndex, element.axNodeId);

    if (element.backendDOMNodeId !== undefined) {
      axNodeIdToBackendDOMNodeId.set(element.axNodeId, element.backendDOMNodeId);
      backendDOMNodeIdToAXNodeId.set(element.backendDOMNodeId, element.axNodeId);
    }
  });

  return {
    axNodeIdToElementIndex,
    elementIndexToAXNodeId,
    axNodeIdToBackendDOMNodeId,
    backendDOMNodeIdToAXNodeId,
  };
}

/**
 * Map accessibility node to DOM element using Chrome DevTools Protocol
 * 
 * Uses backendDOMNodeId from accessibility node to find corresponding DOM node.
 * 
 * @param axNode - Accessibility node to map
 * @param tabId - Tab ID for Chrome DevTools Protocol
 * @returns Promise<number | null> - DOM node ID or null if not found
 */
export async function mapAXNodeToDOMNodeId(
  axNode: AXNode,
  tabId: number
): Promise<number | null> {
  try {
    // Use backendDOMNodeId if available (most reliable)
    if (axNode.backendDOMNodeId !== undefined) {
      return axNode.backendDOMNodeId;
    }

    // Fallback: Try to find by role and name
    // This is less reliable but may work in some cases
    const role = axNode.role?.value || axNode.chromeRole?.value;
    const name = axNode.name?.value;

    if (!role) {
      return null;
    }

    // Use Chrome DevTools Protocol to query for elements
    // This is a simplified approach - full implementation would need more sophisticated matching
    const document = (await chrome.debugger.sendCommand(
      { tabId },
      'DOM.getDocument'
    )) as { root: { nodeId: number } };

    // Try to find element by role attribute
    if (name) {
      try {
        const result = (await chrome.debugger.sendCommand(
          { tabId },
          'DOM.querySelector',
          {
            nodeId: document.root.nodeId,
            selector: `[role="${role}"][aria-label="${name}"]`,
          }
        )) as { nodeId: number } | null;

        if (result?.nodeId) {
          return result.nodeId;
        }
      } catch {
        // Query selector may fail, continue to next method
      }
    }

    // Try by role only
    try {
      const result = (await chrome.debugger.sendCommand(
        { tabId },
        'DOM.querySelector',
        {
          nodeId: document.root.nodeId,
          selector: `[role="${role}"]`,
        }
      )) as { nodeId: number } | null;

      if (result?.nodeId) {
        return result.nodeId;
      }
    } catch {
      // Query selector may fail
    }

    return null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Failed to map accessibility node to DOM:', errorMessage);
    return null;
  }
}

/**
 * Map DOM element to accessibility node
 * 
 * Uses backendDOMNodeId to find corresponding accessibility node.
 * 
 * @param backendDOMNodeId - Backend DOM node ID from Chrome DevTools Protocol
 * @param mapping - Accessibility mapping
 * @returns string | null - Accessibility node ID or null if not found
 */
export function mapDOMNodeIdToAXNode(
  backendDOMNodeId: number,
  mapping: AccessibilityMapping
): string | null {
  return mapping.backendDOMNodeIdToAXNodeId.get(backendDOMNodeId) || null;
}

/**
 * Get element index from accessibility node ID
 * 
 * @param axNodeId - Accessibility node ID
 * @param mapping - Accessibility mapping
 * @returns number | null - Element index or null if not found
 */
export function getElementIndexFromAXNodeId(
  axNodeId: string,
  mapping: AccessibilityMapping
): number | null {
  return mapping.axNodeIdToElementIndex.get(axNodeId) ?? null;
}

/**
 * Get accessibility node ID from element index
 * 
 * @param elementIndex - Element index
 * @param mapping - Accessibility mapping
 * @returns string | null - Accessibility node ID or null if not found
 */
export function getAXNodeIdFromElementIndex(
  elementIndex: number,
  mapping: AccessibilityMapping
): string | null {
  return mapping.elementIndexToAXNodeId.get(elementIndex) ?? null;
}
