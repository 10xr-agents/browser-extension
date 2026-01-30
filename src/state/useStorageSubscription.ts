/**
 * useStorageSubscription - React Hooks for Storage-First Pattern
 * 
 * Phase 4 Implementation: Storage Subscription Hooks
 * 
 * These hooks bind React components DIRECTLY to chrome.storage.local.
 * The UI becomes a pure view that:
 * - Reads from storage
 * - Subscribes to storage.onChanged
 * - Renders state
 * 
 * NO synchronization logic. NO message passing. Just read & render.
 * 
 * Usage:
 * ```tsx
 * const session = useActiveSession(); // Auto-updates on storage change
 * const { messages, status } = session;
 * ```
 * 
 * Reference: ARCHITECTURE_REVIEW.md §Phase 4 (Observer Pattern)
 */

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import {
  getSession,
  setSession,
  updateSession,
  getActiveTabId,
  setActiveTabId,
  getAllSessions,
  getConnectionState,
  getGlobalSettings,
  setGlobalSettings,
  getPendingNotifications,
  clearNotificationsForTab,
  STORAGE_KEYS,
  getSessionKey,
  type TabSession,
  type ConnectionState,
  type GlobalSettings,
  type PendingNotification,
} from './StorageFirstManager';
import type { ChatMessage } from '../types/chatMessage';

// ============================================================================
// Core Storage Subscription Hook
// ============================================================================

/**
 * Generic hook to subscribe to any storage key
 * Returns current value and updates automatically on storage change
 */
export function useStorageKey<T>(
  key: string,
  defaultValue: T
): { value: T; isLoading: boolean; error: string | null } {
  const [value, setValue] = useState<T>(defaultValue);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Initial load
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      setIsLoading(false);
      return;
    }
    
    chrome.storage.local.get(key)
      .then((result) => {
        setValue(result[key] ?? defaultValue);
        setIsLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        setIsLoading(false);
      });
  }, [key, defaultValue]);
  
  // Subscribe to changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    
    const handleChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[key]) {
        setValue(changes[key].newValue ?? defaultValue);
      }
    };
    
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, [key, defaultValue]);
  
  return { value, isLoading, error };
}

// ============================================================================
// Tab Session Hooks
// ============================================================================

/**
 * Subscribe to a specific tab's session
 */
