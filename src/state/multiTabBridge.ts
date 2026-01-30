/**
 * Multi-Tab Bridge - React Hooks for Multi-Tab Task Support
 * 
 * Phase 3 Implementation: React integration for multi-tab support
 * 
 * This module provides React hooks to interact with the TabTaskManager
 * in the background service worker.
 * 
 * Reference: ARCHITECTURE_REVIEW.md §Phase 3 (Multi-tab support)
 */

import { useEffect, useState, useCallback, useMemo } from 'react';
import type {
  MultiTabState,
  TabTaskState,
  TabTaskContext,
  TabDisplayHistoryEntry,
} from '../pages/Background/TabTaskManager';
import type { ChatMessage } from '../types/chatMessage';

// Re-export types
export type { MultiTabState, TabTaskState, TabTaskContext, TabDisplayHistoryEntry };

// Storage key (must match TabTaskManager.ts)
const MULTI_TAB_STATE_KEY = 'multi_tab_task_state';

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
    autoPauseOnTabSwitch: false,
  },
};

// ============================================================================
// Commands
// ============================================================================

export type MultiTabCommand =
  | { type: 'START_TAB_TASK'; tabId: number; tabUrl: string; instructions: string; sessionId?: string }
  | { type: 'STOP_TAB_TASK'; tabId: number }
  | { type: 'PAUSE_TAB_TASK'; tabId: number; reason?: string }
  | { type: 'RESUME_TAB_TASK'; tabId: number }
  | { type: 'CLEAR_TAB_TASK'; tabId: number }
  | { type: 'GET_TAB_STATE'; tabId: number }
  | { type: 'GET_MULTI_TAB_STATE' }
  | { type: 'UPDATE_SETTINGS'; settings: Partial<MultiTabState['globalSettings']> };

type CommandResponse = 
  | { success: true; state?: MultiTabState | TabTaskState }
  | { success: false; error: string };

/**
 * Send command to background
 */
async function sendMultiTabCommand(command: MultiTabCommand): Promise<CommandResponse> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return { success: false, error: 'Chrome runtime not available' };
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'MULTI_TAB_COMMAND',
      command,
    });
    
    return response as CommandResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Multi-tab task commands
 */
export const multiTabCommands = {
  startTask: async (tabId: number, tabUrl: string, instructions: string, sessionId?: string) => {
    return sendMultiTabCommand({
      type: 'START_TAB_TASK',
      tabId,
      tabUrl,
      instructions,
      sessionId,
    });
  },
  
  stopTask: async (tabId: number) => {
    return sendMultiTabCommand({ type: 'STOP_TAB_TASK', tabId });
  },
  
  pauseTask: async (tabId: number, reason?: string) => {
    return sendMultiTabCommand({ type: 'PAUSE_TAB_TASK', tabId, reason });
  },
  
  resumeTask: async (tabId: number) => {
    return sendMultiTabCommand({ type: 'RESUME_TAB_TASK', tabId });
  },
  
  clearTask: async (tabId: number) => {
    return sendMultiTabCommand({ type: 'CLEAR_TAB_TASK', tabId });
  },
  
  getTabState: async (tabId: number) => {
    return sendMultiTabCommand({ type: 'GET_TAB_STATE', tabId });
  },
  
  getState: async () => {
    return sendMultiTabCommand({ type: 'GET_MULTI_TAB_STATE' });
  },
  
  updateSettings: async (settings: Partial<MultiTabState['globalSettings']>) => {
    return sendMultiTabCommand({ type: 'UPDATE_SETTINGS', settings });
  },
};

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook to get full multi-tab state
 */
export function useMultiTabState(): MultiTabState {
  const [state, setState] = useState<MultiTabState>(DEFAULT_MULTI_TAB_STATE);
  
  // Initial load
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) return;
    
    chrome.storage.local.get(MULTI_TAB_STATE_KEY).then((result) => {
      if (result[MULTI_TAB_STATE_KEY]) {
        setState(result[MULTI_TAB_STATE_KEY] as MultiTabState);
      }
    });
  }, []);
  
  // Subscribe to changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    
    const handleChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[MULTI_TAB_STATE_KEY]) {
        setState(changes[MULTI_TAB_STATE_KEY].newValue || DEFAULT_MULTI_TAB_STATE);
      }
    };
    
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, []);
  
  return state;
}

/**
 * Hook to get state for a specific tab
 */
