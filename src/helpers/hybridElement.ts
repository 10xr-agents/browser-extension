/**
 * Hybrid Element Helper for Thin Client Architecture
 * 
 * Creates unified element representation combining accessibility tree and DOM data.
 * Prefers accessibility data when available, supplements with DOM when needed.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §8.1 (Task 7: Hybrid Element Representation)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 4)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.3 (Recommended Approach: Accessibility Tree + Current Approach)
 */

import type { HybridElement, HybridElementOptions } from '../types/hybridElement';
import type { SimplifiedAXElement } from './accessibilityFilter';

/**
 * Create hybrid element from accessibility element and optional DOM element
 * 
 * Merges accessibility and DOM information, preferring accessibility data when available.
 * 
 * @param axElement - Simplified accessibility element
 * @param elementId - Element index for action targeting
 * @param domElement - Optional DOM element to supplement with
 * @param options - Options for creating hybrid element
 * @returns HybridElement with combined data
 */
export function createHybridElement(
  axElement: SimplifiedAXElement,
  elementId: number,
  domElement?: HTMLElement,
  options: HybridElementOptions = {}
): HybridElement {
  const {
    preferAccessibility = true,
    supplementWithDOM = true,
  } = options;

  // Start with accessibility data as base
  const hybrid: HybridElement = {
    id: elementId,
    axElement,
    domElement,
    role: axElement.role,
    name: axElement.name,
    description: axElement.description,
    value: axElement.value,
    interactive: axElement.interactive,
    attributes: { ...axElement.attributes },
    source: domElement ? 'hybrid' : 'accessibility',
    backendDOMNodeId: axElement.backendDOMNodeId,
    // Critical: Include popup/dropdown indicators for expected outcome generation
    // When hasPopup is set, clicking opens a popup instead of navigating
    hasPopup: axElement.hasPopup,
    expanded: axElement.expanded,
  };

  // Supplement with DOM data if available and enabled
  if (domElement && supplementWithDOM) {
    // Get role from DOM if not in accessibility or if not preferring accessibility
    if (!preferAccessibility || !hybrid.role) {
      const domRole = domElement.getAttribute('role') || 
                      (domElement.tagName === 'BUTTON' ? 'button' :
                       domElement.tagName === 'INPUT' ? 'textbox' :
                       domElement.tagName === 'A' ? 'link' :
                       domElement.tagName === 'SELECT' ? 'combobox' :
                       domElement.tagName === 'TEXTAREA' ? 'textbox' : null);
      if (domRole) {
        hybrid.role = domRole;
      }
    }

    // Get name from DOM if not in accessibility or if not preferring accessibility
    if (!preferAccessibility || !hybrid.name) {
      const domName = domElement.getAttribute('aria-label') ||
                      domElement.getAttribute('name') ||
                      domElement.getAttribute('placeholder') ||
                      domElement.textContent?.trim() ||
                      null;
      if (domName) {
        hybrid.name = domName;
      }
    }

    // Get description from DOM if not in accessibility
    if (!hybrid.description) {
      const domDescription = domElement.getAttribute('title') ||
                            domElement.getAttribute('aria-description') ||
                            null;
      if (domDescription) {
        hybrid.description = domDescription;
      }
    }

    // Get value from DOM if not in accessibility
    if (!hybrid.value) {
      const domValue = (domElement as HTMLInputElement).value ||
                      domElement.getAttribute('value') ||
                      null;
      if (domValue) {
        hybrid.value = domValue;
      }
    }

    // Merge DOM attributes (don't overwrite accessibility attributes if preferring accessibility)
    const domAttributes = [
      'aria-label',
      'name',
      'type',
      'placeholder',
      'value',
      'role',
      'title',
      'data-id',
      'data-interactive',
      'data-visible',
      'aria-haspopup', // Critical for dropdown detection
      'aria-expanded', // Critical for dropdown state
    ];

    domAttributes.forEach((attr) => {
      const domValue = domElement.getAttribute(attr);
      if (domValue) {
        // Only add if not preferring accessibility or if attribute not already set
        if (!preferAccessibility || !hybrid.attributes[attr]) {
          hybrid.attributes[attr] = domValue;
        }
      }
    });
    
    // Supplement hasPopup from DOM if not in accessibility
    // This is critical for expected outcome generation
    if (!hybrid.hasPopup) {
      const domHasPopup = domElement.getAttribute('aria-haspopup');
      if (domHasPopup) {
        hybrid.hasPopup = domHasPopup;
        hybrid.attributes['aria-haspopup'] = domHasPopup;
      }
    }
    
    // Supplement expanded from DOM if not in accessibility
    if (hybrid.expanded === undefined) {
      const domExpanded = domElement.getAttribute('aria-expanded');
      if (domExpanded !== null) {
        hybrid.expanded = domExpanded === 'true';
        hybrid.attributes['aria-expanded'] = domExpanded;
      }
    }

    // Update source to hybrid if we have both
    if (hybrid.axElement && domElement) {
      hybrid.source = 'hybrid';
    }
  }

  return hybrid;
}

