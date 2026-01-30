/**
 * StorageFirstManager - Storage-as-Backend Architecture
 * 
 * Phase 4 Implementation: Storage-First Pattern
 * 
 * This module implements the "Storage-First" (Flux) architecture where:
 * - chrome.storage.local is the SINGLE SOURCE OF TRUTH (like Redux)
 * - Writers (Background/WebSocket) ONLY write to storage, never send messages
 * - Readers (Side Panel) ONLY read from storage via subscriptions
 * - Zero synchronization logic - UI always reflects storage
 * 
 * Key Benefits:
 * - Tab switch is instant (just read different key)
 * - No message passing between components
 * - State survives Side Panel close/reopen
 * - State survives Service Worker termination
 * 
 * Storage Schema:
 * ```
 * {
 *   "session_{tabId}": { messages: [], status: "running", ... },
 *   "active_tab_id": 123,
 *   "global_settings": { ... },
 *   "connection_state": { socketConnected: true, ... }
 * }
 * ```
 * 
 * Reference: ARCHITECTURE_REVIEW.md §Phase 4 (Storage-First)
 */

import type { ChatMessage } from '../types/chatMessage';

// ============================================================================
// Storage Keys
// ============================================================================

export const STORAGE_KEYS = {
  /** Prefix for per-tab session data */
  SESSION_PREFIX: 'session_',
  /** Currently active tab ID */
  ACTIVE_TAB: 'active_tab_id',
  /** Global settings */
  GLOBAL_SETTINGS: 'global_settings',
  /** WebSocket connection state */
  CONNECTION_STATE: 'connection_state',
  /** Pending notifications (messages received while UI not viewing that tab) */
  PENDING_NOTIFICATIONS: 'pending_notifications',
} as const;

// ============================================================================
// Types
// ============================================================================

/**
 * Per-tab session state stored in chrome.storage
 */
export interface TabSession {
  /** Tab ID */
  tabId: number;
  /** Current URL */
  url: string;
  /** Backend session ID */
  sessionId: string | null;
  /** Current task ID */
  taskId: string | null;
  /** Task status */
  status: 'idle' | 'running' | 'paused' | 'success' | 'error' | 'interrupted';
  /** Action status for UI */
  actionStatus: string;
  /** User instructions */
  instructions: string;
  /** Chat messages */
  messages: ChatMessage[];
  /** Display history (thought/action pairs) */
  displayHistory: DisplayHistoryEntry[];
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Unread message count (messages received while not viewing this tab) */
  unreadCount: number;
}

export interface DisplayHistoryEntry {
  thought: string;
  action: string;
  timestamp: number;
  parsedAction?: {
    name: string;
    args: Record<string, unknown>;
  };
}

export interface ConnectionState {
  /** Is the WebSocket connected? */
  connected: boolean;
  /** Connection status */
  status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'error';
  /** Last connected timestamp */
  lastConnectedAt: number | null;
  /** Error message if any */
  error: string | null;
  /** Active channel subscriptions by tabId */
  subscriptions: Record<number, string>;
}

export interface GlobalSettings {
  /** Max concurrent tasks */
  maxConcurrentTasks: number;
  /** Auto-pause when switching tabs */
  autoPauseOnSwitch: boolean;
  /** Show notifications for background tabs */
  showNotifications: boolean;
}

export interface PendingNotification {
  tabId: number;
  type: 'message' | 'task_complete' | 'error';
  title: string;
  body: string;
  timestamp: number;
}

// ============================================================================
// Default Values
// ============================================================================

const DEFAULT_TAB_SESSION: Omit<TabSession, 'tabId'> = {
  url: '',
  sessionId: null,
  taskId: null,
  status: 'idle',
  actionStatus: 'idle',
  instructions: '',
  messages: [],
  displayHistory: [],
  lastActivityAt: 0,
  unreadCount: 0,
};

const DEFAULT_CONNECTION_STATE: ConnectionState = {
  connected: false,
  status: 'disconnected',
  lastConnectedAt: null,
  error: null,
  subscriptions: {},
};

const DEFAULT_GLOBAL_SETTINGS: GlobalSettings = {
  maxConcurrentTasks: 3,
  autoPauseOnSwitch: false,
  showNotifications: true,
};

// ============================================================================
// Storage Helpers (The Database Layer)
// ============================================================================

/**
 * Get session key for a tab
 */
