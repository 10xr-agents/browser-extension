/**
 * Hidden Event Listener Detection via Chrome DevTools Protocol
 *
 * BROWSER-USE INSPIRED: Detects elements with JavaScript click listeners that
 * are invisible to standard DOM inspection. This catches:
 * - React's onClick (synthetic events)
 * - Vue's @click directives
 * - Angular's (click) bindings
 * - jQuery's .on('click', ...)
 * - Native addEventListener('click', ...)
 *
 * The key technique: Execute script via CDP Runtime.evaluate with
 * `includeCommandLineAPI: true` which enables DevTools-only APIs like
 * `getEventListeners()`.
 *
 * Reference: docs/browser-use-dom-extraction.md
 */

/**
 * Script to inject via CDP to detect hidden event listeners.
 * Uses getEventListeners() which is only available in DevTools context.
 */
export const HIDDEN_LISTENER_DETECTION_SCRIPT = `
(() => {
  // getEventListeners is only available in DevTools context via includeCommandLineAPI
  if (typeof getEventListeners !== 'function') {
    return { error: 'getEventListeners not available', elements: [] };
  }

  const elementsWithListeners = [];
  const allElements = document.querySelectorAll('*');

  for (const el of allElements) {
    try {
      const listeners = getEventListeners(el);
      // Check for click-related event listeners
      if (listeners.click || listeners.mousedown || listeners.mouseup ||
          listeners.pointerdown || listeners.pointerup) {
        // Get existing data-llm-id if present
        const llmId = el.getAttribute('data-llm-id');

        // Collect basic element info for identification
        elementsWithListeners.push({
          tagName: el.tagName.toLowerCase(),
          id: el.id || null,
          className: el.className || null,
          llmId: llmId || null,
          listenerTypes: Object.keys(listeners).filter(k =>
            ['click', 'mousedown', 'mouseup', 'pointerdown', 'pointerup'].includes(k)
          ),
          // Get basic position for matching
          rect: (() => {
            try {
              const r = el.getBoundingClientRect();
              return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
            } catch { return null; }
          })()
        });
      }
    } catch (e) {
      // Ignore errors for individual elements (e.g., cross-origin)
    }
  }

  return {
    error: null,
    elements: elementsWithListeners,
    total: elementsWithListeners.length
  };
})()
`;

/**
 * Result from hidden listener detection
 */
export interface HiddenListenerResult {
  error: string | null;
  elements: Array<{
    tagName: string;
    id: string | null;
    className: string | null;
    llmId: string | null;
    listenerTypes: string[];
    rect: { x: number; y: number; w: number; h: number } | null;
  }>;
  total: number;
}

/**
 * Detect elements with hidden click listeners via CDP.
 * This runs in the background script context using Chrome Debugger API.
 *
 * @param tabId - The tab to analyze
 * @returns List of elements with hidden click listeners
 */
export async function detectHiddenClickListeners(
  tabId: number
): Promise<HiddenListenerResult> {
  try {
    // Execute the detection script with includeCommandLineAPI enabled
    // This is the key that enables getEventListeners()
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: HIDDEN_LISTENER_DETECTION_SCRIPT,
        includeCommandLineAPI: true,  // THE KEY: enables getEventListeners()
        returnByValue: true,          // Get the actual data, not object reference
        awaitPromise: false,
      }
    ) as { result: { value: HiddenListenerResult } };

    if (result?.result?.value) {
      const data = result.result.value;
      console.log(`[HiddenListenerDetector] Found ${data.total} elements with hidden listeners`);
      return data;
    }

    return { error: 'No result from script', elements: [], total: 0 };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[HiddenListenerDetector] Detection failed:', errorMessage);
    return { error: errorMessage, elements: [], total: 0 };
  }
}

/**
 * Mark elements with hidden listeners in the DOM.
 * This runs content script logic to add data-has-listener attribute.
 *
 * @param tabId - The tab to update
 * @param listenerInfo - Results from detectHiddenClickListeners
 * @returns Number of elements marked
 */
export async function markHiddenListenerElements(
  tabId: number,
  listenerInfo: HiddenListenerResult
): Promise<number> {
  if (listenerInfo.error || listenerInfo.elements.length === 0) {
    return 0;
  }

  // Build script to mark elements
  const markScript = `
    (() => {
      const elementsToMark = ${JSON.stringify(listenerInfo.elements)};
      let marked = 0;

      for (const info of elementsToMark) {
        // Try to find element by llmId first (most reliable)
        let el = null;
        if (info.llmId) {
          el = document.querySelector('[data-llm-id="' + info.llmId + '"]');
        }

        // Fallback: find by position if we have rect
        if (!el && info.rect && info.rect.w > 0 && info.rect.h > 0) {
          const centerX = info.rect.x + info.rect.w / 2;
          const centerY = info.rect.y + info.rect.h / 2;
          const topEl = document.elementFromPoint(centerX, centerY);
          if (topEl && topEl.tagName.toLowerCase() === info.tagName) {
            el = topEl;
          }
        }

        if (el) {
          el.setAttribute('data-has-click-listener', 'true');
          marked++;
        }
      }

      return marked;
    })()
  `;

  try {
    const result = await chrome.debugger.sendCommand(
      { tabId },
      'Runtime.evaluate',
      {
        expression: markScript,
        returnByValue: true,
      }
    ) as { result: { value: number } };

    const markedCount = result?.result?.value || 0;
    console.log(`[HiddenListenerDetector] Marked ${markedCount} elements with listener attribute`);
    return markedCount;
  } catch (error) {
    console.error('[HiddenListenerDetector] Failed to mark elements:', error);
    return 0;
  }
}

/**
 * Full detection + marking pipeline.
 * Detects hidden listeners and marks the elements in the DOM.
 *
 * @param tabId - The tab to process
 * @returns Detection result with count of marked elements
 */
export async function detectAndMarkHiddenListeners(
  tabId: number
): Promise<{ detected: number; marked: number; error: string | null }> {
  const detection = await detectHiddenClickListeners(tabId);

  if (detection.error) {
    return { detected: 0, marked: 0, error: detection.error };
  }

  const marked = await markHiddenListenerElements(tabId, detection);

  return {
    detected: detection.total,
    marked,
    error: null,
  };
}

/**
 * Get elements with hidden listeners that don't have data-llm-id yet.
 * These are interactive elements that need to be tagged.
 *
 * @param listenerInfo - Results from detectHiddenClickListeners
 * @returns Elements that need tagging
 */
export function getUntaggedListenerElements(
  listenerInfo: HiddenListenerResult
): Array<{ tagName: string; rect: { x: number; y: number; w: number; h: number } | null }> {
  return listenerInfo.elements
    .filter(el => !el.llmId)
    .map(el => ({
      tagName: el.tagName,
      rect: el.rect,
    }));
}
