/**
 * Skeleton DOM Extraction for Hybrid Vision + Skeleton Pipeline
 * 
 * Extracts only interactive elements from the DOM, creating a minimal
 * HTML string suitable for LLM action targeting (~500-2000 chars vs ~50k for full DOM).
 * 
 * Reference: HYBRID_VISION_SKELETON_EXTENSION_SPEC.md §2
 */

/**
 * Element info for skeleton DOM tree
 */
export interface SkeletonElement {
  tag: string;
  id?: string;
  nodeId?: number; // backend_node_id
  text?: string;   // innerText (truncated)
  attrs: Record<string, string>;
  children?: SkeletonElement[];
}

// Tags that are always interactive
const INTERACTIVE_TAGS = new Set([
  'a', 'button', 'input', 'select', 'textarea', 'option',
]);

// Roles that make an element interactive
const INTERACTIVE_ROLES = new Set([
  'button', 'link', 'menuitem', 'tab', 'checkbox', 'radio', 
  'switch', 'option', 'combobox', 'listbox', 'textbox',
  'searchbox', 'spinbutton', 'slider', 'menuitemcheckbox',
  'menuitemradio', 'treeitem',
]);

// Tags to completely skip
const DISCARD_TAGS = new Set([
  'style', 'script', 'noscript', 'svg', 'path', 'link', 'meta',
  'head', 'title', 'template', 'slot', 'iframe',
]);

// Attributes to keep in skeleton
const KEEP_ATTRS = new Set([
  'name', 'type', 'href', 'value', 'placeholder', 'role', 
  'aria-label', 'title', 'data-testid', 'data-id',
  'disabled', 'readonly', 'checked', 'selected',
]);

// Maximum text length before truncation
const MAX_TEXT_LENGTH = 100;

/**
 * Extract skeleton DOM from annotated DOM HTML string.
 * 
 * @param annotatedDomHtml - The full annotated DOM HTML from getAnnotatedDOM()
 * @returns Minimal HTML containing only interactive elements
 */
export function extractSkeletonDom(annotatedDomHtml: string): string {
  // Parse the HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(annotatedDomHtml, 'text/html');
  
  // Extract skeleton from body
  const skeleton = extractSkeletonNode(doc.body);
  
  // Convert to minimal HTML string
  return skeleton ? skeletonToHtml(skeleton) : '';
}

/**
 * Extract skeleton DOM directly from a DOM element (for content script use).
 * 
 * @param root - Root element to extract from (defaults to document.body)
 * @returns Minimal HTML containing only interactive elements
 */
export function extractSkeletonFromElement(root: Element = document.body): string {
  const skeleton = extractSkeletonNode(root);
  return skeleton ? skeletonToHtml(skeleton) : '';
}

/**
 * Recursively extract interactive elements from a DOM node.
 */
function extractSkeletonNode(element: Element): SkeletonElement | null {
  // Skip text/comment nodes
  if (element.nodeType !== Node.ELEMENT_NODE) return null;
  
  const tag = element.tagName.toLowerCase();
  
  // Skip discard tags entirely
  if (DISCARD_TAGS.has(tag)) return null;
  
  // Skip hidden elements
  if (isHidden(element)) return null;
  
  // Check if this element is interactive
  const isInteractive = checkInteractive(element);
  
  // Extract children
  const children: SkeletonElement[] = [];
  for (const child of element.children) {
    const childSkeleton = extractSkeletonNode(child);
    if (childSkeleton) {
      children.push(childSkeleton);
    }
  }
  
  // If not interactive and no interactive children, skip
  if (!isInteractive && children.length === 0) return null;
  
  // Build skeleton element
  const skeleton: SkeletonElement = {
    tag,
    attrs: {},
    children: children.length > 0 ? children : undefined,
  };
  
  // For interactive elements, extract essential attributes
  if (isInteractive) {
    // Get element ID from multiple sources
    // Priority: data-llm-id (tagger) > data-element-id (fallback) > data-id (legacy) > native id
    const llmId = element.getAttribute('data-llm-id');
    const elementDataId = element.getAttribute('data-element-id');
    const dataId = element.getAttribute('data-id');
    const elementId = element.id;
    skeleton.id = llmId || elementDataId || dataId || elementId || undefined;
    
    // Get backend node ID if available
    const backendNodeId = element.getAttribute('data-backend-node-id');
    if (backendNodeId) {
      skeleton.nodeId = parseInt(backendNodeId, 10);
    }
    
    // Extract essential attributes
    skeleton.attrs = extractEssentialAttrs(element);
    
    // Get visible text (truncated)
    skeleton.text = getVisibleText(element, children.length > 0);
  }
  
  return skeleton;
}