export function getSessionKey(tabId: number): string {
  return `${STORAGE_KEYS.SESSION_PREFIX}${tabId}`;
}

/**
 * Read a session from storage
 */
export async function getSession(tabId: number): Promise<TabSession | null> {
  const key = getSessionKey(tabId);
  try {
    const result = await chrome.storage.local.get(key);
    return result[key] || null;
  } catch (error) {
    console.error(`[StorageFirst] Failed to get session ${tabId}:`, error);
    return null;
  }
}

/**
 * Write a session to storage (creates if not exists)
 */
export async function setSession(tabId: number, session: Partial<TabSession>): Promise<void> {
  const key = getSessionKey(tabId);
  const existing = await getSession(tabId);
  
  const updated: TabSession = {
    ...DEFAULT_TAB_SESSION,
    ...existing,
    ...session,
    tabId,
    lastActivityAt: Date.now(),
  };
  
  try {
    await chrome.storage.local.set({ [key]: updated });
  } catch (error) {
    console.error(`[StorageFirst] Failed to set session ${tabId}:`, error);
    throw error;
  }
}

/**
 * Update specific fields in a session
 */
export async function updateSession(
  tabId: number,
  updates: Partial<TabSession>
): Promise<TabSession | null> {
  const existing = await getSession(tabId);
  if (!existing) {
    console.warn(`[StorageFirst] Session ${tabId} not found for update`);
    return null;
  }
  
  const updated: TabSession = {
    ...existing,
    ...updates,
    lastActivityAt: Date.now(),
  };
  
  const key = getSessionKey(tabId);
  await chrome.storage.local.set({ [key]: updated });
  return updated;
}

/**
 * Delete a session
 */
export async function deleteSession(tabId: number): Promise<void> {
  const key = getSessionKey(tabId);
  await chrome.storage.local.remove(key);
}

/**
 * Get all sessions
 */
export async function getAllSessions(): Promise<Map<number, TabSession>> {
  const result = await chrome.storage.local.get(null);
  const sessions = new Map<number, TabSession>();
  
  for (const [key, value] of Object.entries(result)) {
    if (key.startsWith(STORAGE_KEYS.SESSION_PREFIX)) {
      const tabId = parseInt(key.slice(STORAGE_KEYS.SESSION_PREFIX.length), 10);
      if (!isNaN(tabId)) {
        sessions.set(tabId, value as TabSession);
      }
    }
  }
  
  return sessions;
}

// ============================================================================
// Active Tab Management
// ============================================================================

/**
 * Get the currently active tab ID
 */
export async function getActiveTabId(): Promise<number | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.ACTIVE_TAB);
    return result[STORAGE_KEYS.ACTIVE_TAB] || null;
  } catch {
    return null;
  }
}

/**
 * Set the active tab ID (called when user switches tabs)
 */
export async function setActiveTabId(tabId: number): Promise<void> {
  // Mark previous tab's messages as read-ish (reset unread when leaving)
  const previousTabId = await getActiveTabId();
  if (previousTabId && previousTabId !== tabId) {
    // Keep unread count for the tab we're leaving
  }
  
  await chrome.storage.local.set({ [STORAGE_KEYS.ACTIVE_TAB]: tabId });
  
  // Reset unread count for the tab we're switching TO
  const currentSession = await getSession(tabId);
  if (currentSession && currentSession.unreadCount > 0) {
    await updateSession(tabId, { unreadCount: 0 });
  }
}

// ============================================================================
// Message Routing (The Writer)
// ============================================================================

/**
 * Route an incoming message to the correct tab's storage
 * This is called by the WebSocket handler - it ONLY writes to storage
 */
export async function routeIncomingMessage(
  tabId: number,
  message: ChatMessage
): Promise<void> {
  const session = await getSession(tabId);
  if (!session) {
    // Create session if it doesn't exist
    await setSession(tabId, {
      messages: [message],
    });
    return;
  }
  
  // Avoid duplicates
  if (session.messages.some((m) => m.id === message.id)) {
    return;
  }
  
  // Check if user is viewing this tab
  const activeTabId = await getActiveTabId();
  const isViewing = activeTabId === tabId;
  
  // Update session
  await updateSession(tabId, {
    messages: [...session.messages, message],
    unreadCount: isViewing ? 0 : session.unreadCount + 1,
  });
  
  // If not viewing, optionally create notification
  if (!isViewing) {
    await addPendingNotification({
      tabId,
      type: 'message',
      title: 'New message',
      body: typeof message.content === 'string' 
        ? message.content.slice(0, 100) 
        : 'New activity',
      timestamp: Date.now(),
    });
  }
}

