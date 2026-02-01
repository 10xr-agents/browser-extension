/**
 * DOM Simplification Helper - CDP-First Architecture
 *
 * Pure CDP-based DOM extraction using Accessibility.getFullAXTree and DOMSnapshot.
 * No content script dependencies - eliminates "content script not ready" race conditions.
 *
 * Reference: CDP_DOM_EXTRACTION_MIGRATION.md
 */

import { truthyFilter } from './utils';
import { getAccessibilityTree, isAccessibilityAvailable } from './accessibilityTree';
import type { AccessibilityTree } from '../types/accessibility';
import {
  filterInteractiveAXNodes,
  convertAXNodesToSimplifiedElements,
  type SimplifiedAXElement,
} from './accessibilityFilter';
import type { HybridElement } from '../types/hybridElement';
import {
  selectElementsAccessibilityFirst,
  analyzeAccessibilityCoverage,
  type CoverageMetrics,
} from './accessibilityFirst';
import {
  extractDomViaCDP,
  type CDPExtractionResult,
  type SemanticNodeV3,
} from './cdpDomExtractor';
import { waitForPageReady } from './cdpLifecycle';

/**
 * Result of DOM extraction
 */
export interface SimplifiedDomResult {
  /**
   * Raw annotated DOM HTML (legacy format - may be empty in CDP-first mode)
   */
  annotatedDomHtml: string;
  dom: HTMLElement;
  accessibilityTree?: AccessibilityTree;
  usedAccessibility: boolean;
  accessibilityElements?: SimplifiedAXElement[];
  elementMapping?: Map<string, number>;
  hybridElements?: HybridElement[];
  coverageMetrics?: CoverageMetrics;
  /** CDP extraction result (new primary format) */
  cdpResult?: CDPExtractionResult;
}

/**
 * CDP-first DOM extraction result
 * This is the new primary format used when CDP extraction succeeds
 */
export interface CDPSimplifiedResult {
  mode: 'cdp';
  interactiveTree: SemanticNodeV3[];
  viewport: { width: number; height: number };
  pageTitle: string;
  url: string;
  scrollPosition: string;
  meta: {
    nodeCount: number;
    extractionTimeMs: number;
    axNodeCount: number;
    estimatedTokens: number;
  };
}

/**
 * Get simplified DOM using CDP-first approach
 *
 * Primary: CDP extraction via Accessibility.getFullAXTree + DOMSnapshot
 * Fallback: Legacy accessibility tree extraction (for compatibility)
 *
 * @param tabId - Tab ID to extract from
 * @returns Promise<SimplifiedDomResult | null>
 */
