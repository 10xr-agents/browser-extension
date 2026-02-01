/**
 * Accessibility Tree (AXTree) Extractor via Chrome DevTools Protocol
 * 
 * V3 ENHANCEMENT: Use Chrome's built-in Accessibility Tree instead of manual DOM scraping.
 * 
 * Benefits:
 * - 100% reliability (if Chrome says it's a button, it's a button)
 * - Bypasses Shadow DOM automatically
 * - Bypasses iframes automatically (Chrome handles stitching)
 * - Zero content script overhead
 * - Already filtered to interactive elements
 * 
 * Reference: docs/DOM_EXTRACTION_ARCHITECTURE.md
 */

/**
 * V3 SemanticNode with minified keys for ultra-light payloads
 * Legend: i=id, r=role, n=name, v=value, s=state, xy=coordinates
 */
export interface SemanticNodeV3 {
  /** Element ID (stable Chrome backendDOMNodeId) */
  i: string;
  
  /** Role (btn, inp, link, chk, etc.) */
  r: string;
  
  /** Name/label */
  n: string;
  
  /** Value (for inputs) */
  v?: string;
  
  /** State (disabled, checked, expanded, etc.) */
  s?: string;
  
  /** Coordinates [x, y] for click targeting */
  xy?: [number, number];
  
  /** Frame ID (0 = main, 1+ = iframe) */
  f?: number;
}

/**
 * Full semantic node (non-minified, for backward compatibility)
 */
export interface SemanticNodeFull {
  id: string;
  role: string;
  name: string;
  value?: string;
  state?: string;
  coordinates?: { x: number; y: number };
  frameId?: number;
  isInShadow?: boolean;
  bounds?: { x: number; y: number; width: number; height: number };
}

/**
 * AXTree node from Chrome Accessibility API
 */
interface AXNode {
  nodeId: string;
  ignored: boolean;
  role?: { type: string; value: string };
  name?: { type: string; value: string };
  value?: { type: string; value: string | number | boolean };
  properties?: Array<{
    name: string;
    value: { type: string; value: string | number | boolean };
  }>;
  childIds?: string[];
  backendDOMNodeId?: number;
  frameId?: string;
}

/**
 * Role mapping: Chrome AX roles → minified roles
 */
const ROLE_MAP: Record<string, string> = {
  'button': 'btn',
  'link': 'link',
  'textbox': 'inp',
  'searchbox': 'inp',
  'combobox': 'inp',
  'spinbutton': 'inp',
  'checkbox': 'chk',
  'radio': 'radio',
  'menuitem': 'menu',
  'menuitemcheckbox': 'menu',
  'menuitemradio': 'menu',
  'tab': 'tab',
  'listitem': 'item',
  'option': 'opt',
  'treeitem': 'tree',
  'switch': 'switch',
  'slider': 'slider',
  'heading': 'h',
  'image': 'img',
  'main': 'main',
  'navigation': 'nav',
  'form': 'form',
  'dialog': 'dialog',
  'alertdialog': 'dialog',
  'grid': 'grid',
  'row': 'row',
  'cell': 'cell',
  'columnheader': 'colh',
  'rowheader': 'rowh',
};

/**
 * Roles to include in extraction (interactive elements)
 */
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'textbox', 'searchbox', 'combobox', 'spinbutton',
  'checkbox', 'radio', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
  'tab', 'option', 'treeitem', 'switch', 'slider', 'listbox',
]);

/**
 * Extract accessibility tree from a tab using Chrome Debugger API.
 * This runs in the background script context.
 * 
 * @param tabId - The tab to extract from
 * @param options - Extraction options
 * @returns Semantic nodes from the accessibility tree
 */
