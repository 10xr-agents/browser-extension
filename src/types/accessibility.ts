/**
 * Accessibility Tree Types for Thin Client Architecture
 * 
 * TypeScript interfaces for accessibility node representation.
 * Based on Chrome DevTools Protocol Accessibility domain.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §5.1 (Task 4: Basic Accessibility Tree Extraction)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan)
 * Reference: Chrome DevTools Protocol - Accessibility.getFullAXTree
 */

/**
 * Accessibility node properties from Chrome DevTools Protocol
 * Reference: https://chromedevtools.github.io/devtools-protocol/tot/Accessibility/#type-AXNode
 */
export interface AXNode {
  nodeId: string;
  ignored?: boolean;
  ignoredReasons?: Array<{
    name: string;
    value?: string;
  }>;
  role?: {
    type: string;
    value?: string;
  };
  chromeRole?: {
    type: string;
    value?: string;
  };
  name?: {
    type: string;
    value?: string;
  };
  description?: {
    type: string;
    value?: string;
  };
  value?: {
    type: string;
    value?: string;
  };
  properties?: Array<{
    name: string;
    value: {
      type: string;
      value?: string;
    };
  }>;
  parentId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
}

/**
 * Accessibility tree structure
 * Contains root node and all accessibility nodes
 */
export interface AccessibilityTree {
  nodes: AXNode[];
  rootNodeId?: string;
}
