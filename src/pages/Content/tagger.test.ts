/**
 * Element Tagger Tests
 *
 * Tests for the Persistent Element Tagger module that ensures every
 * interactive element has a stable `data-llm-id` attribute.
 *
 * Critical scenarios tested:
 * - Tagging interactive elements
 * - Visibility checks before tagging
 * - Shadow DOM handling
 * - MutationObserver auto-tagging
 * - Edge cases that cause extraction failures
 *
 * Reference: DOM_EXTRACTION_ARCHITECTURE.md
 */

import {
  LLM_ID_ATTR,
  SHADOW_ATTR,
  FRAME_ATTR,
  ensureStableIds,
  startAutoTagger,
  stopAutoTagger,
  getStableId,
  findElementByStableId,
  getAllTaggedElements,
  resetTagger,
  getCurrentIdCounter,
  setFrameId,
  getFrameId,
} from './tagger';

// ============================================================================
// INTERACTIVE SELECTORS (from tagger.ts)
// ============================================================================

const INTERACTIVE_SELECTORS = [
  'a[href]',
  'button',
  'input',
  'textarea',
  'select',
  '[role="button"]',
  '[role="link"]',
  '[role="menuitem"]',
  '[role="menuitemcheckbox"]',
  '[role="menuitemradio"]',
  '[role="option"]',
  '[role="tab"]',
  '[role="treeitem"]',
  '[role="checkbox"]',
  '[role="radio"]',
  '[role="switch"]',
  '[role="combobox"]',
  '[role="listbox"]',
  '[role="textbox"]',
  '[role="searchbox"]',
  '[role="spinbutton"]',
  '[role="slider"]',
  '[onclick]',
  '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]',
].join(', ');

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Store original getComputedStyle
 */
const originalGetComputedStyle = window.getComputedStyle;

/**
 * Default visible computed style
 */
const defaultVisibleStyle = {
  display: 'block',
  visibility: 'visible',
  opacity: '1',
} as CSSStyleDeclaration;

/**
 * Create a mock element for testing
 */
function createTestElement(config: {
  tagName: string;
  id?: string;
  href?: string;
  role?: string;
  type?: string;
  textContent?: string;
  onclick?: boolean;
  tabindex?: string;
  contenteditable?: string;
  ariaHidden?: boolean;
  hidden?: boolean;
  style?: Partial<CSSStyleDeclaration>;
  rect?: { width: number; height: number; left: number; top: number };
}): HTMLElement {
  const el = document.createElement(config.tagName);

  if (config.id) el.id = config.id;
  if (config.href) el.setAttribute('href', config.href);
  if (config.role) el.setAttribute('role', config.role);
  if (config.type) el.setAttribute('type', config.type);
  if (config.textContent) el.textContent = config.textContent;
  if (config.onclick) el.setAttribute('onclick', 'handleClick()');
  if (config.tabindex) el.setAttribute('tabindex', config.tabindex);
  if (config.contenteditable) el.setAttribute('contenteditable', config.contenteditable);
  if (config.ariaHidden) el.setAttribute('aria-hidden', 'true');
  if (config.hidden) el.setAttribute('hidden', '');

  // Mock getBoundingClientRect - use provided rect or default visible dimensions
  const rect = config.rect || { width: 100, height: 40, left: 0, top: 0 };
  el.getBoundingClientRect = jest.fn(() => ({
    ...rect,
    right: rect.left + rect.width,
    bottom: rect.top + rect.height,
    x: rect.left,
    y: rect.top,
    toJSON: () => rect,
  })) as unknown as () => DOMRect;

  return el;
}

/**
 * Mock getComputedStyle for all elements to return visible styles by default
 */
function mockDefaultVisibleStyles(): void {
  window.getComputedStyle = jest.fn(() => defaultVisibleStyle) as unknown as typeof window.getComputedStyle;
}

/**
 * Mock getComputedStyle for visibility testing
 */
function mockVisibleStyle(el: Element, visible: boolean = true): void {
  window.getComputedStyle = jest.fn((element: Element) => {
    if (element === el) {
      return {
        display: visible ? 'block' : 'none',
        visibility: visible ? 'visible' : 'hidden',
        opacity: visible ? '1' : '0',
      } as CSSStyleDeclaration;
    }
    return defaultVisibleStyle;
  }) as typeof window.getComputedStyle;
}

// ============================================================================
// UNIT TESTS
// ============================================================================

