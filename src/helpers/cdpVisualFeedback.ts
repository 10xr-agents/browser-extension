/**
 * CDP-Based Visual Feedback
 *
 * Injects visual feedback (ripple effects, highlights) via CDP Runtime.evaluate.
 * Replaces content script ripple functionality.
 *
 * Reference: CDP_DOM_EXTRACTION_MIGRATION.md
 */

import { isDebuggerAttached, attachDebugger } from './chromeDebugger';

/**
 * Send a CDP command
 */
async function sendCDPCommand(
  tabId: number,
  method: string,
  params?: Record<string, any>
): Promise<any> {
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

/**
 * Ensure debugger is attached for visual feedback
 */
async function ensureDebuggerAttached(tabId: number): Promise<void> {
  if (!isDebuggerAttached(tabId)) {
    await attachDebugger(tabId);
  }
}

/**
 * CSS styles for ripple effect
 */
const RIPPLE_STYLES = `
  .cdp-ripple {
    position: fixed;
    pointer-events: none;
    border-radius: 50%;
    background: rgba(66, 133, 244, 0.4);
    transform: scale(0);
    animation: cdp-ripple-animation 0.6s ease-out forwards;
    z-index: 2147483647;
  }

  @keyframes cdp-ripple-animation {
    0% {
      transform: scale(0);
      opacity: 1;
    }
    100% {
      transform: scale(4);
      opacity: 0;
    }
  }

  .cdp-highlight {
    position: fixed;
    pointer-events: none;
    border: 2px solid rgba(66, 133, 244, 0.8);
    background: rgba(66, 133, 244, 0.1);
    border-radius: 4px;
    z-index: 2147483646;
    transition: all 0.2s ease-out;
  }
`;

/**
 * Inject ripple styles into page (once)
 */
async function ensureRippleStyles(tabId: number): Promise<void> {
  await sendCDPCommand(tabId, 'Runtime.evaluate', {
    expression: `
      (function() {
        if (document.getElementById('cdp-ripple-styles')) return;

        const style = document.createElement('style');
        style.id = 'cdp-ripple-styles';
        style.textContent = ${JSON.stringify(RIPPLE_STYLES)};
        document.head.appendChild(style);
      })()
    `,
    returnByValue: true,
  });
}

/**
 * Show a ripple effect at a specific position
 *
 * @param tabId - Tab ID to show ripple in
 * @param x - X coordinate (viewport-relative)
 * @param y - Y coordinate (viewport-relative)
 * @param size - Ripple size in pixels (default 50)
 */
export async function showRippleAt(
  tabId: number,
  x: number,
  y: number,
  size: number = 50
): Promise<void> {
  try {
    await ensureDebuggerAttached(tabId);
    await ensureRippleStyles(tabId);

    await sendCDPCommand(tabId, 'Runtime.evaluate', {
      expression: `
        (function() {
          const ripple = document.createElement('div');
          ripple.className = 'cdp-ripple';
          ripple.style.left = '${x - size / 2}px';
          ripple.style.top = '${y - size / 2}px';
          ripple.style.width = '${size}px';
          ripple.style.height = '${size}px';
          document.body.appendChild(ripple);

          // Remove after animation
          setTimeout(() => {
            ripple.remove();
          }, 600);
        })()
      `,
      returnByValue: true,
    });
  } catch (error) {
    // Visual feedback is non-critical, don't throw
    console.warn(`[cdpVisualFeedback] Failed to show ripple:`, error);
  }
}

/**
 * Highlight an element by backendNodeId
 *
 * @param tabId - Tab ID
 * @param backendNodeId - Backend node ID of element to highlight
 * @param durationMs - How long to show highlight (default 1000ms)
 */
export async function highlightElement(
  tabId: number,
  backendNodeId: number,
  durationMs: number = 1000
): Promise<void> {
  try {
    await ensureDebuggerAttached(tabId);
    await ensureRippleStyles(tabId);

    // Get element bounds via CDP
    const resolveResult = await sendCDPCommand(tabId, 'DOM.resolveNode', {
      backendNodeId,
    });

    if (!resolveResult?.object?.objectId) {
      console.warn(`[cdpVisualFeedback] Could not resolve backendNodeId ${backendNodeId}`);
      return;
    }

    // Get bounding rect
    const boundsResult = await sendCDPCommand(tabId, 'Runtime.callFunctionOn', {
      objectId: resolveResult.object.objectId,
      functionDeclaration: `function() {
        const rect = this.getBoundingClientRect();
        return {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height
        };
      }`,
      returnByValue: true,
    });

    const bounds = boundsResult?.result?.value;
    if (!bounds) return;

    // Create highlight overlay
    await sendCDPCommand(tabId, 'Runtime.evaluate', {
      expression: `
        (function() {
          const highlight = document.createElement('div');
          highlight.className = 'cdp-highlight';
          highlight.style.left = '${bounds.x}px';
          highlight.style.top = '${bounds.y}px';
          highlight.style.width = '${bounds.width}px';
          highlight.style.height = '${bounds.height}px';
          document.body.appendChild(highlight);

          // Remove after duration
          setTimeout(() => {
            highlight.style.opacity = '0';
            setTimeout(() => highlight.remove(), 200);
          }, ${durationMs});
        })()
      `,
      returnByValue: true,
    });
  } catch (error) {
    console.warn(`[cdpVisualFeedback] Failed to highlight element:`, error);
  }
}

/**
 * Show ripple at element center by backendNodeId
 *
 * @param tabId - Tab ID
 * @param backendNodeId - Backend node ID of element
 */
export async function showRippleAtElement(
  tabId: number,
  backendNodeId: number
): Promise<void> {
  try {
    await ensureDebuggerAttached(tabId);

    // Get element center
    const resolveResult = await sendCDPCommand(tabId, 'DOM.resolveNode', {
      backendNodeId,
    });

    if (!resolveResult?.object?.objectId) {
      return;
    }

    const centerResult = await sendCDPCommand(tabId, 'Runtime.callFunctionOn', {
      objectId: resolveResult.object.objectId,
      functionDeclaration: `function() {
        const rect = this.getBoundingClientRect();
        return {
          x: rect.x + rect.width / 2,
          y: rect.y + rect.height / 2
        };
      }`,
      returnByValue: true,
    });

    const center = centerResult?.result?.value;
    if (center) {
      await showRippleAt(tabId, center.x, center.y);
    }
  } catch (error) {
    console.warn(`[cdpVisualFeedback] Failed to show ripple at element:`, error);
  }
}

/**
 * Clear all visual feedback elements from page
 */
export async function clearVisualFeedback(tabId: number): Promise<void> {
  try {
    await sendCDPCommand(tabId, 'Runtime.evaluate', {
      expression: `
        document.querySelectorAll('.cdp-ripple, .cdp-highlight').forEach(el => el.remove());
      `,
      returnByValue: true,
    });
  } catch (error) {
    // Non-critical
  }
}

/**
 * Use CDP DOM.highlightNode for native highlighting (overlay)
 * This uses Chrome's built-in element highlighting
 */
export async function highlightNodeNative(
  tabId: number,
  backendNodeId: number
): Promise<void> {
  try {
    await ensureDebuggerAttached(tabId);

    await sendCDPCommand(tabId, 'DOM.highlightNode', {
      highlightConfig: {
        showInfo: true,
        showRulers: false,
        showExtensionLines: false,
        contentColor: { r: 66, g: 133, b: 244, a: 0.3 },
        paddingColor: { r: 66, g: 133, b: 244, a: 0.15 },
        borderColor: { r: 66, g: 133, b: 244, a: 0.8 },
        marginColor: { r: 255, g: 165, b: 0, a: 0.1 },
      },
      backendNodeId,
    });

    // Auto-hide after delay
    setTimeout(async () => {
      try {
        await sendCDPCommand(tabId, 'DOM.hideHighlight');
      } catch {
        // Ignore cleanup errors
      }
    }, 1500);
  } catch (error) {
    console.warn(`[cdpVisualFeedback] Native highlight failed:`, error);
  }
}

/**
 * Hide native DOM highlighting
 */
export async function hideNativeHighlight(tabId: number): Promise<void> {
  try {
    await sendCDPCommand(tabId, 'DOM.hideHighlight');
  } catch (error) {
    // Non-critical
  }
}
