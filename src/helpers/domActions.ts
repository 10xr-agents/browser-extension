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
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §7.1 (Task 6: Accessibility-DOM Element Mapping)
 */
async function getObjectId(originalId: number): Promise<string> {
  const tabId = useAppState.getState().currentTask.tabId;
  const accessibilityMapping = useAppState.getState().currentTask.accessibilityMapping;

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

  // Fallback to DOM-based approach (existing implementation)
  const uniqueId = await callRPC('getUniqueElementSelectorId', [originalId]);
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
}

async function scrollIntoView(objectId: string) {
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: scrollScriptString,
  });
  await sleep(1000);
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
  callRPC('ripple', [x, y]);
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

async function click(payload: { elementId: number }) {
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);
  await clickAtPosition(x, y);
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

  await selectAllText(x, y);
  await typeText(payload.value);
  // blur the element
  await blurFocusedElement();
}

export const domActions = {
  click,
  setValue,
} as const;

export type DOMActions = typeof domActions;
type ActionName = keyof DOMActions;
type ActionPayload<T extends ActionName> = Parameters<DOMActions[T]>[0];

// Call this function from the content script
export const callDOMAction = async <T extends ActionName>(
  type: T,
  payload: ActionPayload<T>
): Promise<void> => {
  // @ts-expect-error - we know that the type is valid
  await domActions[type](payload);
};
