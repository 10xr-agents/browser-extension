/**
 * Accessibility Node Filtering Helper for Thin Client Architecture
 * 
 * Filters accessibility tree to interactive elements only and converts to simplified element representation.
 * Integrates accessibility-derived elements into DOM processing pipeline.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §6.1 (Task 5: Accessibility Node Filtering)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 2)
 */

import type { AXNode } from '../types/accessibility';

/**
 * Interactive roles that should be included in simplified DOM
 * Based on ARIA roles and common interactive element types
 */
const INTERACTIVE_ROLES = [
  'button',
  'link',
  'textbox',
  'checkbox',
  'radio',
  'combobox',
  'menuitem',
  'tab',
  'menubar',
  'menu',
  'menuitemcheckbox',
  'menuitemradio',
  'option',
  'searchbox',
  'slider',
  'spinbutton',
  'switch',
  'tablist',
  'treeitem',
  'gridcell',
  'cell',
  'row',
  'columnheader',
  'rowheader',
] as const;

/**
 * Simplified element representation from accessibility node
 * Compatible with existing DOM processing pipeline
 */
export interface SimplifiedAXElement {
  axNodeId: string;
  role: string;
  name: string | null;
  description: string | null;
  value: string | null;
  interactive: boolean;
  backendDOMNodeId?: number; // For mapping to DOM element
  attributes: Record<string, string>; // Extracted attributes
  // Popup/dropdown indicators (critical for expected outcome generation)
  hasPopup?: string; // 'menu', 'listbox', 'tree', 'grid', 'dialog', 'true', or undefined
  expanded?: boolean; // Current expanded state (for dropdowns)
}

/**
 * Filter accessibility tree to interactive elements only
 * 
 * @param nodes - Array of accessibility nodes to filter
 * @returns Filtered array of interactive accessibility nodes
 */
export function filterInteractiveAXNodes(nodes: AXNode[]): AXNode[] {
  return nodes.filter((node) => {
    // Skip ignored nodes
    if (node.ignored === true) {
      return false;
    }

    // Get role value (prefer role over chromeRole)
    const roleValue = node.role?.value || node.chromeRole?.value;
    if (!roleValue) {
      return false;
    }

    // Check if role is interactive
    const isInteractiveRole = INTERACTIVE_ROLES.some(
      (interactiveRole) => roleValue.toLowerCase() === interactiveRole.toLowerCase()
    );

    // Check if node has interactive properties
    const hasValue = node.value !== undefined && node.value !== null;
    const hasChecked = node.properties?.some((prop) => prop.name === 'checked');
    const hasExpanded = node.properties?.some((prop) => prop.name === 'expanded');
    const hasSelected = node.properties?.some((prop) => prop.name === 'selected');

    // Include if interactive role or has interactive properties
    return (
      isInteractiveRole ||
      hasValue ||
      hasChecked !== undefined ||
      hasExpanded !== undefined ||
      hasSelected !== undefined
    );
  });
}

/**
 * Convert filtered accessibility node to simplified element representation
 * 
 * @param node - Accessibility node to convert
 * @returns Simplified element representation
 */
export function convertAXNodeToSimplifiedElement(
  node: AXNode
): SimplifiedAXElement {
  const roleValue = node.role?.value || node.chromeRole?.value || 'unknown';
  const name = node.name?.value || null;
  const description = node.description?.value || null;
  const value = node.value?.value || null;

  // Extract attributes from properties
  const attributes: Record<string, string> = {};
  
  // Critical popup/dropdown indicators for expected outcome generation
  let hasPopup: string | undefined;
  let expanded: boolean | undefined;
  
  if (node.properties) {
    for (const prop of node.properties) {
      if (prop.value?.value) {
        attributes[prop.name] = prop.value.value;
        
        // Extract hasPopup property (critical for dropdown detection)
        // Values can be: 'menu', 'listbox', 'tree', 'grid', 'dialog', 'true'
        if (prop.name === 'hasPopup' || prop.name === 'haspopup') {
          hasPopup = prop.value.value;
        }
        
        // Extract expanded state (for detecting open/closed dropdowns)
        if (prop.name === 'expanded') {
          expanded = prop.value.value === 'true';
        }
      }
    }
  }

  // Add role as attribute
  attributes['role'] = roleValue;

  // Add name as aria-label if available
  if (name) {
    attributes['aria-label'] = name;
  }

  // Add description if available
  if (description) {
    attributes['title'] = description;
  }
  
  // Add hasPopup as attribute if present (important for DOM simplification)
  if (hasPopup) {
    attributes['aria-haspopup'] = hasPopup;
  }
  
  // Add expanded as attribute if present
  if (expanded !== undefined) {
    attributes['aria-expanded'] = expanded.toString();
  }

  // Determine if interactive based on role
  const isInteractive = INTERACTIVE_ROLES.some(
    (interactiveRole) => roleValue.toLowerCase() === interactiveRole.toLowerCase()
  ) || node.value !== undefined;

  return {
    axNodeId: node.nodeId,
    role: roleValue,
    name,
    description,
    value,
    interactive: isInteractive,
    backendDOMNodeId: node.backendDOMNodeId,
    attributes,
    hasPopup,
    expanded,
  };
}

/**
 * Convert array of filtered accessibility nodes to simplified elements
 * 
 * @param nodes - Filtered accessibility nodes
 * @returns Array of simplified element representations
 */
export function convertAXNodesToSimplifiedElements(
  nodes: AXNode[]
): SimplifiedAXElement[] {
  return nodes.map(convertAXNodeToSimplifiedElement);
}
