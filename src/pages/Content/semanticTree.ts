/**
 * Semantic Tree Extraction - JSON-based DOM Representation (V3 Advanced)
 * 
 * This module replaces heavy HTML extraction with a lightweight JSON tree.
 * LLMs are much better at understanding structured JSON than parsing nested HTML.
 * 
 * V3 ADVANCED UPGRADES (NEW):
 * - TRUE VISIBILITY RAYCASTING: Uses elementFromPoint() to verify elements
 *   aren't covered by modals/overlays (prevents phantom click failures)
 * - EXPLICIT LABEL ASSOCIATION: Hunts for semantic labels for unnamed inputs
 *   by checking <label for>, siblings, aria-*, placeholders
 * - VIRTUAL LIST DETECTION: Identifies scrollable containers and reports scroll %
 * - BOUNDING BOX (box_2d): Full [x, y, w, h] for Set-of-Mark multimodal support
 * 
 * V3 CORE FEATURES:
 * - Viewport pruning: Skip off-screen elements (~60% reduction on long pages)
 * - Minified JSON keys: i/r/n/v/s/xy instead of id/role/name/etc.
 * - Coordinates included for click targeting
 * - Semantic mode is now PRIMARY (full DOM only on explicit backend request)
 * 
 * V2 FEATURES:
 * - Tracks isInShadow for Shadow DOM elements
 * - Tracks frameId for iframe elements
 * - Uses querySelectorAllDeep for Shadow DOM piercing
 * - Includes bounding box for visual tasks
 * 
 * Benefits:
 * - ~95-99% token reduction (50-300 tokens vs 10k-50k)
 * - Faster LLM processing (no HTML parsing)
 * - Stable IDs that don't drift
 * - Cleaner action targeting
 * - Shadow DOM and iframe support
 * - Modal/overlay awareness (no phantom clicks)
 * 
 * Reference: DOM_EXTRACTION_ARCHITECTURE.md
 */

import { 
  LLM_ID_ATTR, 
  SHADOW_ATTR, 
  FRAME_ATTR,
  ensureStableIds, 
  findElementByStableId,
  findElementByIdDeep,
  getFrameId,
  isInShadowDom,
} from './tagger';
import { querySelectorAllDeep } from 'query-selector-shadow-dom';

/**
 * Semantic node representing an interactive element for the LLM (V2)
 */
export interface SemanticNode {
  /** Stable ID from data-llm-id attribute */
  id: string;
  
  /** Semantic role: 'button', 'link', 'input', 'select', 'text', 'checkbox', etc. */
  role: string;
  
  /** Human-readable name/label the user sees */
  name: string;
  
  /** Current value (for inputs, selects, checkboxes) */
  value?: string;
  
  /** Element state: 'checked', 'disabled', 'selected', 'expanded', etc. */
  state?: string;
  
  /** Input type for input elements */
  type?: string;
  
  /** Placeholder text */
  placeholder?: string;
  
  /** Whether element is required */
  required?: boolean;
  
  /** Href for links */
  href?: string;
  
  // === V2 FIELDS ===
  
  /** Whether element is inside a Shadow DOM */
  isInShadow?: boolean;
  
  /** Frame ID (0 = main frame, >0 = iframe) */
  frameId?: number;
  
  /** Bounding box for visual tasks (optional) */
  bounds?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}

/**
 * V3 ULTRA-LIGHT FORMAT: Minified keys for maximum token efficiency
 * Legend: i=id, r=role, n=name, v=value, s=state, xy=coordinates, f=frameId
 * 
 * V3 ADVANCED FIELDS:
 * - box: [x, y, w, h] bounding box for Set-of-Mark multimodal
 * - scr: scrollable container info { depth: "0%", h: true }
 * - occ: true if element is occluded by overlay (shouldn't be clicked)
 * 
 * Example:
 * { "i": "55", "r": "btn", "n": "Search", "xy": [400, 300], "box": [350, 280, 100, 40] }
 */
export interface SemanticNodeV3 {
  /** Element ID (stable data-llm-id) */
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
  
  /** Frame ID (0 = main, 1+ = iframe) */
  f?: number;
  
  // === V3 ADVANCED FIELDS ===
  
  /** Bounding box [x, y, width, height] for Set-of-Mark multimodal */
  box?: [number, number, number, number];
  
  /** Scrollable container info: { depth: scroll%, h: has more content } */
  scr?: { depth: string; h: boolean };
  
  /** True if element is occluded by overlay/modal (shouldn't be clicked) */
  occ?: boolean;
}

/**
 * Role mapping: Full roles → minified roles
 */
export const ROLE_MINIFY_MAP: Record<string, string> = {
  'button': 'btn',
  'link': 'link',
  'textbox': 'inp',
  'searchbox': 'inp',
  'input': 'inp',
  'textarea': 'inp',
  'checkbox': 'chk',
  'radio': 'radio',
  'select': 'sel',
  'menuitem': 'menu',
  'tab': 'tab',
  'listitem': 'item',
  'option': 'opt',
  'treeitem': 'tree',
  'switch': 'switch',
  'slider': 'slider',
  'heading': 'h',
  'a': 'link',
};

/**
 * Result of semantic tree extraction (V2/V3)
 */
export interface SemanticTreeResult {
  /** Type identifier for the payload */
  type: 'semantic_tree';
  
  /** Current page URL */
  url: string;
  
  /** Page title */
  title: string;
  
  /** Array of interactive nodes */
  nodes: SemanticNode[];
  
  /** Extraction metadata */
  meta: {
    /** Number of elements tagged */
    elementCount: number;
    /** Time taken to extract in ms */
    extractionTimeMs: number;
    /** Estimated token count */
    estimatedTokens: number;
    
    // === V2 FIELDS ===
    
    /** Number of elements inside Shadow DOM */
    shadowDomCount?: number;
    /** Frame ID for this extraction (0 = main) */
    frameId?: number;
  };
}

/**
 * Role mapping from HTML tags and ARIA roles to semantic roles
 */
const ROLE_CANONICAL_MAP: Record<string, string> = {
  // HTML tags
  'a': 'link',
  'button': 'button',
  'input': 'input',
  'select': 'select',
  'textarea': 'textbox',
  'option': 'option',

  // ARIA roles (passthrough) - only add ones not already defined above
  'link': 'link',
  'menuitem': 'menuitem',
  'menuitemcheckbox': 'checkbox',
  'menuitemradio': 'radio',
  'tab': 'tab',
  'treeitem': 'treeitem',
  'checkbox': 'checkbox',
  'radio': 'radio',
  'switch': 'switch',
  'combobox': 'combobox',
  'listbox': 'listbox',
  'textbox': 'textbox',
  'searchbox': 'searchbox',
  'spinbutton': 'spinbutton',
  'slider': 'slider',
};

/**
 * Input type to role mapping
 */
