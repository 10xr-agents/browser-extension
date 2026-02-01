/**
 * Background Service Worker for Spadeworks Copilot AI
 * 
 * ARCHITECTURE (Phase 2 - Background-Centric):
 * - TaskOrchestrator owns all task state and orchestration logic
 * - chrome.storage.local is the single source of truth
 * - Side panel is a pure UI renderer
 * - Content script lifecycle managed centrally
 * 
 * Reference: ARCHITECTURE_REVIEW.md §3.2 (Option B: Background-Centric Architecture)
 * 
 * CRITICAL: chrome.sidePanel.open() MUST be called synchronously in the same
 * call stack as the user gesture. Never call it inside .then() or async callbacks.
 */

import {
  handleTaskCommand,
  handleTabSwitch,
  handleTabRemoved,
  handleTabUpdated,
  getTaskState,
  type TaskCommand,
  STORAGE_KEYS,
} from './TaskOrchestrator';

// NOTE: PusherService uses pusher-js which requires `window` (browser context).
// Service Workers don't have `window`, so Pusher must run in the Side Panel context.
// The UI handles Pusher connections directly via usePusher hook.
// Background just stores state for coordination.

export type PusherCommand =
  | { type: 'CONNECT'; sessionId: string }
  | { type: 'DISCONNECT' }
  | { type: 'SWITCH_SESSION'; sessionId: string }
  | { type: 'GET_STATE' };

export type PusherCommandResponse =
  | { success: true; state?: unknown }
  | { success: false; error: string };

// Pusher state is managed in storage, read by both UI and background
const PUSHER_STATE_KEY = 'background_pusher_state';

async function handlePusherCommand(command: PusherCommand): Promise<PusherCommandResponse> {
  // Background just manages state - actual WebSocket is in Side Panel
  console.log('[Background] Pusher command (delegated to UI):', command.type);
  
  try {
    if (command.type === 'GET_STATE') {
      const result = await chrome.storage.local.get(PUSHER_STATE_KEY);
      return { success: true, state: result[PUSHER_STATE_KEY] || null };
    }
    
    // For CONNECT/DISCONNECT/SWITCH_SESSION, store intent for UI to pick up
    await chrome.storage.local.set({
      pusher_command: {
        ...command,
        timestamp: Date.now(),
      },
    });
    
    return { success: true };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}
// Phase 3: Multi-tab support and error recovery
import {
  getMultiTabState,
  getTabTaskState,
  startTabTask,
  stopTabTask,
  pauseTabTask,
  resumeTabTask,
  clearTabTask,
  handleTabActivated as multiTabHandleTabActivated,
  handleTabClosed as multiTabHandleTabClosed,
  handleTabUrlChanged,
  updateGlobalSettings,
} from './TabTaskManager';
import {
  recoverContentScript,
  recoverFromServiceWorkerRestart,
  getRecentErrors,
  clearErrorLog,
  classifyError,
  logError,
} from './ErrorRecovery';

// ============================================================================
// Service Worker Keep-Alive (Legacy - kept for backward compatibility)
// TaskOrchestrator has its own keep-alive, but UI can still request via messages
// ============================================================================

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let keepAlivePort: chrome.runtime.Port | null = null;

function startKeepAlive(): void {
  if (keepAliveInterval) {
    console.debug('[KeepAlive] Already running, skipping start');
    return;
  }

  try {
    keepAlivePort = chrome.runtime.connect({ name: 'keepAlive' });
    
    console.log('[KeepAlive] Started heartbeat');
    
    keepAliveInterval = setInterval(() => {
      try {
        if (keepAlivePort) {
          keepAlivePort.postMessage({ type: 'ping', timestamp: Date.now() });
        }
      } catch (error) {
        // Ignore ping errors
      }
    }, 25000);
    
    keepAlivePort.onDisconnect.addListener(() => {
      console.debug('[KeepAlive] Port disconnected, cleaning up');
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
      keepAlivePort = null;
    });
  } catch (error) {
    console.error('[KeepAlive] Failed to start:', error);
  }
}

function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('[KeepAlive] Stopped heartbeat');
  }
  
  if (keepAlivePort) {
    try {
      keepAlivePort.disconnect();
    } catch (error) {
      // Port may already be disconnected
    }
    keepAlivePort = null;
  }
}

// ============================================================================
// Port Connection Handler
// ============================================================================

chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'keepAlive' || port.name === 'taskOrchestratorKeepAlive') {
    console.debug(`[Background] Keep-alive port connected: ${port.name}`);
    
    port.onMessage.addListener((message: { type: string; timestamp?: number }) => {
      if (message.type === 'ping') {
        try {
          port.postMessage({ type: 'pong', timestamp: Date.now() });
        } catch (error) {
          // Port may be disconnected
        }
      }
    });
  }
});

// ============================================================================
// Content Script Readiness Tracking
// CRITICAL: Track when content scripts are ready to receive messages
// This prevents "Receiving end does not exist" errors during navigation
// ============================================================================

/**
 * Map of tabId -> { ready: boolean, url: string, timestamp: number }
 * Tracks which tabs have content scripts ready to receive messages
 */
const contentScriptReadiness = new Map<number, { ready: boolean; url: string; timestamp: number }>();

/**
 * Check if a content script is ready on a given tab
 * @param tabId - The tab ID to check
 * @returns Promise that resolves when content script is ready (with timeout)
 */
export async function waitForContentScriptReady(tabId: number, timeoutMs: number = 10000): Promise<boolean> {
  const startTime = Date.now();
  const pollInterval = 200;
  
  // Check if already ready
  const state = contentScriptReadiness.get(tabId);
  if (state?.ready) {
    console.log(`[ContentScriptReadiness] Tab ${tabId} already ready`);
    return true;
  }
  
  console.log(`[ContentScriptReadiness] Waiting for content script on tab ${tabId}...`);
  
  // Wait for the content script to signal readiness
  while (Date.now() - startTime < timeoutMs) {
    const currentState = contentScriptReadiness.get(tabId);
    if (currentState?.ready) {
      console.log(`[ContentScriptReadiness] Tab ${tabId} became ready after ${Date.now() - startTime}ms`);
      return true;
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
  }
  
  console.warn(`[ContentScriptReadiness] Timeout waiting for content script on tab ${tabId}`);
  return false;
}

/**
 * Mark a tab's content script as not ready (called before navigation)
 */
export function markContentScriptNotReady(tabId: number): void {
  console.log(`[ContentScriptReadiness] Marking tab ${tabId} as not ready`);
  contentScriptReadiness.set(tabId, { ready: false, url: '', timestamp: Date.now() });
}

/**
 * Check if content script is currently ready (synchronous check)
 */
export function isContentScriptReady(tabId: number): boolean {
  return contentScriptReadiness.get(tabId)?.ready ?? false;
}

// ============================================================================
// Message Handler - Routes to TaskOrchestrator
// ============================================================================

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Content script readiness handshake - TRACK THE READINESS STATE
  if (message.type === 'CONTENT_SCRIPT_READY') {
    const tabId = sender.tab?.id;
    if (tabId) {
      const url = message.url || sender.tab?.url || '';
      console.log(`[Background] Content script ready on tab ${tabId}, URL: ${url.substring(0, 50)}...`);
      
      // Mark this tab's content script as ready
      contentScriptReadiness.set(tabId, {
        ready: true,
        url,
        timestamp: Date.now(),
      });
      
      // Also store in chrome.storage for persistence across service worker restarts
      chrome.storage.local.set({
        [`content_script_ready_${tabId}`]: { ready: true, url, timestamp: Date.now() },
      }).catch(() => {
        // Ignore storage errors
      });
    }
    sendResponse({ success: true, tabId: tabId ?? null });
    return true;
  }

  // Legacy keep-alive messages (for backward compatibility with UI)
  if (message.type === 'START_KEEP_ALIVE') {
    startKeepAlive();
    sendResponse({ success: true });
    return true;
  }
  
  if (message.type === 'STOP_KEEP_ALIVE') {
    stopKeepAlive();
    sendResponse({ success: true });
    return true;
  }
  
  // Get current tab ID (called from content script)
  if (message.type === 'GET_CURRENT_TAB_ID') {
    const tabId = sender.tab?.id;
    if (tabId) {
      sendResponse({ tabId });
    } else {
      chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const activeTabId = tabs[0]?.id;
        sendResponse({ tabId: activeTabId || null });
      });
      return true; // Async response
    }
    return true;
  }
  
  // Content script ping (for health checks)
  if (message.type === 'ping') {
    sendResponse({ pong: true, timestamp: Date.now() });
    return true;
  }
  
  // ============================================================================
  // Content Script Readiness Commands
  // ============================================================================
  
  // Check if content script is ready (synchronous check)
  if (message.type === 'IS_CONTENT_SCRIPT_READY') {
    const tabId = message.tabId as number;
    const ready = isContentScriptReady(tabId);
    sendResponse({ ready, tabId });
    return true;
  }
  
  // Wait for content script to be ready (async with timeout)
  if (message.type === 'WAIT_FOR_CONTENT_SCRIPT') {
    const tabId = message.tabId as number;
    const timeoutMs = message.timeoutMs || 10000;
    
    waitForContentScriptReady(tabId, timeoutMs)
      .then((ready) => {
        sendResponse({ ready, tabId });
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ ready: false, tabId, error: errorMessage });
      });
    return true; // Async response
  }
  
  // ============================================================================
  // TaskOrchestrator Commands (Phase 2 Architecture)
  // ============================================================================
  
  if (message.type === 'TASK_COMMAND') {
    const command = message.command as TaskCommand;
    handleTaskCommand(command)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ success: false, error: errorMessage });
      });
    return true; // Async response
  }
  
  // Legacy RESUME_TASK message (from content script after navigation)
  if (message.type === 'RESUME_TASK') {
    console.log('[Background] Received RESUME_TASK request');
    
    // Use TaskOrchestrator to handle resume
    handleTaskCommand({ type: 'RESUME_TASK' })
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ success: false, error: errorMessage });
      });
    return true;
  }
  
  // ============================================================================
  // Pusher Commands (Phase 2 Architecture)
  // WebSocket management moved to background for resilience
  // ============================================================================
  
  if (message.type === 'PUSHER_COMMAND') {
    const command = message.command as PusherCommand;
    handlePusherCommand(command)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ success: false, error: errorMessage });
      });
    return true; // Async response
  }
  
  // ============================================================================
  // Phase 3: Multi-Tab Commands
  // ============================================================================
  
  if (message.type === 'MULTI_TAB_COMMAND') {
    const command = message.command;
    handleMultiTabCommand(command)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ success: false, error: errorMessage });
      });
    return true; // Async response
  }
  
  // ============================================================================
  // Phase 3: Error Recovery Commands
  // ============================================================================
  
  if (message.type === 'ERROR_RECOVERY_COMMAND') {
    const command = message.command;
    handleErrorRecoveryCommand(command)
      .then((result) => {
        sendResponse(result);
      })
      .catch((error: unknown) => {
        const errorMessage = error instanceof Error ? error.message : String(error);
        sendResponse({ success: false, error: errorMessage });
      });
    return true; // Async response
  }
  
  // Don't return true for messages we don't handle
  return false;
});