describe('Element Tagger', () => {
  beforeEach(() => {
    // Reset DOM
    document.body.innerHTML = '';
    // Reset tagger state
    resetTagger();
    // Reset mocks
    jest.restoreAllMocks();
    // Default: all elements are visible
    mockDefaultVisibleStyles();
  });

  afterEach(() => {
    stopAutoTagger();
    jest.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // Constants Tests
  // --------------------------------------------------------------------------

  describe('Constants', () => {
    it('should have correct attribute names', () => {
      expect(LLM_ID_ATTR).toBe('data-llm-id');
      expect(SHADOW_ATTR).toBe('data-llm-in-shadow');
      expect(FRAME_ATTR).toBe('data-llm-frame-id');
    });
  });

  // --------------------------------------------------------------------------
  // ensureStableIds Tests
  // --------------------------------------------------------------------------

  describe('ensureStableIds', () => {
    it('should tag a button element', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Click me',
      });
      document.body.appendChild(button);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should tag a link element', () => {
      const link = createTestElement({
        tagName: 'a',
        href: 'https://example.com',
        textContent: 'Example',
      });
      document.body.appendChild(link);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(link.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should tag an input element', () => {
      const input = createTestElement({
        tagName: 'input',
        type: 'text',
      });
      document.body.appendChild(input);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(input.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should tag a textarea element', () => {
      const textarea = createTestElement({
        tagName: 'textarea',
      });
      document.body.appendChild(textarea);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(textarea.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should tag a select element', () => {
      const select = createTestElement({
        tagName: 'select',
      });
      document.body.appendChild(select);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(select.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should tag elements with ARIA roles', () => {
      const divButton = createTestElement({
        tagName: 'div',
        role: 'button',
        textContent: 'ARIA Button',
      });
      document.body.appendChild(divButton);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(divButton.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should tag elements with onclick', () => {
      const div = createTestElement({
        tagName: 'div',
        onclick: true,
        textContent: 'Clickable div',
      });
      document.body.appendChild(div);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(div.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should tag focusable elements', () => {
      const div = createTestElement({
        tagName: 'div',
        tabindex: '0',
        textContent: 'Focusable',
      });
      document.body.appendChild(div);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(div.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should tag contenteditable elements', () => {
      const div = createTestElement({
        tagName: 'div',
        contenteditable: 'true',
        textContent: 'Editable',
      });
      document.body.appendChild(div);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(div.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should NOT tag elements with tabindex="-1"', () => {
      const div = createTestElement({
        tagName: 'div',
        tabindex: '-1',
        textContent: 'Not focusable',
      });
      document.body.appendChild(div);

      const count = ensureStableIds();

      // Should not be tagged (div without other interactive properties)
      expect(div.hasAttribute(LLM_ID_ATTR)).toBe(false);
    });

    it('should NOT tag already-tagged elements', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Already tagged',
      });
      button.setAttribute(LLM_ID_ATTR, '999');
      document.body.appendChild(button);

      const count = ensureStableIds();

      expect(button.getAttribute(LLM_ID_ATTR)).toBe('999'); // Unchanged
    });

    it('should assign unique IDs to multiple elements', () => {
      const button1 = createTestElement({ tagName: 'button', textContent: 'One' });
      const button2 = createTestElement({ tagName: 'button', textContent: 'Two' });
      const button3 = createTestElement({ tagName: 'button', textContent: 'Three' });

      document.body.appendChild(button1);
      document.body.appendChild(button2);
      document.body.appendChild(button3);

      ensureStableIds();

      const id1 = button1.getAttribute(LLM_ID_ATTR);
      const id2 = button2.getAttribute(LLM_ID_ATTR);
      const id3 = button3.getAttribute(LLM_ID_ATTR);

      expect(id1).toBeTruthy();
      expect(id2).toBeTruthy();
      expect(id3).toBeTruthy();

      // All IDs should be unique
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });

    it('should handle empty document gracefully', () => {
      document.body.innerHTML = '';

      const count = ensureStableIds();

      expect(count).toBe(0);
    });

    it('should handle null root gracefully', () => {
      const count = ensureStableIds(null as unknown as Element);

      expect(count).toBe(0);
    });
  });

  // --------------------------------------------------------------------------
  // Visibility Tests
  // --------------------------------------------------------------------------

  describe('Visibility Checks', () => {
    it('should NOT tag display:none elements', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Hidden',
      });
      document.body.appendChild(button);

      // Mock getComputedStyle to return display:none for this element
      mockVisibleStyle(button, false);

      ensureStableIds();

      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(false);
    });

    it('should NOT tag visibility:hidden elements', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Hidden',
      });
      document.body.appendChild(button);

      window.getComputedStyle = jest.fn(() => ({
        display: 'block',
        visibility: 'hidden',
        opacity: '1',
      })) as unknown as typeof window.getComputedStyle;

      ensureStableIds();

      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(false);
    });

    it('should NOT tag opacity:0 elements', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Transparent',
      });
      document.body.appendChild(button);

      window.getComputedStyle = jest.fn(() => ({
        display: 'block',
        visibility: 'visible',
        opacity: '0',
      })) as unknown as typeof window.getComputedStyle;

      ensureStableIds();

      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(false);
    });

    it('should NOT tag aria-hidden="true" elements', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Hidden',
        ariaHidden: true,
      });
      document.body.appendChild(button);

      ensureStableIds();

      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(false);
    });

    it('should NOT tag hidden attribute elements', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Hidden',
        hidden: true,
      });
      document.body.appendChild(button);

      ensureStableIds();

      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(false);
    });

    it('should NOT tag input type="hidden"', () => {
      const input = createTestElement({
        tagName: 'input',
        type: 'hidden',
      });
      document.body.appendChild(input);

      ensureStableIds();

      expect(input.hasAttribute(LLM_ID_ATTR)).toBe(false);
    });

    it('should NOT tag zero-sized elements', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Zero size',
        rect: { width: 0, height: 0, left: 0, top: 0 },
      });
      document.body.appendChild(button);

      ensureStableIds();

      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // Frame ID Tests
  // --------------------------------------------------------------------------

  describe('Frame ID', () => {
    it('should set and get frame ID', () => {
      setFrameId(5);
      expect(getFrameId()).toBe(5);
    });

    it('should reset frame ID on resetTagger', () => {
      setFrameId(10);
      resetTagger();
      expect(getFrameId()).toBe(0);
    });

    it('should include frame ID attribute on tagged elements', () => {
      setFrameId(3);

      const button = createTestElement({
        tagName: 'button',
        textContent: 'Test',
      });
      document.body.appendChild(button);

      ensureStableIds();

      expect(button.getAttribute(FRAME_ATTR)).toBe('3');
    });
  });

  // --------------------------------------------------------------------------
  // ID Counter Tests
  // --------------------------------------------------------------------------

  describe('ID Counter', () => {
    it('should start at 1', () => {
      expect(getCurrentIdCounter()).toBe(1);
    });

    it('should increment after tagging', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Test',
      });
      document.body.appendChild(button);

      const initialCounter = getCurrentIdCounter();
      ensureStableIds();
      const afterCounter = getCurrentIdCounter();

      expect(afterCounter).toBeGreaterThan(initialCounter);
    });

    it('should reset counter on resetTagger', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Test',
      });
      document.body.appendChild(button);

      ensureStableIds();
      resetTagger();

      expect(getCurrentIdCounter()).toBe(1);
    });
  });

  // --------------------------------------------------------------------------
  // Lookup Functions Tests
  // --------------------------------------------------------------------------

  describe('Lookup Functions', () => {
    it('should get stable ID for element', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Test',
      });
      document.body.appendChild(button);
      ensureStableIds();

      const id = getStableId(button);

      expect(id).toBeTruthy();
    });

    it('should return null for untagged element', () => {
      const div = document.createElement('div');
      document.body.appendChild(div);

      const id = getStableId(div);

      expect(id).toBeNull();
    });

    it('should find element by stable ID', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Test',
      });
      document.body.appendChild(button);
      ensureStableIds();

      const id = getStableId(button);
      const found = findElementByStableId(id!);

      expect(found).toBe(button);
    });

    it('should return null for non-existent ID', () => {
      const found = findElementByStableId('99999');

      expect(found).toBeNull();
    });

    it('should get all tagged elements', () => {
      const button1 = createTestElement({ tagName: 'button', textContent: 'One' });
      const button2 = createTestElement({ tagName: 'button', textContent: 'Two' });
      const div = document.createElement('div'); // Not interactive

      document.body.appendChild(button1);
      document.body.appendChild(button2);
      document.body.appendChild(div);

      ensureStableIds();

      const tagged = getAllTaggedElements();

      expect(tagged.length).toBe(2);
    });
  });

  // --------------------------------------------------------------------------
  // Auto-Tagger Tests
  // --------------------------------------------------------------------------

  describe('Auto-Tagger', () => {
    it('should start auto-tagger', () => {
      expect(() => startAutoTagger()).not.toThrow();
    });

    it('should stop auto-tagger', () => {
      startAutoTagger();
      expect(() => stopAutoTagger()).not.toThrow();
    });

    it('should be idempotent (can start multiple times)', () => {
      expect(() => {
        startAutoTagger();
        startAutoTagger();
        startAutoTagger();
      }).not.toThrow();
    });

    it('should tag initial elements on start', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Test',
      });
      document.body.appendChild(button);

      startAutoTagger();

      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });
  });

  // --------------------------------------------------------------------------
  // Edge Cases Tests
  // --------------------------------------------------------------------------

  describe('Edge Cases', () => {
    it('should handle elements added after initial tagging', () => {
      const button1 = createTestElement({ tagName: 'button', textContent: 'First' });
      document.body.appendChild(button1);
      ensureStableIds();

      const button2 = createTestElement({ tagName: 'button', textContent: 'Second' });
      document.body.appendChild(button2);
      ensureStableIds();

      expect(button1.hasAttribute(LLM_ID_ATTR)).toBe(true);
      expect(button2.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should handle nested interactive elements', () => {
      const link = createTestElement({
        tagName: 'a',
        href: '/test',
        textContent: '',
      });

      const button = createTestElement({
        tagName: 'button',
        textContent: 'Nested button',
      });

      link.appendChild(button);
      document.body.appendChild(link);

      ensureStableIds();

      // Both should be tagged
      expect(link.hasAttribute(LLM_ID_ATTR)).toBe(true);
      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });

    it('should handle large DOM', () => {
      // Create 1000 elements
      for (let i = 0; i < 1000; i++) {
        const button = createTestElement({
          tagName: 'button',
          textContent: `Button ${i}`,
        });
        document.body.appendChild(button);
      }

      const startTime = performance.now();
      const count = ensureStableIds();
      const duration = performance.now() - startTime;

      expect(count).toBe(1000);
      expect(duration).toBeLessThan(1000); // Should complete in <1s
    });

    it('should handle getComputedStyle throwing error', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: 'Test',
      });
      document.body.appendChild(button);

      // Mock getComputedStyle to throw
      window.getComputedStyle = jest.fn(() => {
        throw new Error('Security error');
      });

      // Should not throw
      expect(() => ensureStableIds()).not.toThrow();
    });

    it('should handle special characters in element text', () => {
      const button = createTestElement({
        tagName: 'button',
        textContent: '<script>alert("xss")</script>',
      });
      document.body.appendChild(button);

      const count = ensureStableIds();

      expect(count).toBeGreaterThan(0);
      expect(button.hasAttribute(LLM_ID_ATTR)).toBe(true);
    });
  });
});

