/**
 * Task Provider - React Context for Background-Centric Task Architecture
 * 
 * This provider wraps the application and provides task state and commands
 * through React context. It bridges the gap between the background-centric
 * TaskOrchestrator and the React UI.
 * 
 * Usage:
 * 1. Wrap your app with <TaskProvider>
 * 2. Use useTask() hook in components to access state and commands
 * 
 * Reference: ARCHITECTURE_REVIEW.md §3.2 (Option B: Background-Centric Architecture)
 */

import React, { createContext, useContext, useCallback, useMemo, ReactNode } from 'react';
import { useToast } from '@chakra-ui/react';
import {
  useTaskState,
  taskCommands,
  adaptToLegacyFormat,
  type TaskState,
  type TaskContext,
  type DisplayHistoryEntry,
} from './taskBridge';
import type { ChatMessage } from '../types/chatMessage';

// ============================================================================
// Context Types
// ============================================================================

interface TaskContextValue {
  // State (reactive, updates automatically)
  state: TaskState;
  context: TaskContext | null;
  messages: ChatMessage[];
  displayHistory: DisplayHistoryEntry[];
  status: TaskContext['status'] | 'idle';
  actionStatus: TaskContext['actionStatus'] | 'idle';
  isRunning: boolean;
  isPaused: boolean;
  
  // Commands (async operations)
  startTask: (instructions: string, tabId?: number) => Promise<void>;
  stopTask: () => Promise<void>;
  pauseTask: (reason?: TaskContext['pauseReason']) => Promise<void>;
  resumeTask: () => Promise<void>;
  clearTask: () => Promise<void>;
  addUserMessage: (content: string) => Promise<void>;
  switchSession: (sessionId: string) => Promise<void>;
  
  // Legacy adapter (for backward compatibility)
  legacy: ReturnType<typeof adaptToLegacyFormat>;
}

const TaskContext = createContext<TaskContextValue | null>(null);

// ============================================================================
// Provider Component
// ============================================================================

interface TaskProviderProps {
  children: ReactNode;
}

export function TaskProvider({ children }: TaskProviderProps): JSX.Element {
  const state = useTaskState();
  const toast = useToast();
  
  // Derived state
  const context = state.context;
  const messages = state.messages;
  const displayHistory = state.displayHistory;
  const status = context?.status || 'idle';
  const actionStatus = context?.actionStatus || 'idle';
  const isRunning = status === 'running';
  const isPaused = status === 'paused';
  
  // Commands with error handling
  const startTask = useCallback(async (instructions: string, tabId?: number) => {
    const result = await taskCommands.startTask(instructions, tabId);
    if (!result.success) {
      toast({
        title: 'Failed to start task',
        description: result.error,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  }, [toast]);
  
  const stopTask = useCallback(async () => {
    const result = await taskCommands.stopTask();
    if (!result.success) {
      toast({
        title: 'Failed to stop task',
        description: result.error,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  }, [toast]);
  
  const pauseTask = useCallback(async (reason?: TaskContext['pauseReason']) => {
    const result = await taskCommands.pauseTask(reason);
    if (!result.success) {
      toast({
        title: 'Failed to pause task',
        description: result.error,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  }, [toast]);
  
  const resumeTask = useCallback(async () => {
    const result = await taskCommands.resumeTask();
    if (!result.success) {
      toast({
        title: 'Failed to resume task',
        description: result.error,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  }, [toast]);
  
  const clearTask = useCallback(async () => {
    const result = await taskCommands.clearTask();
    if (!result.success) {
      toast({
        title: 'Failed to clear task',
        description: result.error,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  }, [toast]);
  
  const addUserMessage = useCallback(async (content: string) => {
    const result = await taskCommands.addUserMessage(content);
    if (!result.success) {
      console.error('[TaskProvider] Failed to add user message:', result.error);
    }
  }, []);
  
  const switchSession = useCallback(async (sessionId: string) => {
    const result = await taskCommands.switchSession(sessionId);
    if (!result.success) {
      toast({
        title: 'Failed to switch session',
        description: result.error,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  }, [toast]);
  
  // Legacy adapter
  const legacy = useMemo(() => adaptToLegacyFormat(state), [state]);
  
  // Context value
  const value = useMemo<TaskContextValue>(() => ({
    state,
    context,
    messages,
    displayHistory,
    status,
    actionStatus,
    isRunning,
    isPaused,
    startTask,
    stopTask,
    pauseTask,
    resumeTask,
    clearTask,
    addUserMessage,
    switchSession,
    legacy,
  }), [
    state,
    context,
    messages,
    displayHistory,
    status,
    actionStatus,
    isRunning,
    isPaused,
    startTask,
    stopTask,
    pauseTask,
    resumeTask,
    clearTask,
    addUserMessage,
    switchSession,
    legacy,
  ]);
  
  return (
    <TaskContext.Provider value={value}>
      {children}
    </TaskContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

/**
 * Hook to access task state and commands
 * Must be used within a TaskProvider
 */
export function useTask(): TaskContextValue {
  const context = useContext(TaskContext);
  
  if (!context) {
    throw new Error('useTask must be used within a TaskProvider');
  }
  
  return context;
}

/**
 * Hook to check if task provider is available
 * Returns null if outside provider (useful for conditional rendering)
 */
export function useTaskOptional(): TaskContextValue | null {
  return useContext(TaskContext);
}

// ============================================================================
// Selector Hooks (Performance Optimization)
// ============================================================================

/**
 * Hook to get only the task status (minimizes re-renders)
 */
export function useTaskStatusOnly(): {
  status: TaskContext['status'] | 'idle';
  actionStatus: TaskContext['actionStatus'] | 'idle';
  isRunning: boolean;
  isPaused: boolean;
} {
  const { status, actionStatus, isRunning, isPaused } = useTask();
  return { status, actionStatus, isRunning, isPaused };
}

/**
 * Hook to get only the messages (minimizes re-renders)
 */
export function useTaskMessagesOnly(): ChatMessage[] {
  const { messages } = useTask();
  return messages;
}

/**
 * Hook to get only the display history (minimizes re-renders)
 */
export function useTaskHistoryOnly(): DisplayHistoryEntry[] {
  const { displayHistory } = useTask();
  return displayHistory;
}

/**
 * Hook to get only the task commands (never changes)
 */
export function useTaskCommands(): Pick<
  TaskContextValue,
  'startTask' | 'stopTask' | 'pauseTask' | 'resumeTask' | 'clearTask' | 'addUserMessage' | 'switchSession'
> {
  const { startTask, stopTask, pauseTask, resumeTask, clearTask, addUserMessage, switchSession } = useTask();
  return { startTask, stopTask, pauseTask, resumeTask, clearTask, addUserMessage, switchSession };
}