// ============================================================================
// Phase 3: Multi-Tab Command Handler
// ============================================================================

interface MultiTabCommandType {
  type: string;
  tabId?: number;
  tabUrl?: string;
  instructions?: string;
  sessionId?: string;
  reason?: string;
  settings?: Record<string, unknown>;
  limit?: number;
}

async function handleMultiTabCommand(
  command: MultiTabCommandType
): Promise<{ success: boolean; state?: unknown; error?: string }> {
  console.log('[Background] Handling multi-tab command:', command.type);
  
  try {
    switch (command.type) {
      case 'START_TAB_TASK':
        if (!command.tabId || !command.tabUrl || !command.instructions) {
          return { success: false, error: 'Missing required fields' };
        }
        const startState = await startTabTask(
          command.tabId,
          command.tabUrl,
          command.instructions,
          command.sessionId
        );
        return { success: true, state: startState };
      
      case 'STOP_TAB_TASK':
        if (!command.tabId) {
          return { success: false, error: 'Missing tabId' };
        }
        const stopState = await stopTabTask(command.tabId);
        return { success: true, state: stopState };
      
      case 'PAUSE_TAB_TASK':
        if (!command.tabId) {
          return { success: false, error: 'Missing tabId' };
        }
        const pauseState = await pauseTabTask(command.tabId, command.reason as any);
        return { success: true, state: pauseState };
      
      case 'RESUME_TAB_TASK':
        if (!command.tabId) {
          return { success: false, error: 'Missing tabId' };
        }
        const resumeState = await resumeTabTask(command.tabId);
        return { success: true, state: resumeState };
      
      case 'CLEAR_TAB_TASK':
        if (!command.tabId) {
          return { success: false, error: 'Missing tabId' };
        }
        await clearTabTask(command.tabId);
        return { success: true };
      
      case 'GET_TAB_STATE':
        if (!command.tabId) {
          return { success: false, error: 'Missing tabId' };
        }
        const tabState = await getTabTaskState(command.tabId);
        return { success: true, state: tabState };
      
      case 'GET_MULTI_TAB_STATE':
        const multiState = await getMultiTabState();
        return { success: true, state: multiState };
      
      case 'UPDATE_SETTINGS':
        if (command.settings) {
          await updateGlobalSettings(command.settings as any);
        }
        return { success: true };
      
      default:
        return { success: false, error: `Unknown command: ${command.type}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Phase 3: Error Recovery Command Handler
// ============================================================================

interface ErrorRecoveryCommandType {
  type: string;
  tabId?: number;
  limit?: number;
}

async function handleErrorRecoveryCommand(
  command: ErrorRecoveryCommandType
): Promise<{ success: boolean; data?: unknown; error?: string }> {
  console.log('[Background] Handling error recovery command:', command.type);
  
  try {
    switch (command.type) {
      case 'GET_RECENT_ERRORS':
        const errors = await getRecentErrors(command.limit || 20);
        return { success: true, data: errors };
      
      case 'CLEAR_ERROR_LOG':
        await clearErrorLog();
        return { success: true };
      
      case 'RECOVER_CONTENT_SCRIPT':
        if (!command.tabId) {
          return { success: false, error: 'Missing tabId' };
        }
        const recovered = await recoverContentScript(command.tabId);
        return { success: recovered, data: { recovered } };
      
      case 'RECOVER_FROM_RESTART':
        const recovery = await recoverFromServiceWorkerRestart();
        return { success: true, data: recovery };
      
      default:
        return { success: false, error: `Unknown command: ${command.type}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Tab Event Handlers - Route to TaskOrchestrator
// ============================================================================

// Handle tab activation (user switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const { tabId, windowId } = activeInfo;
  
  // Configure side panel for this tab
  try {
    await chrome.sidePanel.setOptions({
      tabId,
      enabled: true,
      path: 'popup.html',
    });
  } catch (error) {
    console.debug('Side panel pre-configuration (onActivated):', error);
  }
  
  // Notify TaskOrchestrator of tab switch
  await handleTabSwitch(tabId, windowId);
  
  // Store tab switch info for UI
  try {
    await chrome.storage.local.set({
      tabSwitched: {
        tabId,
        windowId,
        timestamp: Date.now(),
      },
    });
    
    // Notify UI
    chrome.runtime.sendMessage({
      type: 'TAB_SWITCHED',
      tabId,
      windowId,
    }).catch(() => {
      // No listeners
    });
  } catch (error) {
    console.warn('Error handling tab switch:', error);
  }
});

// Handle tab updates (navigation, etc.)
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // CRITICAL: Mark content script as not ready when navigation starts
  // This prevents "Receiving end does not exist" errors
  if (changeInfo.status === 'loading') {
    markContentScriptNotReady(tabId);
    console.log(`[Background] Tab ${tabId} started loading - content script marked not ready`);
  }
  
  // Configure side panel when tab finishes loading
  if (changeInfo.status === 'complete') {
    try {
      await chrome.sidePanel.setOptions({
        tabId,
        enabled: true,
        path: 'popup.html',
      });
    } catch (error) {
      console.debug('Side panel pre-configuration (onUpdated):', error);
    }
  }
  
  // Notify TaskOrchestrator of tab update
  await handleTabUpdated(tabId, changeInfo);
});

