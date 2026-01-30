/**
 * TabTaskManager - Multi-Tab Task Support
 * 
 * Phase 3 Implementation: Proper multi-tab support
 * 
 * This module manages multiple concurrent tasks across different tabs.
 * Each tab can have its own independent task, with proper isolation and
 * lifecycle management.
 * 
 * Architecture:
 * - Each tab has its own TaskContext stored by tabId
 * - Switching tabs shows that tab's task state
 * - Tasks continue running even when user switches tabs
 * - Tab close automatically cleans up that tab's task
 * 
 * Reference: ARCHITECTURE_REVIEW.md §Phase 3 (Multi-tab support)
 */

import type { ChatMessage } from '../../types/chatMessage';
import type { ParsedAction } from '../../helpers/parseAction';

// ============================================================================
// Types
// ============================================================================

/**
 * Individual tab's task context
 */
export interface TabTaskContext {
  /** Tab ID this context belongs to */
  tabId: number;
  /** Tab URL when task started */
  tabUrl: string;
  /** Backend session ID */
  sessionId: string | null;
  /** Current task ID */
  taskId: string | null;
  /** Task status */
  status: 'idle' | 'running' | 'paused' | 'success' | 'error' | 'interrupted';
  /** Pause reason if paused */
  pauseReason?: 'tab_switched' | 'user_input_needed' | 'navigation' | 'manual';
  /** Action status for UI */
  actionStatus: 
    | 'idle'
    | 'attaching-debugger'
    | 'pulling-dom'
    | 'transforming-dom'
    | 'performing-query'
    | 'performing-action'
    | 'waiting';
  /** User's instructions */
  instructions: string;
  /** When task started */
  startedAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Current step number */
  currentStep: number | null;
  /** Total steps */
  totalSteps: number | null;
  /** Orchestrator status */
  orchestratorStatus: 'planning' | 'executing' | 'verifying' | 'correcting' | 'completed' | 'failed' | null;
  /** Whether org knowledge is available */
  hasOrgKnowledge: boolean | null;
}

/**
 * Display history entry
 */
export interface TabDisplayHistoryEntry {
  thought: string;
  action: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  parsedAction: ParsedAction;
  timestamp: number;
}

/**
 * Full state for a single tab's task
 */
export interface TabTaskState {
  context: TabTaskContext | null;
  displayHistory: TabDisplayHistoryEntry[];
  messages: ChatMessage[];
}

/**
 * Multi-tab state stored in chrome.storage.local
 */
export interface MultiTabState {
  /** Map of tabId -> TaskState */
  tabs: Record<number, TabTaskState>;
  /** Currently active/focused tab */
  activeTabId: number | null;
  /** Global settings that apply to all tabs */
  globalSettings: {
    /** Maximum concurrent tasks allowed */
    maxConcurrentTasks: number;
    /** Auto-pause tasks when switching tabs */
    autoPauseOnTabSwitch: boolean;
  };
}

// Storage key
export const MULTI_TAB_STATE_KEY = 'multi_tab_task_state';

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_TAB_TASK_STATE: TabTaskState = {
  context: null,
  displayHistory: [],
  messages: [],
};

const DEFAULT_MULTI_TAB_STATE: MultiTabState = {
  tabs: {},
  activeTabId: null,
  globalSettings: {
    maxConcurrentTasks: 3,
    autoPauseOnTabSwitch: false, // Changed to false - let tasks continue in background
  },
};

// ============================================================================
// Storage Helpers
// ============================================================================

/**
 * Get multi-tab state from storage
 */
export async function getMultiTabState(): Promise<MultiTabState> {
  try {
    const result = await chrome.storage.local.get(MULTI_TAB_STATE_KEY);
    return result[MULTI_TAB_STATE_KEY] || DEFAULT_MULTI_TAB_STATE;
  } catch (error) {
    console.error('[TabTaskManager] Failed to get state:', error);
    return DEFAULT_MULTI_TAB_STATE;
  }
}

/**
 * Save multi-tab state to storage
 */
async function setMultiTabState(state: MultiTabState): Promise<void> {
  try {
    await chrome.storage.local.set({ [MULTI_TAB_STATE_KEY]: state });
  } catch (error) {
    console.error('[TabTaskManager] Failed to set state:', error);
    throw error;
  }
}

/**
 * Update state with a function
 */
async function updateMultiTabState(
  updater: (state: MultiTabState) => MultiTabState
): Promise<MultiTabState> {
  const currentState = await getMultiTabState();
  const newState = updater(currentState);
  await setMultiTabState(newState);
  return newState;
}

// ============================================================================
// Tab Task Management
// ============================================================================

/**
 * Get task state for a specific tab
 */
