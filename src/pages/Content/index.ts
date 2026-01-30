/**
 * Content Script Entry Point
 * 
 * CRITICAL FIX: State Wipe on Navigation (Issue #3)
 * When navigating between pages, the content script is destroyed and recreated.
 * We check for active tasks on load and notify the background script to resume.
 * 
 * Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)
 */

import { watchForRPCRequests } from '../../helpers/pageRPC';
import { checkForActiveTask } from '../../helpers/taskPersistence';

/**
 * Check for an active task that should be resumed after navigation.
 * If found, notify the background script to continue the task loop.
 */
async function checkAndResumeActiveTask(): Promise<void> {
  try {
    // Get current tab ID (via background script)
    const tabIdResponse = await new Promise<{ tabId: number } | undefined>((resolve) => {
      if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
        resolve(undefined);
        return;
      }
      
      try {
        chrome.runtime.sendMessage({ type: 'GET_CURRENT_TAB_ID' }, (response) => {
          // Clear lastError to prevent "Unchecked runtime.lastError" console warnings
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            // Background script not ready - silently resolve undefined
            resolve(undefined);
            return;
          }
          resolve(response);
        });
      } catch {
        // sendMessage threw - extension context invalid
        resolve(undefined);
      }
    });
    
    const currentTabId = tabIdResponse?.tabId;
    
    // Check for active task
    const activeTask = await checkForActiveTask(currentTabId);
    
    if (activeTask) {
      console.log('[ContentScript] Found active task after navigation, requesting resume:', {
        taskId: activeTask.taskId.slice(0, 8) + '...',
        sessionId: activeTask.sessionId?.slice(0, 8) + '...',
        previousUrl: activeTask.currentUrl,
        currentUrl: window.location.href,
      });
      
      // Notify background script to resume the task
      try {
        chrome.runtime.sendMessage({
          type: 'RESUME_TASK',
          taskId: activeTask.taskId,
          sessionId: activeTask.sessionId,
          previousUrl: activeTask.currentUrl,
          currentUrl: window.location.href,
          instructions: activeTask.instructions,
        }, (response) => {
          // Clear lastError to prevent "Unchecked runtime.lastError" console warnings
          const lastError = chrome.runtime.lastError;
          if (lastError) {
            // Background script not ready - silently ignore
            return;
          }
          console.debug('[ContentScript] RESUME_TASK acknowledged:', response);
        });
      } catch {
        // sendMessage threw - extension context invalid, silently ignore
      }
    }
  } catch (error) {
    // Silently ignore errors - this is a best-effort recovery mechanism
  }
}

// Only set up the listener once, even if script is injected multiple times
// Check if listener is already set up by checking for a marker on window
if (!(window as any).__spadeworksContentScriptLoaded) {
  watchForRPCRequests();
  (window as any).__spadeworksContentScriptLoaded = true;
  
  // CRITICAL FIX: Check for active task after navigation
  // This ensures the agent can resume after page navigations
  // Wait a short moment for page to be ready
  setTimeout(() => {
    checkAndResumeActiveTask().catch((error) => {
      console.warn('[ContentScript] Failed to check for active task:', error);
    });
  }, 500);
}
