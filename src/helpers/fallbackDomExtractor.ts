/**
 * Fallback DOM Extractor - Direct Function Injection
 * 
 * When the content script message channel is broken (e.g., on google.com after
 * navigation), this module provides a fallback that directly injects a DOM
 * extraction function into the page using chrome.scripting.executeScript().
 * 
 * This bypasses the need for a content script listener entirely.
 * 
 * Reference: Chrome Extensions documentation on programmatic injection
 * https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts#programmatic
 */

/**
 * Result from the fallback DOM extraction
 */
export interface FallbackDomResult {
  success: boolean;
  url: string;
  title: string;
  html?: string;
  interactiveElements?: FallbackInteractiveElement[];
  error?: string;
}

/**
 * Interactive element extracted via fallback
 */
export interface FallbackInteractiveElement {
  index: number;
  tag: string;
  type?: string;
  text: string;
  value?: string;
  placeholder?: string;
  name?: string;
  id?: string;
  role?: string;
  ariaLabel?: string;
  href?: string;
  isVisible: boolean;
  rect: { x: number; y: number; width: number; height: number };
  /** CSS selector path for robust re-finding (used when element ID becomes stale) */
  selectorPath?: string;
}

/**
 * Self-contained DOM extraction function to be injected directly into the page.
 * 
 * CRITICAL: This function MUST be completely self-contained with NO external
 * dependencies and MUST use plain ES5 JavaScript (no for...of, no spread in 
 * certain contexts, no TypeScript features). It will be serialized and executed 
 * in the page context where Babel helpers are NOT available.
 * 
 * @returns FallbackDomResult (as plain object)
 */
function extractDomDirectly() {
  try {
    // Check if document is ready
    if (!document || !document.body || !document.documentElement) {
      return {
        success: false,
        url: window.location ? window.location.href : '',
        title: document ? document.title : '',
        error: 'Document not ready',
      };
    }

    var interactiveElements = [];
    var elementIndex = 0;

    // Helper to check if element is visible (ES5 compatible)
    function isElementVisible(el) {
      try {
        var style = window.getComputedStyle(el);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') {
          return false;
        }
        var rect = el.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      } catch (e) {
        return false;
      }
    }

    // Helper to get element text (ES5 compatible)
    function getElementText(el) {
      try {
        // For inputs, get value or placeholder
        if (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA') {
          return el.value || el.placeholder || el.getAttribute('aria-label') || '';
        }
        // For buttons and links, get text content
        var innerText = el.innerText;
        if (innerText) return innerText.trim().substring(0, 200);
        var ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) return ariaLabel;
        var title = el.getAttribute('title');
        if (title) return title;
        return '';
      } catch (e) {
        return '';
      }
    }

    // Helper to generate a unique CSS selector path for an element (ES5 compatible)
    // This is used for robust re-finding when element IDs become stale
    function getUniqueSelectorPath(el) {
      try {
        // 1. If element has a unique ID, use it
        if (el.id) {
          return '#' + el.id;
        }

        // 2. Try to build a unique selector using attributes
        var tag = el.tagName.toLowerCase();
        var selectors = [];

        // Name attribute (common for form inputs)
        var name = el.getAttribute('name');
        if (name) {
          var nameSelector = tag + '[name="' + name + '"]';
          if (document.querySelectorAll(nameSelector).length === 1) {
            return nameSelector;
          }
          selectors.push(nameSelector);
        }

        // Aria-label (good for accessibility)
        var ariaLabel = el.getAttribute('aria-label');
        if (ariaLabel) {
          var ariaSelector = tag + '[aria-label="' + ariaLabel.replace(/"/g, '\\"') + '"]';
          if (document.querySelectorAll(ariaSelector).length === 1) {
            return ariaSelector;
          }
          selectors.push(ariaSelector);
        }

        // Type attribute (for inputs)
        var type = el.getAttribute('type');
        if (type && tag === 'input') {
          var typeSelector = 'input[type="' + type + '"]';
          if (document.querySelectorAll(typeSelector).length === 1) {
            return typeSelector;
          }
        }

        // Data-testid (common in React apps)
        var testId = el.getAttribute('data-testid');
        if (testId) {
          return '[data-testid="' + testId + '"]';
        }

        // Placeholder (for inputs/textareas)
        var placeholder = el.getAttribute('placeholder');
        if (placeholder) {
          var placeholderSelector = tag + '[placeholder="' + placeholder.replace(/"/g, '\\"') + '"]';
          if (document.querySelectorAll(placeholderSelector).length === 1) {
            return placeholderSelector;
          }
        }

        // 3. Fallback: Build path from parent with nth-child
        var path = [];
        var current = el;
        while (current && current !== document.body && current.parentElement) {
          var parent = current.parentElement;
          var siblings = parent.children;
          var index = 0;
          for (var i = 0; i < siblings.length; i++) {
            if (siblings[i] === current) {
              index = i + 1;
              break;
            }
          }
          var currentTag = current.tagName.toLowerCase();
          path.unshift(currentTag + ':nth-child(' + index + ')');
          current = parent;
          // Limit depth to avoid overly complex selectors
          if (path.length > 5) break;
        }

        if (path.length > 0) {
          return path.join(' > ');
        }

        // Last resort: just the tag
        return tag;
      } catch (e) {
        return null;
      }
    }

    // Selectors for interactive elements
    var interactiveSelectors = 'a[href], button, input, textarea, select, ' +
      '[role="button"], [role="link"], [role="textbox"], [role="combobox"], ' +
      '[role="listbox"], [role="menuitem"], [role="tab"], [role="checkbox"], ' +
      '[role="radio"], [onclick], [tabindex]:not([tabindex="-1"])';

    // Query all interactive elements
    var elements;
    try {
      elements = document.querySelectorAll(interactiveSelectors);
    } catch (e) {
      elements = [];
    }

    // Process each element using traditional for loop (ES5 compatible)
    for (var i = 0; i < elements.length; i++) {
      var el = elements[i];
      try {
        var isVisible = isElementVisible(el);
        if (!isVisible) continue; // Skip invisible elements

        var rect = el.getBoundingClientRect();
        
        interactiveElements.push({
          index: elementIndex++,
          tag: el.tagName.toLowerCase(),
          type: el.type || null,
          text: getElementText(el),
          value: el.value ? el.value.substring(0, 200) : null,
          placeholder: el.placeholder || null,
          name: el.getAttribute('name') || null,
          id: el.id || null,
          role: el.getAttribute('role') || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          href: el.getAttribute('href') || null,
          isVisible: true,
          rect: {
            x: Math.round(rect.x),
            y: Math.round(rect.y),
            width: Math.round(rect.width),
            height: Math.round(rect.height),
          },
          // Generate unique selector path for robust re-finding
          selectorPath: getUniqueSelectorPath(el),
        });
      } catch (e) {
        // Skip problematic elements
        continue;
      }
    }

    // Get simplified HTML (just the body, limited size)
    var html = '';
    try {
      // Clone body and remove scripts/styles to reduce size
      var clone = document.body.cloneNode(true);
      var toRemove = clone.querySelectorAll('script, style, noscript, svg, iframe');
      // Use traditional for loop for NodeList
      for (var j = 0; j < toRemove.length; j++) {
        toRemove[j].remove();
      }
      html = clone.innerHTML.substring(0, 100000); // Limit to 100KB
    } catch (e) {
      html = document.body && document.body.innerHTML ? document.body.innerHTML.substring(0, 50000) : '';
    }

    return {
      success: true,
      url: window.location.href,
      title: document.title,
      html: html,
      interactiveElements: interactiveElements,
    };
  } catch (e) {
    return {
      success: false,
      url: window.location ? window.location.href : '',
      title: document ? document.title : '',
      error: e && e.message ? e.message : String(e),
    };
  }
}

