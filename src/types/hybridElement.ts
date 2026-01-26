/**
 * Hybrid Element Types for Thin Client Architecture
 * 
 * Unified element representation combining accessibility tree and DOM data.
 * Elements contain both accessibility and DOM information, preferring accessibility data when available.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §8.1 (Task 7: Hybrid Element Representation)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 4)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.3 (Recommended Approach: Accessibility Tree + Current Approach)
 */

import type { AXNode } from './accessibility';
import type { SimplifiedAXElement } from '../helpers/accessibilityFilter';

/**
 * Hybrid element combining accessibility node data and DOM element data
 * Prefers accessibility data when available, supplements with DOM when needed
 */
export interface HybridElement {
  id: number; // Element index (for action targeting)
  axNode?: AXNode; // Original accessibility node (if available)
  axElement?: SimplifiedAXElement; // Simplified accessibility element (if available)
  domElement?: HTMLElement; // Original DOM element (if available)
  role: string; // Combined role (prefer accessibility, fallback to DOM)
  name: string | null; // Combined name (prefer accessibility, fallback to DOM)
  description: string | null; // Combined description (prefer accessibility, fallback to DOM)
  value: string | null; // Combined value (prefer accessibility, fallback to DOM)
  interactive: boolean; // Whether element is interactive
  attributes: Record<string, string>; // Combined attributes from both sources
  source: 'accessibility' | 'dom' | 'hybrid'; // Primary data source
  backendDOMNodeId?: number; // Backend DOM node ID for mapping (if available)
}

/**
 * Options for creating hybrid elements
 */
export interface HybridElementOptions {
  preferAccessibility?: boolean; // Prefer accessibility data over DOM (default: true)
  supplementWithDOM?: boolean; // Supplement accessibility with DOM data (default: true)
}