export async function extractAXTree(
  tabId: number,
  options: {
    minified?: boolean;
    viewportOnly?: boolean;
    viewportWidth?: number;
    viewportHeight?: number;
  } = {}
): Promise<{
  nodes: SemanticNodeV3[] | SemanticNodeFull[];
  url: string;
  title: string;
  meta: {
    totalNodes: number;
    filteredNodes: number;
    extractionTimeMs: number;
  };
}> {
  const startTime = performance.now();
  const { minified = true, viewportOnly = true, viewportWidth = 1280, viewportHeight = 800 } = options;
  
  try {
    // 1. Enable Accessibility domain
    await chrome.debugger.sendCommand({ tabId }, 'Accessibility.enable');
    
    // 2. Get the full AX tree
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Accessibility.getFullAXTree'
    ) as { nodes: AXNode[] };
    
    if (!result || !result.nodes) {
      throw new Error('Failed to get accessibility tree');
    }
    
    // 3. Get page info
    const pageInfo = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      { expression: 'JSON.stringify({ url: window.location.href, title: document.title, width: window.innerWidth, height: window.innerHeight })' }
    ) as { result: { value: string } };
    
    const { url, title, width, height } = JSON.parse(pageInfo.result.value);
    
    // 4. Filter and transform nodes
    const totalNodes = result.nodes.length;
    const semanticNodes: (SemanticNodeV3 | SemanticNodeFull)[] = [];
    
    // Build node map for coordinate lookup
    const nodeIdToBackendId = new Map<string, number>();
    result.nodes.forEach(node => {
      if (node.backendDOMNodeId) {
        nodeIdToBackendId.set(node.nodeId, node.backendDOMNodeId);
      }
    });
    
    for (const node of result.nodes) {
      // Skip ignored nodes
      if (node.ignored) continue;
      
      // Get role
      const roleValue = node.role?.value;
      if (!roleValue || roleValue === 'none' || roleValue === 'generic') continue;
      
      // Filter to interactive roles only
      if (!INTERACTIVE_ROLES.has(roleValue)) continue;
      
      // Get name (required for useful nodes)
      const nameValue = node.name?.value;
      if (!nameValue || nameValue.trim() === '') continue;
      
      // Get backend DOM node ID (stable ID)
      const backendId = node.backendDOMNodeId;
      if (!backendId) continue;
      
      // Get coordinates if needed
      let coords: [number, number] | undefined;
      let bounds: { x: number; y: number; width: number; height: number } | undefined;
      
      if (viewportOnly) {
        // Get bounding box via DOM.getBoxModel
        try {
          const boxResult = await chrome.debugger.sendCommand(
            { tabId },
            'DOM.getBoxModel',
            { backendNodeId: backendId }
          ) as { model: { content: number[] } };
          
          if (boxResult && boxResult.model && boxResult.model.content) {
            const [x1, y1, x2, y2, x3, y3, x4, y4] = boxResult.model.content;
            const x = Math.round((x1 + x2 + x3 + x4) / 4);
            const y = Math.round((y1 + y2 + y3 + y4) / 4);
            const w = Math.abs(x2 - x1);
            const h = Math.abs(y3 - y1);
            
            // Viewport pruning: skip off-screen elements
            if (y > (height || viewportHeight) || y + h < 0) {
              continue;
            }
            
            coords = [x, y];
            bounds = { x, y, width: w, height: h };
          }
        } catch {
          // Skip elements we can't get coordinates for
          continue;
        }
      }
      
      // Extract state from properties
      const states: string[] = [];
      if (node.properties) {
        for (const prop of node.properties) {
          if (prop.name === 'disabled' && prop.value.value === true) states.push('disabled');
          if (prop.name === 'checked' && prop.value.value === true) states.push('checked');
          if (prop.name === 'selected' && prop.value.value === true) states.push('selected');
          if (prop.name === 'expanded' && prop.value.value === true) states.push('expanded');
          if (prop.name === 'focused' && prop.value.value === true) states.push('focused');
        }
      }
      
      // Get value
      const value = node.value?.value;
      
      if (minified) {
        // V3 ultra-light format
        const v3Node: SemanticNodeV3 = {
          i: String(backendId),
          r: ROLE_MAP[roleValue] || roleValue.substring(0, 4),
          n: nameValue.substring(0, 50), // Truncate long names
        };
        
        if (value !== undefined && value !== '') {
          v3Node.v = String(value).substring(0, 50);
        }
        
        if (states.length > 0) {
          v3Node.s = states.join(',');
        }
        
        if (coords) {
          v3Node.xy = coords;
        }
        
        semanticNodes.push(v3Node);
      } else {
        // Full format
        const fullNode: SemanticNodeFull = {
          id: String(backendId),
          role: roleValue,
          name: nameValue,
        };
        
        if (value !== undefined && value !== '') {
          fullNode.value = String(value);
        }
        
        if (states.length > 0) {
          fullNode.state = states.join(',');
        }
        
        if (coords) {
          fullNode.coordinates = { x: coords[0], y: coords[1] };
        }
        
        if (bounds) {
          fullNode.bounds = bounds;
        }
        
        semanticNodes.push(fullNode);
      }
    }
    
    const extractionTimeMs = Math.round(performance.now() - startTime);
    
    console.log(`[AXTree] Extracted ${semanticNodes.length} nodes from ${totalNodes} total in ${extractionTimeMs}ms`);
    
    return {
      nodes: semanticNodes,
      url,
      title,
      meta: {
        totalNodes,
        filteredNodes: semanticNodes.length,
        extractionTimeMs,
      },
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[AXTree] Extraction failed:', errorMessage);
    
    // Return empty result on error
    return {
      nodes: [],
      url: '',
      title: '',
      meta: {
        totalNodes: 0,
        filteredNodes: 0,
        extractionTimeMs: Math.round(performance.now() - startTime),
      },
    };
  }
}

/**
 * Convert V3 minified nodes to full format
 */
export function expandV3Nodes(nodes: SemanticNodeV3[]): SemanticNodeFull[] {
  // Reverse role map
  const reverseRoleMap: Record<string, string> = {};
  Object.entries(ROLE_MAP).forEach(([full, mini]) => {
    reverseRoleMap[mini] = full;
  });
  
  return nodes.map(node => ({
    id: node.i,
    role: reverseRoleMap[node.r] || node.r,
    name: node.n,
    value: node.v,
    state: node.s,
    coordinates: node.xy ? { x: node.xy[0], y: node.xy[1] } : undefined,
    frameId: node.f,
  }));
}

/**
 * Convert full format nodes to V3 minified format
 */
export function minifyNodes(nodes: SemanticNodeFull[]): SemanticNodeV3[] {
  return nodes.map(node => {
    const v3: SemanticNodeV3 = {
      i: node.id,
      r: ROLE_MAP[node.role] || node.role.substring(0, 4),
      n: node.name.substring(0, 50),
    };
    
    if (node.value) v3.v = node.value.substring(0, 50);
    if (node.state) v3.s = node.state;
    if (node.coordinates) v3.xy = [node.coordinates.x, node.coordinates.y];
    if (node.frameId) v3.f = node.frameId;
    
    return v3;
  });
}

/**
 * Get V3 payload format for LLM
 */
export function buildV3Payload(
  nodes: SemanticNodeV3[],
  url: string,
  title: string,
  viewport: { width: number; height: number }
): {
  mode: 'semantic_v3';
  url: string;
  title: string;
  viewport: { width: number; height: number };
  interactive_tree: SemanticNodeV3[];
} {
  return {
    mode: 'semantic_v3',
    url,
    title,
    viewport,
    interactive_tree: nodes,
  };
}