const INPUT_TYPE_ROLE_MAP: Record<string, string> = {
  'text': 'textbox',
  'password': 'textbox',
  'email': 'textbox',
  'number': 'spinbutton',
  'tel': 'textbox',
  'url': 'textbox',
  'search': 'searchbox',
  'checkbox': 'checkbox',
  'radio': 'radio',
  'submit': 'button',
  'button': 'button',
  'reset': 'button',
  'file': 'button',
  'date': 'textbox',
  'time': 'textbox',
  'datetime-local': 'textbox',
  'range': 'slider',
  'color': 'button',
};

/**
 * Get the human-readable name for an element
 * Priority: aria-label > aria-labelledby > innerText > placeholder > title > name > alt
 */
function getElementName(el: HTMLElement): string {
  // 1. Explicit aria-label
  const ariaLabel = el.getAttribute('aria-label');
  if (ariaLabel) return cleanText(ariaLabel);
  
  // 2. aria-labelledby reference
  const labelledBy = el.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl?.textContent) return cleanText(labelEl.textContent);
  }
  
  // 3. Associated label element (for inputs)
  if (el.id) {
    const label = document.querySelector(`label[for="${el.id}"]`);
    if (label?.textContent) return cleanText(label.textContent);
  }
  
  // 4. Inner text content (truncated)
  const innerText = el.innerText || el.textContent;
  if (innerText) {
    const cleaned = cleanText(innerText);
    if (cleaned) return cleaned;
  }
  
  // 5. Placeholder (for inputs)
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) return cleanText(placeholder);
  
  // 6. Title attribute
  const title = el.getAttribute('title');
  if (title) return cleanText(title);
  
  // 7. Name attribute
  const name = el.getAttribute('name');
  if (name) return cleanText(name);
  
  // 8. Alt text (for images/buttons with images)
  const alt = el.getAttribute('alt');
  if (alt) return cleanText(alt);
  
  // 9. Value for certain elements
  const value = (el as HTMLInputElement).value;
  if (value && el.tagName === 'BUTTON') return cleanText(value);
  
  // 10. Fallback to tag name
  return el.tagName.toLowerCase();
}

/**
 * Clean and truncate text
 */
function cleanText(text: string, maxLength = 100): string {
  // Remove excessive whitespace
  let cleaned = text.replace(/\s+/g, ' ').trim();
  
  // Truncate if too long
  if (cleaned.length > maxLength) {
    cleaned = cleaned.substring(0, maxLength - 3) + '...';
  }
  
  return cleaned;
}

/**
 * Get the semantic role for an element
 */
function getElementRole(el: HTMLElement): string {
  // 1. Explicit ARIA role takes priority
  const ariaRole = el.getAttribute('role');
  if (ariaRole && ROLE_CANONICAL_MAP[ariaRole]) {
    return ROLE_CANONICAL_MAP[ariaRole];
  }
  if (ariaRole) {
    return ariaRole; // Use as-is if not in map
  }
  
  // 2. Special handling for inputs
  if (el.tagName === 'INPUT') {
    const inputType = (el as HTMLInputElement).type || 'text';
    return INPUT_TYPE_ROLE_MAP[inputType] || 'input';
  }
  
  // 3. Map from tag name
  const tagLower = el.tagName.toLowerCase();
  if (ROLE_CANONICAL_MAP[tagLower]) {
    return ROLE_CANONICAL_MAP[tagLower];
  }
  
  // 4. Check for clickable indicators
  if (el.hasAttribute('onclick') || 
      el.getAttribute('tabindex') === '0' ||
      window.getComputedStyle(el).cursor === 'pointer') {
    return 'button';
  }
  
  // 5. Contenteditable
  if (el.getAttribute('contenteditable') === 'true') {
    return 'textbox';
  }
  
  return tagLower;
}

/**
 * Get element state string
 */
function getElementState(el: HTMLElement): string | undefined {
  const states: string[] = [];
  
  // Disabled state
  if ((el as HTMLInputElement).disabled || el.getAttribute('aria-disabled') === 'true') {
    states.push('disabled');
  }
  
  // Checked state (checkbox, radio, switch)
  if ((el as HTMLInputElement).checked || el.getAttribute('aria-checked') === 'true') {
    states.push('checked');
  }
  
  // Selected state
  if ((el as HTMLOptionElement).selected || el.getAttribute('aria-selected') === 'true') {
    states.push('selected');
  }
  
  // Expanded state
  if (el.getAttribute('aria-expanded') === 'true') {
    states.push('expanded');
  } else if (el.getAttribute('aria-expanded') === 'false') {
    states.push('collapsed');
  }
  
  // Pressed state (toggle buttons)
  if (el.getAttribute('aria-pressed') === 'true') {
    states.push('pressed');
  }
  
  // Required state
  if ((el as HTMLInputElement).required || el.getAttribute('aria-required') === 'true') {
    states.push('required');
  }
  
  // Readonly state
  if ((el as HTMLInputElement).readOnly || el.getAttribute('aria-readonly') === 'true') {
    states.push('readonly');
  }
  
  return states.length > 0 ? states.join(',') : undefined;
}

/**
 * Get element value
 */
function getElementValue(el: HTMLElement): string | undefined {
  // Input/textarea value
  if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
    const value = (el as HTMLInputElement | HTMLTextAreaElement).value;
    if (value) return cleanText(value, 200);
  }
  
  // Select value
  if (el.tagName === 'SELECT') {
    const select = el as HTMLSelectElement;
    const selectedOption = select.options[select.selectedIndex];
    if (selectedOption) return cleanText(selectedOption.text);
  }
  
  // Contenteditable value
  if (el.getAttribute('contenteditable') === 'true') {
    const text = el.textContent;
    if (text) return cleanText(text, 200);
  }
  
  return undefined;
}

// =============================================================================
// V4 MIDSCENE INSPIRED: ATOMIC LEAF TRAVERSAL
// Treat interactive elements as atomic - don't recurse into children
// =============================================================================

/**
 * MIDSCENE INSPIRED: Atomic roles that should not have children extracted.
 *
 * When we hit one of these elements, we treat it as a "leaf" node and
 * extract all its text content at once, rather than recursing into children.
 * This reduces tree depth and token count by ~30% on complex UIs.
 */
const ATOMIC_ROLES = new Set([
  'button', 'link', 'menuitem', 'tab', 'option', 'treeitem',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'textbox', 'searchbox', 'combobox',
]);

/**
 * MIDSCENE INSPIRED: Check if an element is inside an atomic parent.
 *
 * If an element is a child of a button/link/etc., we should skip it
 * because the parent already captures all the relevant content.
 *
 * @param element - Element to check
 * @returns true if element is inside an atomic parent that should handle extraction
 */
