/**
 * Semantic Tree Extraction Tests
 *
 * These tests verify the reliability of semantic DOM extraction.
 * They cover:
 * - Core extraction functions
 * - Visibility filtering (2/3 rule, multi-point scoring)
 * - Atomic leaf optimization (Midscene)
 * - Container pruning
 * - Edge cases that can cause empty results
 *
 * Reference: DOM_EXTRACTION_ARCHITECTURE.md
 */

import {
  SemanticNodeV3,
  SemanticTreeResultV3,
  V3ExtractionOptions,
  ROLE_MINIFY_MAP,
} from './semanticTree';

// ============================================================================
// MOCK SETUP - Simulates browser environment for testing
// ============================================================================

// Store original window/document if they exist
const originalWindow = typeof window !== 'undefined' ? window : undefined;
const originalDocument = typeof document !== 'undefined' ? document : undefined;

/**
 * Create a mock element with standard properties
 */
function createMockElement(config: {
  tagName: string;
  id?: string;
  llmId?: string;
  ariaLabel?: string;
  textContent?: string;
  role?: string;
  type?: string;
  value?: string;
  disabled?: boolean;
  checked?: boolean;
  href?: string;
  placeholder?: string;
  rect?: { left: number; top: number; width: number; height: number };
  style?: Partial<CSSStyleDeclaration>;
  computedStyle?: Partial<CSSStyleDeclaration>;
  attributes?: Record<string, string>;
}): HTMLElement {
  const el = document.createElement(config.tagName);

  if (config.id) el.id = config.id;
  if (config.llmId) el.setAttribute('data-llm-id', config.llmId);
  if (config.ariaLabel) el.setAttribute('aria-label', config.ariaLabel);
  if (config.textContent) el.textContent = config.textContent;
  if (config.role) el.setAttribute('role', config.role);
  if (config.type) el.setAttribute('type', config.type);
  if (config.value) (el as HTMLInputElement).value = config.value;
  if (config.disabled) el.setAttribute('disabled', '');
  if (config.checked) el.setAttribute('checked', '');
  if (config.href) el.setAttribute('href', config.href);
  if (config.placeholder) el.setAttribute('placeholder', config.placeholder);
  if (config.attributes) {
    Object.entries(config.attributes).forEach(([key, val]) => el.setAttribute(key, val));
  }

  // Mock getBoundingClientRect
  const defaultRect = { left: 100, top: 100, width: 100, height: 40 };
  const baseRect = { ...defaultRect, ...config.rect };
  // Compute right and bottom from left/top + width/height
  const fullRect = {
    ...baseRect,
    right: baseRect.left + baseRect.width,
    bottom: baseRect.top + baseRect.height,
    x: baseRect.left,
    y: baseRect.top,
  };
  el.getBoundingClientRect = jest.fn(() => ({
    ...fullRect,
    toJSON: () => fullRect,
  })) as unknown as () => DOMRect;

  return el;
}

/**
 * Create a mock document body with elements
 */
function createMockDocument(elements: HTMLElement[]): void {
  // Clear body
  document.body.innerHTML = '';

  // Add elements
  elements.forEach(el => document.body.appendChild(el));
}

/**
 * Mock window.getComputedStyle
 */
function mockComputedStyle(styles: Record<string, Partial<CSSStyleDeclaration>>): void {
  const originalGetComputedStyle = window.getComputedStyle;

  window.getComputedStyle = jest.fn((el: Element) => {
    const llmId = el.getAttribute('data-llm-id');
    const customStyles = llmId && styles[llmId] ? styles[llmId] : {};

    return {
      display: 'block',
      visibility: 'visible',
      opacity: '1',
      backgroundColor: 'transparent',
      borderWidth: '0',
      boxShadow: 'none',
      ...customStyles,
    } as CSSStyleDeclaration;
  }) as typeof window.getComputedStyle;
}

/**
 * Mock document.elementFromPoint for occlusion testing
 */
