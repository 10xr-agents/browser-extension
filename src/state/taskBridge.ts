/**
 * Task Bridge - Bridges UI to Background TaskOrchestrator
 * 
 * This module provides a React-friendly interface to the background-centric
 * TaskOrchestrator. It handles:
 * - Subscribing to chrome.storage.local changes
 * - Sending commands to background via chrome.runtime.sendMessage
 * - Converting storage state to UI-friendly format
 * 
 * Usage:
 * 1. Use `useTaskState()` hook to get reactive task state
 * 2. Use `taskCommands` object to send commands to background
 * 
 * Reference: ARCHITECTURE_REVIEW.md §3.2 (Option B: Background-Centric Architecture)
 */

import { useEffect, useState, useCallback } from 'react';
import type { 
  TaskState, 
  TaskContext, 
  DisplayHistoryEntry,
  TaskCommand,
  TaskCommandResponse,
} from '../pages/Background/TaskOrchestrator';
import type { ChatMessage } from '../types/chatMessage';

// Re-export types for convenience
export type { TaskState, TaskContext, DisplayHistoryEntry };

// ============================================================================
// Storage Keys (must match TaskOrchestrator.ts)
// ============================================================================

const STORAGE_KEY = 'background_task_state';

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_TASK_STATE: TaskState = {
  context: null,
  displayHistory: [],
  messages: [],
  virtualElementCoordinates: {},
};

// ============================================================================
// State Fetching
// ============================================================================

/**
 * Get current task state from chrome.storage.local
 */
export async function getTaskStateFromStorage(): Promise<TaskState> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      console.warn('[TaskBridge] Chrome storage not available');
      return DEFAULT_TASK_STATE;
    }
    
    const result = await chrome.storage.local.get(STORAGE_KEY);
    return result[STORAGE_KEY] || DEFAULT_TASK_STATE;
  } catch (error) {
    console.error('[TaskBridge] Failed to get task state:', error);
    return DEFAULT_TASK_STATE;
  }
}

// ============================================================================
// Commands - Send to Background
// ============================================================================

/**
 * Send a command to the background TaskOrchestrator
 */
async function sendCommand(command: TaskCommand): Promise<TaskCommandResponse> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      console.error('[TaskBridge] Chrome runtime not available');
      return { success: false, error: 'Chrome runtime not available' };
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'TASK_COMMAND',
      command,
    });
    
    return response as TaskCommandResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[TaskBridge] Command failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Task commands that can be called from UI components
 */
export const taskCommands = {
  /**
   * Start a new task on the specified tab (or active tab if not specified)
   */
  startTask: async (instructions: string, tabId?: number): Promise<TaskCommandResponse> => {
    console.log('[TaskBridge] Starting task:', { instructions: instructions.slice(0, 50) + '...', tabId });
    return sendCommand({ type: 'START_TASK', instructions, tabId });
  },
  
  /**
   * Stop the current task
   */
  stopTask: async (): Promise<TaskCommandResponse> => {
    console.log('[TaskBridge] Stopping task');
    return sendCommand({ type: 'STOP_TASK' });
  },
  
  /**
   * Pause the current task
   */
  pauseTask: async (reason?: TaskContext['pauseReason']): Promise<TaskCommandResponse> => {
    console.log('[TaskBridge] Pausing task:', reason);
    return sendCommand({ type: 'PAUSE_TASK', reason: reason || 'navigation' });
  },
  
  /**
   * Resume a paused task
   */
  resumeTask: async (): Promise<TaskCommandResponse> => {
    console.log('[TaskBridge] Resuming task');
    return sendCommand({ type: 'RESUME_TASK' });
  },
  
  /**
   * Clear task state
   */
  clearTask: async (): Promise<TaskCommandResponse> => {
    console.log('[TaskBridge] Clearing task');
    return sendCommand({ type: 'CLEAR_TASK' });
  },
  
  /**
   * Get current state (for one-time read without subscription)
   */
  getState: async (): Promise<TaskCommandResponse> => {
    return sendCommand({ type: 'GET_STATE' });
  },
  
  /**
   * Add a user message to the conversation
   */
  addUserMessage: async (content: string): Promise<TaskCommandResponse> => {
    console.log('[TaskBridge] Adding user message');
    return sendCommand({ type: 'ADD_USER_MESSAGE', content });
  },
  
  /**
   * Switch to a different session
   */
  switchSession: async (sessionId: string): Promise<TaskCommandResponse> => {
    console.log('[TaskBridge] Switching session:', sessionId);
    return sendCommand({ type: 'SWITCH_SESSION', sessionId });
  },
};

