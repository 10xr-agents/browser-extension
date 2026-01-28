/**
 * Action Executors for Chrome Extension
 * 
 * Comprehensive implementation of all browser automation actions.
 * Executes actions via Chrome Debugger API and Chrome Extension APIs.
 * 
 * Reference: CHROME_TAB_ACTIONS.md
 */

import { callRPC } from './pageRPC';
import { callDOMAction } from './domActions';
import { attachDebugger } from './chromeDebugger';
import { sleep } from './utils';
import { useAppState } from '../state/store';

/**
 * Helper to send Chrome Debugger API commands
 */
async function sendCommand(method: string, params?: any) {
  const tabId = useAppState.getState().currentTask.tabId;
  if (tabId === -1) {
    throw new Error('No active tab');
  }
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

/**
 * Helper to get element object ID (reused from domActions pattern)
 */
async function getElementObjectId(elementId: number): Promise<string> {
  const tabId = useAppState.getState().currentTask.tabId;
  const accessibilityMapping = useAppState.getState().currentTask.accessibilityMapping;
  const { SPADEWORKS_ELEMENT_SELECTOR } = await import('../constants');

  // Try accessibility mapping first
  if (accessibilityMapping) {
    try {
      const { getAXNodeIdFromElementIndex } = await import('./accessibilityMapping');
      const axNodeId = getAXNodeIdFromElementIndex(elementId, accessibilityMapping);
      
      if (axNodeId) {
        const backendDOMNodeId = accessibilityMapping.axNodeIdToBackendDOMNodeId.get(axNodeId);
        
        if (backendDOMNodeId !== undefined) {
          try {
            const result = (await sendCommand('DOM.resolveNode', {
              backendNodeId: backendDOMNodeId,
            })) as { object: { objectId: string } } | null;

            if (result?.object?.objectId) {
              return result.object.objectId;
            }
          } catch {
            // Fallback to DOM
          }
        }
      }
    } catch {
      // Fallback to DOM
    }
  }

  // DOM fallback
  const uniqueId = await callRPC('getUniqueElementSelectorId', [elementId]);
  const document = (await sendCommand('DOM.getDocument')) as any;
  const { nodeId } = (await sendCommand('DOM.querySelector', {
    nodeId: document.root.nodeId,
    selector: `[${SPADEWORKS_ELEMENT_SELECTOR}="${uniqueId}"]`,
  })) as any;
  if (!nodeId) {
    throw new Error('Could not find node');
  }
  const result = (await sendCommand('DOM.resolveNode', { nodeId })) as any;
  return result.object.objectId;
}

/**
 * Scroll element into view
 */
async function scrollIntoView(objectId: string) {
  const { scrollScriptString } = await import('./runtimeFunctionStrings');
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: scrollScriptString,
  });
  await sleep(100);
}

/**
 * Get element center coordinates
 */
async function getCenterCoordinates(objectId: string) {
  const { model } = (await sendCommand('DOM.getBoxModel', { objectId })) as any;
  const [x1, y1, x2, y2, x3, y3, x4, y4] = model.border;
  return { x: (x1 + x3) / 2, y: (y1 + y3) / 2 };
}

// ============================================================================
// NAVIGATION & BROWSER CONTROL
// ============================================================================

export async function executeNavigate(args: { url: string; newTab?: boolean }) {
  const tabId = useAppState.getState().currentTask.tabId;
  
  if (args.newTab) {
    await chrome.tabs.create({ url: args.url, active: true });
  } else {
    await chrome.tabs.update(tabId, { url: args.url });
    await sleep(2000); // Wait for navigation
  }
}

export async function executeGoBack() {
  // Enable Page domain if needed
  try {
    await sendCommand('Page.enable');
  } catch {
    // Already enabled or not critical
  }
  await sendCommand('Page.goBack');
  await sleep(2000);
}

export async function executeGoForward() {
  // Enable Page domain if needed
  try {
    await sendCommand('Page.enable');
  } catch {
    // Already enabled or not critical
  }
  await sendCommand('Page.goForward');
  await sleep(2000);
}

export async function executeWait(args: { seconds?: number }) {
  const seconds = args.seconds || 3;
  const maxSeconds = 30;
  const waitTime = Math.min(seconds, maxSeconds) * 1000;
  await sleep(waitTime);
}

export async function executeSearch(args: { query: string; engine?: string }) {
  const engine = args.engine || 'duckduckgo';
  const searchUrls: Record<string, string> = {
    duckduckgo: `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`,
    google: `https://www.google.com/search?q=${encodeURIComponent(args.query)}`,
    bing: `https://www.bing.com/search?q=${encodeURIComponent(args.query)}`,
  };
  const url = searchUrls[engine] || searchUrls.duckduckgo;
  await executeNavigate({ url });
}

// ============================================================================
// PAGE INTERACTION
// ============================================================================