/**
 * Extract DOM using direct function injection (fallback method).
 * 
 * This bypasses the content script message channel by directly injecting
 * the extraction function into the page context.
 * 
 * @param tabId - The tab ID to extract DOM from
 * @returns Promise<FallbackDomResult>
 */
export async function extractDomViaInjection(tabId: number): Promise<FallbackDomResult> {
  if (!tabId || tabId <= 0) {
    return {
      success: false,
      url: '',
      title: '',
      error: `Invalid tabId: ${tabId}`,
    };
  }

  // Check if chrome.scripting is available
  if (typeof chrome === 'undefined' || !chrome.scripting?.executeScript) {
    return {
      success: false,
      url: '',
      title: '',
      error: 'chrome.scripting API not available',
    };
  }

  try {
    console.log(`[FallbackDomExtractor] Injecting extraction function into tab ${tabId}...`);

    // Inject the self-contained function directly
    const results = await chrome.scripting.executeScript({
      target: { tabId },
      func: extractDomDirectly,
      // Run in the main world to access the full DOM
      world: 'MAIN',
    });

    if (!results || results.length === 0) {
      return {
        success: false,
        url: '',
        title: '',
        error: 'Script injection returned no results',
      };
    }

    const result = results[0].result as FallbackDomResult;
    
    if (result?.success) {
      console.log(`[FallbackDomExtractor] Successfully extracted DOM via injection:`, {
        url: result.url?.substring(0, 50),
        interactiveElements: result.interactiveElements?.length || 0,
        htmlSize: result.html?.length || 0,
      });
    } else {
      console.warn(`[FallbackDomExtractor] Extraction returned failure:`, result?.error);
    }

    return result || {
      success: false,
      url: '',
      title: '',
      error: 'Script returned null result',
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[FallbackDomExtractor] Injection failed:`, errorMessage);

    // Check for specific error types
    if (errorMessage.includes('Cannot access')) {
      return {
        success: false,
        url: '',
        title: '',
        error: `Cannot access page (possibly chrome:// or extension page): ${errorMessage}`,
      };
    }

    if (errorMessage.includes('No tab with id')) {
      return {
        success: false,
        url: '',
        title: '',
        error: `Tab ${tabId} no longer exists`,
      };
    }

    return {
      success: false,
      url: '',
      title: '',
      error: errorMessage,
    };
  }
}

/**
 * Convert fallback DOM result to a format compatible with SimplifiedDomResult.
 * This creates a minimal DOM structure that can be used by the agent.
 * 
 * @param fallbackResult - The result from extractDomViaInjection
 * @returns A mock HTMLElement or null
 */
export function convertFallbackToSimplifiedDom(fallbackResult: FallbackDomResult): HTMLElement | null {
  if (!fallbackResult.success || !fallbackResult.html) {
    return null;
  }

  try {
    // Create a DOM parser to parse the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      `<!DOCTYPE html><html><body>${fallbackResult.html}</body></html>`,
      'text/html'
    );

    // Mark interactive elements with data-element-id
    if (fallbackResult.interactiveElements && fallbackResult.interactiveElements.length > 0) {
      // This is a best-effort attempt to mark elements
      // The actual element matching happens on the next DOM extraction
      console.log(`[FallbackDomExtractor] Parsed ${fallbackResult.interactiveElements.length} interactive elements`);
    }

    return doc.body;
  } catch (error) {
    console.error('[FallbackDomExtractor] Failed to parse fallback HTML:', error);
    return null;
  }
}
