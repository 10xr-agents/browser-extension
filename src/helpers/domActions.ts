/**
 * DOM Actions Helper for Thin Client Architecture
 * 
 * Executes browser actions (click, setValue) via Chrome Debugger API.
 * Uses accessibility node mapping when available (Task 6), falls back to DOM-based targeting.
 * 
 * Reference: ACTION_SYSTEM.md
 * Reference: THIN_CLIENT_ROADMAP.md §7.1 (Task 6: Accessibility-DOM Element Mapping)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 3)
 */

import { SPADEWORKS_ELEMENT_SELECTOR } from '../constants';
import { useAppState } from '../state/store';
import { callRPC } from './pageRPC';
import { scrollScriptString } from './runtimeFunctionStrings';
import { sleep } from './utils';
import { getAXNodeIdFromElementIndex } from './accessibilityMapping';

async function sendCommand(method: string, params?: any) {
  const tabId = useAppState.getState().currentTask.tabId;
  return chrome.debugger.sendCommand({ tabId }, method, params);
}

/**
 * Get object ID for element using accessibility mapping when available, fallback to DOM-based approach
 * CRITICAL FIX: Stale Element Recovery (Section 2.6) - Handles React/Vue re-renders that destroy old elements
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §7.1 (Task 6: Accessibility-DOM Element Mapping)
 * Reference: PRODUCTION_READINESS.md §2.6 (Stale Element Race Conditions)
 */