export async function executeScroll(args: { down?: boolean; pages?: number; index?: number }) {
  const down = args.down !== false; // Default true
  const pages = args.pages || 1.0;
  
  if (args.index !== undefined) {
    // Scroll specific element
    const objectId = await getElementObjectId(args.index);
    await scrollIntoView(objectId);
    const scrollScript = `
      (function() {
        const element = this;
        const scrollAmount = element.clientHeight * ${pages};
        element.scrollBy(0, ${down ? '' : '-'}${scrollAmount});
      })();
    `;
    await sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: scrollScript,
    });
  } else {
    // Scroll window
    const scrollScript = `
      const scrollAmount = window.innerHeight * ${pages};
      window.scrollBy(0, ${down ? '' : '-'}${scrollAmount});
    `;
    await sendCommand('Runtime.evaluate', { expression: scrollScript });
  }
  await sleep(500);
}

export async function executeFindText(args: { text: string }) {
  const script = `
    (function() {
      const text = ${JSON.stringify(args.text)};
      const walker = document.createTreeWalker(
        document.body,
        NodeFilter.SHOW_TEXT,
        null
      );
      let node;
      while (node = walker.nextNode()) {
        if (node.textContent.includes(text)) {
          node.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return true;
        }
      }
      return false;
    })();
  `;
  await sendCommand('Runtime.evaluate', { expression: script });
  await sleep(500);
}

/**
 * Scroll a specific container to bring an element into view
 * CRITICAL FIX: Advanced Scroll Targeting (Section 5.4) - Container-aware scrolling
 * 
 * Reference: PRODUCTION_READINESS.md §5.4 (Advanced Scroll Targeting)
 */
export async function executeScrollContainer(args: { elementId: number; direction?: 'up' | 'down' | 'left' | 'right' }) {
  const { scrollContainer } = await import('./domActions');
  const objectId = await getElementObjectId(args.elementId);
  const direction = args.direction || 'down';
  
  // Use the scrollContainer function from domActions
  // Note: We need to expose this function or implement it here
  // For now, let's implement it inline
  const scrollParentResult = (await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        let element = this;
        
        while (element && element !== document.body && element !== document.documentElement) {
          const style = window.getComputedStyle(element);
          const overflowY = style.overflowY;
          const overflowX = style.overflowX;
          
          if (
            (overflowY === 'auto' || overflowY === 'scroll') ||
            (overflowX === 'auto' || overflowX === 'scroll')
          ) {
            if (element.scrollHeight > element.clientHeight ||
                element.scrollWidth > element.clientWidth) {
              return element;
            }
          }
          
          element = element.parentElement;
        }
        
        return null;
      }
    `,
  })) as { objectId?: string } | null;
  
  if (scrollParentResult?.objectId) {
    // Scroll the specific container
    await sendCommand('Runtime.callFunctionOn', {
      objectId: scrollParentResult.objectId,
      functionDeclaration: `
        function() {
          const targetElement = arguments[0];
          const direction = arguments[1];
          
          const containerRect = this.getBoundingClientRect();
          const elementRect = targetElement.getBoundingClientRect();
          
          const relativeTop = elementRect.top - containerRect.top;
          const relativeLeft = elementRect.left - containerRect.left;
          
          if (direction === 'down' || direction === 'up') {
            this.scrollTop = relativeTop - (this.clientHeight / 2) + (elementRect.height / 2);
          }
          
          if (direction === 'left' || direction === 'right') {
            this.scrollLeft = relativeLeft - (this.clientWidth / 2) + (elementRect.width / 2);
          }
        }
      `,
      arguments: [{ objectId }, direction],
    });
    await sleep(500);
  } else {
    // Fallback to standard scrollIntoView
    await sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          this.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      `,
    });
    await sleep(1000);
  }
}

/**
 * Wait for a specific condition to be met
 * CRITICAL FIX: Wait for Condition (Section 5.5) - Smart Patience
 * 
 * Reference: PRODUCTION_READINESS.md §5.5 ("Wait for Condition")
 */
export async function executeWaitFor(args: { condition: string }) {
  const tabId = useAppState.getState().currentTask.tabId;
  if (tabId === -1) {
    throw new Error('No active tab');
  }
  
  let condition: {
    type: 'text' | 'selector' | 'element_count' | 'url_change' | 'custom';
    value: string;
    timeout?: number;
    pollInterval?: number;
  };
  
  try {
    condition = JSON.parse(args.condition);
  } catch (error) {
    throw new Error(`Invalid condition JSON: ${args.condition}`);
  }
  
  const timeout = condition.timeout || 60000; // Default 60 seconds
  const pollInterval = condition.pollInterval || 500; // Default 500ms
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      // Use RPC to check condition in content script
      const { callRPC } = await import('./pageRPC');
      const conditionMet = await callRPC('checkWaitCondition', [condition], 1, tabId);
      
      if (conditionMet) {
        console.log(`Wait condition met: ${condition.type} = ${condition.value}`);
        return;
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Error checking wait condition:', errorMessage);
    }
    
    await sleep(pollInterval);
  }
  
  throw new Error(`Timeout waiting for condition: ${condition.type} = ${condition.value} (timeout: ${timeout}ms)`);
}

// ============================================================================
// MOUSE & TOUCH ACTIONS
// ============================================================================

/**
 * Hover mouse over an element
 * CRITICAL FIX: Hover-Only Elements (Section 2.3) - Enhanced with proper hydration wait
 * 
 * Reference: PRODUCTION_READINESS.md §2.3 (The "Hover-Only" Elements)
 */
