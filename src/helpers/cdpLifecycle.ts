/**
 * CDP-Based Page Lifecycle Management
 *
 * Replaces content script-based DOM stability detection with CDP events.
 * Uses Page.lifecycleEvent and Network events for page readiness detection.
 *
 * Reference: CDP_DOM_EXTRACTION_MIGRATION.md
 */

import { attachDebugger, isDebuggerAttached } from './chromeDebugger';

/**
 * Track network activity per tab for idle detection
 */
interface NetworkState {
  pendingRequests: Set<string>;
  lastActivity: number;
  observationMark: number | null;
  networkOccurredSinceMark: boolean;
}

const networkStates = new Map<number, NetworkState>();

/**
 * CDP event listeners per tab
 */
const eventListeners = new Map<number, {
  cleanup: () => void;
}>();

/**
 * Get or create network state for a tab
 */
function getNetworkState(tabId: number): NetworkState {
  let state = networkStates.get(tabId);
  if (!state) {
    state = {
      pendingRequests: new Set(),
      lastActivity: Date.now(),
      observationMark: null,
      networkOccurredSinceMark: false,
    };
    networkStates.set(tabId, state);
  }
  return state;
}

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
 * Enable CDP domains for lifecycle tracking
 */
async function enableLifecycleDomains(tabId: number): Promise<void> {
  if (!isDebuggerAttached(tabId)) {
    await attachDebugger(tabId);
  }

  await Promise.all([
    sendCDPCommand(tabId, 'Page.enable'),
    sendCDPCommand(tabId, 'Network.enable'),
  ]);
}

/**
 * Set up CDP event listeners for a tab
 */
function setupEventListeners(tabId: number): void {
  // Skip if already set up
  if (eventListeners.has(tabId)) {
    return;
  }

  const state = getNetworkState(tabId);

  // Handle CDP events via debugger.onEvent
  const onEvent = (
    source: chrome.debugger.Debuggee,
    method: string,
    params?: any
  ) => {
    if (source.tabId !== tabId) return;

    // Track network requests
    if (method === 'Network.requestWillBeSent') {
      state.pendingRequests.add(params?.requestId);
      state.lastActivity = Date.now();
      if (state.observationMark !== null) {
        state.networkOccurredSinceMark = true;
      }
    }

    if (method === 'Network.loadingFinished' || method === 'Network.loadingFailed') {
      state.pendingRequests.delete(params?.requestId);
      state.lastActivity = Date.now();
    }

    // Page lifecycle events
    if (method === 'Page.lifecycleEvent') {
      const eventName = params?.name;
      console.log(`[cdpLifecycle] Tab ${tabId} lifecycle event: ${eventName}`);
    }
  };

  // Add listener
  chrome.debugger.onEvent.addListener(onEvent);

  // Store cleanup function
  eventListeners.set(tabId, {
    cleanup: () => {
      chrome.debugger.onEvent.removeListener(onEvent);
      networkStates.delete(tabId);
    },
  });
}

/**
 * Clean up lifecycle tracking for a tab
 */
export function cleanupLifecycleTracking(tabId: number): void {
  const listener = eventListeners.get(tabId);
  if (listener) {
    listener.cleanup();
    eventListeners.delete(tabId);
  }
}

/**
 * Check if network is idle (no pending requests and no activity for duration)
 */
function isNetworkIdle(tabId: number, idleDurationMs: number = 500): boolean {
  const state = networkStates.get(tabId);
  if (!state) return true;

  const hasPendingRequests = state.pendingRequests.size > 0;
  const timeSinceActivity = Date.now() - state.lastActivity;

  return !hasPendingRequests && timeSinceActivity >= idleDurationMs;
}

/**
 * Wait for page to be ready via CDP lifecycle events
 *
 * Waits for:
 * 1. Page.lifecycleEvent with name 'load' or 'networkIdle'
 * 2. Network to be idle (no pending requests)
 *
 * @param tabId - Tab ID to wait for
 * @param timeoutMs - Maximum time to wait (default 15s)
 * @returns true if page is ready, false if timeout
 */
export async function waitForPageReady(
  tabId: number,
  timeoutMs: number = 15000
): Promise<boolean> {
  const startTime = Date.now();

  try {
    // Enable CDP domains and set up listeners
    await enableLifecycleDomains(tabId);
    setupEventListeners(tabId);

    // Wait for page load and network idle
    while (Date.now() - startTime < timeoutMs) {
      // Check if network is idle
      if (isNetworkIdle(tabId, 500)) {
        // Additional check: verify DOM is interactive
        try {
          const result = await sendCDPCommand(tabId, 'Runtime.evaluate', {
            expression: 'document.readyState',
            returnByValue: true,
          });

          const readyState = result?.result?.value;
          if (readyState === 'complete' || readyState === 'interactive') {
            console.log(`[cdpLifecycle] Tab ${tabId} ready (readyState: ${readyState})`);
            return true;
          }
        } catch (error) {
          // DOM not ready yet, continue waiting
        }
      }

      // Wait a bit before checking again
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    console.warn(`[cdpLifecycle] Tab ${tabId} readiness timeout after ${timeoutMs}ms`);
    return false;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`[cdpLifecycle] Error waiting for page ready:`, errorMessage);
    return false;
  }
}

