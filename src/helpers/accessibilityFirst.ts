/**
 * Accessibility-First Element Selection Helper for Thin Client Architecture
 * 
 * Prioritizes accessibility tree as primary source, uses DOM as fallback only.
 * Analyzes coverage and supplements with DOM-only elements when needed.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §9.1 (Task 8: Accessibility-First Element Selection)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 5)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.3 (Recommended Approach)
 */

import type { AXNode } from '../types/accessibility';
import type { SimplifiedAXElement } from './accessibilityFilter';
import type { HybridElement } from '../types/hybridElement';

/**
 * Coverage metrics for accessibility tree analysis
 */
export interface CoverageMetrics {
  axCoverage: number; // Percentage of interactive elements found in accessibility tree
  domOnlyElements: number; // Count of DOM-only elements (not in accessibility tree)
  axOnlyElements: number; // Count of accessibility-only elements (not in DOM)
  overlap: number; // Count of elements found in both accessibility tree and DOM
  totalInteractive: number; // Total count of interactive elements
  totalAXNodes: number; // Total count of accessibility nodes
}

/**
 * Analyze what percentage of interactive elements are found in accessibility tree
 * 
 * @param axElements - Filtered accessibility elements
 * @param domElements - DOM elements (interactive elements from DOM)
 * @returns CoverageMetrics with coverage analysis
 */
export function analyzeAccessibilityCoverage(
  axElements: SimplifiedAXElement[],
  domElements: HTMLElement[]
): CoverageMetrics {
  const totalAXNodes = axElements.length;
  const totalDOMElements = domElements.length;
  const totalInteractive = Math.max(totalAXNodes, totalDOMElements);

  // Create sets for comparison
  const axElementKeys = new Set<string>();
  axElements.forEach((ax) => {
    // Use role + name as key for matching
    const key = `${ax.role}:${ax.name || ''}:${ax.axNodeId}`;
    axElementKeys.add(key);
  });

  const domElementKeys = new Set<string>();
  domElements.forEach((dom) => {
    const role = dom.getAttribute('role') ||
                 (dom.tagName === 'BUTTON' ? 'button' :
                  dom.tagName === 'INPUT' ? 'textbox' :
                  dom.tagName === 'A' ? 'link' :
                  dom.tagName === 'SELECT' ? 'combobox' :
                  dom.tagName === 'TEXTAREA' ? 'textbox' : null);
    const name = dom.getAttribute('aria-label') ||
                 dom.getAttribute('name') ||
                 dom.getAttribute('placeholder') ||
                 dom.textContent?.trim() ||
                 '';
    const id = dom.getAttribute('data-id') || '';
    const key = `${role || 'unknown'}:${name}:${id}`;
    domElementKeys.add(key);
  });

  // Find overlap (elements in both)
  let overlap = 0;
  axElementKeys.forEach((axKey) => {
    if (domElementKeys.has(axKey)) {
      overlap++;
    }
  });

  // Calculate metrics
  const domOnlyElements = totalDOMElements - overlap;
  const axOnlyElements = totalAXNodes - overlap;
  
  // Coverage is percentage of DOM elements that are also in accessibility tree
  const axCoverage = totalDOMElements > 0
    ? (overlap / totalDOMElements) * 100
    : totalAXNodes > 0 ? 100 : 0;

  return {
    axCoverage: Math.round(axCoverage * 100) / 100, // Round to 2 decimal places
    domOnlyElements,
    axOnlyElements,
    overlap,
    totalInteractive,
    totalAXNodes,
  };
}

/**
 * Select elements using accessibility-first strategy
 * 
 * Prioritizes accessibility tree as primary source, supplements with DOM-only elements.
 * 
 * @param axElements - Filtered accessibility elements
 * @param domElements - DOM elements (interactive elements from DOM)
 * @param elementMapping - Optional mapping from axNodeId to element index
 * @returns Array of hybrid elements with accessibility-first selection
 */
export function selectElementsAccessibilityFirst(
  axElements: SimplifiedAXElement[],
  domElements: HTMLElement[],
  elementMapping?: Map<string, number>
): HybridElement[] {
  const selectedElements: HybridElement[] = [];
  const usedDOMIndices = new Set<number>();

  // Step 1: Start with all accessibility elements (primary source)
  axElements.forEach((axElement, index) => {
    const elementId = elementMapping?.get(axElement.axNodeId) ?? index;
    
    // Try to find matching DOM element
    let matchingDOMElement: HTMLElement | undefined;
    
    // Try by index first
    if (elementId < domElements.length) {
      matchingDOMElement = domElements[elementId];
      usedDOMIndices.add(elementId);
    } else {
      // Try to match by attributes
      matchingDOMElement = domElements.find((dom, idx) => {
        if (usedDOMIndices.has(idx)) return false;
        
        const domRole = dom.getAttribute('role') ||
                       (dom.tagName === 'BUTTON' ? 'button' :
                        dom.tagName === 'INPUT' ? 'textbox' :
                        dom.tagName === 'A' ? 'link' : null);
        const domName = dom.getAttribute('aria-label') ||
                       dom.getAttribute('name') ||
                       dom.textContent?.trim() ||
                       '';
        
        return domRole === axElement.role && domName === (axElement.name || '');
      });
      
      if (matchingDOMElement) {
        const domIndex = domElements.indexOf(matchingDOMElement);
        usedDOMIndices.add(domIndex);
      }
    }

    // Create hybrid element (accessibility-first)
    const hybrid: HybridElement = {
      id: elementId,
      axElement,
      domElement: matchingDOMElement,
      role: axElement.role,
      name: axElement.name,
      description: axElement.description,
      value: axElement.value,
      interactive: axElement.interactive,
      attributes: { ...axElement.attributes },
      source: matchingDOMElement ? 'hybrid' : 'accessibility',
      backendDOMNodeId: axElement.backendDOMNodeId,
    };

    selectedElements.push(hybrid);
  });

  // Step 2: Add DOM-only elements (supplementation)
  domElements.forEach((domElement, index) => {
    if (!usedDOMIndices.has(index)) {
      // This DOM element is not in accessibility tree, add it
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
      const description = domElement.getAttribute('title') ||
                         domElement.getAttribute('aria-description') ||
                         null;
      const value = (domElement as HTMLInputElement).value ||
                   domElement.getAttribute('value') ||
                   null;

      const hybrid: HybridElement = {
        id: selectedElements.length,
        domElement,
        role,
        name,
        description,
        value,
        interactive: true,
        attributes: {
          role,
          ...(name ? { 'aria-label': name } : {}),
          ...(description ? { title: description } : {}),
        },
        source: 'dom',
      };

      selectedElements.push(hybrid);
    }
  });

  return selectedElements;
}
