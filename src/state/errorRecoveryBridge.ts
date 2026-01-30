/**
 * Error Recovery Bridge - React Hooks for Error Recovery
 * 
 * Phase 3 Implementation: React integration for error recovery
 * 
 * This module provides React hooks to interact with the ErrorRecovery
 * system in the background service worker.
 * 
 * Reference: ARCHITECTURE_REVIEW.md §Phase 3 (Error recovery)
 */

import { useEffect, useState, useCallback } from 'react';
import type { ErrorLogEntry, CategorizedError, ErrorCategory } from '../pages/Background/ErrorRecovery';

// Re-export types
export type { ErrorLogEntry, CategorizedError, ErrorCategory };

// Storage key (must match ErrorRecovery.ts)
const ERROR_LOG_KEY = 'error_log';

// ============================================================================
// Commands
// ============================================================================

export type ErrorRecoveryCommand =
  | { type: 'GET_RECENT_ERRORS'; limit?: number }
  | { type: 'CLEAR_ERROR_LOG' }
  | { type: 'RECOVER_CONTENT_SCRIPT'; tabId: number }
  | { type: 'RECOVER_FROM_RESTART' };

type CommandResponse =
  | { success: true; data?: unknown }
  | { success: false; error: string };

/**
 * Send command to background
 */
async function sendErrorRecoveryCommand(command: ErrorRecoveryCommand): Promise<CommandResponse> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      return { success: false, error: 'Chrome runtime not available' };
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'ERROR_RECOVERY_COMMAND',
      command,
    });
    
    return response as CommandResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    return { success: false, error: errorMessage };
  }
}

/**
 * Error recovery commands
 */
export const errorRecoveryCommands = {
  getRecentErrors: async (limit = 20) => {
    return sendErrorRecoveryCommand({ type: 'GET_RECENT_ERRORS', limit });
  },
  
  clearErrorLog: async () => {
    return sendErrorRecoveryCommand({ type: 'CLEAR_ERROR_LOG' });
  },
  
  recoverContentScript: async (tabId: number) => {
    return sendErrorRecoveryCommand({ type: 'RECOVER_CONTENT_SCRIPT', tabId });
  },
  
  recoverFromRestart: async () => {
    return sendErrorRecoveryCommand({ type: 'RECOVER_FROM_RESTART' });
  },
};

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook to get recent errors
 */
export function useRecentErrors(limit = 20): {
  errors: ErrorLogEntry[];
  isLoading: boolean;
  refresh: () => Promise<void>;
  clear: () => Promise<void>;
} {
  const [errors, setErrors] = useState<ErrorLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  
  const loadErrors = useCallback(async () => {
    setIsLoading(true);
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) {
        setErrors([]);
        return;
      }
      
      const result = await chrome.storage.local.get(ERROR_LOG_KEY);
      const log = (result[ERROR_LOG_KEY] || []) as ErrorLogEntry[];
      setErrors(log.slice(-limit));
    } catch (error) {
      console.error('[useRecentErrors] Failed to load errors:', error);
      setErrors([]);
    } finally {
      setIsLoading(false);
    }
  }, [limit]);
  
  // Initial load
  useEffect(() => {
    loadErrors();
  }, [loadErrors]);
  
  // Subscribe to changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) return;
    
    const handleChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      if (changes[ERROR_LOG_KEY]) {
        const log = (changes[ERROR_LOG_KEY].newValue || []) as ErrorLogEntry[];
        setErrors(log.slice(-limit));
      }
    };
    
    chrome.storage.onChanged.addListener(handleChange);
    return () => chrome.storage.onChanged.removeListener(handleChange);
  }, [limit]);
  
  const clear = useCallback(async () => {
    await errorRecoveryCommands.clearErrorLog();
    setErrors([]);
  }, []);
  
  return {
    errors,
    isLoading,
    refresh: loadErrors,
    clear,
  };
}

/**
 * Hook to get error statistics
 */
export function useErrorStats(): {
  total: number;
  byCategory: Record<string, number>;
  recentCount: number; // Errors in last hour
} {
  const { errors } = useRecentErrors(100);
  
  const total = errors.length;
  
  const byCategory = errors.reduce((acc, error) => {
    acc[error.category] = (acc[error.category] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  const recentCount = errors.filter((e) => e.timestamp > oneHourAgo).length;
  
  return { total, byCategory, recentCount };
}

/**
 * Hook to handle state recovery notification
 */
export function useStateRecoveryListener(
  onRecovery: (recovery: {
    timestamp: number;
    trigger: string;
    recoveredTasks: Array<{ tabId: number; status: string; restored: boolean }>;
  }) => void
): void {
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    
    const handleMessage = (message: { type: string; recovery?: unknown }) => {
      if (message.type === 'STATE_RECOVERED' && message.recovery) {
        onRecovery(message.recovery as {
          timestamp: number;
          trigger: string;
          recoveredTasks: Array<{ tabId: number; status: string; restored: boolean }>;
        });
      }
      return false;
    };
    
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [onRecovery]);
}

/**
 * Hook to manually trigger content script recovery
 */
export function useContentScriptRecovery(): {
  recover: (tabId: number) => Promise<boolean>;
  isRecovering: boolean;
} {
  const [isRecovering, setIsRecovering] = useState(false);
  
  const recover = useCallback(async (tabId: number) => {
    setIsRecovering(true);
    try {
      const result = await errorRecoveryCommands.recoverContentScript(tabId);
      return result.success;
    } finally {
      setIsRecovering(false);
    }
  }, []);
  
  return { recover, isRecovering };
}

/**
 * Hook to show error toast notifications
 */
export function useErrorNotifications(
  showToast: (options: {
    title: string;
    description: string;
    status: 'error' | 'warning' | 'info';
    duration?: number;
    isClosable?: boolean;
  }) => void
): void {
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) return;
    
    const handleMessage = (message: { type: string; error?: CategorizedError }) => {
      if (message.type === 'ERROR_NOTIFICATION' && message.error) {
        showToast({
          title: getCategoryTitle(message.error.category as ErrorCategory),
          description: message.error.userMessage,
          status: message.error.retryable ? 'warning' : 'error',
          duration: 5000,
          isClosable: true,
        });
      }
      return false;
    };
    
    chrome.runtime.onMessage.addListener(handleMessage);
    return () => chrome.runtime.onMessage.removeListener(handleMessage);
  }, [showToast]);
}

// ============================================================================
// Helpers
// ============================================================================

function getCategoryTitle(category: ErrorCategory): string {
  const titles: Record<ErrorCategory, string> = {
    network: 'Network Error',
    content_script: 'Page Connection Error',
    dom: 'Page Content Error',
    api: 'Server Error',
    auth: 'Authentication Error',
    tab: 'Tab Error',
    rate_limit: 'Rate Limited',
    unknown: 'Error',
  };
  return titles[category] || 'Error';
}

// Import ErrorCategory enum for type checking
type ErrorCategory = 'network' | 'content_script' | 'dom' | 'api' | 'auth' | 'tab' | 'rate_limit' | 'unknown';