// Handle tab removal
chrome.tabs.onRemoved.addListener(async (tabId) => {
  await handleTabRemoved(tabId);
});

// Handle new tab creation (for auto-follow during task)
chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    // Check if we have a running task
    const state = await getTaskState();
    
    if (state.context?.status === 'running') {
      const now = Date.now();
      const lastActivity = state.context.lastActivityAt;
      
      // If tab was created within 2 seconds of last activity, assume it's from agent action
      if (now - lastActivity < 2000) {
        await chrome.storage.local.set({
          newTabDetected: {
            tabId: tab.id,
            url: tab.url || tab.pendingUrl || 'unknown',
            timestamp: now,
          },
        });
        
        chrome.runtime.sendMessage({
          type: 'NEW_TAB_DETECTED',
          tabId: tab.id,
          url: tab.url || tab.pendingUrl || 'unknown',
        }).catch(() => {
          // No listeners
        });
        
        console.log('New tab detected after agent action:', {
          tabId: tab.id,
          url: tab.url || tab.pendingUrl,
        });
      }
    }
  } catch (error) {
    console.warn('Error handling new tab:', error);
  }
});

// ============================================================================
// Extension Icon Click - Open Side Panel
// ============================================================================

chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    console.error('No tab ID available');
    return;
  }

  // CRITICAL: chrome.sidePanel.open() MUST be called synchronously within user gesture
  chrome.sidePanel.open({ tabId: tab.id });
});