/**
 * Check if element is interactive.
 */
function checkInteractive(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  
  // Always interactive tags
  if (INTERACTIVE_TAGS.has(tag)) return true;
  
  // Check for click handlers
  if (element.hasAttribute('onclick')) return true;
  
  // Check for interactive roles
  const role = element.getAttribute('role');
  if (role && INTERACTIVE_ROLES.has(role)) return true;
  
  // Check for tabindex (focusable)
  const tabindex = element.getAttribute('tabindex');
  if (tabindex !== null && parseInt(tabindex, 10) >= 0) return true;
  
  // Check for contenteditable
  if (element.getAttribute('contenteditable') === 'true') return true;
  
  // Check for data-interactive marker (from our annotation)
  if (element.getAttribute('data-interactive') === 'true') return true;
  
  // Check for cursor: pointer (indicates clickable) - only if inline style
  const style = element.getAttribute('style');
  if (style && style.includes('cursor') && style.includes('pointer')) return true;
  
  return false;
}

/**
 * Check if element is hidden.
 */
function isHidden(element: Element): boolean {
  // Check data-visible from annotation
  const dataVisible = element.getAttribute('data-visible');
  if (dataVisible === 'false') return true;
  
  // Check aria-hidden
  if (element.getAttribute('aria-hidden') === 'true') return true;
  
  // Check hidden attribute
  if (element.hasAttribute('hidden')) return true;
  
  // Check type="hidden" for inputs
  if (element.getAttribute('type') === 'hidden') return true;
  
  return false;
}

/**
 * Extract essential attributes from an element.
 */
function extractEssentialAttrs(element: Element): Record<string, string> {
  const attrs: Record<string, string> = {};
  
  for (const attr of Array.from(element.attributes)) {
    if (KEEP_ATTRS.has(attr.name) && attr.value) {
      attrs[attr.name] = attr.value;
    }
  }
  
  return attrs;
}

/**
 * Get visible text content (truncated).
 */
function getVisibleText(element: Element, hasChildren: boolean): string | undefined {
  // If element has skeleton children, don't duplicate their text
  if (hasChildren) {
    // Only get direct text nodes
    let text = '';
    for (const node of element.childNodes) {
      if (node.nodeType === Node.TEXT_NODE) {
        text += node.textContent || '';
      }
    }
    text = text.trim();
    if (!text) return undefined;
    return truncateText(text);
  }
  
  // Get full text content
  const text = element.textContent?.trim();
  if (!text) return undefined;
  
  return truncateText(text);
}

/**
 * Truncate text to max length.
 */
function truncateText(text: string): string {
  if (text.length <= MAX_TEXT_LENGTH) return text;
  return text.substring(0, MAX_TEXT_LENGTH) + '...';
}

/**
 * Convert skeleton tree to minimal HTML string.
 */
