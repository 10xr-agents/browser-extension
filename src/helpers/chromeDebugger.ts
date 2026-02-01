/**
 * Track which tabs we have debuggers attached to.
 * This helps with re-attachment after detachment events.
 */
const attachedTabs = new Map<number, {
  attachedAt: number;
  detachedReason?: string;
}>();

/**
 * Callbacks to notify when debugger is detached.
 * Other modules can register to be notified when debugger detaches.
 */
const detachCallbacks: Array<(tabId: number, reason: string) => void> = [];

/**
 * Register a callback to be notified when debugger is detached from any tab.
 * @param callback - Function called with (tabId, reason) when detached
 */
export function onDebuggerDetach(callback: (tabId: number, reason: string) => void): void {
  detachCallbacks.push(callback);
}

/**
 * Check if debugger is attached to a specific tab (according to our tracking).
 */
export function isDebuggerAttached(tabId: number): boolean {
  return attachedTabs.has(tabId) && !attachedTabs.get(tabId)?.detachedReason;
}

/**
 * Get the reason for debugger detachment if it was detached.
 */
export function getDetachReason(tabId: number): string | undefined {
  return attachedTabs.get(tabId)?.detachedReason;
}

/**
 * Initialize the debugger detach listener.
 * This should be called once during extension initialization.
 * 
 * Chrome.debugger.onDetach reasons:
 * - "canceled_by_user": User opened DevTools or clicked "cancel" on the debug bar
 * - "target_closed": The tab was closed or navigated away
 * - "replaced_with_devtools": DevTools was opened for the tab
 */
export function initDebuggerDetachListener(): void {
  if (!chrome.debugger?.onDetach) {
    console.warn('[Debugger] chrome.debugger.onDetach not available');
    return;
  }

  chrome.debugger.onDetach.addListener((source, reason) => {
    const tabId = source.tabId;
    
    console.warn(`[Debugger] Debugger detached from tab ${tabId}, reason: ${reason}`);
    
    // Update our tracking
    if (tabId && attachedTabs.has(tabId)) {
      const entry = attachedTabs.get(tabId)!;
      entry.detachedReason = reason;
    }
    
    // Notify registered callbacks
    if (tabId) {
      for (const callback of detachCallbacks) {
        try {
          callback(tabId, reason);
        } catch (error) {
          console.error('[Debugger] Error in detach callback:', error);
        }
      }
    }

    // Log specific advice based on reason
    if (reason === 'canceled_by_user') {
      console.warn('[Debugger] User canceled debugger (likely opened DevTools). Automation will not work with DevTools open.');
    } else if (reason === 'target_closed') {
      console.log('[Debugger] Tab was closed or navigated away');
    } else if (reason === 'replaced_with_devtools') {
      console.warn('[Debugger] DevTools was opened, replacing our debugger. Close DevTools to resume automation.');
    }
  });

  console.log('[Debugger] Detach listener initialized');
}

/**
 * Attach the Chrome Debugger to a tab.
 * 
 * IMPORTANT: Chrome only allows ONE debugger per tab. If another debugger
 * is already attached (e.g., from a previous task, DevTools, or another extension),
 * this function will attempt to handle it gracefully.
 * 
 * @param tabId - The tab ID to attach the debugger to
 * @throws Error if debugger cannot be attached after retries
 */