export async function executeHover(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);
  
  // CRITICAL FIX: Use Chrome Debugger API to simulate real mouse movement
  // This ensures JavaScript hover events are properly triggered
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
    button: 'left',
  });
  
  // CRITICAL FIX: Wait for DOM to hydrate (menu items to appear)
  // Increased from 300ms to 500ms to ensure menus are fully interactive
  await sleep(500);
  
  // Note: After hover, the next DOM snapshot should be taken to detect newly appeared menu items
  // This is handled automatically by waitForDOMChangesAfterAction in currentTask.ts
}

export async function executeDoubleClick(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);
  
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 1,
  });
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount: 2,
  });
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount: 2,
  });
  await sleep(500);
}

export async function executeRightClick(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);
  
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'right',
  });
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'right',
  });
  await sleep(500);
}

export async function executeDragAndDrop(args: { sourceIndex: number; targetIndex: number }) {
  const sourceObjectId = await getElementObjectId(args.sourceIndex);
  const targetObjectId = await getElementObjectId(args.targetIndex);
  await scrollIntoView(sourceObjectId);
  const sourceCoords = await getCenterCoordinates(sourceObjectId);
  const targetCoords = await getCenterCoordinates(targetObjectId);
  
  // Mouse down on source
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x: sourceCoords.x,
    y: sourceCoords.y,
    button: 'left',
  });
  await sleep(100);
  
  // Mouse move to target
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x: targetCoords.x,
    y: targetCoords.y,
    button: 'left',
  });
  await sleep(100);
  
  // Mouse up on target
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x: targetCoords.x,
    y: targetCoords.y,
    button: 'left',
  });
  await sleep(500);
}

// ============================================================================
// KEYBOARD ACTIONS
// ============================================================================

const KEY_MAP: Record<string, { code: string; key: string }> = {
  Enter: { code: 'Enter', key: 'Enter' },
  Escape: { code: 'Escape', key: 'Escape' },
  Tab: { code: 'Tab', key: 'Tab' },
  ArrowUp: { code: 'ArrowUp', key: 'ArrowUp' },
  ArrowDown: { code: 'ArrowDown', key: 'ArrowDown' },
  ArrowLeft: { code: 'ArrowLeft', key: 'ArrowLeft' },
  ArrowRight: { code: 'ArrowRight', key: 'ArrowRight' },
  Home: { code: 'Home', key: 'Home' },
  End: { code: 'End', key: 'End' },
  PageUp: { code: 'PageUp', key: 'PageUp' },
  PageDown: { code: 'PageDown', key: 'PageDown' },
  Delete: { code: 'Delete', key: 'Delete' },
  Backspace: { code: 'Backspace', key: 'Backspace' },
};

export async function executePress(args: { key: string; modifiers?: string[] }) {
  const keyInfo = KEY_MAP[args.key] || { code: args.key, key: args.key };
  const modifiers = args.modifiers || [];
  
  // Press modifier keys
  for (const mod of modifiers) {
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      modifiers: [mod],
      code: mod === 'Control' ? 'ControlLeft' : mod === 'Shift' ? 'ShiftLeft' : mod === 'Alt' ? 'AltLeft' : mod === 'Meta' ? 'MetaLeft' : mod,
    });
  }
  
  // Press main key
  await sendCommand('Input.dispatchKeyEvent', {
    type: 'keyDown',
    code: keyInfo.code,
    key: keyInfo.key,
    modifiers: modifiers,
  });
  
  await sendCommand('Input.dispatchKeyEvent', {
    type: 'keyUp',
    code: keyInfo.code,
    key: keyInfo.key,
    modifiers: modifiers,
  });
  
  // Release modifier keys
  for (const mod of modifiers.reverse()) {
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      modifiers: [mod],
    });
  }
  
  await sleep(200);
}

export async function executeType(args: { text: string; delay?: number }) {
  const delay = args.delay || 0;
  
  for (const char of args.text) {
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
    });
    await sleep(delay);
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      text: char,
    });
    await sleep(delay);
  }
}

export async function executeFocus(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  await scrollIntoView(objectId);
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.focus(); }',
  });
  await sleep(200);
}

export async function executeBlur(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.blur(); }',
  });
  await sleep(200);
}

// ============================================================================
// JAVASCRIPT EXECUTION
// ============================================================================