function skeletonToHtml(skeleton: SkeletonElement | null, indent = 0): string {
  if (!skeleton) return '';
  
  const { tag, id, attrs = {}, text, children } = skeleton;
  const pad = '  '.repeat(indent);
  
  // Build attribute string
  const attrParts: string[] = [];
  if (id) attrParts.push(`id="${escapeHtml(id)}"`);
  for (const [key, value] of Object.entries(attrs)) {
    // Skip data-id if we already have id
    if (key === 'data-id' && id) continue;
    attrParts.push(`${key}="${escapeHtml(value)}"`);
  }
  const attrStr = attrParts.length > 0 ? ' ' + attrParts.join(' ') : '';
  
  // Self-closing tags
  const SELF_CLOSING = new Set(['input', 'br', 'hr', 'img', 'meta', 'link']);
  if (SELF_CLOSING.has(tag)) {
    return `${pad}<${tag}${attrStr} />\n`;
  }
  
  // Build content
  let content = '';
  if (text && (!children || children.length === 0)) {
    content = escapeHtml(text);
  } else if (children && children.length > 0) {
    content = '\n' + children.map(c => skeletonToHtml(c, indent + 1)).join('') + pad;
  }
  
  return `${pad}<${tag}${attrStr}>${content}</${tag}>\n`;
}

/**
 * Escape HTML special characters.
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Count interactive elements in the skeleton.
 */
export function countSkeletonElements(skeleton: SkeletonElement | null): number {
  if (!skeleton) return 0;
  
  let count = skeleton.id ? 1 : 0; // Count if it has an ID (is interactive)
  
  if (skeleton.children) {
    for (const child of skeleton.children) {
      count += countSkeletonElements(child);
    }
  }
  
  return count;
}

/**
 * Get statistics about skeleton extraction.
 */
export interface SkeletonStats {
  interactiveCount: number;
  skeletonLength: number;
  compressionRatio: number;
}

export function getSkeletonStats(originalDomLength: number, skeletonHtml: string): SkeletonStats {
  // Count interactive elements by counting id= occurrences
  const interactiveCount = (skeletonHtml.match(/id="/g) || []).length;
  const skeletonLength = skeletonHtml.length;
  const compressionRatio = originalDomLength > 0
    ? Math.round((1 - skeletonLength / originalDomLength) * 100)
    : 0;

  return {
    interactiveCount,
    skeletonLength,
    compressionRatio,
  };
}

/**
 * FALLBACK: Extract a minimal interactive tree from skeleton DOM HTML
 * when semantic extraction via RPC fails.
 *
 * This provides ~95% token reduction compared to sending full skeletonDom.
 *
 * @param skeletonHtml - The skeleton DOM HTML string
 * @returns Array of minified semantic nodes
 */
export interface MinimalSemanticNode {
  i: string;  // ID
  r: string;  // Role (minified)
  n: string;  // Name/label
  v?: string; // Value (for inputs)
}

const ROLE_MAP: Record<string, string> = {
  'a': 'link',
  'button': 'btn',
  'input': 'inp',
  'select': 'sel',
  'textarea': 'inp',
  'option': 'opt',
};

export function extractInteractiveTreeFromSkeleton(skeletonHtml: string): MinimalSemanticNode[] {
  const nodes: MinimalSemanticNode[] = [];

  // Parse the skeleton HTML
  const parser = new DOMParser();
  const doc = parser.parseFromString(`<body>${skeletonHtml}</body>`, 'text/html');

  // Find all elements with IDs (these are interactive)
  const elements = doc.querySelectorAll('[id]');

  elements.forEach(el => {
    const id = el.getAttribute('id');
    if (!id) return;

    const tag = el.tagName.toLowerCase();
    const role = el.getAttribute('role') || ROLE_MAP[tag] || tag.substring(0, 4);

    // Get name from various sources
    let name = el.getAttribute('aria-label') ||
               el.getAttribute('name') ||
               el.getAttribute('title') ||
               el.getAttribute('placeholder') ||
               el.textContent?.trim().substring(0, 50) ||
               '';

    // Clean up name
    name = name.replace(/\s+/g, ' ').trim();
    if (name.length > 50) name = name.substring(0, 47) + '...';

    const node: MinimalSemanticNode = {
      i: id,
      r: role,
      n: name,
    };

    // Add value for inputs
    const value = el.getAttribute('value');
    if (value) {
      node.v = value.substring(0, 50);
    }

    nodes.push(node);
  });

  console.log(`[extractInteractiveTreeFromSkeleton] Extracted ${nodes.length} nodes from skeleton DOM`);
  return nodes;
}