async function getObjectId(originalId: number): Promise<string> {
  const tabId = useAppState.getState().currentTask.tabId;
  const accessibilityMapping = useAppState.getState().currentTask.accessibilityMapping;
  const hybridElements = useAppState.getState().currentTask.hybridElements;

  // CRITICAL FIX: Store recovery information for stale element recovery
  // If element ID becomes stale (React re-render), we can search by text/role
  const element = hybridElements?.[originalId];
  const recoveryInfo = element ? {
    text: element.name || element.description || null,
    role: element.role || null,
    interactive: element.interactive || false,
  } : null;

  // Try accessibility mapping first if available (Task 6)
  if (accessibilityMapping) {
    try {
      // Get accessibility node ID from element index
      const axNodeId = getAXNodeIdFromElementIndex(originalId, accessibilityMapping);
      
      if (axNodeId) {
        // Get backendDOMNodeId from mapping
        const backendDOMNodeId = accessibilityMapping.axNodeIdToBackendDOMNodeId.get(axNodeId);
        
        if (backendDOMNodeId !== undefined) {
          // Use backendDOMNodeId to get object ID directly
          try {
            const result = (await sendCommand('DOM.resolveNode', {
              backendNodeId: backendDOMNodeId,
            })) as { object: { objectId: string } } | null;

            if (result?.object?.objectId) {
              console.log('Using accessibility mapping for element targeting', {
                elementId: originalId,
                axNodeId,
                backendDOMNodeId,
              });
              return result.object.objectId;
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.warn('Accessibility mapping failed, falling back to DOM:', errorMessage);
            // Continue to DOM fallback
          }
        }
      }
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.warn('Accessibility mapping lookup failed, falling back to DOM:', errorMessage);
      // Continue to DOM fallback
    }
  }

  // Try normal DOM-based resolution
  try {
    // Fallback to DOM-based approach (existing implementation)
    // Pass explicit tabId to callRPC
    const uniqueId = await callRPC('getUniqueElementSelectorId', [originalId], 1, tabId);
    // get node id
    const document = (await sendCommand('DOM.getDocument')) as any;
    const { nodeId } = (await sendCommand('DOM.querySelector', {
      nodeId: document.root.nodeId,
      selector: `[${SPADEWORKS_ELEMENT_SELECTOR}="${uniqueId}"]`,
    })) as any;
    if (!nodeId) {
      throw new Error('Could not find node');
    }
    // get object id
    const result = (await sendCommand('DOM.resolveNode', { nodeId })) as any;
    const objectId = result.object.objectId;
    if (!objectId) {
      throw new Error('Could not find object');
    }
    return objectId;
  } catch (error: unknown) {
    // CRITICAL FIX: Stale Element Recovery
    // If normal resolution fails (element ID is stale), search by text/role
    if (recoveryInfo && recoveryInfo.text) {
      console.warn(`Element ${originalId} not found, attempting recovery search:`, recoveryInfo);
      
      try {
        // Search for element with matching text and role
        const searchExpression = `
          (function() {
            const searchText = ${JSON.stringify(recoveryInfo.text)};
            const searchRole = ${JSON.stringify(recoveryInfo.role || '')};
            const isInteractive = ${recoveryInfo.interactive};
            
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_ELEMENT,
              null
            );
            
            let node;
            const candidates = [];
            
            while (node = walker.nextNode()) {
              if (node instanceof HTMLElement) {
                const textContent = (node.textContent || '').trim();
                const role = node.getAttribute('role') || '';
                const tagName = node.tagName.toLowerCase();
                
                // Check if text matches (exact or contains)
                const textMatches = textContent === searchText || 
                                   textContent.includes(searchText) ||
                                   (node.getAttribute('aria-label') || '').includes(searchText) ||
                                   (node.getAttribute('name') || '').includes(searchText);
                
                // Check if role matches (if specified)
                const roleMatches = !searchRole || role === searchRole;
                
                // Check if element is interactive (if specified)
                const interactiveMatches = !isInteractive || 
                  tagName === 'button' || 
                  tagName === 'a' || 
                  tagName === 'input' ||
                  role === 'button' ||
                  role === 'link' ||
                  node.hasAttribute('onclick');
                
                if (textMatches && roleMatches && interactiveMatches) {
                  candidates.push(node);
                }
              }
            }
            
            // Return first candidate (most likely match)
            return candidates.length > 0 ? candidates[0] : null;
          })()
        `;
        
        const searchResult = (await sendCommand('Runtime.evaluate', {
          expression: searchExpression,
        })) as { objectId?: string } | null;
        
        if (searchResult?.objectId) {
          console.log('Stale element recovery successful:', {
            originalId,
            recoveryInfo,
            newObjectId: searchResult.objectId,
          });
          return searchResult.objectId;
        }
      } catch (recoveryError: unknown) {
        const recoveryErrorMessage = recoveryError instanceof Error ? recoveryError.message : String(recoveryError);
        console.warn('Stale element recovery failed:', recoveryErrorMessage);
      }
    }
    
    // If all recovery attempts fail, throw original error
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`Element ${originalId} not found and recovery failed: ${errorMessage}`);
  }
}

/**
 * Find the scroll parent container for an element
 * CRITICAL FIX: Advanced Scroll Targeting (Section 5.4) - Container-aware scrolling
 * 
 * Reference: PRODUCTION_READINESS.md §5.4 (Advanced Scroll Targeting)
 */