export async function executeEvaluate(args: { code: string }) {
  // SECURITY: Validate and sanitize user-provided code
  const code = args.code.trim();
  
  // Block dangerous patterns
  const dangerousPatterns = [
    /eval\s*\(/i,
    /Function\s*\(/i,
    /setTimeout\s*\(/i,
    /setInterval\s*\(/i,
    /import\s*\(/i,
    /require\s*\(/i,
    /document\.write/i,
    /document\.writeln/i,
    /innerHTML\s*=/i,
    /outerHTML\s*=/i,
  ];
  
  for (const pattern of dangerousPatterns) {
    if (pattern.test(code)) {
      throw new Error(`Unsafe code detected: ${pattern.source} is not allowed for security reasons`);
    }
  }
  
  // Additional validation: code should be reasonable length
  if (code.length > 10000) {
    throw new Error('Code exceeds maximum length of 10000 characters');
  }
  
  const result = await sendCommand('Runtime.evaluate', {
    expression: code,
    returnByValue: true,
  });
  return result;
}

// ============================================================================
// TAB MANAGEMENT
// ============================================================================

export async function executeCreateTab(args: { url?: string; active?: boolean }) {
  const url = args.url || 'about:blank';
  const active = args.active !== false; // Default true
  const tab = await chrome.tabs.create({ url, active });
  return tab.id;
}

export async function executeSwitchTab(args: { tabId: string | number }) {
  let chromeTabId: number;
  
  if (typeof args.tabId === 'string') {
    // String identifier - need to find tab
    const tabs = await chrome.tabs.query({});
    // For now, assume string is a simple identifier - in production, maintain a mapping
    const tabIndex = parseInt(args.tabId, 10);
    if (isNaN(tabIndex) || tabIndex < 0 || tabIndex >= tabs.length) {
      throw new Error(`Tab not found: ${args.tabId}`);
    }
    chromeTabId = tabs[tabIndex].id!;
  } else {
    chromeTabId = args.tabId;
  }
  
  await chrome.tabs.update(chromeTabId, { active: true });
  await sleep(500);
}

export async function executeCloseTab(args: { tabId: string | number }) {
  // SAFETY: Prevent closing the last remaining tab
  const tabs = await chrome.tabs.query({});
  if (tabs.length <= 1) {
    throw new Error('Cannot close the last remaining tab (safety check)');
  }
  
  let chromeTabId: number;
  if (typeof args.tabId === 'string') {
    const tabIndex = parseInt(args.tabId, 10);
    if (isNaN(tabIndex) || tabIndex < 0 || tabIndex >= tabs.length) {
      throw new Error(`Tab not found: ${args.tabId}`);
    }
    chromeTabId = tabs[tabIndex].id!;
  } else {
    chromeTabId = args.tabId;
  }
  
  // Double-check we're not closing the last tab
  const remainingTabs = tabs.filter(t => t.id !== chromeTabId);
  if (remainingTabs.length === 0) {
    throw new Error('Cannot close the last remaining tab (safety check)');
  }
  
  await chrome.tabs.remove(chromeTabId);
}

export async function executeGetTabs(args: { windowId?: number; activeOnly?: boolean }) {
  const queryOptions: chrome.tabs.QueryInfo = {};
  if (args.windowId !== undefined) {
    queryOptions.windowId = args.windowId;
  }
  if (args.activeOnly) {
    queryOptions.active = true;
  }
  
  const tabs = await chrome.tabs.query(queryOptions);
  return tabs.map(tab => ({
    id: tab.id,
    url: tab.url,
    title: tab.title,
    active: tab.active,
    windowId: tab.windowId,
  }));
}

// ============================================================================
// FORM CONTROLS
// ============================================================================

export async function executeCheck(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  await scrollIntoView(objectId);
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.checked = true; this.dispatchEvent(new Event("change", { bubbles: true })); }',
  });
  await sleep(200);
}

export async function executeUncheck(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  await scrollIntoView(objectId);
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { this.checked = false; this.dispatchEvent(new Event("change", { bubbles: true })); }',
  });
  await sleep(200);
}

export async function executeDropdownOptions(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  const result = await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        if (this.tagName === 'SELECT') {
          return Array.from(this.options).map(opt => ({ value: opt.value, text: opt.text }));
        }
        // For ARIA menus
        const options = this.querySelectorAll('[role="option"]');
        return Array.from(options).map(opt => ({ value: opt.getAttribute('value') || opt.textContent, text: opt.textContent }));
      }
    `,
    returnByValue: true,
  }) as { result: { value: Array<{ value: string; text: string }> } };
  return result.result.value;
}

export async function executeSelectDropdown(args: { index: number; value?: string; text?: string; multiple?: boolean }) {
  const objectId = await getElementObjectId(args.index);
  await scrollIntoView(objectId);
  
  const selectScript = args.value
    ? `function() { this.value = ${JSON.stringify(args.value)}; this.dispatchEvent(new Event("change", { bubbles: true })); }`
    : `function() {
        const text = ${JSON.stringify(args.text || '')};
        if (this.tagName === 'SELECT') {
          const option = Array.from(this.options).find(opt => opt.text.trim() === text);
          if (option) {
            this.selectedIndex = option.index;
            this.dispatchEvent(new Event("change", { bubbles: true }));
          }
        }
      }`;
  
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: selectScript,
  });
  await sleep(200);
}

// ============================================================================
// ELEMENT QUERIES
// ============================================================================

export async function executeGetText(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  const result = await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { return this.textContent || this.innerText; }',
    returnByValue: true,
  }) as { result: { value: string } };
  return result.result.value;
}

export async function executeGetAttribute(args: { index: number; attribute: string }) {
  const objectId = await getElementObjectId(args.index);
  const result = await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() { return this.getAttribute(${JSON.stringify(args.attribute)}); }`,
    returnByValue: true,
  }) as { result: { value: string | null } };
  return result.result.value;
}

