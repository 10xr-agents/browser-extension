/**
 * Task state persistence for interact flow.
 * Prevents "lost task" loop when extension restarts or tab is refreshed.
 *
 * Reference: INTERACT_FLOW_WALKTHROUGH.md § Client Contract: State Persistence & Stability
 */

const TASK_STORAGE_KEY_PREFIX = 'task_';
const TASK_STORAGE_EXPIRY_MS = 30 * 60 * 1000; // 30 minutes

export interface StoredTaskState {
  taskId: string;
  sessionId: string | null;
  url: string;
  timestamp: number;
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