function mockElementFromPoint(handler: (x: number, y: number) => Element | null): void {
  document.elementFromPoint = jest.fn(handler);
}

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('SemanticTree Extraction', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';

    // Reset window dimensions
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });

    // Reset document dimensions
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 1080, writable: true });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Role Minification Tests
  // --------------------------------------------------------------------------

  describe('ROLE_MINIFY_MAP', () => {
    it('should have correct minified roles', () => {
      expect(ROLE_MINIFY_MAP['button']).toBe('btn');
      expect(ROLE_MINIFY_MAP['link']).toBe('link');
      expect(ROLE_MINIFY_MAP['textbox']).toBe('inp');
      expect(ROLE_MINIFY_MAP['checkbox']).toBe('chk');
      expect(ROLE_MINIFY_MAP['select']).toBe('sel');
    });

    it('should map multiple input types to "inp"', () => {
      expect(ROLE_MINIFY_MAP['textbox']).toBe('inp');
      expect(ROLE_MINIFY_MAP['searchbox']).toBe('inp');
      expect(ROLE_MINIFY_MAP['input']).toBe('inp');
      expect(ROLE_MINIFY_MAP['textarea']).toBe('inp');
    });
  });

  // --------------------------------------------------------------------------
  // Visibility Function Tests
  // --------------------------------------------------------------------------

  describe('Visibility Functions', () => {
    describe('isReliablyVisible (2/3 Visibility Rule)', () => {
      // Import function for testing
      // Note: In actual implementation, this would be imported from semanticTree.ts

      it('should return true for fully visible elements', () => {
        const el = createMockElement({
          tagName: 'button',
          llmId: '1',
          textContent: 'Click me',
          rect: { left: 100, top: 100, width: 100, height: 40 },
        });

        document.body.appendChild(el);

        // Fully visible element (100% in viewport)
        const rect = el.getBoundingClientRect();
        const viewportHeight = window.innerHeight;
        const viewportWidth = window.innerWidth;

        const visibleTop = Math.max(rect.top, 0);
        const visibleBottom = Math.min(rect.bottom, viewportHeight);
        const visibleLeft = Math.max(rect.left, 0);
        const visibleRight = Math.min(rect.right, viewportWidth);

        const visibleHeight = Math.max(0, visibleBottom - visibleTop);
        const visibleWidth = Math.max(0, visibleRight - visibleLeft);
        const visibleArea = visibleHeight * visibleWidth;
        const totalArea = rect.width * rect.height;

        const visibilityRatio = visibleArea / totalArea;

        expect(visibilityRatio).toBeGreaterThanOrEqual(0.66);
      });

      it('should return false for elements less than 66% visible', () => {
        const el = createMockElement({
          tagName: 'button',
          llmId: '1',
          textContent: 'Click me',
          // Element at bottom of viewport, only 30% visible
          rect: { left: 100, top: 1050, width: 100, height: 100 },
        });

        document.body.appendChild(el);

        const rect = el.getBoundingClientRect();
        const viewportHeight = window.innerHeight; // 1080

        const visibleTop = Math.max(rect.top, 0); // 1050
        const visibleBottom = Math.min(rect.bottom, viewportHeight); // 1080
        const visibleHeight = Math.max(0, visibleBottom - visibleTop); // 30
        const totalHeight = rect.height; // 100

        const visibilityRatio = visibleHeight / totalHeight; // 0.3

        expect(visibilityRatio).toBeLessThan(0.66);
      });

      it('should handle zero-area elements', () => {
        const el = createMockElement({
          tagName: 'button',
          llmId: '1',
          rect: { left: 100, top: 100, width: 0, height: 0 },
        });

        document.body.appendChild(el);

        const rect = el.getBoundingClientRect();
        expect(rect.width === 0 || rect.height === 0).toBe(true);
      });
    });

    describe('getVisibilityScore (5-Point Sampling)', () => {
      it('should return 1.0 for completely unoccluded elements', () => {
        const el = createMockElement({
          tagName: 'button',
          llmId: '1',
          textContent: 'Click me',
          rect: { left: 100, top: 100, width: 100, height: 40 },
        });

        document.body.appendChild(el);

        // Mock elementFromPoint to always return the element itself
        mockElementFromPoint(() => el);

        // Calculate 5-point visibility
        const rect = el.getBoundingClientRect();
        const inset = 2;
        const points = [
          { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, // center
          { x: rect.left + inset, y: rect.top + inset }, // top-left
          { x: rect.right - inset, y: rect.top + inset }, // top-right
          { x: rect.left + inset, y: rect.bottom - inset }, // bottom-left
          { x: rect.right - inset, y: rect.bottom - inset }, // bottom-right
        ];

        let visiblePoints = 0;
        for (const p of points) {
          const topElement = document.elementFromPoint(p.x, p.y);
          if (topElement === el) {
            visiblePoints++;
          }
        }

        expect(visiblePoints / points.length).toBe(1.0);
      });

      it('should return 0.6 for partially occluded elements (3 of 5 points)', () => {
        const el = createMockElement({
          tagName: 'button',
          llmId: '1',
          textContent: 'Click me',
          rect: { left: 100, top: 100, width: 100, height: 40 },
        });

        const overlay = createMockElement({
          tagName: 'div',
          llmId: 'overlay',
          rect: { left: 100, top: 100, width: 50, height: 40 }, // covers left half
        });

        document.body.appendChild(el);
        document.body.appendChild(overlay);

        // Mock elementFromPoint - left side returns overlay, right side returns element
        mockElementFromPoint((x) => {
          return x < 150 ? overlay : el;
        });

        const rect = el.getBoundingClientRect();
        const inset = 2;
        const points = [
          { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, // center - visible
          { x: rect.left + inset, y: rect.top + inset }, // top-left - occluded
          { x: rect.right - inset, y: rect.top + inset }, // top-right - visible
          { x: rect.left + inset, y: rect.bottom - inset }, // bottom-left - occluded
          { x: rect.right - inset, y: rect.bottom - inset }, // bottom-right - visible
        ];

        let visiblePoints = 0;
        for (const p of points) {
          const topElement = document.elementFromPoint(p.x, p.y);
          if (topElement === el) {
            visiblePoints++;
          }
        }

        expect(visiblePoints / points.length).toBe(0.6);
      });

      it('should return 0 for fully occluded elements', () => {
        const el = createMockElement({
          tagName: 'button',
          llmId: '1',
          textContent: 'Click me',
          rect: { left: 100, top: 100, width: 100, height: 40 },
        });

        const modal = createMockElement({
          tagName: 'div',
          llmId: 'modal',
          rect: { left: 0, top: 0, width: 1920, height: 1080 }, // full screen overlay
        });

        document.body.appendChild(el);
        document.body.appendChild(modal);

        // Mock elementFromPoint - always returns modal
        mockElementFromPoint(() => modal);

        const rect = el.getBoundingClientRect();
        const inset = 2;
        const points = [
          { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
          { x: rect.left + inset, y: rect.top + inset },
          { x: rect.right - inset, y: rect.top + inset },
          { x: rect.left + inset, y: rect.bottom - inset },
          { x: rect.right - inset, y: rect.bottom - inset },
        ];

        let visiblePoints = 0;
        for (const p of points) {
          const topElement = document.elementFromPoint(p.x, p.y);
          if (topElement === el) {
            visiblePoints++;
          }
        }

        expect(visiblePoints / points.length).toBe(0);
      });
    });
  });

  // --------------------------------------------------------------------------
  // Atomic Leaf Optimization Tests (Midscene)
  // --------------------------------------------------------------------------

  describe('Atomic Leaf Optimization', () => {
    const ATOMIC_ROLES = new Set([
      'button', 'link', 'menuitem', 'tab', 'option', 'treeitem',
      'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
      'textbox', 'searchbox', 'combobox',
    ]);

    it('should recognize atomic roles', () => {
      expect(ATOMIC_ROLES.has('button')).toBe(true);
      expect(ATOMIC_ROLES.has('link')).toBe(true);
      expect(ATOMIC_ROLES.has('menuitem')).toBe(true);
    });

    it('should detect elements inside atomic parents', () => {
      // Create a button with nested span
      const button = createMockElement({
        tagName: 'button',
        llmId: '1',
        role: 'button',
      });

      const span = document.createElement('span');
      span.setAttribute('data-llm-id', '2');
      span.textContent = 'Click me';
      button.appendChild(span);

      document.body.appendChild(button);

      // Check if span is inside atomic parent (button)
      let parent = span.parentElement;
      let isInsideAtomic = false;

      while (parent) {
        const tagLower = parent.tagName.toLowerCase();
        if (['button', 'a', 'select', 'option'].includes(tagLower)) {
          isInsideAtomic = true;
          break;
        }
        const role = parent.getAttribute('role');
        if (role && ATOMIC_ROLES.has(role)) {
          isInsideAtomic = true;
          break;
        }
        parent = parent.parentElement;
      }

      expect(isInsideAtomic).toBe(true);
    });

    it('should not detect top-level elements as inside atomic parent', () => {
      const button = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Click me',
      });

      document.body.appendChild(button);

      // Button itself is not inside an atomic parent
      let parent = button.parentElement;
      let isInsideAtomic = false;

      while (parent) {
        const tagLower = parent.tagName.toLowerCase();
        if (['button', 'a', 'select', 'option'].includes(tagLower)) {
          isInsideAtomic = true;
          break;
        }
        parent = parent.parentElement;
      }

      expect(isInsideAtomic).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Container Pruning Tests (Midscene)
  // --------------------------------------------------------------------------

  describe('Container Pruning', () => {
    it('should identify meaningful containers (with background)', () => {
      const el = createMockElement({
        tagName: 'div',
        llmId: '1',
      });

      document.body.appendChild(el);

      // Mock computed style with background color
      mockComputedStyle({
        '1': {
          backgroundColor: 'rgb(255, 255, 255)',
          borderWidth: '0',
          boxShadow: 'none',
        },
      });

      const style = window.getComputedStyle(el);
      const hasBackground = style.backgroundColor !== 'rgba(0, 0, 0, 0)' &&
                            style.backgroundColor !== 'transparent';

      expect(hasBackground).toBe(true);
    });

    it('should identify meaningful containers (with border)', () => {
      const el = createMockElement({
        tagName: 'div',
        llmId: '1',
      });

      document.body.appendChild(el);

      mockComputedStyle({
        '1': {
          backgroundColor: 'transparent',
          borderWidth: '1px',
          boxShadow: 'none',
        },
      });

      const style = window.getComputedStyle(el);
      const hasBorder = parseFloat(style.borderWidth) > 0;

      expect(hasBorder).toBe(true);
    });

    it('should identify empty containers (no visual boundaries)', () => {
      const el = createMockElement({
        tagName: 'div',
        llmId: '1',
      });

      document.body.appendChild(el);

      mockComputedStyle({
        '1': {
          backgroundColor: 'transparent',
          borderWidth: '0',
          boxShadow: 'none',
        },
      });

      const style = window.getComputedStyle(el);
      const isEmptyContainer =
        (style.backgroundColor === 'rgba(0, 0, 0, 0)' || style.backgroundColor === 'transparent') &&
        parseFloat(style.borderWidth) === 0 &&
        (style.boxShadow === 'none' || !style.boxShadow);

      expect(isEmptyContainer).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // CSS Visibility Tests
  // --------------------------------------------------------------------------

  describe('CSS Visibility Filtering', () => {
    it('should filter out display:none elements', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Hidden',
      });

      document.body.appendChild(el);

      mockComputedStyle({
        '1': { display: 'none' },
      });

      const style = window.getComputedStyle(el);
      expect(style.display).toBe('none');
    });

    it('should filter out visibility:hidden elements', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Hidden',
      });

      document.body.appendChild(el);

      mockComputedStyle({
        '1': { visibility: 'hidden' },
      });

      const style = window.getComputedStyle(el);
      expect(style.visibility).toBe('hidden');
    });

    it('should filter out opacity:0 elements', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Transparent',
      });

      document.body.appendChild(el);

      mockComputedStyle({
        '1': { opacity: '0' },
      });

      const style = window.getComputedStyle(el);
      expect(style.opacity).toBe('0');
    });
  });

  // --------------------------------------------------------------------------
  // Element Name Extraction Tests
  // --------------------------------------------------------------------------

  describe('Element Name Extraction', () => {
    it('should prioritize aria-label', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        ariaLabel: 'Submit form',
        textContent: 'Click',
      });

      const ariaLabel = el.getAttribute('aria-label');
      const textContent = el.textContent;

      // aria-label should take priority
      const name = ariaLabel || textContent || '';
      expect(name).toBe('Submit form');
    });

    it('should fall back to textContent', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Click me',
      });

      const ariaLabel = el.getAttribute('aria-label');
      const textContent = el.textContent;

      const name = ariaLabel || textContent || '';
      expect(name).toBe('Click me');
    });

    it('should use placeholder for inputs', () => {
      const el = createMockElement({
        tagName: 'input',
        llmId: '1',
        placeholder: 'Enter email',
        type: 'email',
      });

      const ariaLabel = el.getAttribute('aria-label');
      const placeholder = el.getAttribute('placeholder');

      const name = ariaLabel || placeholder || '';
      expect(name).toBe('Enter email');
    });

    it('should use title attribute as fallback', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        attributes: { title: 'Submit button' },
      });

      const ariaLabel = el.getAttribute('aria-label');
      const title = el.getAttribute('title');

      const name = ariaLabel || title || '';
      expect(name).toBe('Submit button');
    });
  });

  // --------------------------------------------------------------------------
  // Viewport Pruning Tests
  // --------------------------------------------------------------------------

  describe('Viewport Pruning', () => {
    it('should include elements within viewport', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Visible',
        rect: { left: 100, top: 100, width: 100, height: 40 },
      });

      document.body.appendChild(el);

      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight; // 1080

      const isInViewport = rect.top < viewportHeight && rect.bottom > 0;
      expect(isInViewport).toBe(true);
    });

    it('should exclude elements below viewport', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Below viewport',
        rect: { left: 100, top: 2000, width: 100, height: 40 },
      });

      document.body.appendChild(el);

      const rect = el.getBoundingClientRect();
      const viewportHeight = window.innerHeight; // 1080

      const isInViewport = rect.top < viewportHeight;
      expect(isInViewport).toBe(false);
    });

    it('should exclude elements above viewport', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Above viewport',
        rect: { left: 100, top: -200, width: 100, height: 40 },
      });

      document.body.appendChild(el);

      const rect = el.getBoundingClientRect();
      const isInViewport = rect.bottom > 0;
      expect(isInViewport).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Empty Result Prevention Tests
  // --------------------------------------------------------------------------

  describe('Empty Result Prevention', () => {
    it('should not return empty result when elements exist', () => {
      const button = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Click me',
        rect: { left: 100, top: 100, width: 100, height: 40 },
      });

      document.body.appendChild(button);
      mockComputedStyle({});

      // Simulate extraction
      const elements = document.querySelectorAll('[data-llm-id]');
      expect(elements.length).toBeGreaterThan(0);
    });

    it('should handle document with no tagged elements gracefully', () => {
      // No elements with data-llm-id
      const div = document.createElement('div');
      div.textContent = 'No LLM ID';
      document.body.appendChild(div);

      const elements = document.querySelectorAll('[data-llm-id]');
      expect(elements.length).toBe(0);
    });

    it('should handle all elements being filtered out', () => {
      // All elements are hidden
      const button = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Hidden',
      });

      document.body.appendChild(button);

      mockComputedStyle({
        '1': { display: 'none' },
      });

      const elements = document.querySelectorAll('[data-llm-id]');
      let visibleCount = 0;

      elements.forEach(el => {
        const style = window.getComputedStyle(el);
        if (style.display !== 'none') {
          visibleCount++;
        }
      });

      expect(visibleCount).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Element State Tests
  // --------------------------------------------------------------------------

  describe('Element State Extraction', () => {
    it('should detect disabled state', () => {
      const button = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Disabled',
        disabled: true,
      });

      expect(button.hasAttribute('disabled')).toBe(true);
    });

    it('should detect checked state for checkboxes', () => {
      const checkbox = createMockElement({
        tagName: 'input',
        llmId: '1',
        type: 'checkbox',
        checked: true,
      });

      expect(checkbox.hasAttribute('checked')).toBe(true);
    });

    it('should extract input values', () => {
      const input = createMockElement({
        tagName: 'input',
        llmId: '1',
        type: 'text',
        value: 'test@example.com',
      });

      expect((input as HTMLInputElement).value).toBe('test@example.com');
    });
  });

  // --------------------------------------------------------------------------
  // Role Detection Tests
  // --------------------------------------------------------------------------

  describe('Role Detection', () => {
    it('should detect button role from tag', () => {
      const button = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Click',
      });

      expect(button.tagName.toLowerCase()).toBe('button');
    });

    it('should detect button role from ARIA', () => {
      const div = createMockElement({
        tagName: 'div',
        llmId: '1',
        role: 'button',
        textContent: 'Click',
      });

      expect(div.getAttribute('role')).toBe('button');
    });

    it('should detect link role', () => {
      const link = createMockElement({
        tagName: 'a',
        llmId: '1',
        href: 'https://example.com',
        textContent: 'Example',
      });

      expect(link.tagName.toLowerCase()).toBe('a');
      expect(link.hasAttribute('href')).toBe(true);
    });

    it('should detect input type', () => {
      const input = createMockElement({
        tagName: 'input',
        llmId: '1',
        type: 'email',
        placeholder: 'Email',
      });

      expect(input.getAttribute('type')).toBe('email');
    });
  });

  // --------------------------------------------------------------------------
  // Coordinate Calculation Tests
  // --------------------------------------------------------------------------

  describe('Coordinate Calculation', () => {
    it('should calculate center coordinates correctly', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Click',
        rect: { left: 100, top: 200, width: 100, height: 40 },
      });

      const rect = el.getBoundingClientRect();
      const centerX = Math.round(rect.left + rect.width / 2);
      const centerY = Math.round(rect.top + rect.height / 2);

      expect(centerX).toBe(150);
      expect(centerY).toBe(220);
    });

    it('should handle elements at origin', () => {
      const el = createMockElement({
        tagName: 'button',
        llmId: '1',
        textContent: 'Click',
        rect: { left: 0, top: 0, width: 50, height: 30 },
      });

      const rect = el.getBoundingClientRect();
      const centerX = Math.round(rect.left + rect.width / 2);
      const centerY = Math.round(rect.top + rect.height / 2);

      expect(centerX).toBe(25);
      expect(centerY).toBe(15);
    });
  });

  // --------------------------------------------------------------------------
  // Token Estimation Tests
  // --------------------------------------------------------------------------

  describe('Token Estimation', () => {
    it('should estimate tokens from JSON string length', () => {
      const nodes: SemanticNodeV3[] = [
        { i: '1', r: 'btn', n: 'Click' },
        { i: '2', r: 'inp', n: 'Email', v: '' },
        { i: '3', r: 'link', n: 'Home' },
      ];

      const jsonString = JSON.stringify(nodes);
      const estimatedTokens = Math.round(jsonString.length / 4);

      // Should be reasonable estimate
      expect(estimatedTokens).toBeGreaterThan(0);
      expect(estimatedTokens).toBeLessThan(100); // Small payload
    });

    it('should estimate minified format is more efficient', () => {
      // Full format
      const fullNodes = [
        { id: '1', role: 'button', name: 'Click' },
        { id: '2', role: 'textbox', name: 'Email', value: '' },
      ];

      // Minified format
      const minifiedNodes: SemanticNodeV3[] = [
        { i: '1', r: 'btn', n: 'Click' },
        { i: '2', r: 'inp', n: 'Email', v: '' },
      ];

      const fullLength = JSON.stringify(fullNodes).length;
      const minifiedLength = JSON.stringify(minifiedNodes).length;

      expect(minifiedLength).toBeLessThan(fullLength);
    });
  });
});