export async function executeGetBoundingBox(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  const result = await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        const rect = this.getBoundingClientRect();
        return { x: rect.x, y: rect.y, width: rect.width, height: rect.height };
      }
    `,
    returnByValue: true,
  }) as { result: { value: { x: number; y: number; width: number; height: number } } };
  return result.result.value;
}

export async function executeIsVisible(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  const result = await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        if (!this.offsetParent && this.tagName !== 'BODY') return false;
        const style = window.getComputedStyle(this);
        if (style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0') return false;
        const rect = this.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      }
    `,
    returnByValue: true,
  }) as { result: { value: boolean } };
  return result.result.value;
}

export async function executeIsEnabled(args: { index: number }) {
  const objectId = await getElementObjectId(args.index);
  const result = await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: 'function() { return !this.disabled && !this.hasAttribute("disabled"); }',
    returnByValue: true,
  }) as { result: { value: boolean } };
  return result.result.value;
}

// ============================================================================
// VISUAL ACTIONS
// ============================================================================

export async function executeScreenshot(args: { fullPage?: boolean; elementIndex?: number; format?: string; quality?: number }) {
  const tabId = useAppState.getState().currentTask.tabId;
  
  // Enable Page domain if needed
  try {
    await sendCommand('Page.enable');
  } catch {
    // Already enabled or not critical
  }
  
  if (args.elementIndex !== undefined) {
    // Element screenshot - use Page.captureScreenshot with clip
    const box = await executeGetBoundingBox({ index: args.elementIndex });
    const result = await sendCommand('Page.captureScreenshot', {
      format: args.format || 'png',
      quality: args.quality,
      clip: {
        x: box.x,
        y: box.y,
        width: box.width,
        height: box.height,
        scale: 1,
      },
    }) as { data: string };
    return result.data;
  } else if (args.fullPage) {
    // Full page screenshot
    const result = await sendCommand('Page.captureScreenshot', {
      format: args.format || 'png',
      quality: args.quality,
      captureBeyondViewport: true,
    }) as { data: string };
    return result.data;
  } else {
    // Viewport screenshot
    const dataUrl = await chrome.tabs.captureVisibleTab(tabId, {
      format: args.format || 'png',
      quality: args.quality,
    });
    return dataUrl;
  }
}

export async function executeGeneratePdf(args: { 
  format?: string; 
  landscape?: boolean; 
  margin?: string; // JSON string that will be parsed
  printBackground?: boolean;
}) {
  await sendCommand('Page.enable');
  
  // Parse margin if provided as JSON string
  let margin: { top?: string; right?: string; bottom?: string; left?: string } = {};
  if (args.margin) {
    try {
      margin = JSON.parse(args.margin);
    } catch {
      // Invalid JSON, use empty margin
    }
  }
  
  const result = await sendCommand('Page.printToPDF', {
    paperWidth: args.format === 'Letter' ? 8.5 : args.format === 'A3' ? 11.7 : 8.27, // A4 default
    paperHeight: args.format === 'Letter' ? 11 : args.format === 'A3' ? 16.5 : 11.69, // A4 default
    landscape: args.landscape || false,
    marginTop: margin.top ? parseFloat(margin.top.replace(/[^0-9.]/g, '')) : 0,
    marginRight: margin.right ? parseFloat(margin.right.replace(/[^0-9.]/g, '')) : 0,
    marginBottom: margin.bottom ? parseFloat(margin.bottom.replace(/[^0-9.]/g, '')) : 0,
    marginLeft: margin.left ? parseFloat(margin.left.replace(/[^0-9.]/g, '')) : 0,
    printBackground: args.printBackground || false,
  }) as { data: string };
  
  return result.data;
}

// ============================================================================
// DIALOG HANDLING
// ============================================================================

// Store dialog handlers
const dialogHandlers = new Map<number, {
  accept: boolean;
  promptText?: string;
}>();

export async function executeAcceptDialog(args: { text?: string }) {
  const tabId = useAppState.getState().currentTask.tabId;
  
  // Enable Page domain and set up dialog handler
  await sendCommand('Page.enable');
  
  // Store handler for when dialog appears
  dialogHandlers.set(tabId, {
    accept: true,
    promptText: args.text,
  });
  
  // Set up event listener for dialog
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId === tabId && method === 'Page.javascriptDialogOpening') {
      const handler = dialogHandlers.get(tabId);
      if (handler) {
        chrome.debugger.sendCommand({ tabId }, 'Page.handleJavaScriptDialog', {
          accept: handler.accept,
          promptText: handler.promptText,
        });
        dialogHandlers.delete(tabId);
      }
    }
  });
  
  // If dialog is already open, handle it immediately
  try {
    await sendCommand('Page.handleJavaScriptDialog', {
      accept: true,
      promptText: args.text,
    });
  } catch {
    // Dialog not open yet, handler will catch it
  }
}

export async function executeDismissDialog() {
  const tabId = useAppState.getState().currentTask.tabId;
  
  await sendCommand('Page.enable');
  
  // Store handler
  dialogHandlers.set(tabId, {
    accept: false,
  });
  
  // Set up event listener
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId === tabId && method === 'Page.javascriptDialogOpening') {
      const handler = dialogHandlers.get(tabId);
      if (handler) {
        chrome.debugger.sendCommand({ tabId }, 'Page.handleJavaScriptDialog', {
          accept: false,
        });
        dialogHandlers.delete(tabId);
      }
    }
  });
  
  // If dialog is already open, handle it immediately
  try {
    await sendCommand('Page.handleJavaScriptDialog', {
      accept: false,
    });
  } catch {
    // Dialog not open yet, handler will catch it
  }
}

