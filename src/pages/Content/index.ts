/**
 * Content Script Entry Point
 * 
 * CRITICAL FIX: State Wipe on Navigation (Issue #3)
 * When navigating between pages, the content script is destroyed and recreated.
 * We check for active tasks on load and notify the background script to resume.
 * 
 * Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)
 */

// pageRPC removed - CDP-first architecture no longer uses content script RPC
import { checkForActiveTask } from '../../helpers/taskPersistence';
import { startAutoTagger } from './tagger';
import { startMutationLogger } from './mutationLog';

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
  // watchForRPCRequests removed - CDP-first architecture
  (window as any).__spadeworksContentScriptLoaded = true;
  
  // === V3 ADVANCED: Initialize Tagger + Mutation Logger ===
  // Start the auto-tagger to assign stable IDs to interactive elements.
  // Start the mutation logger to track DOM changes for ghost state detection.
  // Reference: SEMANTIC_JSON_PROTOCOL.md, DOM_EXTRACTION_ARCHITECTURE.md
  try {
    // Wait for document to be ready before starting tagger
    if (document.readyState === 'complete' || document.readyState === 'interactive') {
      startAutoTagger();
      startMutationLogger(); // V3 ADVANCED: Track DOM changes
    } else {
      document.addEventListener('DOMContentLoaded', () => {
        startAutoTagger();
        startMutationLogger(); // V3 ADVANCED: Track DOM changes
      });
    }
  } catch (taggerError) {
    console.warn('[ContentScript] Failed to start auto-tagger/mutation logger:', taggerError);
    // Non-fatal - can be started later via RPC
  }

  // Handshake: notify background/UI that content script is ready.
  // This helps avoid noisy "Receiving end does not exist" paths by allowing
  // readiness tracking (best-effort; safe to ignore failures).
  try {
    chrome.runtime.sendMessage(
      { type: 'CONTENT_SCRIPT_READY', url: window.location.href, timestamp: Date.now() },
      () => {
        // Read lastError to avoid "Unchecked runtime.lastError" warnings.
        void chrome.runtime.lastError;
      }
    );
  } catch {
    // Ignore (extension context invalidated / background not ready)
  }
  
  // CRITICAL FIX: Check for active task after navigation
  // This ensures the agent can resume after page navigations
  // Wait a short moment for page to be ready
  setTimeout(() => {
    checkAndResumeActiveTask().catch((error) => {
      console.warn('[ContentScript] Failed to check for active task:', error);
    });
  }, 500);
}