function isInsideAtomicParent(element: HTMLElement): boolean {
  try {
    let parent = element.parentElement;
    let depth = 0;
    const maxDepth = 5; // Don't search too deep

    while (parent && depth < maxDepth) {
      const tagLower = parent.tagName?.toLowerCase();
      if (!tagLower) break;

      // Check if parent is an atomic interactive element
      if (['button', 'a', 'select', 'option'].includes(tagLower)) {
        return true;
      }

      // Check for atomic ARIA roles
      const role = parent.getAttribute('role');
      if (role && ATOMIC_ROLES.has(role)) {
        return true;
      }

      // Check for common interactive attributes
      if (parent.hasAttribute('onclick') ||
          parent.getAttribute('tabindex') === '0' ||
          parent.getAttribute('role') === 'button') {
        return true;
      }

      parent = parent.parentElement;
      depth++;
    }

    return false;
  } catch {
    // If we can't check parent hierarchy, assume NOT inside atomic parent
    // This ensures the element still gets processed
    return false;
  }
}

/**
 * MIDSCENE INSPIRED: Get combined text from an atomic element.
 *
 * For buttons/links, we want ALL the text content (including nested spans/icons),
 * not individual text nodes.
 *
 * @param element - Atomic element to extract text from
 * @returns Combined text content, cleaned and truncated
 */
function getAtomicElementText(element: HTMLElement): string {
  // Get all text, including pseudo-elements
  let text = element.innerText || element.textContent || '';

  // Also check aria-label (often more descriptive)
  const ariaLabel = element.getAttribute('aria-label');
  if (ariaLabel && ariaLabel.length > text.trim().length) {
    text = ariaLabel;
  }

  // Check title attribute
  const title = element.getAttribute('title');
  if (title && !text.trim()) {
    text = title;
  }

  // Clean and truncate
  return text.replace(/\s+/g, ' ').trim().substring(0, 100);
}

// =============================================================================
// V4 MIDSCENE INSPIRED: 2/3 VISIBILITY RULE (Precision Pruning)
// Only include elements that are at least 66% visible in viewport
// =============================================================================

/**
 * MIDSCENE INSPIRED: Check if element is reliably visible (>= 66% in viewport).
 *
 * Midscene is stricter than simple viewport bounds checking. It discards
 * elements unless at least 2/3 of their area is visible. This prevents
 * the LLM from trying to interact with half-hidden elements that usually
 * require scrolling first.
 *
 * @param element - Element to check
 * @param minVisibleRatio - Minimum visible ratio (default 0.66 = 2/3)
 * @returns true if element meets visibility threshold
 */
export function isReliablyVisible(element: HTMLElement, minVisibleRatio = 0.66): boolean {
  try {
    const rect = element.getBoundingClientRect();

    // Guard against invalid rect
    if (!rect || typeof rect.width !== 'number' || typeof rect.height !== 'number') {
      return true; // Fail-safe: assume visible if we can't check
    }

    const viewportHeight = window.innerHeight || 1080; // Fallback to common resolution
    const viewportWidth = window.innerWidth || 1920;

    // Zero-size elements are not visible
    if (rect.width <= 0 || rect.height <= 0) return false;

    // Calculate intersection with viewport
    const visibleTop = Math.max(rect.top, 0);
    const visibleBottom = Math.min(rect.bottom, viewportHeight);
    const visibleLeft = Math.max(rect.left, 0);
    const visibleRight = Math.min(rect.right, viewportWidth);

    const visibleHeight = Math.max(0, visibleBottom - visibleTop);
    const visibleWidth = Math.max(0, visibleRight - visibleLeft);

    if (visibleHeight <= 0 || visibleWidth <= 0) return false;

    const visibleArea = visibleHeight * visibleWidth;
    const totalArea = rect.width * rect.height;

    // Guard against division by zero
    if (totalArea <= 0) return false;

    // Midscene Rule: Must be >= 66% visible
    return (visibleArea / totalArea) >= minVisibleRatio;
  } catch (error) {
    // FAIL-SAFE: If visibility check throws, assume element IS visible
    // This prevents filtering out elements due to browser quirks
    console.debug('[SemanticTree] isReliablyVisible error, assuming visible:', error);
    return true;
  }
}

// =============================================================================
// V4 MIDSCENE INSPIRED: CONTAINER CLASSIFICATION
// Only keep container divs that have visual boundaries
// =============================================================================

/**
 * MIDSCENE INSPIRED: Check if a container element is visually meaningful.
 *
 * Generic <div>s without visual styling (background, border, shadow) are
 * just structural wrappers that don't add semantic value. Midscene strips
 * these to flatten the tree.
 *
 * @param element - Container element to check
 * @returns true if container has visual boundaries worth preserving
 */
export function isMeaningfulContainer(element: HTMLElement): boolean {
  try {
    const style = window.getComputedStyle(element);

    // Has background color (not transparent)
    const bgColor = style.backgroundColor;
    if (bgColor && bgColor !== 'rgba(0, 0, 0, 0)' && bgColor !== 'transparent') {
      return true;
    }

    // Has border
    const borderWidth = parseFloat(style.borderWidth) || 0;
    if (borderWidth > 0) {
      return true;
    }

    // Has box shadow
    if (style.boxShadow && style.boxShadow !== 'none') {
      return true;
    }

    // Has outline
    const outlineWidth = parseFloat(style.outlineWidth) || 0;
    if (outlineWidth > 0 && style.outlineStyle !== 'none') {
      return true;
    }

    // Is a semantic landmark
    const role = element.getAttribute('role');
    const semanticLandmarks = ['main', 'navigation', 'banner', 'contentinfo', 'complementary', 'form', 'region'];
    if (role && semanticLandmarks.includes(role)) {
      return true;
    }

    return false;
  } catch {
    return false;
  }
}

/**
 * Check if element is a generic container (div, span, section, etc.)
 */
function isGenericContainer(element: HTMLElement): boolean {
  const genericTags = new Set(['div', 'span', 'section', 'article', 'aside', 'header', 'footer', 'main', 'nav']);
  return genericTags.has(element.tagName.toLowerCase());
}

// =============================================================================
// V3 ADVANCED: TRUE VISIBILITY RAYCASTING (The Modal Killer)
// Browser-Use Inspired: Multi-Point Sampling for Accurate Occlusion Detection
// =============================================================================

/**
 * V3 ADVANCED: Multi-Point Visibility Score Calculator
 *
 * BROWSER-USE INSPIRED: Uses 5-point sampling (center + 4 corners) to determine
 * what percentage of an element is actually visible. This is more reliable than
 * single center-point checking, as it catches partial occlusions from overlays,
 * modals, cookie banners, and sticky headers.
 *
 * @param element - The DOM element to check
 * @returns Visibility score from 0.0 (fully hidden) to 1.0 (fully visible)
 */
