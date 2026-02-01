/**
 * CDP-Based DOM Extraction
 *
 * Pure CDP (Chrome DevTools Protocol) implementation for DOM extraction.
 * This replaces content script injection with direct CDP calls, eliminating
 * "content script not ready" race conditions.
 *
 * Uses:
 * - Accessibility.getFullAXTree for semantic role/name/value extraction
 * - DOMSnapshot.captureSnapshot for bounds/visibility/paint order
 * - DOM.resolveNode for backendNodeId → objectId conversion (actions)
 *
 * Reference: CDP_DOM_EXTRACTION_MIGRATION.md
 */

import { attachDebugger, isDebuggerAttached } from './chromeDebugger';

/**
 * SemanticNodeV3 format - compatible with backend expectations
 * Minified keys for token efficiency
 */
export interface SemanticNodeV3 {
  /** Element ID (backendNodeId as string) */
  i: string;
  /** Role (minified: btn, inp, link, chk, etc.) */
  r: string;
  /** Name/label */
  n: string;
  /** Value (for inputs) */
  v?: string;
  /** State (disabled, checked, expanded, etc.) */
  s?: string;
  /** Coordinates [x, y] center point for click targeting */
  xy?: [number, number];
  /** Bounding box [x, y, width, height] for Set-of-Mark multimodal */
  box?: [number, number, number, number];
  /** Frame ID (0 = main, 1+ = iframe) */
  f?: number;
  /** True if element is occluded by overlay/modal */
  occ?: boolean;
  /** Scrollable container info */
  scr?: { depth: string; h: boolean };
}

/**
 * CDP extraction result
 */
export interface CDPExtractionResult {
  /** Interactive elements in SemanticNodeV3 format */
  interactiveTree: SemanticNodeV3[];
  /** Viewport dimensions */
  viewport: { width: number; height: number };
  /** Page title */
  pageTitle: string;
  /** Current URL */
  url: string;
  /** Scroll position description */
  scrollPosition: string;
  /** Extraction metadata */
  meta: {
    nodeCount: number;
    extractionTimeMs: number;
    axNodeCount: number;
    estimatedTokens: number;
  };
}

/**
 * Accessibility node from CDP Accessibility.getFullAXTree
 */
interface CDPAXNode {
  nodeId: string;
  ignored?: boolean;
  role?: { type: string; value?: string };
  name?: { type: string; value?: string };
  description?: { type: string; value?: string };
  value?: { type: string; value?: string };
  properties?: Array<{ name: string; value: { type: string; value?: any } }>;
  parentId?: string;
  childIds?: string[];
  backendDOMNodeId?: number;
}

/**
 * DOMSnapshot node strings index
 */
interface DOMSnapshotResult {
  documents: Array<{
    documentURL: { index: number };
    title: { index: number };
    baseURL: { index: number };
    contentLanguage: { index: number };
    encodingName: { index: number };
    publicId: { index: number };
    systemId: { index: number };
    frameId: { index: number };
    nodes: {
      nodeType: number[];
      nodeName: number[];
      nodeValue: number[];
      backendNodeId: number[];
      parentIndex: number[];
      attributes: Array<number[]>;
    };
    layout: {
      nodeIndex: number[];
      bounds: number[][];
      text: number[];
      stackingContexts?: {
        index: number[];
      };
    };
    textBoxes?: {
      layoutIndex: number[];
      bounds: number[][];
      start: number[];
      length: number[];
    };
    scrollOffsetX?: number;
    scrollOffsetY?: number;
  }>;
  strings: string[];
}

/**
 * Role mapping: Accessibility roles → minified roles
 */
const ROLE_MINIFY_MAP: Record<string, string> = {
  'button': 'btn',
  'link': 'link',
  'textbox': 'inp',
  'searchbox': 'inp',
  'combobox': 'sel',
  'listbox': 'sel',
  'checkbox': 'chk',
  'radio': 'radio',
  'menuitem': 'menu',
  'menuitemcheckbox': 'menu',
  'menuitemradio': 'menu',
  'tab': 'tab',
  'switch': 'switch',
  'slider': 'slider',
  'spinbutton': 'inp',
  'option': 'opt',
  'treeitem': 'tree',
  'heading': 'h',
  'row': 'row',
  'cell': 'cell',
  'gridcell': 'cell',
  'columnheader': 'th',
  'rowheader': 'th',
};