/**
 * Route task status update to storage
 */
export async function routeTaskUpdate(
  tabId: number,
  update: {
    status?: TabSession['status'];
    actionStatus?: string;
    taskId?: string;
    thought?: string;
    action?: string;
  }
): Promise<void> {
  const session = await getSession(tabId);
  if (!session) return;
  
  const updates: Partial<TabSession> = {};
  
  if (update.status) updates.status = update.status;
  if (update.actionStatus) updates.actionStatus = update.actionStatus;
  if (update.taskId) updates.taskId = update.taskId;
  
  // Add to display history if thought/action provided
  if (update.thought || update.action) {
    updates.displayHistory = [
      ...session.displayHistory,
      {
        thought: update.thought || '',
        action: update.action || '',
        timestamp: Date.now(),
      },
    ];
  }
  
  await updateSession(tabId, updates);
}

// ============================================================================
// Connection State
// ============================================================================

export async function getConnectionState(): Promise<ConnectionState> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.CONNECTION_STATE);
    return result[STORAGE_KEYS.CONNECTION_STATE] || DEFAULT_CONNECTION_STATE;
  } catch {
    return DEFAULT_CONNECTION_STATE;
  }
}

export async function setConnectionState(
  updates: Partial<ConnectionState>
): Promise<void> {
  const current = await getConnectionState();
  await chrome.storage.local.set({
    [STORAGE_KEYS.CONNECTION_STATE]: { ...current, ...updates },
  });
}

// ============================================================================
// Notifications
// ============================================================================

async function addPendingNotification(notification: PendingNotification): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_NOTIFICATIONS);
    const notifications: PendingNotification[] = result[STORAGE_KEYS.PENDING_NOTIFICATIONS] || [];
    
    // Keep last 50 notifications
    const updated = [...notifications, notification].slice(-50);
    await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_NOTIFICATIONS]: updated });
  } catch (error) {
    console.error('[StorageFirst] Failed to add notification:', error);
  }
}

export async function getPendingNotifications(): Promise<PendingNotification[]> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.PENDING_NOTIFICATIONS);
    return result[STORAGE_KEYS.PENDING_NOTIFICATIONS] || [];
  } catch {
    return [];
  }
}

export async function clearNotificationsForTab(tabId: number): Promise<void> {
  const notifications = await getPendingNotifications();
  const filtered = notifications.filter((n) => n.tabId !== tabId);
  await chrome.storage.local.set({ [STORAGE_KEYS.PENDING_NOTIFICATIONS]: filtered });
}

// ============================================================================
// Global Settings
// ============================================================================

export async function getGlobalSettings(): Promise<GlobalSettings> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.GLOBAL_SETTINGS);
    return { ...DEFAULT_GLOBAL_SETTINGS, ...result[STORAGE_KEYS.GLOBAL_SETTINGS] };
  } catch {
    return DEFAULT_GLOBAL_SETTINGS;
  }
}

export async function setGlobalSettings(settings: Partial<GlobalSettings>): Promise<void> {
  const current = await getGlobalSettings();
  await chrome.storage.local.set({
    [STORAGE_KEYS.GLOBAL_SETTINGS]: { ...current, ...settings },
  });
}

// ============================================================================
// Cleanup
// ============================================================================

/**
 * Clean up session for a closed tab
 */
export async function cleanupClosedTab(tabId: number): Promise<void> {
  await deleteSession(tabId);
  await clearNotificationsForTab(tabId);
  
  // Remove from subscriptions
  const connectionState = await getConnectionState();
  const { [tabId]: removed, ...remaining } = connectionState.subscriptions;
  await setConnectionState({ subscriptions: remaining });
}

/**
 * Clean up stale sessions (tabs that no longer exist)
 */
export async function cleanupStaleSessions(): Promise<number> {
  const sessions = await getAllSessions();
  let cleanedCount = 0;
  
  for (const [tabId] of sessions) {
    try {
      await chrome.tabs.get(tabId);
    } catch {
      // Tab doesn't exist, clean up
      await cleanupClosedTab(tabId);
      cleanedCount++;
    }
  }
  
  if (cleanedCount > 0) {
    console.log(`[StorageFirst] Cleaned up ${cleanedCount} stale sessions`);
  }
  
  return cleanedCount;
}