export function getVisibilityScore(element: HTMLElement): number {
  try {
    const rect = element.getBoundingClientRect();

    // Guard against invalid rect
    if (!rect || typeof rect.width !== 'number' || typeof rect.height !== 'number') {
      return 0.5; // Fail-safe: assume partially visible
    }

    // Zero-size elements are not visible
    if (rect.width === 0 || rect.height === 0) return 0;

    const viewportWidth = window.innerWidth || 1920;
    const viewportHeight = window.innerHeight || 1080;

    // Sample 5 points: center + 4 corners (with 2px inset to avoid edge issues)
    const inset = 2;
    const points = [
      { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },  // Center
      { x: rect.left + inset, y: rect.top + inset },                      // Top-left
      { x: rect.right - inset, y: rect.top + inset },                     // Top-right
      { x: rect.left + inset, y: rect.bottom - inset },                   // Bottom-left
      { x: rect.right - inset, y: rect.bottom - inset },                  // Bottom-right
    ];

    let visiblePoints = 0;
    let sampledPoints = 0;

    for (const p of points) {
      // Skip points outside viewport
      if (p.x < 0 || p.y < 0 || p.x > viewportWidth || p.y > viewportHeight) {
        continue;
      }

      sampledPoints++;

      // Ask browser: "What is the top-most element at this point?"
      try {
        const topElement = document.elementFromPoint(p.x, p.y);

        // Element is visible at this point if:
        // 1. The top element IS this element, OR
        // 2. The top element is a CHILD of this element, OR
        // 3. This element CONTAINS the top element
        if (topElement && (
          element === topElement ||
          element.contains(topElement) ||
          topElement.contains(element)
        )) {
          visiblePoints++;
        }
      } catch {
        // If elementFromPoint fails for this point, skip it
        continue;
      }
    }

    // Return ratio of visible points (0.5 if no points sampled - fail-safe)
    return sampledPoints > 0 ? visiblePoints / sampledPoints : 0.5;
  } catch {
    // If raycasting fails, assume partially visible (fail-safe)
    return 0.5;
  }
}

/**
 * V3 ADVANCED: True Visibility Raycasting (Single-Point Fallback)
 *
 * Uses document.elementFromPoint() to verify the element is actually the
 * top-most clickable layer. Prevents "Click failed" errors when modals,
 * cookie banners, or transparent overlays are covering the element.
 *
 * NOTE: For more accurate detection, use getVisibilityScore() which samples
 * 5 points instead of just the center.
 *
 * @param element - The element to check
 * @returns true if the element is actually clickable (not occluded)
 */
function isActuallyClickable(element: HTMLElement): boolean {
  // Use multi-point visibility score with 50% threshold
  // Element is considered clickable if at least half of sampled points are visible
  return getVisibilityScore(element) >= 0.5;
}

/**
 * Check if element is occluded by an overlay/modal
 * Returns true if the element is covered and shouldn't be clicked
 *
 * Uses multi-point sampling: element is considered occluded if less than
 * 50% of sampled points are visible (i.e., mostly covered by overlay)
 */
function isOccludedByOverlay(element: HTMLElement): boolean {
  return getVisibilityScore(element) < 0.5;
}

// =============================================================================
// V3 ADVANCED: EXPLICIT LABEL ASSOCIATION (The Form Fix)
// =============================================================================

/**
 * V3 ADVANCED: Find semantic label for an input element
 * 
 * Many input fields have no meaningful attributes on themselves - the label
 * "Email Address" is often in a separate <span> nearby. This function hunts
 * for the semantic label using multiple strategies.
 * 
 * Priority:
 * 1. Explicit <label for="id">
 * 2. aria-label / aria-labelledby
 * 3. Placeholder attribute
 * 4. Previous sibling text (heuristic - often the label is right before input)
 * 5. Parent label element
 * 
 * @param input - The input element
 * @returns The found label or "Unknown Input"
 */
function findLabelForInput(input: HTMLElement): string {
  // 1. Check explicit <label for="id">
  if (input.id) {
    const label = document.querySelector(`label[for="${input.id}"]`);
    if (label?.textContent) {
      const text = cleanText(label.textContent);
      if (text && text.length > 0) return text;
    }
  }
  
  // 2. Check aria-label
  const ariaLabel = input.getAttribute('aria-label');
  if (ariaLabel) return cleanText(ariaLabel);
  
  // 3. Check aria-labelledby
  const labelledBy = input.getAttribute('aria-labelledby');
  if (labelledBy) {
    const labelEl = document.getElementById(labelledBy);
    if (labelEl?.textContent) return cleanText(labelEl.textContent);
  }
  
  // 4. Check placeholder
  const placeholder = (input as HTMLInputElement).placeholder;
  if (placeholder) return cleanText(placeholder);
  
  // 5. Check name attribute (sometimes descriptive)
  const name = input.getAttribute('name');
  if (name && name.length > 2 && !name.match(/^[a-z0-9_]+$/i)) {
    // Only use if it looks like a human-readable name
    return cleanText(name.replace(/[-_]/g, ' '));
  }
  
  // 6. Pro Move: Look at previous sibling text (heuristic)
  // Often the text immediately before the input is the label
  let sibling = input.previousElementSibling;
  let attempts = 0;
  while (sibling && attempts < 3) {
    const text = sibling.textContent?.trim();
    if (text && text.length > 1 && text.length < 50) {
      // Check it's not a button or another input
      if (!['INPUT', 'BUTTON', 'SELECT', 'TEXTAREA'].includes(sibling.tagName)) {
        return cleanText(text);
      }
    }
    sibling = sibling.previousElementSibling;
    attempts++;
  }
  
  // 7. Check if input is inside a <label> element
  const parentLabel = input.closest('label');
  if (parentLabel) {
    // Get text content excluding the input itself
    const labelText = Array.from(parentLabel.childNodes)
      .filter(node => node !== input && node.nodeType === Node.TEXT_NODE)
      .map(node => node.textContent)
      .join('')
      .trim();
    if (labelText) return cleanText(labelText);
  }
  
  // 8. Check data-* attributes that might contain label info
  const dataLabel = input.getAttribute('data-label') || input.getAttribute('data-name');
  if (dataLabel) return cleanText(dataLabel);
  
  return '';
}

// =============================================================================
// V3 ADVANCED: VIRTUAL LIST / SCROLLABLE DETECTION
// =============================================================================

/**
 * V3 ADVANCED: Detect if element is a scrollable container
 * 
 * Modern feeds (Twitter, LinkedIn) use virtual lists that only render
 * visible items. This function detects scrollable containers so the LLM
 * knows it can scroll to load more content.
 * 
 * @param element - The element to check
 * @returns Scroll info or undefined if not scrollable
 */
function getScrollableInfo(element: HTMLElement): { depth: string; h: boolean } | undefined {
  try {
    // Check if element is scrollable (content exceeds visible area by at least 50px)
    const isVerticallyScrollable = element.scrollHeight > element.clientHeight + 50;
    const isHorizontallyScrollable = element.scrollWidth > element.clientWidth + 50;
    
    if (!isVerticallyScrollable && !isHorizontallyScrollable) {
      return undefined;
    }
    
    // Calculate scroll depth percentage
    let scrollDepth = '0%';
    if (isVerticallyScrollable && element.scrollHeight > element.clientHeight) {
      const maxScroll = element.scrollHeight - element.clientHeight;
      const currentScroll = element.scrollTop;
      const percentage = Math.round((currentScroll / maxScroll) * 100);
      scrollDepth = `${percentage}%`;
    }
    
    // Check if there's more content to load (not at bottom)
    const hasMore = element.scrollTop + element.clientHeight < element.scrollHeight - 20;
    
    return {
      depth: scrollDepth,
      h: hasMore, // h = hasMore content below
    };
  } catch {
    return undefined;
  }
}