export async function executeWaitForDialog(args: { timeout?: number; autoAccept?: boolean }) {
  const tabId = useAppState.getState().currentTask.tabId;
  const timeout = args.timeout || 30000;
  const autoAccept = args.autoAccept || false;
  
  await sendCommand('Page.enable');
  
  return new Promise<boolean>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new Error('Dialog did not appear within timeout'));
    }, timeout);
    
    const handler = (source: chrome.debugger.Debuggee, method: string, params?: any) => {
      if (source.tabId === tabId && method === 'Page.javascriptDialogOpening') {
        clearTimeout(timeoutId);
        chrome.debugger.onEvent.removeListener(handler);
        
        if (autoAccept) {
          chrome.debugger.sendCommand({ tabId }, 'Page.handleJavaScriptDialog', {
            accept: true,
          });
        }
        
        resolve(true);
      }
    };
    
    chrome.debugger.onEvent.addListener(handler);
  });
}

// ============================================================================
// NETWORK INTERCEPTION
// ============================================================================

// Store request interceptors
const requestInterceptors = new Map<number, Array<{
  urlPattern: string;
  action: 'block' | 'modify' | 'continue';
  modifications?: any;
}>>();

// Store response mocks
const responseMocks = new Map<number, Array<{
  urlPattern: string;
  response: {
    status: number;
    headers: Record<string, string>;
    body: string;
  };
}>>();

export async function executeInterceptRequest(args: {
  urlPattern: string;
  action: 'block' | 'modify' | 'continue';
  modifications?: string; // JSON string
}) {
  const tabId = useAppState.getState().currentTask.tabId;
  
  // Enable Fetch domain
  await sendCommand('Fetch.enable', {
    handleAuthRequests: true,
  });
  
  // Parse modifications if provided
  let modifications: any = undefined;
  if (args.modifications) {
    try {
      modifications = JSON.parse(args.modifications);
    } catch {
      // Invalid JSON, ignore
    }
  }
  
  // Store interceptor
  if (!requestInterceptors.has(tabId)) {
    requestInterceptors.set(tabId, []);
  }
  requestInterceptors.get(tabId)!.push({
    urlPattern: args.urlPattern,
    action: args.action,
    modifications,
  });
  
  // Set up event listener
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId === tabId && method === 'Fetch.requestPaused') {
      const request = params as { request: { url: string } };
      const interceptors = requestInterceptors.get(tabId) || [];
      
      for (const interceptor of interceptors) {
        // Simple pattern matching (supports * wildcard)
        const pattern = interceptor.urlPattern.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        
        if (regex.test(request.request.url)) {
          if (interceptor.action === 'block') {
            chrome.debugger.sendCommand({ tabId }, 'Fetch.failRequest', {
              requestId: (params as any).requestId,
              errorReason: 'BlockedByClient',
            });
          } else if (interceptor.action === 'modify') {
            chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
              requestId: (params as any).requestId,
              ...interceptor.modifications,
            });
          } else {
            chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
              requestId: (params as any).requestId,
            });
          }
          return;
        }
      }
      
      // No interceptor matched, continue normally
      chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
        requestId: (params as any).requestId,
      });
    }
  });
}

export async function executeMockResponse(args: {
  urlPattern: string;
  response: string; // JSON string with status, headers, body
}) {
  const tabId = useAppState.getState().currentTask.tabId;
  
  // Enable Fetch domain
  await sendCommand('Fetch.enable', {
    handleAuthRequests: true,
  });
  
  // Parse response
  let response: { status: number; headers: Record<string, string>; body: string };
  try {
    response = JSON.parse(args.response);
  } catch {
    throw new Error('Invalid response JSON');
  }
  
  // Store mock
  if (!responseMocks.has(tabId)) {
    responseMocks.set(tabId, []);
  }
  responseMocks.get(tabId)!.push({
    urlPattern: args.urlPattern,
    response,
  });
  
  // Set up event listener
  chrome.debugger.onEvent.addListener((source, method, params) => {
    if (source.tabId === tabId && method === 'Fetch.requestPaused') {
      const request = params as { request: { url: string }; requestId: string };
      const mocks = responseMocks.get(tabId) || [];
      
      for (const mock of mocks) {
        const pattern = mock.urlPattern.replace(/\*/g, '.*');
        const regex = new RegExp(`^${pattern}$`);
        
        if (regex.test(request.request.url)) {
          chrome.debugger.sendCommand({ tabId }, 'Fetch.fulfillRequest', {
            requestId: request.requestId,
            responseCode: mock.response.status,
            responseHeaders: Object.entries(mock.response.headers).map(([name, value]) => ({
              name,
              value,
            })),
            body: btoa(mock.response.body), // Base64 encode
          });
          return;
        }
      }
      
      // No mock matched, continue normally
      chrome.debugger.sendCommand({ tabId }, 'Fetch.continueRequest', {
        requestId: request.requestId,
      });
    }
  });
}

