/**
 * Task state persistence for interact flow.
 * Prevents "lost task" loop when extension restarts or tab is refreshed.
 *
 * Reference: INTERACT_FLOW_WALKTHROUGH.md § Client Contract: State Persistence & Stability
 * 
 * CRITICAL FIX: State Wipe on Navigation (Issue #3)
 * When the agent clicks a link or form submission causes navigation,
 * the Content Script is destroyed and recreated. Any state in JS variables is lost.
 * We persist task state to chrome.storage.local to survive navigation.
 * 
 * Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)
 */

const TASK_STORAGE_KEY_PREFIX = 'task_';
const ACTIVE_TASK_STORAGE_KEY = 'active_task_state';
const TASK_STORAGE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes
const ACTIVE_TASK_TIMEOUT_MS = 5 * 60 * 1000; // 5 minutes (for stale task detection)

export interface StoredTaskState {
  taskId: string;
  sessionId: string | null;
  url: string;
  timestamp: number;
}

/**
 * Active task state persisted for navigation survival
 * Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3
 */
export interface ActiveTaskState {
  taskId: string;
  sessionId: string | null;
  tabId: number;
  status: 'running' | 'paused' | 'idle';
  currentUrl: string;
  lastActionTimestamp: number;
  instructions?: string;
}

/**
 * Persist taskId (and sessionId, url) for the given tab.
 * Call after receiving interact response with taskId.
 */
export async function persistTaskState(
  tabId: number,
  state: StoredTaskState
): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({
      [`${TASK_STORAGE_KEY_PREFIX}${tabId}`]: {
        ...state,
        timestamp: state.timestamp ?? Date.now(),
      },
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[taskPersistence] Failed to persist task state:', msg);
  }
}

/**
 * Recover taskId for the given tab from chrome.storage.local.
 * Returns undefined if not found or expired (30 min inactivity).
 */
export async function getTaskIdForTab(tabId: number): Promise<string | undefined> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined;
    const key = `${TASK_STORAGE_KEY_PREFIX}${tabId}`;
    const result = await chrome.storage.local.get(key);
    const stored = result[key] as StoredTaskState | undefined;
    if (!stored?.taskId) return undefined;
    if (Date.now() - (stored.timestamp ?? 0) > TASK_STORAGE_EXPIRY_MS) {
      await chrome.storage.local.remove(key);
      return undefined;
    }
    return stored.taskId;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[taskPersistence] Failed to recover taskId:', msg);
    return undefined;
  }
}

/**
 * Recover full stored state for the tab (taskId, sessionId, url).
 * Returns undefined if not found or expired.
 */
export async function getStoredTaskStateForTab(
  tabId: number
): Promise<StoredTaskState | undefined> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined;
    const key = `${TASK_STORAGE_KEY_PREFIX}${tabId}`;
    const result = await chrome.storage.local.get(key);
    const stored = result[key] as StoredTaskState | undefined;
    if (!stored?.taskId) return undefined;
    if (Date.now() - (stored.timestamp ?? 0) > TASK_STORAGE_EXPIRY_MS) {
      await chrome.storage.local.remove(key);
      return undefined;
    }
    return stored;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[taskPersistence] Failed to recover stored state:', msg);
    return undefined;
  }
}

// ============================================================================
// CRITICAL FIX: State Wipe on Navigation (Issue #3)
// Functions to persist active task state that survives page navigation
// 
// Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)
// ============================================================================

/**
 * Persist active task state for navigation survival.
 * Call before executing any action that might cause navigation.
 * 
 * @param state - The active task state to persist
 */
export async function persistActiveTaskState(
  state: ActiveTaskState
): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.set({
      [ACTIVE_TASK_STORAGE_KEY]: {
        ...state,
        lastActionTimestamp: state.lastActionTimestamp ?? Date.now(),
      },
    });
    console.debug('[taskPersistence] Persisted active task state:', {
      taskId: state.taskId.slice(0, 8) + '...',
      status: state.status,
      tabId: state.tabId,
    });
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[taskPersistence] Failed to persist active task state:', msg);
  }
}

/**
 * Check for an active task that should be resumed after navigation.
 * Returns the active task state if found and not stale (within 5 minutes).
 * 
 * @param currentTabId - The current tab ID (to verify we're in the right tab)
 * @returns The active task state if found and valid, undefined otherwise
 */
export async function checkForActiveTask(
  currentTabId?: number
): Promise<ActiveTaskState | undefined> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return undefined;
    
    const result = await chrome.storage.local.get(ACTIVE_TASK_STORAGE_KEY);
    const stored = result[ACTIVE_TASK_STORAGE_KEY] as ActiveTaskState | undefined;
    
    if (!stored?.taskId) {
      return undefined;
    }
    
    // Check if task is stale (no activity for 5 minutes)
    const now = Date.now();
    const isStale = now - (stored.lastActionTimestamp ?? 0) > ACTIVE_TASK_TIMEOUT_MS;
    if (isStale) {
      console.debug('[taskPersistence] Active task is stale, clearing');
      await clearActiveTaskState();
      return undefined;
    }
    
    // Check if we're in the correct tab (if tab ID provided)
    if (currentTabId !== undefined && stored.tabId !== currentTabId) {
      console.debug('[taskPersistence] Active task belongs to different tab:', {
        activeTabId: stored.tabId,
        currentTabId,
      });
      return undefined;
    }
    
    // Check if task is in a resumable state
    if (stored.status !== 'running') {
      console.debug('[taskPersistence] Active task is not running:', stored.status);
      return undefined;
    }
    
    console.debug('[taskPersistence] Found active task to resume:', {
      taskId: stored.taskId.slice(0, 8) + '...',
      status: stored.status,
      timeSinceLastAction: Math.round((now - stored.lastActionTimestamp) / 1000) + 's',
    });
    
    return stored;
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[taskPersistence] Failed to check for active task:', msg);
    return undefined;
  }
}

/**
 * Clear the active task state.
 * Call when task completes, fails, or user stops it.
 */
export async function clearActiveTaskState(): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    await chrome.storage.local.remove(ACTIVE_TASK_STORAGE_KEY);
    console.debug('[taskPersistence] Cleared active task state');
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[taskPersistence] Failed to clear active task state:', msg);
  }
}

/**
 * Update the timestamp of the active task (call after each action).
 * This prevents the task from being considered stale.
 */
export async function updateActiveTaskTimestamp(): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    
    const result = await chrome.storage.local.get(ACTIVE_TASK_STORAGE_KEY);
    const stored = result[ACTIVE_TASK_STORAGE_KEY] as ActiveTaskState | undefined;
    
    if (stored) {
      await chrome.storage.local.set({
        [ACTIVE_TASK_STORAGE_KEY]: {
          ...stored,
          lastActionTimestamp: Date.now(),
        },
      });
    }
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : String(error);
    console.warn('[taskPersistence] Failed to update active task timestamp:', msg);
  }
}
