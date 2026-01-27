/**
 * DOM Simplification Helper for Thin Client Architecture
 * 
 * Extracts and simplifies DOM for agent interaction.
 * Tries accessibility tree extraction first (Task 4), filters to interactive elements (Task 5),
 * creates hybrid elements combining accessibility and DOM data (Task 7),
 * uses accessibility-first selection strategy (Task 8), and integrates them into simplified DOM.
 * Falls back to DOM approach if accessibility extraction fails.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §5.1 (Task 4: Basic Accessibility Tree Extraction)
 * Reference: THIN_CLIENT_ROADMAP.md §6.1 (Task 5: Accessibility Node Filtering)
 * Reference: THIN_CLIENT_ROADMAP.md §8.1 (Task 7: Hybrid Element Representation)
 * Reference: THIN_CLIENT_ROADMAP.md §9.1 (Task 8: Accessibility-First Element Selection)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 5)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.3 (Recommended Approach)
 */

import { callRPC } from './pageRPC';
import { truthyFilter } from './utils';
import { getAccessibilityTree, isAccessibilityAvailable } from './accessibilityTree';
import type { AccessibilityTree } from '../types/accessibility';
import {
  filterInteractiveAXNodes,
  convertAXNodesToSimplifiedElements,
  type SimplifiedAXElement,
} from './accessibilityFilter';
import { createHybridElements, hybridElementToDOM } from './hybridElement';
import type { HybridElement } from '../types/hybridElement';
import {
  selectElementsAccessibilityFirst,
  analyzeAccessibilityCoverage,
  type CoverageMetrics,
} from './accessibilityFirst';

/**
 * Result of DOM extraction
 */
export interface SimplifiedDomResult {
  dom: HTMLElement;
  accessibilityTree?: AccessibilityTree;
  usedAccessibility: boolean;
  accessibilityElements?: SimplifiedAXElement[]; // Filtered and converted accessibility elements (Task 5)
  elementMapping?: Map<string, number>; // Map from axNodeId to DOM element index (Task 5)
  hybridElements?: HybridElement[]; // Hybrid elements combining accessibility and DOM data (Task 7)
  coverageMetrics?: CoverageMetrics; // Coverage metrics for accessibility-first selection (Task 8)
}

/**
 * Get simplified DOM with optional accessibility tree extraction
 * 
 * Tries accessibility tree extraction first (if tabId provided), falls back to DOM approach.
 * 
 * @param tabId - Optional tab ID for accessibility tree extraction
 * @returns Promise<SimplifiedDomResult | null> - Simplified DOM with optional accessibility tree
 */