// ============================================================================
// REGRESSION TESTS - Specific bugs that have occurred
// ============================================================================

describe('Regression Tests', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    resetTagger();
    jest.restoreAllMocks();
    // Default: all elements are visible
    mockDefaultVisibleStyles();
  });

  it('REGRESSION: Should not leave document without any tagged elements on valid page', () => {
    // This tests the scenario from the error log where semantic extraction
    // returned empty result because no elements were tagged

    // Create a typical dashboard page structure
    const nav = document.createElement('nav');

    const link1 = createTestElement({
      tagName: 'a',
      href: '/dashboard?tab=overview',
      textContent: 'Overview',
    });
    const link2 = createTestElement({
      tagName: 'a',
      href: '/dashboard?tab=settings',
      textContent: 'Settings',
    });

    const button1 = createTestElement({
      tagName: 'button',
      textContent: 'Add Alert',
    });

    const switchEl = createTestElement({
      tagName: 'button',
      role: 'switch',
      textContent: '',
    });

    nav.appendChild(link1);
    nav.appendChild(link2);
    document.body.appendChild(nav);
    document.body.appendChild(button1);
    document.body.appendChild(switchEl);

    // Tag all elements
    const count = ensureStableIds();

    // CRITICAL: Should have tagged elements
    expect(count).toBeGreaterThan(0);

    // All interactive elements should have IDs
    expect(link1.hasAttribute(LLM_ID_ATTR)).toBe(true);
    expect(link2.hasAttribute(LLM_ID_ATTR)).toBe(true);
    expect(button1.hasAttribute(LLM_ID_ATTR)).toBe(true);
    expect(switchEl.hasAttribute(LLM_ID_ATTR)).toBe(true);
  });

  it('REGRESSION: Should tag elements in deeply nested structure', () => {
    // Some sites have very deep nesting which can cause issues

    let parent = document.body;
    const targetDepth = 20;

    for (let i = 0; i < targetDepth; i++) {
      const div = document.createElement('div');
      parent.appendChild(div);
      parent = div;
    }

    // Add button at deepest level
    const button = createTestElement({
      tagName: 'button',
      textContent: 'Deep button',
    });
    parent.appendChild(button);

    const count = ensureStableIds();

    expect(count).toBeGreaterThan(0);
    expect(button.hasAttribute(LLM_ID_ATTR)).toBe(true);
  });

  it('REGRESSION: Should handle querySelectorAll failure gracefully', () => {
    // Mock querySelectorAll to throw
    const originalQuerySelectorAll = document.querySelectorAll;
    document.querySelectorAll = jest.fn(() => {
      throw new Error('Query selector failed');
    });

    const button = createTestElement({
      tagName: 'button',
      textContent: 'Test',
    });
    document.body.appendChild(button);

    // Should not throw
    expect(() => ensureStableIds()).not.toThrow();

    // Restore
    document.querySelectorAll = originalQuerySelectorAll;
  });
});