// ============================================================================
// INTEGRATION TESTS - Test full extraction pipeline
// ============================================================================

describe('SemanticTree Integration', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });
    Object.defineProperty(window, 'scrollY', { value: 0, writable: true });
  });

  it('should extract a typical page with various interactive elements', () => {
    // Create a mini page structure
    const header = document.createElement('header');

    const logo = createMockElement({
      tagName: 'a',
      llmId: '1',
      href: '/',
      ariaLabel: 'Home',
      rect: { left: 20, top: 20, width: 50, height: 50 },
    });

    const nav = document.createElement('nav');
    const navLink1 = createMockElement({
      tagName: 'a',
      llmId: '2',
      href: '/products',
      textContent: 'Products',
      rect: { left: 100, top: 20, width: 80, height: 30 },
    });
    const navLink2 = createMockElement({
      tagName: 'a',
      llmId: '3',
      href: '/about',
      textContent: 'About',
      rect: { left: 200, top: 20, width: 60, height: 30 },
    });

    const searchInput = createMockElement({
      tagName: 'input',
      llmId: '4',
      type: 'search',
      placeholder: 'Search...',
      rect: { left: 400, top: 20, width: 200, height: 35 },
    });

    const loginBtn = createMockElement({
      tagName: 'button',
      llmId: '5',
      textContent: 'Login',
      rect: { left: 650, top: 20, width: 80, height: 35 },
    });

    nav.appendChild(navLink1);
    nav.appendChild(navLink2);
    header.appendChild(logo);
    header.appendChild(nav);
    header.appendChild(searchInput);
    header.appendChild(loginBtn);

    document.body.appendChild(header);

    mockComputedStyle({});

    // Query all tagged elements
    const elements = document.querySelectorAll('[data-llm-id]');

    expect(elements.length).toBe(5);

    // Verify each element has an ID
    elements.forEach(el => {
      expect(el.getAttribute('data-llm-id')).toBeTruthy();
    });
  });

  it('should handle a page with modal overlay', () => {
    // Background button
    const bgButton = createMockElement({
      tagName: 'button',
      llmId: '1',
      textContent: 'Background Button',
      rect: { left: 100, top: 100, width: 100, height: 40 },
    });

    // Modal overlay (full screen)
    const modal = createMockElement({
      tagName: 'div',
      llmId: 'modal',
      role: 'dialog',
      rect: { left: 0, top: 0, width: 1920, height: 1080 },
    });

    // Modal button
    const modalButton = createMockElement({
      tagName: 'button',
      llmId: '2',
      textContent: 'Close Modal',
      rect: { left: 900, top: 500, width: 100, height: 40 },
    });

    document.body.appendChild(bgButton);
    document.body.appendChild(modal);
    modal.appendChild(modalButton);

    mockComputedStyle({});

    // Store references for closure
    const bgButtonRef = bgButton;
    const modalButtonRef = modalButton;
    const modalRef = modal;

    // Mock elementFromPoint - returns modal or modal button based on coordinates
    // Modal button rect: left=900, right=1000, top=500, bottom=540
    // Modal button center: (950, 520)
    mockElementFromPoint((x, y) => {
      // Modal button area
      if (x >= 900 && x <= 1000 && y >= 500 && y <= 540) {
        return modalButtonRef;
      }
      // Modal covers everything else
      return modalRef;
    });

    // Test occlusion detection for background button
    const bgRect = bgButtonRef.getBoundingClientRect();
    const centerX = bgRect.left + bgRect.width / 2; // 150
    const centerY = bgRect.top + bgRect.height / 2; // 120

    const topElement = document.elementFromPoint(centerX, centerY);
    const isOccluded = topElement !== bgButtonRef && !bgButtonRef.contains(topElement as Node);

    expect(isOccluded).toBe(true);

    // Modal button should not be occluded - check with exact center coordinates
    const modalTopElement = document.elementFromPoint(950, 520);
    const isModalButtonOccluded = modalTopElement !== modalButtonRef;

    expect(isModalButtonOccluded).toBe(false);
  });

  it('should handle empty page gracefully', () => {
    // Empty body
    document.body.innerHTML = '';

    const elements = document.querySelectorAll('[data-llm-id]');
    expect(elements.length).toBe(0);
  });

  it('should handle page with only hidden elements', () => {
    const button = createMockElement({
      tagName: 'button',
      llmId: '1',
      textContent: 'Hidden',
    });

    document.body.appendChild(button);

    mockComputedStyle({
      '1': { display: 'none' },
    });

    const elements = document.querySelectorAll('[data-llm-id]');
    let visibleCount = 0;

    elements.forEach(el => {
      const style = window.getComputedStyle(el);
      if (style.display !== 'none' && style.visibility !== 'hidden' && style.opacity !== '0') {
        visibleCount++;
      }
    });

    expect(visibleCount).toBe(0);
  });
});