/**
 * Wait for network to be idle
 *
 * @param tabId - Tab ID to wait for
 * @param idleDurationMs - How long network must be idle (default 500ms)
 * @param timeoutMs - Maximum time to wait (default 10s)
 * @returns true if network became idle, false if timeout
 */
export async function waitForNetworkIdle(
  tabId: number,
  idleDurationMs: number = 500,
  timeoutMs: number = 10000
): Promise<boolean> {
  const startTime = Date.now();

  try {
    await enableLifecycleDomains(tabId);
    setupEventListeners(tabId);

    while (Date.now() - startTime < timeoutMs) {
      if (isNetworkIdle(tabId, idleDurationMs)) {
        return true;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return false;
  } catch (error) {
    console.error(`[cdpLifecycle] Error waiting for network idle:`, error);
    return false;
  }
}

/**
 * Set a network observation mark
 * Used to detect if any network activity occurred after a specific point
 */
export function setNetworkObservationMark(tabId: number): void {
  const state = getNetworkState(tabId);
  state.observationMark = Date.now();
  state.networkOccurredSinceMark = false;
}

/**
 * Check if network activity occurred since the observation mark
 */
export function getDidNetworkOccurSinceMark(tabId: number): boolean {
  const state = networkStates.get(tabId);
  return state?.networkOccurredSinceMark ?? false;
}

/**
 * Wait for DOM to stabilize (no mutations for a duration)
 *
 * Uses CDP Runtime.evaluate with MutationObserver
 *
 * @param tabId - Tab ID to wait for
 * @param stableDurationMs - How long DOM must be stable (default 300ms)
 * @param timeoutMs - Maximum time to wait (default 5s)
 * @returns true if DOM stabilized, false if timeout
 */
export async function waitForDomStability(
  tabId: number,
  stableDurationMs: number = 300,
  timeoutMs: number = 5000
): Promise<boolean> {
  try {
    const result = await sendCDPCommand(tabId, 'Runtime.evaluate', {
      expression: `
        new Promise((resolve) => {
          let lastMutationTime = Date.now();
          let checkInterval;

          const observer = new MutationObserver(() => {
            lastMutationTime = Date.now();
          });

          observer.observe(document.body, {
            childList: true,
            subtree: true,
            attributes: true,
            characterData: true,
          });

          checkInterval = setInterval(() => {
            const elapsed = Date.now() - lastMutationTime;
            if (elapsed >= ${stableDurationMs}) {
              observer.disconnect();
              clearInterval(checkInterval);
              resolve(true);
            }
          }, 100);

          // Timeout
          setTimeout(() => {
            observer.disconnect();
            clearInterval(checkInterval);
            resolve(false);
          }, ${timeoutMs});
        })
      `,
      awaitPromise: true,
      returnByValue: true,
    });

    return result?.result?.value === true;
  } catch (error) {
    console.error(`[cdpLifecycle] Error waiting for DOM stability:`, error);
    return false;
  }
}

/**
 * Wait for a specific condition to be met
 *
 * @param tabId - Tab ID
 * @param condition - JavaScript expression that returns boolean
 * @param timeoutMs - Maximum time to wait
 * @returns true if condition met, false if timeout
 */
export async function waitForCondition(
  tabId: number,
  condition: string,
  timeoutMs: number = 10000
): Promise<boolean> {
  const startTime = Date.now();

  while (Date.now() - startTime < timeoutMs) {
    try {
      const result = await sendCDPCommand(tabId, 'Runtime.evaluate', {
        expression: condition,
        returnByValue: true,
      });

      if (result?.result?.value === true) {
        return true;
      }
    } catch (error) {
      // Condition evaluation failed, continue waiting
    }

    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return false;
}

/**
 * Check if page is ready (synchronous check, no waiting)
 */
export async function isPageReady(tabId: number): Promise<boolean> {
  try {
    const result = await sendCDPCommand(tabId, 'Runtime.evaluate', {
      expression: 'document.readyState === "complete"',
      returnByValue: true,
    });

    return result?.result?.value === true;
  } catch (error) {
    return false;
  }
}
