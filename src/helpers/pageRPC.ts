import getAnnotatedDOM, {
  getUniqueElementSelectorId,
  getInteractiveElementSnapshot,
  waitForElementAppearance,
  checkNetworkIdle,
  checkWaitCondition,
  setNetworkObservationMark,
  getDidNetworkOccurSinceMark,
} from '../pages/Content/getAnnotatedDOM';
import { copyToClipboard } from '../pages/Content/copyToClipboard';

import ripple from '../pages/Content/ripple';
import { sleep } from './utils';

/**
 * Programmatically inject content script if it's not already loaded
 * This is a fallback for cases where the content script wasn't auto-injected
 * (e.g., after extension reload, page loaded before extension was ready)
 */
async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
  try {
    // Try to inject the content script
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.bundle.js'],
    });
    
    // Give the script a moment to initialize
    await sleep(500);
    return true;
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    // If script is already injected, we'll get an error, but that's OK
    // If it's a different error (e.g., no permission), log it
    if (!errorMessage.includes('already been injected')) {
      console.debug('Failed to inject content script:', errorMessage);
    }
    return false;
  }
}

export const rpcMethods = {
  getAnnotatedDOM,
  getUniqueElementSelectorId,
  getInteractiveElementSnapshot,
  waitForElementAppearance,
  checkNetworkIdle,
  checkWaitCondition,
  setNetworkObservationMark,
  getDidNetworkOccurSinceMark,
  ripple,
  copyToClipboard,
} as const;

export type RPCMethods = typeof rpcMethods;
type MethodName = keyof RPCMethods;
type Payload<T extends MethodName> = Parameters<RPCMethods[T]>;
type MethodRT<T extends MethodName> = ReturnType<RPCMethods[T]>;

// Call this function from the content script
export const callRPC = async <T extends MethodName>(
  type: keyof typeof rpcMethods,
  payload?: Payload<T>,
  maxTries = 1,
  tabId?: number // New: Explicit tabId parameter
): Promise<MethodRT<T>> => {
  let activeTab: chrome.tabs.Tab | undefined;
  
  // Use explicit tabId if provided, otherwise fall back to querying active tab
  if (tabId !== undefined) {
    try {
      activeTab = await chrome.tabs.get(tabId);
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      throw new Error(`Tab ${tabId} not found: ${errorMessage}`);
    }
  } else {
    // Fallback to querying active tab (legacy behavior)
    let queryOptions = { active: true, currentWindow: true };
    activeTab = (await chrome.tabs.query(queryOptions))[0];

    // If the active tab is a chrome-extension:// page, then we need to get some random other tab for testing
    if (activeTab?.url?.startsWith('chrome')) {
      queryOptions = { active: false, currentWindow: true };
      activeTab = (await chrome.tabs.query(queryOptions))[0];
    }
  }

  if (!activeTab?.id) {
    throw new Error('No active tab found. Please ensure you have a web page open.');
  }

  // Check if tab URL is valid for content scripts
  if (!activeTab.url || (!activeTab.url.startsWith('http://') && !activeTab.url.startsWith('https://'))) {
    throw new Error(`Cannot execute action on this page type: ${activeTab.url || 'unknown'}. Content scripts only work on HTTP/HTTPS pages.`);
  }

  let err: any;
  let contentScriptInjected = false;
  
  for (let i = 0; i < maxTries; i++) {
    try {
      // Check if content script is loaded by sending a message
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type,
        payload: payload || [],
      });
      return response;
    } catch (e: any) {
      const errorMessage = e?.message || String(e);
      
      // Check if it's the "Receiving end does not exist" error
      if (errorMessage.includes('Receiving end does not exist') || 
          errorMessage.includes('Could not establish connection')) {
        
        // Try to inject the content script programmatically (only once)
        if (!contentScriptInjected && i < maxTries - 1) {
          contentScriptInjected = true;
          const injected = await ensureContentScriptInjected(activeTab.id);
          if (injected) {
            // Script was injected, wait a bit and retry immediately
            await sleep(500);
            continue; // Retry the message immediately
          }
        }
        
        if (i === maxTries - 1) {
          // Last try - provide helpful error message
          throw new Error(
            `Content script is not loaded on this page. ` +
            `This can happen if:\n` +
            `1. The page was just loaded and the content script hasn't initialized yet\n` +
            `2. Chrome DevTools is attached (try closing DevTools)\n` +
            `3. The extension was reloaded (try refreshing the page)\n` +
            `4. The page is in an iframe or special context\n\n` +
            `Try refreshing the page and running the task again.`
          );
        } else {
          // Retry - content script may still be loading
          // Only log on last few attempts to reduce console noise
          if (i >= maxTries - 2) {
            console.debug(`Content script not ready (attempt ${i + 1}/${maxTries}), retrying...`);
          }
          await sleep(1000);
        }
      } else {
        // Check for extension context invalidated error
        if (errorMessage.includes('Extension context invalidated') || 
            errorMessage.includes('message port closed')) {
          // Auto-reload the popup to recover
          if (typeof window !== 'undefined' && window.location) {
            console.warn('Extension context invalidated, reloading popup...');
            window.location.reload();
          }
          throw new Error('Extension context invalidated. Please reload the extension.');
        }
        // Other error - throw immediately
        throw e;
      }
      
      if (i === maxTries - 1) {
        err = e;
      }
    }
  }
  
  // If we get here, all retries failed
  throw err || new Error('Failed to communicate with content script after multiple attempts');
};

const isKnownMethodName = (type: string): type is MethodName => {
  return type in rpcMethods;
};

// This function should run in the content script
export const watchForRPCRequests = () => {
  chrome.runtime.onMessage.addListener(
    (message, sender, sendResponse): true | undefined => {
      const type = message.type;
      if (isKnownMethodName(type)) {
        // @ts-expect-error we need to type payload
        const resp = rpcMethods[type](...message.payload);
        if (resp instanceof Promise) {
          resp.then((resolvedResp) => {
            sendResponse(resolvedResp);
          });

          return true;
        } else {
          sendResponse(resp);
        }
      }
    }
  );
};