async function findScrollParent(objectId: string): Promise<string | null> {
  try {
    // Walk up the DOM tree checking for scroll containers
    const result = (await sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          let element = this;
          
          while (element && element !== document.body && element !== document.documentElement) {
            const style = window.getComputedStyle(element);
            const overflowY = style.overflowY;
            const overflowX = style.overflowX;
            
            // Check if element is a scroll container
            if (
              (overflowY === 'auto' || overflowY === 'scroll') ||
              (overflowX === 'auto' || overflowX === 'scroll')
            ) {
              // Check if element actually scrolls (has scrollable content)
              if (element.scrollHeight > element.clientHeight ||
                  element.scrollWidth > element.clientWidth) {
                return element;
              }
            }
            
            element = element.parentElement;
          }
          
          return null; // No scroll parent found, use window
        }
      `,
    })) as { objectId?: string } | null;
    
    return result?.objectId || null;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Failed to find scroll parent, falling back to window scroll:', errorMessage);
    return null;
  }
}

/**
 * Scroll a specific container to bring an element into view
 * CRITICAL FIX: Advanced Scroll Targeting (Section 5.4)
 */
async function scrollContainer(
  objectId: string,
  direction: 'up' | 'down' | 'left' | 'right' = 'down'
): Promise<void> {
  const scrollParentId = await findScrollParent(objectId);
  
  if (!scrollParentId) {
    // Fallback to standard scrollIntoView
    await sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: scrollScriptString,
    });
    await sleep(1000);
    return;
  }
  
  // Scroll the specific container
  await sendCommand('Runtime.callFunctionOn', {
    objectId: scrollParentId,
    functionDeclaration: `
      function() {
        const targetElement = arguments[0];
        const direction = arguments[1];
        
        // Calculate element position relative to scroll container
        const containerRect = this.getBoundingClientRect();
        const elementRect = targetElement.getBoundingClientRect();
        
        const relativeTop = elementRect.top - containerRect.top;
        const relativeLeft = elementRect.left - containerRect.left;
        
        // Scroll to center element in container
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
  
  await sleep(500); // Shorter wait for container scroll
}

async function scrollIntoView(objectId: string) {
  // Use container-aware scrolling if available
  await scrollContainer(objectId, 'down');
}

async function getCenterCoordinates(objectId: string) {
  const { model } = (await sendCommand('DOM.getBoxModel', { objectId })) as any;
  const [x1, y1, x2, y2, x3, y3, x4, y4] = model.border;
  const centerX = (x1 + x3) / 2;
  const centerY = (y1 + y3) / 2;
  return { x: centerX, y: centerY };
}

const delayBetweenClicks = 1000; // Set this value to control the delay between clicks
const delayBetweenKeystrokes = 100; // Set this value to control typing speed

async function clickAtPosition(
  x: number,
  y: number,
  clickCount = 1
): Promise<void> {
  const tabId = useAppState.getState().currentTask.tabId;
  callRPC('ripple', [x, y], 1, tabId);
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount,
  });
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount,
  });
  await sleep(delayBetweenClicks);
}

/**
 * Check if click had side effects (URL change, DOM mutation, network activity)
 * CRITICAL FIX: Hydration Gap (Section 4.4) - Detects "dead clicks" where element isn't interactive yet
 * 
 * Reference: PRODUCTION_READINESS.md §4.4 (The "Hydration Gap")
 */