export async function getSimplifiedDom(tabId?: number): Promise<SimplifiedDomResult | null> {
  let accessibilityTree: AccessibilityTree | undefined;
  let usedAccessibility = false;

  // Try accessibility tree extraction first if tabId is provided
  if (tabId !== undefined) {
    try {
      const isAvailable = await isAccessibilityAvailable(tabId);
      if (isAvailable) {
        accessibilityTree = await getAccessibilityTree(tabId);
        usedAccessibility = true;
        console.log('Accessibility tree extracted successfully', {
          nodeCount: accessibilityTree.nodes.length,
          rootNodeId: accessibilityTree.rootNodeId,
        });
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Accessibility tree extraction failed, falling back to DOM:', errorMessage);
      // Continue with DOM fallback
    }
  }

  // Process accessibility tree if available (Task 5: Filter and convert)
  let accessibilityElements: SimplifiedAXElement[] | undefined;
  let elementMapping: Map<string, number> | undefined;

  if (accessibilityTree && accessibilityTree.nodes.length > 0) {
    // Filter to interactive elements only
    const filteredNodes = filterInteractiveAXNodes(accessibilityTree.nodes);
    
    // Convert to simplified element representation
    accessibilityElements = convertAXNodesToSimplifiedElements(filteredNodes);
    
    // Create mapping from axNodeId to element index (for action targeting)
    elementMapping = new Map<string, number>();
    accessibilityElements.forEach((element, index) => {
      elementMapping!.set(element.axNodeId, index);
    });

    console.log('Accessibility filtering complete', {
      totalNodes: accessibilityTree.nodes.length,
      interactiveNodes: filteredNodes.length,
      simplifiedElements: accessibilityElements.length,
    });
  }

  // Fallback to DOM approach (always used, or as fallback)
  // Use more retries for DOM extraction as content script may need time to load
  let fullDom: string | null = null;
  try {
    // Type assertion needed because callRPC can return multiple types depending on method
    fullDom = await callRPC('getAnnotatedDOM', [], 5) as string; // Increased retries for initial DOM load
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Failed to get annotated DOM:', errorMessage);
    // Return null to let caller handle the error
    return null;
  }
  
  if (!fullDom) return null;

  const dom = new DOMParser().parseFromString(fullDom, 'text/html');

  const interactiveElements: HTMLElement[] = [];

  // Generate simplified DOM (may be enhanced with accessibility elements)
  const simplifiedDom = generateSimplifiedDom(
    dom.documentElement,
    interactiveElements,
    accessibilityElements // Pass accessibility elements for integration
  ) as HTMLElement;

  // Create hybrid elements using accessibility-first strategy (Task 8)
  let hybridElements: HybridElement[] | undefined;
  let coverageMetrics: CoverageMetrics | undefined;

  if (accessibilityElements && accessibilityElements.length > 0) {
    // Use accessibility-first selection strategy (Task 8)
    hybridElements = selectElementsAccessibilityFirst(
      accessibilityElements,
      interactiveElements,
      elementMapping
    );

    // Analyze coverage metrics (Task 8)
    coverageMetrics = analyzeAccessibilityCoverage(
      accessibilityElements,
      interactiveElements
    );

    console.log('Accessibility-first selection complete', {
      totalAXElements: accessibilityElements.length,
      totalDOMElements: interactiveElements.length,
      selectedElements: hybridElements.length,
      coverage: `${coverageMetrics.axCoverage}%`,
      domOnlyElements: coverageMetrics.domOnlyElements,
      axOnlyElements: coverageMetrics.axOnlyElements,
      overlap: coverageMetrics.overlap,
    });

    // Enhance simplified DOM with hybrid elements
    enhanceDomWithHybridElements(
      simplifiedDom,
      hybridElements,
      elementMapping!
    );
  } else {
    // If no accessibility elements, use DOM-only approach
    // Create hybrid elements from DOM only
    hybridElements = interactiveElements.map((domElement, index) => {
      const role = domElement.getAttribute('role') ||
                   (domElement.tagName === 'BUTTON' ? 'button' :
                    domElement.tagName === 'INPUT' ? 'textbox' :
                    domElement.tagName === 'A' ? 'link' :
                    domElement.tagName === 'SELECT' ? 'combobox' :
                    domElement.tagName === 'TEXTAREA' ? 'textbox' : 'unknown');
      const name = domElement.getAttribute('aria-label') ||
                   domElement.getAttribute('name') ||
                   domElement.getAttribute('placeholder') ||
                   domElement.textContent?.trim() ||
                   null;

      return {
        id: index,
        domElement,
        role,
        name,
        description: domElement.getAttribute('title') || null,
        value: (domElement as HTMLInputElement).value || domElement.getAttribute('value') || null,
        interactive: true,
        attributes: {
          role,
          ...(name ? { 'aria-label': name } : {}),
        },
        source: 'dom' as const,
      } as HybridElement;
    });

    // Coverage is 0% when no accessibility elements
    coverageMetrics = {
      axCoverage: 0,
      domOnlyElements: interactiveElements.length,
      axOnlyElements: 0,
      overlap: 0,
      totalInteractive: interactiveElements.length,
      totalAXNodes: 0,
    };
  }

  return {
    dom: simplifiedDom,
    accessibilityTree,
    usedAccessibility,
    accessibilityElements,
    elementMapping,
    hybridElements, // Return hybrid elements (Task 7)
    coverageMetrics, // Return coverage metrics (Task 8)
  };
}

/**
 * Enhance simplified DOM with hybrid elements (Task 7)
 * Replaces or enhances DOM elements with hybrid element representation
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §8.1 (Task 7: Hybrid Element Representation)
 */
function enhanceDomWithHybridElements(
  simplifiedDom: HTMLElement,
  hybridElements: HybridElement[],
  elementMapping: Map<string, number>
): void {
  // Create a map of element IDs to hybrid elements for quick lookup
  const hybridMap = new Map<number, HybridElement>();
  hybridElements.forEach((hybrid) => {
    hybridMap.set(hybrid.id, hybrid);
  });

  // Find all interactive elements in simplified DOM and enhance with hybrid data
  const interactiveElements = simplifiedDom.querySelectorAll('[data-interactive="true"], [role]');
  
  interactiveElements.forEach((el) => {
    if (el instanceof HTMLElement) {
      const elementId = el.getAttribute('data-id') || el.getAttribute('id');
      if (elementId) {
        const id = parseInt(elementId, 10);
        const hybrid = hybridMap.get(id);
        
        if (hybrid) {
          // Mark as hybrid element
          el.setAttribute('data-hybrid', 'true');
          el.setAttribute('data-source', hybrid.source);
          
          // Add accessibility node ID if available
          if (hybrid.axElement) {
            el.setAttribute('data-ax-node-id', hybrid.axElement.axNodeId);
          }
          
          // Update attributes with hybrid data (prefer accessibility)
          if (hybrid.role && !el.hasAttribute('role')) {
            el.setAttribute('role', hybrid.role);
          }
          if (hybrid.name && !el.hasAttribute('aria-label')) {
            el.setAttribute('aria-label', hybrid.name);
          }
          if (hybrid.description && !el.hasAttribute('title')) {
            el.setAttribute('title', hybrid.description);
          }
          if (hybrid.value && !el.hasAttribute('value')) {
            el.setAttribute('value', hybrid.value);
            if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
              el.value = hybrid.value;
            }
          }
        }
      }
    }
  });
}