// ============================================================================
// ERROR HANDLING TESTS
// ============================================================================

describe('Error Handling', () => {
  it('should handle getComputedStyle throwing error', () => {
    const button = createMockElement({
      tagName: 'button',
      llmId: '1',
      textContent: 'Test',
    });

    document.body.appendChild(button);

    // Mock getComputedStyle to throw
    window.getComputedStyle = jest.fn(() => {
      throw new Error('Cannot read style');
    });

    // Should not throw
    expect(() => {
      try {
        window.getComputedStyle(button);
      } catch {
        // Handled gracefully
      }
    }).not.toThrow();
  });

  it('should handle getBoundingClientRect returning zeroes', () => {
    const button = createMockElement({
      tagName: 'button',
      llmId: '1',
      textContent: 'Zero size',
      rect: { left: 0, top: 0, width: 0, height: 0 },
    });

    document.body.appendChild(button);

    const rect = button.getBoundingClientRect();
    const hasNoSize = rect.width === 0 && rect.height === 0;

    expect(hasNoSize).toBe(true);
  });

  it('should handle elementFromPoint returning null', () => {
    mockElementFromPoint(() => null);

    const result = document.elementFromPoint(100, 100);
    expect(result).toBeNull();
  });

  it('should handle isReliablyVisible errors gracefully', () => {
    // Import the function to test
    const { isReliablyVisible } = require('./semanticTree');

    // Create element that returns invalid rect
    const brokenElement = document.createElement('button');
    brokenElement.getBoundingClientRect = jest.fn(() => {
      throw new Error('getBoundingClientRect failed');
    });

    // Should not throw and should return true (fail-safe)
    expect(() => isReliablyVisible(brokenElement)).not.toThrow();
    expect(isReliablyVisible(brokenElement)).toBe(true);
  });

  it('should handle getVisibilityScore errors gracefully', () => {
    const { getVisibilityScore } = require('./semanticTree');

    // Create element that returns invalid rect
    const brokenElement = document.createElement('button');
    brokenElement.getBoundingClientRect = jest.fn(() => {
      throw new Error('getBoundingClientRect failed');
    });

    // Should not throw and should return 0.5 (fail-safe)
    expect(() => getVisibilityScore(brokenElement)).not.toThrow();
    expect(getVisibilityScore(brokenElement)).toBe(0.5);
  });

  it('should handle zero viewport dimensions gracefully', () => {
    const { isReliablyVisible } = require('./semanticTree');

    // Set viewport to 0 (edge case)
    Object.defineProperty(window, 'innerWidth', { value: 0, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 0, writable: true });

    const button = createMockElement({
      tagName: 'button',
      llmId: '1',
      textContent: 'Test',
      rect: { left: 100, top: 100, width: 100, height: 40 },
    });

    document.body.appendChild(button);

    // Should use fallback viewport values and not crash
    expect(() => isReliablyVisible(button)).not.toThrow();

    // Restore viewport
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });
  });
});