// ============================================================================
// STORAGE & COOKIES
// ============================================================================

export async function executeGetCookies(args: { url?: string }) {
  const tabId = useAppState.getState().currentTask.tabId;
  
  let url = args.url;
  if (!url) {
    const tabs = await chrome.tabs.get(tabId);
    url = tabs.url || '';
  }
  
  const cookies = await chrome.cookies.getAll({ url });
  return cookies.map(cookie => ({
    name: cookie.name,
    value: cookie.value,
    domain: cookie.domain,
    path: cookie.path,
    secure: cookie.secure,
    httpOnly: cookie.httpOnly,
    sameSite: cookie.sameSite,
    expirationDate: cookie.expirationDate,
  }));
}

export async function executeSetCookie(args: {
  name: string;
  value: string;
  domain?: string;
  path?: string;
  expires?: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: string;
}) {
  const tabId = useAppState.getState().currentTask.tabId;
  const tabs = await chrome.tabs.get(tabId);
  const url = tabs.url || '';
  
  const cookie: chrome.cookies.SetDetails = {
    url,
    name: args.name,
    value: args.value,
    domain: args.domain,
    path: args.path || '/',
    httpOnly: args.httpOnly,
    secure: args.secure,
    sameSite: args.sameSite as chrome.cookies.SameSiteStatus | undefined,
  };
  
  if (args.expires) {
    cookie.expirationDate = args.expires;
  }
  
  await chrome.cookies.set(cookie);
}

export async function executeClearCookies(args: { url?: string }) {
  const tabId = useAppState.getState().currentTask.tabId;
  
  let url = args.url;
  if (!url) {
    const tabs = await chrome.tabs.get(tabId);
    url = tabs.url || '';
  }
  
  const cookies = await chrome.cookies.getAll({ url });
  for (const cookie of cookies) {
    await chrome.cookies.remove({
      url: url!,
      name: cookie.name,
    });
  }
}

export async function executeGetLocalStorage(args: { key?: string }) {
  const script = args.key
    ? `localStorage.getItem(${JSON.stringify(args.key)})`
    : `JSON.stringify(Object.keys(localStorage).reduce((acc, key) => { acc[key] = localStorage.getItem(key); return acc; }, {}))`;
  
  const result = await sendCommand('Runtime.evaluate', {
    expression: script,
    returnByValue: true,
  }) as { result: { value: string } };
  
  if (args.key) {
    return result.result.value;
  } else {
    return JSON.parse(result.result.value || '{}');
  }
}

export async function executeSetLocalStorage(args: { key: string; value: string }) {
  const script = `localStorage.setItem(${JSON.stringify(args.key)}, ${JSON.stringify(args.value)})`;
  await sendCommand('Runtime.evaluate', {
    expression: script,
  });
}

export async function executeClearStorage(args: { storageType: string }) {
  const script = args.storageType === 'localStorage'
    ? 'localStorage.clear()'
    : args.storageType === 'sessionStorage'
    ? 'sessionStorage.clear()'
    : 'indexedDB.databases().then(dbs => dbs.forEach(db => indexedDB.deleteDatabase(db.name)))';
  
  await sendCommand('Runtime.evaluate', {
    expression: script,
  });
}

// ============================================================================
// PERFORMANCE & TRACING
// ============================================================================

// Store tracing state
const tracingState = new Map<number, {
  categories: string[];
  options: any;
}>();

export async function executeStartTracing(args: {
  categories?: string; // JSON array string
  options?: string; // JSON object string
}) {
  const tabId = useAppState.getState().currentTask.tabId;
  
  let categories: string[] = [];
  if (args.categories) {
    try {
      categories = JSON.parse(args.categories);
    } catch {
      categories = [];
    }
  }
  
  let options: any = {};
  if (args.options) {
    try {
      options = JSON.parse(args.options);
    } catch {
      options = {};
    }
  }
  
  // Store state
  tracingState.set(tabId, { categories, options });
  
  await sendCommand('Tracing.start', {
    categories: categories.length > 0 ? categories.join(',') : undefined,
    options: JSON.stringify(options),
  });
}

export async function executeStopTracing() {
  const tabId = useAppState.getState().currentTask.tabId;
  
  return new Promise<string>((resolve, reject) => {
    const handler = (source: chrome.debugger.Debuggee, method: string, params?: any) => {
      if (source.tabId === tabId && method === 'Tracing.tracingComplete') {
        chrome.debugger.onEvent.removeListener(handler);
        tracingState.delete(tabId);
        
        // Get trace data
        const result = params as { stream?: string };
        resolve(result.stream || '');
      }
    };
    
    chrome.debugger.onEvent.addListener(handler);
    
    sendCommand('Tracing.end')
      .then(() => {
        // Wait for tracingComplete event
      })
      .catch(reject);
  });
}

