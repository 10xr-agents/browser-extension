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
 * PHASE 1 FIX: Ping content script to check if it's ready
 * This is called BEFORE attempting injection to avoid unnecessary injection attempts.
 * 
 * Reference: ARCHITECTURE_REVIEW.md §4.2 (Verify Content Script Before Every RPC)
 */
async function pingContentScript(tabId: number): Promise<boolean> {
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    return response?.pong === true;
  } catch {
    // Content script not loaded or not responding
    return false;
  }
}

/**
 * PHASE 1 FIX: Ensure content script is ready with ping-first approach
 * 
 * This function:
 * 1. Checks if tab exists and has valid URL
 * 2. Pings content script to see if it's already loaded
 * 3. Only injects if ping fails
 * 4. Verifies injection succeeded by pinging again
 * 
 * Reference: ARCHITECTURE_REVIEW.md §4.2 (Verify Content Script Before Every RPC)
 */
async function ensureContentScriptReady(tabId: number): Promise<boolean> {
  console.log(`[ensureContentScriptReady] Checking content script readiness on tab ${tabId}`);
  
  // Step 1: Check if tab exists and is valid
  let tab: chrome.tabs.Tab;
  try {
    tab = await chrome.tabs.get(tabId);
  } catch (tabError) {
    console.error(`[ensureContentScriptReady] Tab ${tabId} does not exist:`, tabError);
    return false;
  }
  
  // Wait if tab is still loading
  if (tab.status === 'loading') {
    console.log(`[ensureContentScriptReady] Tab ${tabId} is loading, waiting...`);
    await sleep(500);
    try {
      tab = await chrome.tabs.get(tabId);
    } catch {
      return false;
    }
  }
  
  // Check if the URL is injectable
  if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
    console.warn(`[ensureContentScriptReady] Tab ${tabId} has non-injectable URL: ${tab.url}`);
    return false;
  }
  
  // Step 2: Ping content script to see if already loaded
  console.log(`[ensureContentScriptReady] Pinging content script on tab ${tabId}...`);
  const isAlreadyReady = await pingContentScript(tabId);
  if (isAlreadyReady) {
    console.log(`[ensureContentScriptReady] Content script already loaded on tab ${tabId}`);
    return true;
  }
  
  // Step 3: Content script not loaded, inject it
  console.log(`[ensureContentScriptReady] Content script not responding, injecting into tab ${tabId}...`);
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.bundle.js'],
    });
    console.log(`[ensureContentScriptReady] Successfully injected content script into tab ${tabId}`);
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    
    // "Already injected" errors are actually fine - script is there
    if (errorMessage.includes('already been injected') || 
        errorMessage.includes('duplicate script')) {
      console.log(`[ensureContentScriptReady] Script already injected in tab ${tabId}`);
    } else if (errorMessage.includes('Cannot access')) {
      console.error(`[ensureContentScriptReady] Cannot access tab ${tabId} (permissions issue):`, errorMessage);
      return false;
    } else {
      console.error(`[ensureContentScriptReady] Injection failed for tab ${tabId}:`, errorMessage);
      return false;
    }
  }
  
  // Step 4: Wait for script to initialize and verify with ping
  await sleep(200);
  
  // Try pinging up to 3 times with increasing delays
  for (let attempt = 0; attempt < 3; attempt++) {
    const isReady = await pingContentScript(tabId);
    if (isReady) {
      console.log(`[ensureContentScriptReady] Content script verified ready on tab ${tabId} (attempt ${attempt + 1})`);
      return true;
    }
    
    if (attempt < 2) {
      const delay = 300 * (attempt + 1);
      console.log(`[ensureContentScriptReady] Ping failed on attempt ${attempt + 1}, retrying in ${delay}ms...`);
      await sleep(delay);
    }
  }
  
  console.error(`[ensureContentScriptReady] Content script failed to respond after injection on tab ${tabId}`);
  return false;
}

/**
 * Legacy function name for backward compatibility
 * @deprecated Use ensureContentScriptReady instead
 */
async function ensureContentScriptInjected(tabId: number): Promise<boolean> {
  return ensureContentScriptReady(tabId);
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
  
  console.log(`[callRPC] Calling ${type} on tab ${activeTab.id} (URL: ${activeTab.url?.substring(0, 50)}...)`);
  
  for (let i = 0; i < maxTries; i++) {
    try {
      // Check if content script is loaded by sending a message
      console.log(`[callRPC] Attempt ${i + 1}/${maxTries} to send message to tab ${activeTab.id}`);
      const response = await chrome.tabs.sendMessage(activeTab.id, {
        type,
        payload: payload || [],
      });
      console.log(`[callRPC] Successfully received response from tab ${activeTab.id}`);
      return response;
    } catch (e: any) {
      const errorMessage = e?.message || String(e);
      console.log(`[callRPC] Attempt ${i + 1}/${maxTries} failed:`, errorMessage);
      
      // Check if it's the "Receiving end does not exist" error
      if (errorMessage.includes('Receiving end does not exist') || 
          errorMessage.includes('Could not establish connection')) {
        
        // Try to inject the content script programmatically
        // CRITICAL FIX: Try injection on every failed attempt, not just once
        if (i < maxTries - 1) {
          console.log(`[callRPC] Attempting to inject content script into tab ${activeTab.id}...`);
          const injected = await ensureContentScriptInjected(activeTab.id);
          contentScriptInjected = true;
          if (injected) {
            // Script was injected, wait a bit and retry
            console.log(`[callRPC] Injection succeeded, waiting before retry...`);
            await sleep(1000); // Increased wait time
            continue; // Retry the message
          } else {
            console.log(`[callRPC] Injection failed, will retry after delay...`);
            await sleep(1000);
            continue; // Still retry - page might be loading
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
          console.log(`[callRPC] Content script not ready (attempt ${i + 1}/${maxTries}), retrying after delay...`);
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
      
      // PHASE 1 FIX: Handle ping requests for health checks
      // This allows the UI/background to verify content script is loaded before calling RPC methods
      // Reference: ARCHITECTURE_REVIEW.md §4.4 (Add Content Script Ping Handler)
      if (type === 'ping') {
        sendResponse({ pong: true, timestamp: Date.now() });
        return true;
      }
      
      if (isKnownMethodName(type)) {
        try {
          // @ts-expect-error we need to type payload
          const resp = rpcMethods[type](...message.payload);
          if (resp instanceof Promise) {
            resp
              .then((resolvedResp) => {
                sendResponse(resolvedResp);
              })
              .catch((error: unknown) => {
                // CRITICAL FIX: Catch async errors and return null instead of crashing
                // This allows the caller's retry logic to work properly
                const errorMessage = error instanceof Error ? error.message : String(error);
                console.error(`[watchForRPCRequests] Async error in ${type}:`, errorMessage);
                sendResponse(null); // Return null to trigger retry
              });

            return true;
          } else {
            sendResponse(resp);
          }
        } catch (error: unknown) {
          // CRITICAL FIX: Catch sync errors and return null instead of crashing
          // This prevents "Cannot read properties of null" from breaking the RPC channel
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error(`[watchForRPCRequests] Sync error in ${type}:`, errorMessage);
          sendResponse(null); // Return null to trigger retry
        }
      }
    }
  );
};