export async function getSimplifiedDom(tabId?: number): Promise<SimplifiedDomResult | null> {
  if (tabId === undefined) {
    console.error('[getSimplifiedDom] tabId is required for CDP extraction');
    return null;
  }

  // Wait for page to be ready before extraction
  const isReady = await waitForPageReady(tabId, 10000);
  if (!isReady) {
    console.warn('[getSimplifiedDom] Page readiness timeout, proceeding anyway');
  }

  // Primary: CDP extraction
  try {
    const cdpResult = await extractDomViaCDP(tabId);

    console.log('[getSimplifiedDom] CDP extraction successful', {
      nodeCount: cdpResult.meta.nodeCount,
      extractionTimeMs: cdpResult.meta.extractionTimeMs,
      estimatedTokens: cdpResult.meta.estimatedTokens,
    });

    // Convert CDP result to hybrid elements for compatibility
    const hybridElements: HybridElement[] = cdpResult.interactiveTree.map((node, index) => ({
      id: index,
      domElement: null as any, // Not available in CDP mode
      axElement: {
        axNodeId: node.i,
        role: node.r,
        name: node.n,
        value: node.v,
        interactive: true,
        backendDOMNodeId: parseInt(node.i, 10),
      } as SimplifiedAXElement,
      role: node.r,
      name: node.n,
      description: null,
      value: node.v || null,
      interactive: true,
      bounds: node.box ? {
        x: node.box[0],
        y: node.box[1],
        width: node.box[2],
        height: node.box[3],
      } : undefined,
      attributes: {
        role: node.r,
        'aria-label': node.n,
      },
      source: 'ax' as const,
    }));

    // Create minimal DOM representation for compatibility
    const minimalDom = document.createElement('div');
    minimalDom.innerHTML = `<body data-cdp-mode="true"></body>`;

    return {
      annotatedDomHtml: '', // Not available in CDP mode
      dom: minimalDom,
      usedAccessibility: true,
      hybridElements,
      cdpResult,
      coverageMetrics: {
        axCoverage: 100,
        domOnlyElements: 0,
        axOnlyElements: cdpResult.meta.nodeCount,
        overlap: 0,
        totalInteractive: cdpResult.meta.nodeCount,
        totalAXNodes: cdpResult.meta.axNodeCount,
      },
    };
  } catch (cdpError) {
    const errorMessage = cdpError instanceof Error ? cdpError.message : String(cdpError);
    console.warn('[getSimplifiedDom] CDP extraction failed:', errorMessage);
    // Fall through to legacy extraction
  }

  // Fallback: Legacy accessibility tree extraction
  let accessibilityTree: AccessibilityTree | undefined;
  let usedAccessibility = false;

  try {
    const isAvailable = await isAccessibilityAvailable(tabId);
    if (isAvailable) {
      accessibilityTree = await getAccessibilityTree(tabId);
      usedAccessibility = true;
      console.log('[getSimplifiedDom] Legacy accessibility extraction successful', {
        nodeCount: accessibilityTree.nodes.length,
      });
    }
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[getSimplifiedDom] All extraction methods failed:', errorMessage);
    return null;
  }

  // Process accessibility tree
  let accessibilityElements: SimplifiedAXElement[] | undefined;
  let elementMapping: Map<string, number> | undefined;

  if (accessibilityTree && accessibilityTree.nodes.length > 0) {
    const filteredNodes = filterInteractiveAXNodes(accessibilityTree.nodes);
    accessibilityElements = convertAXNodesToSimplifiedElements(filteredNodes);

    elementMapping = new Map<string, number>();
    accessibilityElements.forEach((element, index) => {
      elementMapping!.set(element.axNodeId, index);
    });
  }

  // Create hybrid elements from accessibility elements
  const hybridElements: HybridElement[] = (accessibilityElements || []).map((axElement, index) => ({
    id: index,
    domElement: null as any,
    axElement,
    role: axElement.role,
    name: axElement.name,
    description: axElement.description || null,
    value: axElement.value || null,
    interactive: axElement.interactive,
    attributes: {
      role: axElement.role,
      'aria-label': axElement.name,
    },
    source: 'ax' as const,
  }));

  const minimalDom = document.createElement('div');
  minimalDom.innerHTML = '<body></body>';

  return {
    annotatedDomHtml: '',
    dom: minimalDom,
    accessibilityTree,
    usedAccessibility,
    accessibilityElements,
    elementMapping,
    hybridElements,
    coverageMetrics: {
      axCoverage: accessibilityElements ? 100 : 0,
      domOnlyElements: 0,
      axOnlyElements: accessibilityElements?.length || 0,
      overlap: 0,
      totalInteractive: accessibilityElements?.length || 0,
      totalAXNodes: accessibilityTree?.nodes.length || 0,
    },
  };
}

/**
 * Get CDP extraction result directly
 * This is the preferred method for new code
 */
export async function getCDPSimplifiedDom(tabId: number): Promise<CDPSimplifiedResult | null> {
  // Wait for page to be ready
  const isReady = await waitForPageReady(tabId, 10000);
  if (!isReady) {
    console.warn('[getCDPSimplifiedDom] Page readiness timeout, proceeding anyway');
  }

  try {
    const cdpResult = await extractDomViaCDP(tabId);

    return {
      mode: 'cdp',
      interactiveTree: cdpResult.interactiveTree,
      viewport: cdpResult.viewport,
      pageTitle: cdpResult.pageTitle,
      url: cdpResult.url,
      scrollPosition: cdpResult.scrollPosition,
      meta: cdpResult.meta,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[getCDPSimplifiedDom] CDP extraction failed:', errorMessage);
    return null;
  }
}