export async function getTabTaskState(tabId: number): Promise<TabTaskState> {
  const state = await getMultiTabState();
  return state.tabs[tabId] || DEFAULT_TAB_TASK_STATE;
}

/**
 * Set task state for a specific tab
 */
export async function setTabTaskState(
  tabId: number,
  taskState: TabTaskState
): Promise<void> {
  await updateMultiTabState((state) => ({
    ...state,
    tabs: {
      ...state.tabs,
      [tabId]: taskState,
    },
  }));
}

/**
 * Update task context for a specific tab
 */
export async function updateTabTaskContext(
  tabId: number,
  updates: Partial<TabTaskContext>
): Promise<TabTaskState> {
  const state = await getMultiTabState();
  const tabState = state.tabs[tabId] || DEFAULT_TAB_TASK_STATE;
  
  if (!tabState.context) {
    console.warn('[TabTaskManager] Cannot update context for tab without context:', tabId);
    return tabState;
  }
  
  const newContext: TabTaskContext = {
    ...tabState.context,
    ...updates,
    lastActivityAt: Date.now(),
  };
  
  const newTabState: TabTaskState = {
    ...tabState,
    context: newContext,
  };
  
  await updateMultiTabState((s) => ({
    ...s,
    tabs: {
      ...s.tabs,
      [tabId]: newTabState,
    },
  }));
  
  return newTabState;
}

/**
 * Start a new task on a specific tab
 */
export async function startTabTask(
  tabId: number,
  tabUrl: string,
  instructions: string,
  sessionId?: string | null
): Promise<TabTaskState> {
  const state = await getMultiTabState();
  
  // Check concurrent task limit
  const runningTasks = Object.values(state.tabs).filter(
    (t) => t.context?.status === 'running'
  ).length;
  
  if (runningTasks >= state.globalSettings.maxConcurrentTasks) {
    throw new Error(
      `Maximum concurrent tasks (${state.globalSettings.maxConcurrentTasks}) reached. ` +
      `Please stop a running task first.`
    );
  }
  
  const now = Date.now();
  const context: TabTaskContext = {
    tabId,
    tabUrl,
    sessionId: sessionId || null,
    taskId: null,
    status: 'running',
    actionStatus: 'attaching-debugger',
    instructions,
    startedAt: now,
    lastActivityAt: now,
    currentStep: null,
    totalSteps: null,
    orchestratorStatus: null,
    hasOrgKnowledge: null,
  };
  
  const newTabState: TabTaskState = {
    context,
    displayHistory: [],
    messages: state.tabs[tabId]?.messages || [], // Preserve existing messages
  };
  
  await updateMultiTabState((s) => ({
    ...s,
    tabs: {
      ...s.tabs,
      [tabId]: newTabState,
    },
    activeTabId: tabId,
  }));
  
  console.log(`[TabTaskManager] Started task on tab ${tabId}`);
  return newTabState;
}

/**
 * Stop task on a specific tab
 */
export async function stopTabTask(tabId: number): Promise<TabTaskState> {
  const tabState = await getTabTaskState(tabId);
  
  if (!tabState.context) {
    return tabState;
  }
  
  return updateTabTaskContext(tabId, {
    status: 'interrupted',
    actionStatus: 'idle',
  });
}

/**
 * Pause task on a specific tab
 */
export async function pauseTabTask(
  tabId: number,
  reason: TabTaskContext['pauseReason'] = 'manual'
): Promise<TabTaskState> {
  return updateTabTaskContext(tabId, {
    status: 'paused',
    pauseReason: reason,
    actionStatus: 'idle',
  });
}

/**
 * Resume task on a specific tab
 */
export async function resumeTabTask(tabId: number): Promise<TabTaskState> {
  return updateTabTaskContext(tabId, {
    status: 'running',
    pauseReason: undefined,
  });
}

/**
 * Clear task on a specific tab
 */
export async function clearTabTask(tabId: number): Promise<void> {
  await updateMultiTabState((state) => {
    const { [tabId]: removed, ...remainingTabs } = state.tabs;
    return {
      ...state,
      tabs: remainingTabs,
    };
  });
  console.log(`[TabTaskManager] Cleared task for tab ${tabId}`);
}

/**
 * Add display history entry for a tab
 */
export async function addTabDisplayHistory(
  tabId: number,
  entry: Omit<TabDisplayHistoryEntry, 'timestamp'>
): Promise<void> {
  const state = await getMultiTabState();
  const tabState = state.tabs[tabId] || DEFAULT_TAB_TASK_STATE;
  
  const newEntry: TabDisplayHistoryEntry = {
    ...entry,
    timestamp: Date.now(),
  };
  
  await updateMultiTabState((s) => ({
    ...s,
    tabs: {
      ...s.tabs,
      [tabId]: {
        ...tabState,
        displayHistory: [...tabState.displayHistory, newEntry],
      },
    },
  }));
}