export function useTabSession(tabId: number | null): {
  session: TabSession | null;
  isLoading: boolean;
  update: (updates: Partial<TabSession>) => Promise<void>;
} {
  const [session, setSessionState] = useState<TabSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load initial session
  useEffect(() => {
    if (!tabId) {
      setSessionState(null);
      setIsLoading(false);
      return;
    }
    
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      setIsLoading(false);
      return;
    }
    
    getSession(tabId)
      .then((result) => {
        setSessionState(result);
        setIsLoading(false);
      })
      .catch(() => {
        setSessionState(null);
        setIsLoading(false);
      });
  }, [tabId]);
  
  // Subscribe to changes
  useEffect(() => {
    if (!tabId) return;
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    
    const key = getSessionKey(tabId);
    
    const handleChange = (
      changes: { [k: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[key]) {
        setSessionState(changes[key].newValue || null);
      }
    };
    
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, [tabId]);
  
  // Update function
  const update = useCallback(
    async (updates: Partial<TabSession>) => {
      if (!tabId) return;
      await updateSession(tabId, updates);
    },
    [tabId]
  );
  
  return { session, isLoading, update };
}

/**
 * Get the active tab ID and subscribe to changes
 */
export function useActiveTabId(): {
  tabId: number | null;
  setTabId: (id: number) => Promise<void>;
  isLoading: boolean;
} {
  const [tabId, setTabIdState] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load initial
  useEffect(() => {
    if (typeof chrome === 'undefined') {
      setIsLoading(false);
      return;
    }
    
    getActiveTabId()
      .then((id) => {
        setTabIdState(id);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);
  
  // Subscribe to changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    
    const handleChange = (
      changes: { [k: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[STORAGE_KEYS.ACTIVE_TAB]) {
        setTabIdState(changes[STORAGE_KEYS.ACTIVE_TAB].newValue || null);
      }
    };
    
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);
  
  // Set function
  const setTabId = useCallback(async (id: number) => {
    await setActiveTabId(id);
  }, []);
  
  return { tabId, setTabId, isLoading };
}

/**
 * Subscribe to the ACTIVE tab's session (combines useActiveTabId + useTabSession)
 * This is the main hook for the Side Panel
 */
export function useActiveSession(): {
  session: TabSession | null;
  tabId: number | null;
  isLoading: boolean;
  switchTab: (newTabId: number) => Promise<void>;
  updateSession: (updates: Partial<TabSession>) => Promise<void>;
} {
  const { tabId, setTabId, isLoading: tabLoading } = useActiveTabId();
  const { session, isLoading: sessionLoading, update } = useTabSession(tabId);
  
  const switchTab = useCallback(async (newTabId: number) => {
    await setTabId(newTabId);
  }, [setTabId]);
  
  return {
    session,
    tabId,
    isLoading: tabLoading || sessionLoading,
    switchTab,
    updateSession: update,
  };
}

// ============================================================================
// Messages Hook
// ============================================================================

/**
 * Subscribe to messages for a specific tab
 * Returns messages array that auto-updates
 */
export function useTabMessages(tabId: number | null): {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (message: ChatMessage) => Promise<void>;
  clearMessages: () => Promise<void>;
} {
  const { session, isLoading, update } = useTabSession(tabId);
  
  const messages = useMemo(() => session?.messages || [], [session]);
  
  const addMessage = useCallback(
    async (message: ChatMessage) => {
      if (!session) return;
      
      // Avoid duplicates
      if (session.messages.some((m) => m.id === message.id)) return;
      
      await update({
        messages: [...session.messages, message],
      });
    },
    [session, update]
  );
  
  const clearMessages = useCallback(async () => {
    await update({ messages: [] });
  }, [update]);
  
  return { messages, isLoading, addMessage, clearMessages };
}

/**
 * Subscribe to active tab's messages
 */
export function useActiveMessages(): {
  messages: ChatMessage[];
  isLoading: boolean;
  addMessage: (message: ChatMessage) => Promise<void>;
} {
  const { tabId, isLoading: tabLoading } = useActiveTabId();
  const { messages, isLoading: msgLoading, addMessage } = useTabMessages(tabId);
  
  return {
    messages,
    isLoading: tabLoading || msgLoading,
    addMessage,
  };
}

// ============================================================================
// Connection State Hook
// ============================================================================

/**
 * Subscribe to WebSocket connection state
 */
export function useConnectionState(): {
  state: ConnectionState;
  isLoading: boolean;
} {
  const defaultState: ConnectionState = {
    connected: false,
    status: 'disconnected',
    lastConnectedAt: null,
    error: null,
    subscriptions: {},
  };
  
  const [state, setState] = useState<ConnectionState>(defaultState);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load initial
  useEffect(() => {
    if (typeof chrome === 'undefined') {
      setIsLoading(false);
      return;
    }
    
    getConnectionState()
      .then((result) => {
        setState(result);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);
  
  // Subscribe to changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    
    const handleChange = (
      changes: { [k: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[STORAGE_KEYS.CONNECTION_STATE]) {
        setState(changes[STORAGE_KEYS.CONNECTION_STATE].newValue || defaultState);
      }
    };
    
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);
  
  return { state, isLoading };
}

// ============================================================================
// All Sessions Hook (for Tab Overview)
// ============================================================================

/**
 * Subscribe to all sessions (for tab list/overview)
 */
export function useAllSessions(): {
  sessions: Map<number, TabSession>;
  isLoading: boolean;
  refresh: () => Promise<void>;
} {
  const [sessions, setSessions] = useState<Map<number, TabSession>>(new Map());
  const [isLoading, setIsLoading] = useState(true);
  
  const refresh = useCallback(async () => {
    const result = await getAllSessions();
    setSessions(result);
    setIsLoading(false);
  }, []);
  
  // Initial load
  useEffect(() => {
    refresh();
  }, [refresh]);
  
  // Subscribe to any session changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    
    const handleChange = (
      changes: { [k: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      
      // Check if any session key changed
      const hasSessionChange = Object.keys(changes).some((key) =>
        key.startsWith(STORAGE_KEYS.SESSION_PREFIX)
      );
      
      if (hasSessionChange) {
        refresh();
      }
    };
    
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, [refresh]);
  
  return { sessions, isLoading, refresh };
}

// ============================================================================
// Notifications Hook
// ============================================================================

/**
 * Subscribe to pending notifications
 */
export function usePendingNotifications(): {
  notifications: PendingNotification[];
  unreadByTab: Record<number, number>;
  totalUnread: number;
  clearForTab: (tabId: number) => Promise<void>;
} {
  const [notifications, setNotifications] = useState<PendingNotification[]>([]);
  
  // Load initial
  useEffect(() => {
    if (typeof chrome === 'undefined') return;
    
    getPendingNotifications().then(setNotifications);
  }, []);
  
  // Subscribe to changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    
    const handleChange = (
      changes: { [k: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[STORAGE_KEYS.PENDING_NOTIFICATIONS]) {
        setNotifications(changes[STORAGE_KEYS.PENDING_NOTIFICATIONS].newValue || []);
      }
    };
    
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);
  
  // Calculate unread by tab
  const unreadByTab = useMemo(() => {
    const counts: Record<number, number> = {};
    for (const n of notifications) {
      counts[n.tabId] = (counts[n.tabId] || 0) + 1;
    }
    return counts;
  }, [notifications]);
  
  const totalUnread = notifications.length;
  
  const clearForTab = useCallback(async (tabId: number) => {
    await clearNotificationsForTab(tabId);
  }, []);
  
  return { notifications, unreadByTab, totalUnread, clearForTab };
}

// ============================================================================
// Settings Hook
// ============================================================================

/**
 * Subscribe to global settings
 */
export function useSettings(): {
  settings: GlobalSettings;
  isLoading: boolean;
  updateSettings: (updates: Partial<GlobalSettings>) => Promise<void>;
} {
  const defaultSettings: GlobalSettings = {
    maxConcurrentTasks: 3,
    autoPauseOnSwitch: false,
    showNotifications: true,
  };
  
  const [settings, setSettingsState] = useState<GlobalSettings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  
  // Load initial
  useEffect(() => {
    if (typeof chrome === 'undefined') {
      setIsLoading(false);
      return;
    }
    
    getGlobalSettings()
      .then((result) => {
        setSettingsState(result);
        setIsLoading(false);
      })
      .catch(() => setIsLoading(false));
  }, []);
  
  // Subscribe to changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    
    const handleChange = (
      changes: { [k: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[STORAGE_KEYS.GLOBAL_SETTINGS]) {
        setSettingsState({
          ...defaultSettings,
          ...changes[STORAGE_KEYS.GLOBAL_SETTINGS].newValue,
        });
      }
    };
    
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);
  
  const updateSettings = useCallback(async (updates: Partial<GlobalSettings>) => {
    await setGlobalSettings(updates);
  }, []);
  
  return { settings, isLoading, updateSettings };
}

// ============================================================================
// Task Status Hook (Convenience)
// ============================================================================

/**
 * Get task status for active session
 */
export function useTaskStatus(): {
  status: TabSession['status'];
  actionStatus: string;
  isRunning: boolean;
  isPaused: boolean;
  isIdle: boolean;
  isError: boolean;
} {
  const { session } = useActiveSession();
  
  const status = session?.status || 'idle';
  const actionStatus = session?.actionStatus || 'idle';
  
  return {
    status,
    actionStatus,
    isRunning: status === 'running',
    isPaused: status === 'paused',
    isIdle: status === 'idle',
    isError: status === 'error',
  };
}

// ============================================================================
// Browser Tab Sync Hook
// ============================================================================

/**
 * Sync active tab with Chrome tabs API
 * Call this in the Side Panel to auto-update when user switches tabs
 */
export function useBrowserTabSync(): void {
  const { setTabId } = useActiveTabId();
  
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    
    // Get initial tab
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.id) {
        setTabId(tabs[0].id);
      }
    });
    
    // Listen for tab switches
    const handleActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      setTabId(activeInfo.tabId);
    };
    
    chrome.tabs.onActivated.addListener(handleActivated);
    return () => chrome.tabs.onActivated.removeListener(handleActivated);
  }, [setTabId]);
}