async function checkClickSideEffects(
  objectId: string,
  beforeState: { url: string; domHash: string }
): Promise<{ detected: boolean; reason: string }> {
  try {
    // Check URL change
    const currentUrlResult = (await sendCommand('Runtime.evaluate', {
      expression: 'window.location.href',
    })) as string;
    
    if (currentUrlResult && currentUrlResult !== beforeState.url) {
      return { detected: true, reason: 'URL changed' };
    }
    
    // Check DOM mutations (simple hash of body HTML)
    const currentDomHashResult = (await sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const body = document.body.innerHTML;
          // Simple hash
          let hash = 0;
          for (let i = 0; i < Math.min(body.length, 1000); i++) {
            hash = ((hash << 5) - hash) + body.charCodeAt(i);
            hash = hash & hash;
          }
          return hash.toString();
        })()
      `,
    })) as string;
    
    if (currentDomHashResult && currentDomHashResult !== beforeState.domHash) {
      return { detected: true, reason: 'DOM mutated' };
    }
    
    // Note: Network request checking would require Performance API in content script
    // This is handled separately via network idle detection in waitForDOMStabilization
    
    return { detected: false, reason: 'No side effects detected' };
  } catch (error: unknown) {
    // If check fails, assume side effects occurred (don't block on check failures)
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Click side effect check failed, assuming effects occurred:', errorMessage);
    return { detected: true, reason: 'Check failed, assuming effects' };
  }
}

async function click(payload: { elementId: number }) {
  // CRITICAL FIX: Check if this is a virtual element (text node menu item)
  // Virtual elements have coordinates stored in state instead of DOM nodes
  const virtualCoordinates = useAppState.getState().currentTask.virtualElementCoordinates;
  if (virtualCoordinates && virtualCoordinates.has(payload.elementId)) {
    const coords = virtualCoordinates.get(payload.elementId)!;
    console.log('Clicking virtual element at coordinates:', {
      elementId: payload.elementId,
      coordinates: coords,
    });
    // Click directly at the stored coordinates (no need to scroll or resolve DOM)
    await clickAtPosition(coords.x, coords.y);
    return;
  }
  
  // Normal DOM element - resolve and click as usual
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);
  
  // CRITICAL FIX: Click Obstruction Check (Section 2.4)
  // Hit test: Check what element is actually at these coordinates
  // Prevents clicking overlays (cookie banners, toasts) that sit on top of target elements
  try {
    const hitTestResult = (await sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const element = document.elementFromPoint(${x}, ${y});
          if (!element) return null;
          return {
            tagName: element.tagName,
            id: element.id || '',
            className: element.className || '',
            text: (element.textContent || '').substring(0, 50),
          };
        })()
      `,
    })) as { tagName: string; id: string; className: string; text: string } | null;
    
    // Get target element info for comparison
    const targetElement = (await sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          return {
            tagName: this.tagName,
            id: this.id || '',
            className: this.className || '',
          };
        }
      `,
    })) as { tagName: string; id: string; className: string } | null;
    
    // Verify the element at (x, y) is the target or a child of target
    if (hitTestResult && targetElement) {
      // Check if hit test element is the target itself
      const isExactMatch = hitTestResult.id === targetElement.id && hitTestResult.id !== '';
      
      // Check if hit test element is a child of target (walk up the DOM tree)
      const isChildOfTarget = (await sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const hitElement = document.elementFromPoint(${x}, ${y});
            if (!hitElement) return false;
            
            // Walk up the DOM tree to see if target is an ancestor
            let current = hitElement;
            while (current && current !== document.body) {
              if (current.id === '${targetElement.id}' && current.id !== '') {
                return true;
              }
              if (current.tagName === '${targetElement.tagName}' && 
                  current.className === '${targetElement.className}') {
                return true;
              }
              current = current.parentElement;
            }
            return false;
          })()
        `,
      })) as boolean;
      
      // If neither exact match nor child, element is obstructed
      if (!isExactMatch && !isChildOfTarget) {
        const errorMessage = `Click obstructed by element: ${hitTestResult.tagName}${hitTestResult.id ? `#${hitTestResult.id}` : ''}${hitTestResult.className ? `.${hitTestResult.className.split(' ')[0]}` : ''} (text: "${hitTestResult.text}")`;
        console.warn('Click obstruction detected:', {
          target: targetElement,
          obstructing: hitTestResult,
          coordinates: { x, y },
        });
        throw new Error(errorMessage);
      }
    }
  } catch (error: unknown) {
    // If hit test fails, log warning but continue (don't block click)
    // This ensures we don't break existing functionality if hit test has issues
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.warn('Hit test failed, proceeding with click:', errorMessage);
  }
  
  // CRITICAL FIX: Hydration Gap (Section 4.4) - Capture state before click
  const beforeState = {
    url: (await sendCommand('Runtime.evaluate', {
      expression: 'window.location.href',
    })) as string,
    domHash: (await sendCommand('Runtime.evaluate', {
      expression: `
        (function() {
          const body = document.body.innerHTML;
          let hash = 0;
          for (let i = 0; i < Math.min(body.length, 1000); i++) {
            hash = ((hash << 5) - hash) + body.charCodeAt(i);
            hash = hash & hash;
          }
          return hash.toString();
        })()
      `,
    })) as string,
  };
  
  // Execute click
  await clickAtPosition(x, y);
  
  // Verify click had side effects
  await sleep(300);
  
  const sideEffects = await checkClickSideEffects(objectId, beforeState);
  
  if (!sideEffects.detected) {
    console.warn('Click had no side effects, retrying...', {
      elementId: payload.elementId,
      reason: sideEffects.reason,
    });
    
    // Retry click (element might be interactive now)
    await clickAtPosition(x, y);
    await sleep(300);
    
    const retrySideEffects = await checkClickSideEffects(objectId, beforeState);
    
    if (!retrySideEffects.detected) {
      throw new Error(
        `Click had no side effects after retry. Element may not be interactive yet. ` +
        `Reason: ${retrySideEffects.reason}`
      );
    }
    
    console.log('Click side effects detected on retry:', retrySideEffects.reason);
  } else {
    console.log('Click side effects detected:', sideEffects.reason);
  }
}