/**
 * Check if element is likely a virtual list container
 * (Twitter feed, LinkedIn feed, infinite scroll containers)
 */
function isVirtualListContainer(element: HTMLElement): boolean {
  // Check common virtual list indicators
  const style = window.getComputedStyle(element);
  
  // Must have overflow-y: auto/scroll
  if (style.overflowY !== 'auto' && style.overflowY !== 'scroll') {
    return false;
  }
  
  // Should have significant scrollable content
  if (element.scrollHeight <= element.clientHeight + 100) {
    return false;
  }
  
  // Check for common virtual list roles/classes
  const role = element.getAttribute('role');
  if (role === 'feed' || role === 'list' || role === 'listbox') {
    return true;
  }
  
  // Check for common virtual list class names
  const className = element.className.toLowerCase();
  if (className.includes('feed') || className.includes('timeline') || 
      className.includes('scroll') || className.includes('virtual')) {
    return true;
  }
  
  return false;
}

/**
 * Extract a semantic node from an element (V2)
 * Now includes isInShadow, frameId, and optional bounding box
 */
function extractNode(el: HTMLElement, includeBounds = false): SemanticNode | null {
  // Get the stable ID
  const id = el.getAttribute(LLM_ID_ATTR);
  if (!id) return null;
  
  // Get role and name
  const role = getElementRole(el);
  const name = getElementName(el);
  
  // Skip nodes without useful names (unless they're inputs)
  if (!name && role !== 'input' && role !== 'textbox' && role !== 'select' && role !== 'checkbox' && role !== 'radio') {
    return null;
  }
  
  const node: SemanticNode = {
    id,
    role,
    name,
  };
  
  // Add optional fields
  const value = getElementValue(el);
  if (value !== undefined) node.value = value;
  
  const state = getElementState(el);
  if (state) node.state = state;
  
  // Add type for inputs
  if (el.tagName === 'INPUT') {
    const inputType = (el as HTMLInputElement).type;
    if (inputType && inputType !== 'text') {
      node.type = inputType;
    }
  }
  
  // Add placeholder
  const placeholder = el.getAttribute('placeholder');
  if (placeholder) node.placeholder = cleanText(placeholder);
  
  // Add href for links
  if (el.tagName === 'A') {
    const href = (el as HTMLAnchorElement).href;
    if (href && !href.startsWith('javascript:')) {
      // Truncate long URLs
      node.href = href.length > 100 ? href.substring(0, 97) + '...' : href;
    }
  }
  
  // === V2 FIELDS ===
  
  // Check if element is inside Shadow DOM
  const shadowAttr = el.getAttribute(SHADOW_ATTR);
  if (shadowAttr === 'true') {
    node.isInShadow = true;
  }
  
  // Get frame ID
  const frameAttr = el.getAttribute(FRAME_ATTR);
  if (frameAttr) {
    const frameId = parseInt(frameAttr, 10);
    if (frameId > 0) {
      node.frameId = frameId;
    }
  }
  
  // Optionally include bounding box (for visual/hybrid mode)
  if (includeBounds) {
    try {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        node.bounds = {
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          width: Math.round(rect.width),
          height: Math.round(rect.height),
        };
      }
    } catch {
      // Ignore bounding box errors
    }
  }
  
  return node;
}

/**
 * Options for semantic tree extraction (V2)
 */
export interface ExtractionOptions {
  /** Include bounding boxes for visual tasks */
  includeBounds?: boolean;
  
  /** Use deep querying (pierce Shadow DOM) */
  deepQuery?: boolean;
}

/**
 * Extract semantic tree from the page (V2).
 * 
 * This is the main entry point for DOM extraction.
 * It returns a clean JSON structure that's easy for LLMs to understand.
 * 
 * V2: Uses querySelectorAllDeep to find elements inside Shadow DOMs
 * 
 * @param options - Extraction options
 * @returns SemanticTreeResult containing all interactive elements
 */
export function extractSemanticTree(options: ExtractionOptions = {}): SemanticTreeResult {
  const startTime = performance.now();
  const { includeBounds = false, deepQuery = true } = options;
  
  // Ensure all interactive elements are tagged first
  ensureStableIds();
  
  // V2: Use querySelectorAllDeep to find elements INSIDE Shadow DOMs
  let elements: NodeListOf<Element> | Element[];
  let shadowCount = 0;
  
  try {
    if (deepQuery) {
      // Use library to pierce Shadow DOM boundaries
      elements = querySelectorAllDeep(`[${LLM_ID_ATTR}]`);
    } else {
      // Fallback to standard query
      elements = document.querySelectorAll(`[${LLM_ID_ATTR}]`);
    }
  } catch {
    // Fallback if library fails
    console.warn('[SemanticTree] Deep query failed, using standard querySelectorAll');
    elements = document.querySelectorAll(`[${LLM_ID_ATTR}]`);
  }
  
  const nodes: SemanticNode[] = [];
  
  elements.forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    
    // Skip hidden elements (double-check visibility)
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        return;
      }
    } catch {
      return; // Skip if we can't check visibility
    }
    
    const node = extractNode(el, includeBounds);
    if (node) {
      nodes.push(node);
      if (node.isInShadow) shadowCount++;
    }
  });
  
  const extractionTimeMs = Math.round(performance.now() - startTime);
  
  // Estimate token count (roughly 4 chars per token for JSON)
  const jsonString = JSON.stringify(nodes);
  const estimatedTokens = Math.round(jsonString.length / 4);
  
  // V2: Enhanced logging with Shadow DOM stats
  console.log(`[SemanticTree] Extracted ${nodes.length} nodes (${shadowCount} in Shadow DOM) in ${extractionTimeMs}ms (~${estimatedTokens} tokens)`);
  
  return {
    type: 'semantic_tree',
    url: window.location.href,
    title: document.title,
    nodes,
    meta: {
      elementCount: nodes.length,
      extractionTimeMs,
      estimatedTokens,
      // V2: Additional metadata
      shadowDomCount: shadowCount,
      frameId: getFrameId(),
    },
  };
}

/**
 * Extract semantic tree as a formatted string for direct LLM consumption.
 * This is an alternative to JSON that might be easier for some LLMs.
 * 
 * Format:
 * [id] role: "name" (value) [state]
 * 
 * Example:
 * [5] link: "Sign in"
 * [6] textbox: "Search" (current value) [required]
 * [7] button: "Submit"
 */
export function extractSemanticTreeAsText(): string {
  const result = extractSemanticTree();
  
  const lines = result.nodes.map(node => {
    let line = `[${node.id}] ${node.role}: "${node.name}"`;
    
    if (node.value) {
      line += ` (${node.value})`;
    }
    
    if (node.state) {
      line += ` [${node.state}]`;
    }
    
    if (node.type && node.type !== 'text') {
      line += ` type=${node.type}`;
    }
    
    return line;
  });
  
  return lines.join('\n');
}

/**
 * Find a node by its stable ID
 */