export async function executeGetMetrics() {
  await sendCommand('Performance.enable');
  
  const metrics = await sendCommand('Performance.getMetrics') as {
    metrics: Array<{ name: string; value: number }>;
  };
  
  // Also get performance timing
  const timingResult = await sendCommand('Runtime.evaluate', {
    expression: `
      JSON.stringify({
        loadTime: performance.timing.loadEventEnd - performance.timing.navigationStart,
        domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
        firstPaint: performance.getEntriesByType('paint').find(e => e.name === 'first-paint')?.startTime || 0,
        firstContentfulPaint: performance.getEntriesByType('paint').find(e => e.name === 'first-contentful-paint')?.startTime || 0,
      })
    `,
    returnByValue: true,
  }) as { result: { value: string } };
  
  const timing = JSON.parse(timingResult.result.value || '{}');
  
  // Combine metrics
  const result: Record<string, number> = {};
  for (const metric of metrics.metrics || []) {
    result[metric.name] = metric.value;
  }
  Object.assign(result, timing);
  
  return result;
}

// ============================================================================
// DOM WAITING
// ============================================================================

/**
 * Wait for an element to appear on the page
 * Useful after clicking buttons that open dropdowns/menus
 */
export async function executeWaitForElement(args: {
  text?: string;
  role?: string;
  timeout?: number;
}) {
  const timeout = Math.min(args.timeout || 5000, 30000); // Max 30 seconds
  
  // Build selector from args
  const selector: { text?: string; role?: string } = {};
  if (args.text) selector.text = args.text;
  if (args.role) selector.role = args.role;
  
  // Use RPC to run in content script context
  const result = await callRPC('waitForElementAppearance', [selector, timeout]) as {
    found: boolean;
    element?: { id?: string; tagName: string; role?: string; name?: string; text?: string };
  };
  
  if (!result.found) {
    throw new Error(`Element not found within ${timeout}ms. Selector: ${JSON.stringify(selector)}`);
  }
  
  return result.element;
}

// ============================================================================
// ACTION EXECUTOR MAP
// ============================================================================

export const actionExecutors: Record<string, (args: any) => Promise<any>> = {
  // Navigation
  navigate: executeNavigate,
  goBack: executeGoBack,
  goForward: executeGoForward,
  wait: executeWait,
  waitForElement: executeWaitForElement,
  wait_for: executeWaitFor,
  search: executeSearch,
  
  // Page Interaction
  scroll: executeScroll,
  scroll_container: executeScrollContainer,
  findText: executeFindText,
  
  // Mouse & Touch
  hover: executeHover,
  doubleClick: executeDoubleClick,
  dblclick: executeDoubleClick,
  rightClick: executeRightClick,
  contextMenu: executeRightClick,
  dragAndDrop: executeDragAndDrop,
  
  // Keyboard
  press: executePress,
  pressKey: executePress,
  type: executeType,
  typeText: executeType,
  focus: executeFocus,
  blur: executeBlur,
  
  // JavaScript
  evaluate: executeEvaluate,
  
  // Tab Management
  createTab: executeCreateTab,
  switch: executeSwitchTab,
  switchTab: executeSwitchTab,
  close: executeCloseTab,
  closeTab: executeCloseTab,
  getTabs: executeGetTabs,
  listTabs: executeGetTabs,
  
  // Form Controls
  check: executeCheck,
  uncheck: executeUncheck,
  dropdownOptions: executeDropdownOptions,
  selectDropdown: executeSelectDropdown,
  selectOption: executeSelectDropdown,
  
  // Element Queries
  getText: executeGetText,
  getAttribute: executeGetAttribute,
  getBoundingBox: executeGetBoundingBox,
  isVisible: executeIsVisible,
  isEnabled: executeIsEnabled,
  
  // Visual
  screenshot: executeScreenshot,
  generatePdf: executeGeneratePdf,
  
  // Dialog Handling
  acceptDialog: executeAcceptDialog,
  accept_dialog: executeAcceptDialog,
  dismissDialog: executeDismissDialog,
  dismiss_dialog: executeDismissDialog,
  waitForDialog: executeWaitForDialog,
  wait_for_dialog: executeWaitForDialog,
  
  // Network
  interceptRequest: executeInterceptRequest,
  intercept_request: executeInterceptRequest,
  mockResponse: executeMockResponse,
  mock_response: executeMockResponse,
  
  // Storage & Cookies
  getCookies: executeGetCookies,
  get_cookies: executeGetCookies,
  setCookie: executeSetCookie,
  set_cookie: executeSetCookie,
  clearCookies: executeClearCookies,
  clear_cookies: executeClearCookies,
  getLocalStorage: executeGetLocalStorage,
  get_local_storage: executeGetLocalStorage,
  setLocalStorage: executeSetLocalStorage,
  set_local_storage: executeSetLocalStorage,
  clearStorage: executeClearStorage,
  clear_storage: executeClearStorage,
  
  // Performance
  startTracing: executeStartTracing,
  start_tracing: executeStartTracing,
  stopTracing: executeStopTracing,
  stop_tracing: executeStopTracing,
  getMetrics: executeGetMetrics,
  get_metrics: executeGetMetrics,
};

/**
 * Execute an action by name
 */
export async function executeAction(actionName: string, args: any): Promise<any> {
  const executor = actionExecutors[actionName];
  if (!executor) {
    throw new Error(`Unknown action: ${actionName}`);
  }
  return executor(args);
}