/**
 * Interactive roles that should be included in extraction
 */
const INTERACTIVE_ROLES = new Set([
  'button',
  'link',
  'textbox',
  'searchbox',
  'combobox',
  'listbox',
  'checkbox',
  'radio',
  'menuitem',
  'menuitemcheckbox',
  'menuitemradio',
  'tab',
  'switch',
  'slider',
  'spinbutton',
  'option',
  'treeitem',
]);

/**
 * Send a CDP command to a tab
 */
async function sendCDPCommand(
  tabId: number,
  method: string,
  params?: Record<string, any>
): Promise<any> {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

/**
 * Ensure required CDP domains are enabled
 */
async function enableCDPDomains(tabId: number): Promise<void> {
  // Check if debugger is attached, attach if not
  if (!isDebuggerAttached(tabId)) {
    await attachDebugger(tabId);
  }

  // Enable required domains
  await Promise.all([
    sendCDPCommand(tabId, 'Accessibility.enable'),
    sendCDPCommand(tabId, 'DOM.enable'),
    sendCDPCommand(tabId, 'DOMSnapshot.enable'),
    sendCDPCommand(tabId, 'Page.enable'),
  ]);
}

/**
 * Get accessibility tree via CDP
 */
async function getAccessibilityTree(tabId: number): Promise<CDPAXNode[]> {
  const result = await sendCDPCommand(tabId, 'Accessibility.getFullAXTree', {}) as { nodes?: CDPAXNode[] };
  return result?.nodes || [];
}

/**
 * Get DOM snapshot with layout info via CDP
 */
async function getDOMSnapshot(tabId: number): Promise<DOMSnapshotResult> {
  const result = await sendCDPCommand(tabId, 'DOMSnapshot.captureSnapshot', {
    computedStyles: ['display', 'visibility', 'opacity'],
    includePaintOrder: true,
    includeDOMRects: true,
  }) as DOMSnapshotResult;
  return result;
}

/**
 * Get viewport dimensions via CDP
 */
async function getViewportInfo(tabId: number): Promise<{
  width: number;
  height: number;
  scrollX: number;
  scrollY: number;
  pageTitle: string;
  url: string;
}> {
  const [metricsResult, titleResult, urlResult] = await Promise.all([
    sendCDPCommand(tabId, 'Runtime.evaluate', {
      expression: `({
        width: window.innerWidth,
        height: window.innerHeight,
        scrollX: window.scrollX,
        scrollY: window.scrollY
      })`,
      returnByValue: true,
    }),
    sendCDPCommand(tabId, 'Runtime.evaluate', {
      expression: 'document.title',
      returnByValue: true,
    }),
    sendCDPCommand(tabId, 'Runtime.evaluate', {
      expression: 'window.location.href',
      returnByValue: true,
    }),
  ]);

  return {
    width: metricsResult?.result?.value?.width || 1920,
    height: metricsResult?.result?.value?.height || 1080,
    scrollX: metricsResult?.result?.value?.scrollX || 0,
    scrollY: metricsResult?.result?.value?.scrollY || 0,
    pageTitle: titleResult?.result?.value || '',
    url: urlResult?.result?.value || '',
  };
}

/**
 * Check if a role is interactive
 */
function isInteractiveRole(role: string): boolean {
  return INTERACTIVE_ROLES.has(role.toLowerCase());
}

/**
 * Extract state from accessibility node properties
 */
function extractState(node: CDPAXNode): string | undefined {
  const states: string[] = [];

  if (node.properties) {
    for (const prop of node.properties) {
      const name = prop.name.toLowerCase();
      const value = prop.value.value;

      if (name === 'disabled' && value === true) {
        states.push('disabled');
      }
      if (name === 'checked' && value === 'true') {
        states.push('checked');
      }
      if (name === 'selected' && value === true) {
        states.push('selected');
      }
      if (name === 'expanded') {
        states.push(value === true ? 'expanded' : 'collapsed');
      }
      if (name === 'pressed' && value === true) {
        states.push('pressed');
      }
      if (name === 'readonly' && value === true) {
        states.push('readonly');
      }
      if (name === 'required' && value === true) {
        states.push('required');
      }
    }
  }

  return states.length > 0 ? states.join(',') : undefined;
}

/**
 * Build a lookup map from backendNodeId to bounds
 */
function buildBoundsMap(
  snapshot: DOMSnapshotResult
): Map<number, { x: number; y: number; w: number; h: number }> {
  const boundsMap = new Map<number, { x: number; y: number; w: number; h: number }>();

  if (!snapshot.documents || snapshot.documents.length === 0) {
    return boundsMap;
  }

  for (const doc of snapshot.documents) {
    const { nodes, layout } = doc;

    if (!nodes || !layout) continue;

    // Build a map from node index to backendNodeId
    const backendNodeIds = nodes.backendNodeId || [];

    // Layout contains nodeIndex and bounds arrays
    const layoutNodeIndices = layout.nodeIndex || [];
    const layoutBounds = layout.bounds || [];

    for (let i = 0; i < layoutNodeIndices.length; i++) {
      const nodeIdx = layoutNodeIndices[i];
      const bounds = layoutBounds[i];

      if (nodeIdx !== undefined && bounds && bounds.length >= 4) {
        const backendNodeId = backendNodeIds[nodeIdx];
        if (backendNodeId !== undefined) {
          boundsMap.set(backendNodeId, {
            x: bounds[0],
            y: bounds[1],
            w: bounds[2],
            h: bounds[3],
          });
        }
      }
    }
  }

  return boundsMap;
}

/**
 * Check if element is in viewport
 *
 * NOTE: Currently unused - for human-driven automation we send ALL interactive elements.
 * Kept for potential future use in agentic/token-optimized modes.
 */
function _isInViewport(
  bounds: { x: number; y: number; w: number; h: number },
  viewport: { width: number; height: number },
  scrollX: number,
  scrollY: number
): boolean {
  // Element center
  const centerX = bounds.x + bounds.w / 2;
  const centerY = bounds.y + bounds.h / 2;

  // Viewport bounds (account for scroll)
  const viewLeft = scrollX;
  const viewRight = scrollX + viewport.width;
  const viewTop = scrollY;
  const viewBottom = scrollY + viewport.height;

  // Check if center is in viewport
  return centerX >= viewLeft && centerX <= viewRight &&
         centerY >= viewTop && centerY <= viewBottom;
}

/**
 * Convert accessibility tree to SemanticNodeV3 format
 */
function convertToSemanticNodes(
  axNodes: CDPAXNode[],
  boundsMap: Map<number, { x: number; y: number; w: number; h: number }>,
  viewport: { width: number; height: number },
  scrollX: number,
  scrollY: number
): SemanticNodeV3[] {
  const nodes: SemanticNodeV3[] = [];

  for (const axNode of axNodes) {
    // Skip ignored nodes
    if (axNode.ignored) continue;

    // Get role
    const role = axNode.role?.value || '';
    if (!role) continue;

    // Only include interactive elements
    if (!isInteractiveRole(role)) continue;

    // Must have backendDOMNodeId for action targeting
    const backendNodeId = axNode.backendDOMNodeId;
    if (backendNodeId === undefined) continue;

    // Get name
    const name = axNode.name?.value || '';

    // Get bounds
    const bounds = boundsMap.get(backendNodeId);

    // Skip elements without bounds (invisible/zero-size)
    // NOTE: We do NOT skip elements outside viewport - for human-driven automation,
    // we need the COMPLETE semantic tree of all interactive elements on the page
    if (!bounds || bounds.w === 0 || bounds.h === 0) continue;

    // Calculate center coordinates
    const centerX = Math.round(bounds.x + bounds.w / 2);
    const centerY = Math.round(bounds.y + bounds.h / 2);

    // Build semantic node
    const semanticNode: SemanticNodeV3 = {
      i: String(backendNodeId),
      r: ROLE_MINIFY_MAP[role.toLowerCase()] || role.substring(0, 4),
      n: name.substring(0, 100), // Truncate long names
      xy: [centerX, centerY],
      box: [
        Math.round(bounds.x),
        Math.round(bounds.y),
        Math.round(bounds.w),
        Math.round(bounds.h),
      ],
    };

    // Add value if present
    if (axNode.value?.value) {
      semanticNode.v = String(axNode.value.value).substring(0, 200);
    }

    // Add state if present
    const state = extractState(axNode);
    if (state) {
      semanticNode.s = state;
    }

    nodes.push(semanticNode);
  }

  return nodes;
}

/**
 * Estimate tokens for the extraction result
 */
function estimateTokens(nodes: SemanticNodeV3[]): number {
  // Rough estimate: ~10-20 tokens per node
  return nodes.length * 15;
}

/**
 * Calculate scroll position description
 */
function getScrollPositionDescription(
  scrollX: number,
  scrollY: number,
  viewport: { width: number; height: number }
): string {
  // Get full page dimensions via a separate call would be needed
  // For now, provide a simple description
  if (scrollX === 0 && scrollY === 0) {
    return 'top';
  }
  return `scrolled ${scrollY}px down`;
}

/**
 * Extract DOM via CDP - Main entry point
 *
 * @param tabId - The tab ID to extract from
 * @returns CDPExtractionResult with interactive tree and metadata
 */
export async function extractDomViaCDP(tabId: number): Promise<CDPExtractionResult> {
  const startTime = Date.now();

  // Ensure CDP domains are enabled
  await enableCDPDomains(tabId);

  // Fetch data in parallel
  const [axNodes, snapshot, viewportInfo] = await Promise.all([
    getAccessibilityTree(tabId),
    getDOMSnapshot(tabId),
    getViewportInfo(tabId),
  ]);

  // Build bounds map from snapshot
  const boundsMap = buildBoundsMap(snapshot);

  // Convert to semantic nodes
  const interactiveTree = convertToSemanticNodes(
    axNodes,
    boundsMap,
    { width: viewportInfo.width, height: viewportInfo.height },
    viewportInfo.scrollX,
    viewportInfo.scrollY
  );

  const extractionTimeMs = Date.now() - startTime;

  return {
    interactiveTree,
    viewport: {
      width: viewportInfo.width,
      height: viewportInfo.height,
    },
    pageTitle: viewportInfo.pageTitle,
    url: viewportInfo.url,
    scrollPosition: getScrollPositionDescription(
      viewportInfo.scrollX,
      viewportInfo.scrollY,
      { width: viewportInfo.width, height: viewportInfo.height }
    ),
    meta: {
      nodeCount: interactiveTree.length,
      extractionTimeMs,
      axNodeCount: axNodes.length,
      estimatedTokens: estimateTokens(interactiveTree),
    },
  };
}

/**
 * Resolve a backendNodeId to an objectId for action execution
 *
 * @param tabId - The tab ID
 * @param backendNodeId - The backend node ID from extraction
 * @returns objectId for use with Runtime.callFunctionOn, etc.
 */
export async function resolveBackendNodeId(
  tabId: number,
  backendNodeId: number
): Promise<string> {
  const result = await sendCDPCommand(tabId, 'DOM.resolveNode', {
    backendNodeId,
  }) as { object?: { objectId?: string } };

  if (!result?.object?.objectId) {
    throw new Error(`Failed to resolve backendNodeId ${backendNodeId}`);
  }

  return result.object.objectId;
}

/**
 * Get element bounds by backendNodeId
 */
export async function getElementBounds(
  tabId: number,
  backendNodeId: number
): Promise<{ x: number; y: number; width: number; height: number } | null> {
  try {
    const objectId = await resolveBackendNodeId(tabId, backendNodeId);

    const result = await sendCDPCommand(tabId, 'DOM.getBoxModel', {
      objectId,
    }) as { model?: { border: number[] } };

    if (!result?.model?.border) {
      return null;
    }

    const [x1, y1, x2, , x3, y3] = result.model.border;
    return {
      x: x1,
      y: y1,
      width: Math.abs(x3 - x1),
      height: Math.abs(y3 - y1),
    };
  } catch (error) {
    console.warn(`Failed to get bounds for backendNodeId ${backendNodeId}:`, error);
    return null;
  }
}