export function useTabTaskState(tabId: number | null): TabTaskState {
  const multiTabState = useMultiTabState();
  
  return useMemo(() => {
    if (!tabId) return DEFAULT_TAB_TASK_STATE;
    return multiTabState.tabs[tabId] || DEFAULT_TAB_TASK_STATE;
  }, [multiTabState, tabId]);
}

/**
 * Hook to get active tab's state
 */
export function useActiveTabState(): TabTaskState | null {
  const multiTabState = useMultiTabState();
  
  return useMemo(() => {
    if (!multiTabState.activeTabId) return null;
    return multiTabState.tabs[multiTabState.activeTabId] || null;
  }, [multiTabState]);
}

/**
 * Hook to get all running tasks
 */
export function useRunningTasks(): Array<{ tabId: number; state: TabTaskState }> {
  const multiTabState = useMultiTabState();
  
  return useMemo(() => {
    return Object.entries(multiTabState.tabs)
      .filter(([, state]) => state.context?.status === 'running')
      .map(([tabId, state]) => ({
        tabId: Number(tabId),
        state,
      }));
  }, [multiTabState]);
}

/**
 * Hook to get task summary
 */
export function useTaskSummary(): {
  total: number;
  running: number;
  paused: number;
  completed: number;
  error: number;
} {
  const multiTabState = useMultiTabState();
  
  return useMemo(() => {
    const tabs = Object.values(multiTabState.tabs);
    return {
      total: tabs.length,
      running: tabs.filter((t) => t.context?.status === 'running').length,
      paused: tabs.filter((t) => t.context?.status === 'paused').length,
      completed: tabs.filter((t) => t.context?.status === 'success').length,
      error: tabs.filter((t) => t.context?.status === 'error').length,
    };
  }, [multiTabState]);
}

/**
 * Hook to get global settings
 */
export function useMultiTabSettings(): MultiTabState['globalSettings'] {
  const multiTabState = useMultiTabState();
  return multiTabState.globalSettings;
}

/**
 * Hook for managing a specific tab's task
 */
export function useTabTask(tabId: number | null) {
  const taskState = useTabTaskState(tabId);
  
  const startTask = useCallback(
    async (instructions: string, tabUrl: string, sessionId?: string) => {
      if (!tabId) return { success: false, error: 'No tab ID' };
      return multiTabCommands.startTask(tabId, tabUrl, instructions, sessionId);
    },
    [tabId]
  );
  
  const stopTask = useCallback(async () => {
    if (!tabId) return { success: false, error: 'No tab ID' };
    return multiTabCommands.stopTask(tabId);
  }, [tabId]);
  
  const pauseTask = useCallback(
    async (reason?: string) => {
      if (!tabId) return { success: false, error: 'No tab ID' };
      return multiTabCommands.pauseTask(tabId, reason);
    },
    [tabId]
  );
  
  const resumeTask = useCallback(async () => {
    if (!tabId) return { success: false, error: 'No tab ID' };
    return multiTabCommands.resumeTask(tabId);
  }, [tabId]);
  
  const clearTask = useCallback(async () => {
    if (!tabId) return { success: false, error: 'No tab ID' };
    return multiTabCommands.clearTask(tabId);
  }, [tabId]);
  
  return {
    state: taskState,
    context: taskState.context,
    messages: taskState.messages,
    displayHistory: taskState.displayHistory,
    isRunning: taskState.context?.status === 'running',
    isPaused: taskState.context?.status === 'paused',
    status: taskState.context?.status || 'idle',
    startTask,
    stopTask,
    pauseTask,
    resumeTask,
    clearTask,
  };
}

/**
 * Hook to get current tab ID
 */
export function useCurrentTabId(): number | null {
  const [tabId, setTabId] = useState<number | null>(null);
  
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.tabs) return;
    
    // Get initial tab
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      if (tabs[0]?.id) {
        setTabId(tabs[0].id);
      }
    });
    
    // Listen for tab changes
    const handleActivated = (activeInfo: chrome.tabs.TabActiveInfo) => {
      setTabId(activeInfo.tabId);
    };
    
    chrome.tabs.onActivated.addListener(handleActivated);
    return () => chrome.tabs.onActivated.removeListener(handleActivated);
  }, []);
  
  return tabId;
}

/**
 * Hook that combines current tab ID with task state
 */
export function useCurrentTabTask() {
  const tabId = useCurrentTabId();
  return useTabTask(tabId);
}