async function selectAllText(x: number, y: number) {
  await clickAtPosition(x, y, 3);
}

async function typeText(text: string): Promise<void> {
  for (const char of text) {
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
    });
    await sleep(delayBetweenKeystrokes / 2);
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      text: char,
    });
    await sleep(delayBetweenKeystrokes / 2);
  }
}

async function blurFocusedElement() {
  const blurFocusedElementScript = `
      if (document.activeElement) {
        document.activeElement.blur();
      }
    `;
  await sendCommand('Runtime.evaluate', {
    expression: blurFocusedElementScript,
  });
}

async function setValue(payload: {
  elementId: number;
  value: string;
}): Promise<void> {
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);

  // CRITICAL FIX: React Input Trap - Simulate real user interaction
  // 1. Focus the element first (Crucial for React to "wake up")
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `function() { this.focus(); }`,
  });
  await sleep(100); // Small delay after focus

  // 2. Clear existing value (User-like select all + delete)
  await selectAllText(x, y);
  await sleep(50);

  // 3. Type characters using native keystrokes (Bypasses React's event suppression)
  // This ensures React/Angular/Vue frameworks detect the input changes
  for (const char of payload.value) {
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
    });
    await sleep(50 + Math.random() * 50); // Random delay makes it look human
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      text: char,
    });
  }

  // 4. Dispatch events to force React/Angular/Vue to sync state
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        this.blur(); // Trigger validation on blur
      }
    `,
  });
}

export const domActions = {
  click,
  setValue,
} as const;

export type DOMActions = typeof domActions;
type ActionName = keyof DOMActions;
type ActionPayload<T extends ActionName> = Parameters<DOMActions[T]>[0];

/**
 * Action execution result
 * Used to report success/failure status to the server
 */
export type ActionExecutionResult = {
  success: boolean;
  error?: {
    message: string;
    code: string;
    action: string;
    elementId?: number;
  };
  actualState?: string; // What actually happened (for verification)
};

// Call this function from the content script
export const callDOMAction = async <T extends ActionName>(
  type: T,
  payload: ActionPayload<T>
): Promise<ActionExecutionResult> => {
  const actionString = `${type}(${JSON.stringify(payload).slice(1, -1)})`; // e.g., "click(123)"
  const elementId = 'elementId' in payload ? (payload as { elementId: number }).elementId : undefined;
  
  try {
    // @ts-expect-error - we know that the type is valid
    await domActions[type](payload);
    
    return {
      success: true,
    };
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // Determine error code based on error message
    let errorCode = 'ACTION_FAILED';
    if (errorMessage.includes('not found') || errorMessage.includes('Could not find')) {
      errorCode = 'ELEMENT_NOT_FOUND';
    } else if (errorMessage.includes('timeout') || errorMessage.includes('Timeout')) {
      errorCode = 'TIMEOUT';
    } else if (errorMessage.includes('network') || errorMessage.includes('connection')) {
      errorCode = 'NETWORK_ERROR';
    } else if (errorMessage.includes('Content script is not loaded')) {
      errorCode = 'CONTENT_SCRIPT_NOT_READY';
    }
    
    return {
      success: false,
      error: {
        message: errorMessage,
        code: errorCode,
        action: actionString,
        elementId,
      },
      actualState: errorMessage, // Use error message as actual state for verification
    };
  }
};