export function findNodeById(id: string): SemanticNode | null {
  const el = findElementByStableId(id);
  if (!el || !(el instanceof HTMLElement)) return null;
  return extractNode(el);
}

/**
 * Search nodes by name (fuzzy match)
 */
export function searchNodesByName(query: string): SemanticNode[] {
  const result = extractSemanticTree();
  const queryLower = query.toLowerCase();
  
  return result.nodes.filter(node => 
    node.name.toLowerCase().includes(queryLower)
  );
}

/**
 * Get nodes by role
 */
export function getNodesByRole(role: string): SemanticNode[] {
  const result = extractSemanticTree();
  return result.nodes.filter(node => node.role === role);
}

// =============================================================================
// V3 ULTRA-LIGHT EXTRACTION - Viewport Pruning + Minified JSON
// =============================================================================

/**
 * V3/V4 Extraction Options
 */
export interface V3ExtractionOptions {
  /** Only include elements visible in viewport */
  viewportOnly?: boolean;

  /** Use minified key format (i/r/n instead of id/role/name) */
  minified?: boolean;

  /** Include coordinates for click targeting */
  includeCoordinates?: boolean;

  /** Custom viewport height (for testing) */
  viewportHeight?: number;

  // === V3 ADVANCED OPTIONS (Browser-Use Inspired) ===

  /** Include bounding box [x,y,w,h] for Set-of-Mark multimodal */
  includeBoundingBox?: boolean;

  /** Enable raycasting to detect occluded elements */
  detectOcclusion?: boolean;

  /** Detect scrollable containers (virtual lists) */
  detectScrollable?: boolean;

  /** Use enhanced label hunting for inputs */
  enhancedLabels?: boolean;

  // === V4 MIDSCENE INSPIRED OPTIONS ===

  /** Skip elements inside atomic parents (buttons, links) to reduce tree depth */
  atomicLeafOptimization?: boolean;

  /** Only include elements that are >= this ratio visible in viewport (default: 0.66 = 2/3) */
  minVisibleRatio?: number;

  /** Strip generic containers without visual boundaries (background, border) */
  pruneEmptyContainers?: boolean;
}

/**
 * V3 Extraction Result with minified payload
 */
export interface SemanticTreeResultV3 {
  mode: 'semantic';
  url: string;
  title: string;
  viewport: { width: number; height: number };
  scroll_position?: string; // Page scroll depth "0%", "50%", etc.
  interactive_tree: SemanticNodeV3[];
  
  // V3 ADVANCED: Scrollable containers detected
  scrollable_containers?: Array<{
    id: string;
    depth: string;
    hasMore: boolean;
  }>;
  
  meta: {
    totalElements: number;
    viewportElements: number;
    prunedElements: number;
    occludedElements: number; // V3: Elements covered by overlays
    extractionTimeMs: number;
    estimatedTokens: number;
  };
}

/**
 * V3/V4 ULTRA-LIGHT EXTRACTION (ADVANCED + MIDSCENE INSPIRED)
 *
 * Key improvements:
 * 1. Viewport pruning - skips off-screen elements (~60% reduction)
 * 2. Minified JSON keys - i/r/n/v/s/xy instead of full names
 * 3. Coordinates included - for precise click targeting
 * 4. ~50-300 tokens instead of 10k-50k
 *
 * V3 ADVANCED improvements (Browser-Use Inspired):
 * 5. MULTI-POINT VISIBILITY RAYCASTING - 5-point sampling for occlusion detection
 * 6. EXPLICIT LABEL ASSOCIATION - hunts for semantic labels for unnamed inputs
 * 7. VIRTUAL LIST DETECTION - identifies scrollable containers
 * 8. BOUNDING BOX - [x,y,w,h] for Set-of-Mark multimodal support
 *
 * V4 MIDSCENE INSPIRED improvements:
 * 9. ATOMIC LEAF TRAVERSAL - stop recursion on buttons/inputs, reduces tree depth ~30%
 * 10. 2/3 VISIBILITY RULE - only include elements >= 66% visible in viewport
 * 11. CONTAINER PRUNING - strip generic divs without visual boundaries
 *
 * @param options - Extraction options
 * @returns V3 payload ready for LLM
 */