export async function attachDebugger(tabId: number): Promise<void> {
  // First, check if debugger is already attached to this tab
  try {
    const targets = await chrome.debugger.getTargets();
    const existingTarget = targets.find(
      (target) => target.tabId === tabId && target.attached
    );
    
    if (existingTarget) {
      console.log(`[Debugger] Debugger already attached to tab ${tabId}, checking if it's ours...`);
      
      // Try to use the existing debugger by sending a test command
      try {
        await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
          expression: '1',
          returnByValue: true,
        });
        console.log(`[Debugger] Existing debugger on tab ${tabId} is usable, enabling domains...`);
        
        // Enable required domains (they might need re-enabling)
        try {
          await chrome.debugger.sendCommand({ tabId }, 'DOM.enable');
          await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
          // Additional domains for CDP-based extraction
          await chrome.debugger.sendCommand({ tabId }, 'Accessibility.enable');
          await chrome.debugger.sendCommand({ tabId }, 'DOMSnapshot.enable');
          await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
          await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
          console.log(`[Debugger] All domains enabled on existing debugger for tab ${tabId}`);
          return;
        } catch (domainError) {
          console.warn(`[Debugger] Failed to enable domains on existing debugger:`, domainError);
          // Fall through to detach and reattach
        }
      } catch (testError) {
        console.log(`[Debugger] Existing debugger not responding, will detach and reattach`);
      }
      
      // Detach existing debugger before attaching ours
      try {
        await new Promise<void>((resolve) => {
          chrome.debugger.detach({ tabId }, () => {
            // Clear lastError
            void chrome.runtime.lastError;
            resolve();
          });
        });
        console.log(`[Debugger] Detached existing debugger from tab ${tabId}`);
        // Small delay to ensure Chrome processes the detach
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (detachError) {
        console.warn(`[Debugger] Failed to detach existing debugger:`, detachError);
        // Continue anyway - the attach might still work
      }
    }
  } catch (getTargetsError) {
    console.warn('[Debugger] Failed to get debugger targets:', getTargetsError);
    // Continue with attach attempt
  }
  
  // Now attempt to attach
  return new Promise<void>((resolve, reject) => {
    try {
      chrome.debugger.attach({ tabId }, '1.2', async () => {
        if (chrome.runtime.lastError) {
          const errorMsg = chrome.runtime.lastError.message || 'Unknown debugger error';
          
          // Check if it's the "already attached" error
          if (errorMsg.includes('already attached') || errorMsg.includes('Another debugger')) {
            console.warn(`[Debugger] "Already attached" error despite our checks. Attempting recovery...`);
            
            // Last resort: try to use it anyway
            try {
              await chrome.debugger.sendCommand({ tabId }, 'DOM.enable');
              await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
              console.log(`[Debugger] Successfully enabled domains despite "already attached" error`);
              resolve();
              return;
            } catch (recoveryError) {
              console.error(`[Debugger] Recovery failed:`, recoveryError);
            }
          }
          
          console.error('[Debugger] Failed to attach:', errorMsg);
          reject(new Error(`Failed to attach debugger: ${errorMsg}`));
        } else {
          console.log(`[Debugger] Attached to tab ${tabId}, enabling domains...`);
          try {
            // Enable all required CDP domains for DOM extraction
            await chrome.debugger.sendCommand({ tabId }, 'DOM.enable');
            console.log('[Debugger] DOM enabled');
            await chrome.debugger.sendCommand({ tabId }, 'Runtime.enable');
            console.log('[Debugger] Runtime enabled');

            // Additional domains for CDP-based extraction (no content script needed)
            await chrome.debugger.sendCommand({ tabId }, 'Accessibility.enable');
            console.log('[Debugger] Accessibility enabled');
            await chrome.debugger.sendCommand({ tabId }, 'DOMSnapshot.enable');
            console.log('[Debugger] DOMSnapshot enabled');
            await chrome.debugger.sendCommand({ tabId }, 'Page.enable');
            console.log('[Debugger] Page enabled');
            await chrome.debugger.sendCommand({ tabId }, 'Network.enable');
            console.log('[Debugger] Network enabled');

            // Track successful attachment
            attachedTabs.set(tabId, {
              attachedAt: Date.now(),
              detachedReason: undefined,
            });

            resolve();
          } catch (domainError) {
            console.error('[Debugger] Failed to enable domains after attach:', domainError);
            reject(domainError);
          }
        }
      });
    } catch (e) {
      console.error('[Debugger] Exception during attach:', e);
      reject(e);
    }
  });
}

/**
 * Detach the Chrome Debugger from a tab.
 * Safe to call even if debugger is not attached - will be a no-op.
 * 
 * @param tabId - The tab ID to detach the debugger from
 */
export async function detachDebugger(tabId: number): Promise<void> {
  if (!tabId || tabId <= 0) {
    console.warn('[Debugger] Invalid tabId for detach:', tabId);
    return;
  }
  
  try {
    const targets = await chrome.debugger.getTargets();
    const isAttached = targets.some(
      (target) => target.tabId === tabId && target.attached
    );
    
    if (isAttached) {
      await new Promise<void>((resolve) => {
        chrome.debugger.detach({ tabId }, () => {
          // Clear lastError to prevent warnings
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            console.warn(`[Debugger] Error during detach from tab ${tabId}:`, lastError.message);
          } else {
            console.log(`[Debugger] Successfully detached from tab ${tabId}`);
          }
          
          // Clear our tracking
          attachedTabs.delete(tabId);
          
          resolve();
        });
      });
    } else {
      console.debug(`[Debugger] No debugger attached to tab ${tabId}, nothing to detach`);
      // Also clear tracking in case it's stale
      attachedTabs.delete(tabId);
    }
  } catch (error) {
    console.warn(`[Debugger] Exception during detach from tab ${tabId}:`, error);
    // Don't throw - detach failures shouldn't crash the task
  }
}

/**
 * Force detach debugger from all tabs (cleanup utility).
 * Use this on extension startup or error recovery.
 */
export async function detachAllDebuggers(): Promise<void> {
  try {
    const targets = await chrome.debugger.getTargets();
    const attachedTabs = targets.filter(t => t.attached && t.tabId);
    
    console.log(`[Debugger] Cleaning up ${attachedTabs.length} attached debuggers...`);
    
    for (const target of attachedTabs) {
      if (target.tabId) {
        await detachDebugger(target.tabId);
      }
    }
    
    console.log('[Debugger] Cleanup complete');
  } catch (error) {
    console.warn('[Debugger] Error during cleanup:', error);
  }
}