// ============================================================================
// Keyboard Shortcut Handler
// ============================================================================

chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        const tabId = tab.id;
        
        chrome.sidePanel.getOptions({ tabId })
          .then((options) => {
            const isEnabled = options?.enabled !== false;
            
            if (isEnabled) {
              chrome.sidePanel.setOptions({
                tabId,
                enabled: false,
              }).catch((error) => {
                console.error('Error closing side panel:', error);
              });
            } else {
              chrome.sidePanel.setOptions({
                tabId,
                enabled: true,
                path: 'popup.html',
              }).catch((error) => {
                console.error('Error enabling side panel:', error);
              });
            }
          })
          .catch((error) => {
            chrome.sidePanel.setOptions({
              tabId,
              enabled: true,
              path: 'popup.html',
            }).catch((setError) => {
              console.error('Error setting side panel options:', setError);
            });
          });
      }
    });
  }
});

// ============================================================================
// Startup
// ============================================================================

console.log('[Background] Service worker started (Phase 3 Architecture - Multi-tab & Error Recovery)');

// Phase 3: Run state recovery on service worker startup
recoverFromServiceWorkerRestart().then((recovery) => {
  if (recovery.recoveredTasks.length > 0) {
    console.log('[Background] State recovery completed:', recovery);
  }
}).catch((error) => {
  console.error('[Background] State recovery failed:', error);
});

// Log current task state on startup (for debugging)
getTaskState().then((state) => {
  if (state.context) {
    console.log('[Background] Existing task context found:', {
      status: state.context.status,
      tabId: state.context.targetTabId,
      sessionId: state.context.sessionId?.slice(0, 8) + '...',
    });
  }
}).catch((error) => {
  console.error('[Background] Failed to get task state on startup:', error);
});

// Log multi-tab state
getMultiTabState().then((state) => {
  const tabCount = Object.keys(state.tabs).length;
  if (tabCount > 0) {
    console.log(`[Background] Multi-tab state: ${tabCount} tabs tracked`);
  }
}).catch((error) => {
  console.error('[Background] Failed to get multi-tab state on startup:', error);
});

// ============================================================================
// Debugger Cleanup on Startup
// CRITICAL: Clean up any stale debuggers from previous sessions
// This prevents "Another debugger is already attached" errors
// ============================================================================

import { initDebuggerDetachListener, onDebuggerDetach, detachAllDebuggers } from '../../helpers/chromeDebugger';

// Initialize the debugger detach listener to track when debuggers are disconnected
initDebuggerDetachListener();

// Register a callback to handle debugger detachment (e.g., when DevTools is opened)
onDebuggerDetach((tabId, reason) => {
  console.warn(`[Background] Debugger detached from tab ${tabId}: ${reason}`);
  
  // If the user opened DevTools, we can't do anything about it - just log
  if (reason === 'canceled_by_user' || reason === 'replaced_with_devtools') {
    // Store a flag so the UI can show a message to the user
    chrome.storage.local.set({
      debugger_detach_warning: {
        tabId,
        reason,
        timestamp: Date.now(),
        message: reason === 'replaced_with_devtools' 
          ? 'DevTools was opened. Close DevTools to resume automation.'
          : 'Debugger was canceled by user.',
      },
    }).catch((error) => {
      console.error('[Background] Failed to store debugger detach warning:', error);
    });
  }
  
  // If the tab was closed, clean up any related state
  if (reason === 'target_closed') {
    // The tab handling code will take care of cleanup
  }
});

(async function cleanupDebuggers() {
  try {
    const targets = await chrome.debugger.getTargets();
    const attachedTabs = targets.filter(t => t.attached && t.tabId);
    
    if (attachedTabs.length > 0) {
      console.log(`[Background] Found ${attachedTabs.length} stale debugger(s) from previous session, cleaning up...`);
      
      // Use the helper function for consistent cleanup
      await detachAllDebuggers();
      
      console.log('[Background] Debugger cleanup complete');
    }
  } catch (error) {
    console.warn('[Background] Error during debugger cleanup:', error);
  }
})();