export function extractSemanticTreeV3(options: V3ExtractionOptions = {}): SemanticTreeResultV3 {
  const startTime = performance.now();
  const {
    viewportOnly = true,
    minified = true,
    includeCoordinates = true,
    viewportHeight = window.innerHeight,
    // V3 ADVANCED options (Browser-Use Inspired)
    includeBoundingBox = false,
    detectOcclusion = true,
    detectScrollable = true,
    enhancedLabels = true,
    // V4 MIDSCENE INSPIRED options
    atomicLeafOptimization = true,
    minVisibleRatio = 0.66,
    pruneEmptyContainers = true,
  } = options;

  // CRITICAL FIX: Ensure all interactive elements are tagged first
  // Call ensureStableIds multiple times in case DOM changed
  let taggedCount = ensureStableIds();
  console.log(`[SemanticTreeV3] Initial tagging: ${taggedCount} elements`);

  // Get viewport dimensions
  const viewportWidth = window.innerWidth || 1920;
  const actualViewportHeight = viewportHeight || window.innerHeight || 1080;

  // Calculate page scroll position
  const docScrollHeight = document.documentElement?.scrollHeight || window.innerHeight;
  const maxScroll = Math.max(0, docScrollHeight - window.innerHeight);
  const scrollPosition = maxScroll > 0
    ? `${Math.round((window.scrollY / maxScroll) * 100)}%`
    : '0%';

  // Query all tagged elements (piercing Shadow DOM)
  let elements: NodeListOf<Element> | Element[];
  try {
    elements = querySelectorAllDeep(`[${LLM_ID_ATTR}]`);
    console.log(`[SemanticTreeV3] querySelectorAllDeep found ${elements.length} elements`);
  } catch (e) {
    console.warn('[SemanticTreeV3] querySelectorAllDeep failed, using fallback:', e);
    elements = document.querySelectorAll(`[${LLM_ID_ATTR}]`);
    console.log(`[SemanticTreeV3] querySelectorAll fallback found ${elements.length} elements`);
  }

  // CRITICAL FIX: If no elements found, try re-tagging and querying again
  if (elements.length === 0) {
    console.warn('[SemanticTreeV3] No tagged elements found, re-tagging...');
    taggedCount = ensureStableIds(document);
    console.log(`[SemanticTreeV3] Re-tagged ${taggedCount} elements`);

    // Query again
    try {
      elements = querySelectorAllDeep(`[${LLM_ID_ATTR}]`);
    } catch {
      elements = document.querySelectorAll(`[${LLM_ID_ATTR}]`);
    }
    console.log(`[SemanticTreeV3] After re-tag: ${elements.length} elements`);
  }
  
  const nodes: SemanticNodeV3[] = [];
  const scrollableContainers: Array<{ id: string; depth: string; hasMore: boolean }> = [];
  let totalElements = 0;
  let prunedElements = 0;
  let occludedElements = 0;
  let atomicSkipped = 0;      // V4: Elements inside atomic parents
  let containersPruned = 0;   // V4: Empty containers stripped

  elements.forEach(el => {
    if (!(el instanceof HTMLElement)) return;
    totalElements++;

    // V4 MIDSCENE: Skip elements inside atomic parents (buttons, links)
    // The parent element already captures all relevant content
    if (atomicLeafOptimization && isInsideAtomicParent(el)) {
      atomicSkipped++;
      prunedElements++;
      return;
    }

    // V4 MIDSCENE: Strip generic containers without visual boundaries
    if (pruneEmptyContainers && isGenericContainer(el) && !isMeaningfulContainer(el)) {
      // Check if this container has any meaningful content or interactive children
      const hasInteractiveChild = el.querySelector('button, a, input, select, textarea, [role="button"]');
      if (!hasInteractiveChild && !el.getAttribute(LLM_ID_ATTR)) {
        containersPruned++;
        prunedElements++;
        return;
      }
    }

    // Check CSS visibility
    try {
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
        prunedElements++;
        return;
      }
    } catch {
      prunedElements++;
      return;
    }

    // Get bounding rect for viewport pruning
    const rect = el.getBoundingClientRect();

    // V3: VIEWPORT PRUNING - Skip off-screen elements
    if (viewportOnly) {
      // Skip elements completely below viewport
      if (rect.top > actualViewportHeight) {
        prunedElements++;
        return;
      }
      // Skip elements completely above viewport
      if (rect.bottom < 0) {
        prunedElements++;
        return;
      }
      // Skip elements with no size
      if (rect.width === 0 && rect.height === 0) {
        prunedElements++;
        return;
      }

      // V4 MIDSCENE: 2/3 Visibility Rule - stricter than simple bounds check
      if (minVisibleRatio > 0 && !isReliablyVisible(el, minVisibleRatio)) {
        prunedElements++;
        return;
      }
    }
    
    // Get stable ID
    const id = el.getAttribute(LLM_ID_ATTR);
    if (!id) return;
    
    // Get role
    const role = getElementRole(el);
    const minifiedRole = ROLE_MINIFY_MAP[role] || role.substring(0, 4);

    // V4 MIDSCENE: For atomic elements (buttons, links), get combined text from all children
    let name: string;
    if (atomicLeafOptimization && ATOMIC_ROLES.has(role)) {
      name = getAtomicElementText(el);
    } else {
      // Standard name extraction
      name = getElementName(el);
    }

    // V3 ADVANCED: Enhanced label hunting for inputs
    if (!name && enhancedLabels && ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName)) {
      name = findLabelForInput(el);
    }
    
    // Skip nameless non-input elements (but keep inputs with empty names)
    if (!name && !['textbox', 'input', 'textarea', 'searchbox', 'checkbox', 'radio', 'select'].includes(role)) {
      return;
    }
    
    // Build V3 node
    const node: SemanticNodeV3 = {
      i: id,
      r: minified ? minifiedRole : role,
      n: (name || '').substring(0, 50), // Truncate long names
    };
    
    // Add value for inputs
    const value = getElementValue(el);
    if (value !== undefined && value !== '') {
      node.v = String(value).substring(0, 50);
    }
    
    // Add state
    const state = getElementState(el);
    if (state) {
      node.s = state;
    }
    
    // V3: Add coordinates for click targeting
    if (includeCoordinates) {
      const centerX = Math.round(rect.left + rect.width / 2);
      const centerY = Math.round(rect.top + rect.height / 2);
      node.xy = [centerX, centerY];
    }
    
    // V3 ADVANCED: Include full bounding box for Set-of-Mark
    if (includeBoundingBox) {
      node.box = [
        Math.round(rect.left),
        Math.round(rect.top),
        Math.round(rect.width),
        Math.round(rect.height),
      ];
    }
    
    // V3 ADVANCED: Detect occlusion (element covered by modal/overlay)
    if (detectOcclusion) {
      const occluded = isOccludedByOverlay(el);
      if (occluded) {
        node.occ = true;
        occludedElements++;
      }
    }
    
    // V3 ADVANCED: Detect scrollable containers
    if (detectScrollable) {
      const scrollInfo = getScrollableInfo(el);
      if (scrollInfo) {
        node.scr = scrollInfo;
        // Also add to top-level scrollable containers list
        scrollableContainers.push({
          id,
          depth: scrollInfo.depth,
          hasMore: scrollInfo.h,
        });
      }
    }
    
    // Add frame ID if not main frame
    const frameId = getFrameId();
    if (frameId > 0) {
      node.f = frameId;
    }
    
    nodes.push(node);
  });
  
  const extractionTimeMs = Math.round(performance.now() - startTime);
  
  // Estimate token count (minified format is more efficient)
  const jsonString = JSON.stringify(nodes);
  const estimatedTokens = Math.round(jsonString.length / 4);

  // V4: Enhanced logging with Midscene metrics
  console.log(`[SemanticTreeV4] Extracted ${nodes.length} nodes in ${extractionTimeMs}ms (~${estimatedTokens} tokens)`);
  console.log(`  Total elements queried: ${totalElements}`);
  console.log(`  Pruned: ${prunedElements} (atomic: ${atomicSkipped}, containers: ${containersPruned}, visibility: ${prunedElements - atomicSkipped - containersPruned})`);
  if (occludedElements > 0) {
    console.log(`  Occluded (modal): ${occludedElements}`);
  }

  // CRITICAL FIX: If all elements were filtered out, retry with relaxed settings
  if (nodes.length === 0 && totalElements > 0) {
    console.warn(`[SemanticTreeV4] WARNING: All ${totalElements} elements were filtered out! Retrying with relaxed settings...`);

    // Retry extraction with relaxed settings
    const relaxedNodes: SemanticNodeV3[] = [];
    elements.forEach(el => {
      if (!(el instanceof HTMLElement)) return;

      const id = el.getAttribute(LLM_ID_ATTR);
      if (!id) return;

      // Skip only truly hidden elements
      try {
        const style = window.getComputedStyle(el);
        if (style.display === 'none') return;
      } catch {
        // Ignore style errors
      }

      const rect = el.getBoundingClientRect();

      // Skip only zero-size elements
      if (rect.width === 0 && rect.height === 0) return;

      const role = getElementRole(el);
      const minifiedRole = ROLE_MINIFY_MAP[role] || role.substring(0, 4);
      const name = getElementName(el) || el.getAttribute('aria-label') || el.getAttribute('title') || '';

      const node: SemanticNodeV3 = {
        i: id,
        r: minified ? minifiedRole : role,
        n: (name || '').substring(0, 50),
      };

      // Add value for inputs
      const value = getElementValue(el);
      if (value !== undefined && value !== '') {
        node.v = String(value).substring(0, 50);
      }

      // Add coordinates
      if (includeCoordinates && rect.width > 0 && rect.height > 0) {
        const centerX = Math.round(rect.left + rect.width / 2);
        const centerY = Math.round(rect.top + rect.height / 2);
        node.xy = [centerX, centerY];
      }

      relaxedNodes.push(node);
    });

    console.log(`[SemanticTreeV4] Relaxed extraction recovered ${relaxedNodes.length} nodes`);

    if (relaxedNodes.length > 0) {
      const relaxedResult: SemanticTreeResultV3 = {
        mode: 'semantic',
        url: window.location.href,
        title: document.title,
        viewport: { width: viewportWidth, height: actualViewportHeight },
        scroll_position: scrollPosition,
        interactive_tree: relaxedNodes,
        meta: {
          totalElements,
          viewportElements: relaxedNodes.length,
          prunedElements: totalElements - relaxedNodes.length,
          occludedElements: 0,
          extractionTimeMs: Math.round(performance.now() - startTime),
          estimatedTokens: Math.round(JSON.stringify(relaxedNodes).length / 4),
        },
      };
      return relaxedResult;
    }
  }

  // LAST-RESORT FALLBACK: Query interactive elements directly if everything else failed
  if (nodes.length === 0) {
    console.warn('[SemanticTreeV4] LAST RESORT: Querying interactive elements directly...');

    const INTERACTIVE_SELECTORS = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="textbox"], [onclick], [tabindex]:not([tabindex="-1"])';
    const lastResortNodes: SemanticNodeV3[] = [];
    let lastResortId = 1;

    try {
      // Try deep query first, fallback to standard query
      let interactiveElements: NodeListOf<Element> | Element[];
      try {
        interactiveElements = querySelectorAllDeep(INTERACTIVE_SELECTORS);
      } catch {
        interactiveElements = document.querySelectorAll(INTERACTIVE_SELECTORS);
      }

      console.log(`[SemanticTreeV4] Last resort found ${interactiveElements.length} interactive elements`);

      interactiveElements.forEach(el => {
        if (!(el instanceof HTMLElement)) return;

        // Skip hidden elements
        try {
          const style = window.getComputedStyle(el);
          if (style.display === 'none' || style.visibility === 'hidden') return;
        } catch {
          return;
        }

        const rect = el.getBoundingClientRect();
        if (rect.width === 0 && rect.height === 0) return;

        // Generate or use existing ID
        let id = el.getAttribute(LLM_ID_ATTR);
        if (!id) {
          id = `lr-${lastResortId++}`;
          el.setAttribute(LLM_ID_ATTR, id);
        }

        const role = getElementRole(el);
        const minifiedRole = ROLE_MINIFY_MAP[role] || role.substring(0, 4);
        const name = getElementName(el) || el.getAttribute('aria-label') || el.tagName.toLowerCase();

        const node: SemanticNodeV3 = {
          i: id,
          r: minified ? minifiedRole : role,
          n: (name || '').substring(0, 50),
        };

        // Add coordinates
        if (includeCoordinates && rect.width > 0 && rect.height > 0) {
          const centerX = Math.round(rect.left + rect.width / 2);
          const centerY = Math.round(rect.top + rect.height / 2);
          node.xy = [centerX, centerY];
        }

        lastResortNodes.push(node);
      });

      console.log(`[SemanticTreeV4] Last resort recovered ${lastResortNodes.length} nodes`);

      if (lastResortNodes.length > 0) {
        return {
          mode: 'semantic',
          url: window.location.href,
          title: document.title,
          viewport: { width: viewportWidth, height: actualViewportHeight },
          scroll_position: scrollPosition,
          interactive_tree: lastResortNodes,
          meta: {
            totalElements: lastResortNodes.length,
            viewportElements: lastResortNodes.length,
            prunedElements: 0,
            occludedElements: 0,
            extractionTimeMs: Math.round(performance.now() - startTime),
            estimatedTokens: Math.round(JSON.stringify(lastResortNodes).length / 4),
          },
        } as SemanticTreeResultV3;
      }
    } catch (error) {
      console.error('[SemanticTreeV4] Last resort fallback failed:', error);
    }
  }

  const result: SemanticTreeResultV3 = {
    mode: 'semantic',
    url: window.location.href,
    title: document.title,
    viewport: { width: viewportWidth, height: actualViewportHeight },
    scroll_position: scrollPosition,
    interactive_tree: nodes,
    meta: {
      totalElements,
      viewportElements: nodes.length,
      prunedElements,
      occludedElements,
      extractionTimeMs,
      estimatedTokens,
    },
  };

  // Add scrollable containers if any were found
  if (scrollableContainers.length > 0) {
    result.scrollable_containers = scrollableContainers;
  }

  return result;
}