// ============================================================================
// React Hook - Reactive State Subscription
// ============================================================================

/**
 * React hook to subscribe to task state changes
 * Returns the current task state and updates automatically when storage changes
 */
export function useTaskState(): TaskState {
  const [state, setState] = useState<TaskState>(DEFAULT_TASK_STATE);
  
  // Initial load
  useEffect(() => {
    getTaskStateFromStorage().then(setState);
  }, []);
  
  // Subscribe to storage changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
      return;
    }
    
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      
      if (changes[STORAGE_KEY]) {
        const newValue = changes[STORAGE_KEY].newValue as TaskState | undefined;
        setState(newValue || DEFAULT_TASK_STATE);
      }
    };
    
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);
  
  return state;
}

/**
 * React hook to get just the task context (convenience wrapper)
 */
export function useTaskContext(): TaskContext | null {
  const state = useTaskState();
  return state.context;
}

/**
 * React hook to get just the messages (convenience wrapper)
 */
export function useTaskMessages(): ChatMessage[] {
  const state = useTaskState();
  return state.messages;
}

/**
 * React hook to get just the display history (convenience wrapper)
 */
export function useTaskDisplayHistory(): DisplayHistoryEntry[] {
  const state = useTaskState();
  return state.displayHistory;
}

/**
 * React hook for task status (convenience wrapper)
 */
export function useTaskStatus(): TaskContext['status'] | 'idle' {
  const context = useTaskContext();
  return context?.status || 'idle';
}

/**
 * React hook for action status (convenience wrapper)
 */
export function useTaskActionStatus(): TaskContext['actionStatus'] | 'idle' {
  const context = useTaskContext();
  return context?.actionStatus || 'idle';
}

// ============================================================================
// Adapter Functions - Bridge to Legacy Interface
// ============================================================================

/**
 * Convert TaskState to the legacy CurrentTaskSlice format
 * This allows existing components to work with the new architecture
 */
export function adaptToLegacyFormat(state: TaskState): {
  tabId: number;
  instructions: string | null;
  taskId: string | null;
  sessionId: string | null;
  displayHistory: DisplayHistoryEntry[];
  messages: ChatMessage[];
  status: 'idle' | 'running' | 'success' | 'error' | 'interrupted';
  actionStatus: string;
  currentStep: number | null;
  totalSteps: number | null;
  orchestratorStatus: string | null;
  hasOrgKnowledge: boolean | null;
  url: string | null;
} {
  const context = state.context;
  
  return {
    tabId: context?.targetTabId || -1,
    instructions: context?.instructions || null,
    taskId: context?.taskId || null,
    sessionId: context?.sessionId || null,
    displayHistory: state.displayHistory,
    messages: state.messages,
    status: context?.status || 'idle',
    actionStatus: context?.actionStatus || 'idle',
    currentStep: context?.currentStep || null,
    totalSteps: context?.totalSteps || null,
    orchestratorStatus: context?.orchestratorStatus || null,
    hasOrgKnowledge: context?.hasOrgKnowledge ?? null,
    url: context?.currentUrl || null,
  };
}

/**
 * Hook that provides the legacy CurrentTaskSlice format
 * Use this for backward compatibility with existing components
 */
export function useLegacyTaskState() {
  const state = useTaskState();
  return adaptToLegacyFormat(state);
}

// ============================================================================
// Feature Flag - Enable/Disable New Architecture
// ============================================================================

/**
 * Check if the new background-centric architecture is enabled
 * This can be controlled via chrome.storage.local for gradual rollout
 */
export async function isBackgroundArchitectureEnabled(): Promise<boolean> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return false;
    }
    
    const result = await chrome.storage.local.get('useBackgroundArchitecture');
    // Default to true for Phase 2
    return result.useBackgroundArchitecture !== false;
  } catch (error) {
    return false;
  }
}

/**
 * Enable or disable the new background-centric architecture
 */
export async function setBackgroundArchitectureEnabled(enabled: boolean): Promise<void> {
  try {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }
    
    await chrome.storage.local.set({ useBackgroundArchitecture: enabled });
    console.log(`[TaskBridge] Background architecture ${enabled ? 'enabled' : 'disabled'}`);
  } catch (error) {
    console.error('[TaskBridge] Failed to set architecture flag:', error);
  }
}