/**
 * Add message to a tab's chat
 */
export async function addTabMessage(
  tabId: number,
  message: ChatMessage
): Promise<void> {
  const state = await getMultiTabState();
  const tabState = state.tabs[tabId] || DEFAULT_TAB_TASK_STATE;
  
  // Avoid duplicates
  if (tabState.messages.some((m) => m.id === message.id)) {
    return;
  }
  
  await updateMultiTabState((s) => ({
    ...s,
    tabs: {
      ...s.tabs,
      [tabId]: {
        ...tabState,
        messages: [...tabState.messages, message],
      },
    },
  }));
}

// ============================================================================
// Tab Lifecycle Events
// ============================================================================

/**
 * Handle tab becoming active
 */
export async function handleTabActivated(tabId: number): Promise<void> {
  const state = await getMultiTabState();
  
  // Update active tab
  await updateMultiTabState((s) => ({
    ...s,
    activeTabId: tabId,
  }));
  
  // If autoPauseOnTabSwitch is enabled, pause tasks on other tabs
  if (state.globalSettings.autoPauseOnTabSwitch) {
    for (const [tid, tabState] of Object.entries(state.tabs)) {
      const numericTid = Number(tid);
      if (numericTid !== tabId && tabState.context?.status === 'running') {
        await pauseTabTask(numericTid, 'tab_switched');
        console.log(`[TabTaskManager] Auto-paused task on tab ${numericTid}`);
      }
    }
  }
}

/**
 * Handle tab closed
 */
export async function handleTabClosed(tabId: number): Promise<void> {
  const state = await getMultiTabState();
  
  if (state.tabs[tabId]) {
    // Clean up the tab's task
    await clearTabTask(tabId);
    console.log(`[TabTaskManager] Cleaned up closed tab ${tabId}`);
  }
  
  // Update active tab if needed
  if (state.activeTabId === tabId) {
    await updateMultiTabState((s) => ({
      ...s,
      activeTabId: null,
    }));
  }
}

/**
 * Handle tab URL change
 */
export async function handleTabUrlChanged(
  tabId: number,
  newUrl: string
): Promise<void> {
  const tabState = await getTabTaskState(tabId);
  
  if (tabState.context && tabState.context.status === 'running') {
    // Update URL in context
    await updateTabTaskContext(tabId, {
      tabUrl: newUrl,
    });
    console.log(`[TabTaskManager] Updated URL for tab ${tabId}: ${newUrl}`);
  }
}

// ============================================================================
// Queries
// ============================================================================

/**
 * Get all running tasks
 */
export async function getRunningTasks(): Promise<Array<{ tabId: number; state: TabTaskState }>> {
  const state = await getMultiTabState();
  return Object.entries(state.tabs)
    .filter(([, tabState]) => tabState.context?.status === 'running')
    .map(([tabId, tabState]) => ({
      tabId: Number(tabId),
      state: tabState,
    }));
}

/**
 * Get active tab's task state
 */
export async function getActiveTabTaskState(): Promise<TabTaskState | null> {
  const state = await getMultiTabState();
  if (!state.activeTabId) return null;
  return state.tabs[state.activeTabId] || null;
}

/**
 * Check if any task is running
 */
export async function hasRunningTask(): Promise<boolean> {
  const running = await getRunningTasks();
  return running.length > 0;
}

/**
 * Get task count summary
 */
export async function getTaskSummary(): Promise<{
  total: number;
  running: number;
  paused: number;
  completed: number;
  error: number;
}> {
  const state = await getMultiTabState();
  const tabs = Object.values(state.tabs);
  
  return {
    total: tabs.length,
    running: tabs.filter((t) => t.context?.status === 'running').length,
    paused: tabs.filter((t) => t.context?.status === 'paused').length,
    completed: tabs.filter((t) => t.context?.status === 'success').length,
    error: tabs.filter((t) => t.context?.status === 'error').length,
  };
}

// ============================================================================
// Settings
// ============================================================================

/**
 * Update global settings
 */
export async function updateGlobalSettings(
  updates: Partial<MultiTabState['globalSettings']>
): Promise<void> {
  await updateMultiTabState((state) => ({
    ...state,
    globalSettings: {
      ...state.globalSettings,
      ...updates,
    },
  }));
}

/**
 * Get global settings
 */
export async function getGlobalSettings(): Promise<MultiTabState['globalSettings']> {
  const state = await getMultiTabState();
  return state.globalSettings;
}