/**
 * Convert V3 minified nodes back to full format
 */
export function expandV3ToFull(nodes: SemanticNodeV3[]): SemanticNode[] {
  // Reverse role map
  const reverseRoleMap: Record<string, string> = {};
  Object.entries(ROLE_MINIFY_MAP).forEach(([full, mini]) => {
    reverseRoleMap[mini] = full;
  });
  
  return nodes.map(node => ({
    id: node.i,
    role: reverseRoleMap[node.r] || node.r,
    name: node.n,
    value: node.v,
    state: node.s,
    bounds: node.xy ? {
      x: node.xy[0],
      y: node.xy[1],
      width: 0,
      height: 0,
    } : undefined,
    frameId: node.f,
  }));
}

/**
 * Convert full format nodes to V3 minified format
 */
export function minifyToV3(nodes: SemanticNode[]): SemanticNodeV3[] {
  return nodes.map(node => {
    const v3: SemanticNodeV3 = {
      i: node.id,
      r: ROLE_MINIFY_MAP[node.role] || node.role.substring(0, 4),
      n: node.name.substring(0, 50),
    };
    
    if (node.value) v3.v = node.value.substring(0, 50);
    if (node.state) v3.s = node.state;
    if (node.bounds) v3.xy = [node.bounds.x, node.bounds.y];
    if (node.frameId && node.frameId > 0) v3.f = node.frameId;
    
    return v3;
  });
}

/**
 * Get system prompt legend for V3 format
 * Include this in the system prompt so the LLM understands the minified keys
 */
export function getV3Legend(): string {
  return `LEGEND for interactive_tree format:
- i: element ID (use this in click(i) or setValue(i, text))
- r: role (btn=button, inp=input, link=link, chk=checkbox, sel=select, radio, tab, menu, opt)
- n: name/label visible to user
- v: current value (for inputs)
- s: state (disabled, checked, expanded, etc.)
- xy: [x, y] center coordinates on screen
- box: [x, y, width, height] bounding box (when included)
- scr: { depth: "0%", h: true } - scrollable container, depth=scroll position, h=has more content below
- occ: true if element is covered by overlay/modal (avoid clicking)
- f: frame ID (0=main frame, 1+=iframe)

SCROLLABLE CONTAINERS:
- If you see scr: { depth: "0%", h: true }, element has more content below
- Use scroll(id) action to load more items in virtual lists (Twitter, feeds)

OCCLUDED ELEMENTS:
- If occ: true, element is covered by modal/popup - click will fail
- First dismiss the overlay, then click the target`;
}