/**
 * Create hybrid elements from accessibility elements and DOM elements
 * 
 * @param axElements - Array of simplified accessibility elements
 * @param domElements - Array of DOM elements (optional, matched by index or mapping)
 * @param elementMapping - Optional mapping from axNodeId to element index
 * @param options - Options for creating hybrid elements
 * @returns Array of hybrid elements
 */
export function createHybridElements(
  axElements: SimplifiedAXElement[],
  domElements?: HTMLElement[],
  elementMapping?: Map<string, number>,
  options: HybridElementOptions = {}
): HybridElement[] {
  return axElements.map((axElement, index) => {
    // Get element index from mapping if available, otherwise use array index
    const elementId = elementMapping?.get(axElement.axNodeId) ?? index;
    
    // Try to find corresponding DOM element
    let domElement: HTMLElement | undefined;
    if (domElements) {
      // Try by index first
      if (elementId < domElements.length) {
        domElement = domElements[elementId];
      }
      
      // If not found, try to match by attributes
      if (!domElement) {
        domElement = domElements.find((el) => {
          const elRole = el.getAttribute('role') || 
                        (el.tagName === 'BUTTON' ? 'button' :
                         el.tagName === 'INPUT' ? 'textbox' :
                         el.tagName === 'A' ? 'link' : null);
          const elName = el.getAttribute('aria-label') || el.getAttribute('name');
          return elRole === axElement.role && elName === axElement.name;
        });
      }
    }

    return createHybridElement(axElement, elementId, domElement, options);
  });
}

/**
 * Convert hybrid element to simplified DOM representation
 * 
 * Creates a DOM element from hybrid element data, preferring accessibility information.
 * 
 * @param hybrid - Hybrid element to convert
 * @returns HTMLElement representing the hybrid element
 */
export function hybridElementToDOM(hybrid: HybridElement): HTMLElement {
  // Determine tag name from role or use div as default
  const tagName = hybrid.role === 'button' ? 'button' :
                  hybrid.role === 'textbox' || hybrid.role === 'searchbox' ? 'input' :
                  hybrid.role === 'link' ? 'a' :
                  hybrid.role === 'checkbox' ? 'input' :
                  hybrid.role === 'radio' ? 'input' :
                  hybrid.role === 'combobox' ? 'select' :
                  'div';

  const element = document.createElement(tagName);

  // Set id for action targeting
  element.setAttribute('id', hybrid.id.toString());

  // Set role
  if (hybrid.role) {
    element.setAttribute('role', hybrid.role);
  }

  // Set name/aria-label
  if (hybrid.name) {
    element.setAttribute('aria-label', hybrid.name);
  }

  // Set description/title
  if (hybrid.description) {
    element.setAttribute('title', hybrid.description);
  }

  // Set value
  if (hybrid.value) {
    element.setAttribute('value', hybrid.value);
    if (element instanceof HTMLInputElement || element instanceof HTMLTextAreaElement) {
      element.value = hybrid.value;
    }
  }

  // Set all attributes
  Object.entries(hybrid.attributes).forEach(([key, value]) => {
    if (key !== 'role' && key !== 'aria-label' && key !== 'title' && key !== 'value') {
      element.setAttribute(key, value);
    }
  });

  // Mark as hybrid element
  element.setAttribute('data-hybrid', 'true');
  element.setAttribute('data-source', hybrid.source);

  // Add accessibility node ID if available
  if (hybrid.axElement) {
    element.setAttribute('data-ax-node-id', hybrid.axElement.axNodeId);
  }
  
  // Add hasPopup attribute (critical for expected outcome generation)
  // When hasPopup is set, clicking this element opens a popup instead of navigating
  if (hybrid.hasPopup) {
    element.setAttribute('aria-haspopup', hybrid.hasPopup);
    // Also add as data attribute for easy parsing
    element.setAttribute('data-has-popup', hybrid.hasPopup);
  }
  
  // Add expanded state
  if (hybrid.expanded !== undefined) {
    element.setAttribute('aria-expanded', hybrid.expanded.toString());
  }

  return element;
}