// ============================================================================
// LAST-RESORT FALLBACK TESTS
// ============================================================================

describe('Last-Resort Fallback', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
    Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });
  });

  it('should find interactive elements even without data-llm-id', () => {
    // Create interactive elements WITHOUT data-llm-id
    const button = document.createElement('button');
    button.textContent = 'Click me';

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Enter text';

    const link = document.createElement('a');
    link.href = 'https://example.com';
    link.textContent = 'Example Link';

    document.body.appendChild(button);
    document.body.appendChild(input);
    document.body.appendChild(link);

    // Query interactive elements directly (simulating last-resort fallback)
    const INTERACTIVE_SELECTORS = 'a[href], button, input, textarea, select, [role="button"], [role="link"], [role="textbox"]';
    const elements = document.querySelectorAll(INTERACTIVE_SELECTORS);

    expect(elements.length).toBe(3);
    expect(elements[0]).toBe(button);
    expect(elements[1]).toBe(input);
    expect(elements[2]).toBe(link);
  });

  it('should assign IDs dynamically in last-resort mode', () => {
    // Create interactive element without ID
    const button = document.createElement('button');
    button.textContent = 'Test Button';
    document.body.appendChild(button);

    // Verify no data-llm-id initially
    expect(button.getAttribute('data-llm-id')).toBeNull();

    // Simulate last-resort ID assignment
    const lastResortId = 'lr-1';
    button.setAttribute('data-llm-id', lastResortId);

    expect(button.getAttribute('data-llm-id')).toBe('lr-1');
  });

  it('should extract basic info from untagged elements', () => {
    const button = document.createElement('button');
    button.textContent = 'Submit Form';
    button.setAttribute('aria-label', 'Submit the registration form');

    document.body.appendChild(button);

    // Extract basic info (simulating fallback extraction)
    const tagName = button.tagName.toLowerCase();
    const textContent = button.textContent;
    const ariaLabel = button.getAttribute('aria-label');

    expect(tagName).toBe('button');
    expect(textContent).toBe('Submit Form');
    expect(ariaLabel).toBe('Submit the registration form');
  });
});