/**
 * Enhance simplified DOM with accessibility-derived elements
 * Adds accessibility elements as data attributes and merges them into the DOM structure
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §6.1 (Task 5: Accessibility Node Filtering)
 */
function enhanceDomWithAccessibilityElements(
  simplifiedDom: HTMLElement,
  accessibilityElements: SimplifiedAXElement[],
  elementMapping: Map<string, number>
): void {
  // Add accessibility elements as metadata
  // This allows the LLM to see which elements came from accessibility tree
  accessibilityElements.forEach((axElement, index) => {
    // Find corresponding elements in simplified DOM by matching attributes
    const matchingElements = simplifiedDom.querySelectorAll(
      `[role="${axElement.role}"], [aria-label="${axElement.name}"]`
    );
    
    // Mark elements with accessibility data
    matchingElements.forEach((el) => {
      if (el instanceof HTMLElement) {
        el.setAttribute('data-ax-node-id', axElement.axNodeId);
        el.setAttribute('data-ax-source', 'true');
        el.setAttribute('data-ax-index', index.toString());
        
        // Add accessibility attributes if not already present
        if (axElement.name && !el.hasAttribute('aria-label')) {
          el.setAttribute('aria-label', axElement.name);
        }
        if (axElement.description && !el.hasAttribute('title')) {
          el.setAttribute('title', axElement.description);
        }
        if (axElement.value && !el.hasAttribute('value')) {
          el.setAttribute('value', axElement.value);
        }
      }
    });
  });
}

function generateSimplifiedDom(
  element: ChildNode,
  interactiveElements: HTMLElement[],
  accessibilityElements?: SimplifiedAXElement[]
): ChildNode | null {
  if (element.nodeType === Node.TEXT_NODE && element.textContent?.trim()) {
    return document.createTextNode(element.textContent + ' ');
  }

  if (!(element instanceof HTMLElement || element instanceof SVGElement))
    return null;

  const isVisible = element.getAttribute('data-visible') === 'true';
  if (!isVisible) return null;

  let children = Array.from(element.childNodes)
    .map((c) => generateSimplifiedDom(c, interactiveElements, accessibilityElements))
    .filter(truthyFilter);

  // Don't bother with text that is the direct child of the body
  if (element.tagName === 'BODY')
    children = children.filter((c) => c.nodeType !== Node.TEXT_NODE);

  const interactive =
    element.getAttribute('data-interactive') === 'true' ||
    element.hasAttribute('role');
  const hasLabel =
    element.hasAttribute('aria-label') || element.hasAttribute('name');
  const includeNode = interactive || hasLabel;

  if (!includeNode && children.length === 0) return null;
  if (!includeNode && children.length === 1) {
    return children[0];
  }

  const container = document.createElement(element.tagName);

  const allowedAttributes = [
    'aria-label',
    'data-name',
    'name',
    'type',
    'placeholder',
    'value',
    'role',
    'title',
    'data-ax-node-id', // Accessibility node ID (Task 6)
    'data-ax-id', // Primary accessibility identifier (Task 6)
    'data-ax-source', // Mark accessibility-derived elements (Task 5)
    'data-ax-index', // Accessibility element index (Task 5)
    // Critical for expected outcome generation: popup/dropdown indicators
    // When hasPopup is set, clicking opens a popup instead of navigating (no URL change)
    'aria-haspopup', // Values: 'menu', 'listbox', 'tree', 'grid', 'dialog', 'true'
    'aria-expanded', // Values: 'true', 'false' - current expanded state
    'data-has-popup', // Alternative/supplemental popup indicator
  ];

  for (const attr of allowedAttributes) {
    if (element.hasAttribute(attr)) {
      container.setAttribute(attr, element.getAttribute(attr) as string);
    }
  }
  if (interactive) {
    interactiveElements.push(element as HTMLElement);
    const elementId = element.getAttribute('data-id') as string;
    container.setAttribute('id', elementId);
    
    // If element has accessibility data, prefer accessibility node ID (Task 6)
    const axNodeId = element.getAttribute('data-ax-node-id');
    if (axNodeId) {
      // Use accessibility node ID as primary identifier
      container.setAttribute('data-ax-id', axNodeId);
      // Keep original data-id for backward compatibility
      container.setAttribute('data-id', elementId);
    }
  }

  children.forEach((child) => container.appendChild(child));

  return container;
}
