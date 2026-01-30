/**
 * Service Worker Keep-Alive Helper
 * 
 * Provides functions to start/stop the Service Worker heartbeat from UI components.
 * The actual heartbeat logic runs in the background script.
 * 
 * CRITICAL FIX: Service Worker Death (Issue #1)
 * Chrome terminates the Service Worker after 30 seconds of inactivity.
 * LLM API calls often take 30-60+ seconds, causing the SW to die mid-request.
 * 
 * Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #1 (Service Worker Death)
 */

/**
 * Start the keep-alive heartbeat in the background script.
 * Call this before initiating any long-running operation (e.g., LLM API calls).
 * 
 * @returns Promise<boolean> - true if successfully started
 */
export async function startKeepAlive(): Promise<boolean> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      // Chrome runtime not available - likely in non-extension context
      return false;
    }

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'START_KEEP_ALIVE' }, (response) => {
          // Clear lastError to prevent "Unchecked runtime.lastError" console warnings
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            // Background script not ready or extension context invalid - silently ignore
            resolve(false);
            return;
          }
          resolve(response?.success ?? false);
        });
      } catch {
        // sendMessage threw - extension context invalid
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

/**
 * Stop the keep-alive heartbeat in the background script.
 * Call this when the long-running operation completes (success or failure).
 * 
 * @returns Promise<boolean> - true if successfully stopped
 */
export async function stopKeepAlive(): Promise<boolean> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      // Chrome runtime not available - likely in non-extension context
      return false;
    }

    return new Promise((resolve) => {
      try {
        chrome.runtime.sendMessage({ type: 'STOP_KEEP_ALIVE' }, (response) => {
          // Clear lastError to prevent "Unchecked runtime.lastError" console warnings
          // This error is expected if SW was already terminated
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            resolve(false);
            return;
          }
          resolve(response?.success ?? false);
        });
      } catch {
        // sendMessage threw - extension context invalid
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}

/**
 * Wrapper to execute a function with keep-alive protection.
 * Automatically starts heartbeat before and stops after execution.
 * 
 * @param fn - The async function to execute with keep-alive protection
 * @returns The result of the function
 */
export async function withKeepAlive<T>(fn: () => Promise<T>): Promise<T> {
  await startKeepAlive();
  try {
    return await fn();
  } finally {
    await stopKeepAlive();
  }
}
