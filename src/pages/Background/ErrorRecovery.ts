/**
 * ErrorRecovery - Comprehensive Error Recovery System
 * 
 * Phase 3 Implementation: Error recovery and resilience
 * 
 * This module provides:
 * - Automatic retry logic for transient errors
 * - State recovery after service worker restart
 * - Content script reconnection logic
 * - User-friendly error messages
 * - Error categorization and handling strategies
 * 
 * Reference: ARCHITECTURE_REVIEW.md §Phase 3 (Error recovery)
 */

// ============================================================================
// Error Categories
// ============================================================================

export enum ErrorCategory {
  /** Transient network errors - retry with backoff */
  NETWORK = 'network',
  /** Content script communication errors - attempt reconnection */
  CONTENT_SCRIPT = 'content_script',
  /** DOM extraction errors - retry or skip */
  DOM = 'dom',
  /** API errors - may need user intervention */
  API = 'api',
  /** Authentication errors - need re-auth */
  AUTH = 'auth',
  /** Tab/browser errors - may be unrecoverable */
  TAB = 'tab',
  /** Rate limiting - wait and retry */
  RATE_LIMIT = 'rate_limit',
  /** Unknown errors - log and fail gracefully */
  UNKNOWN = 'unknown',
}

export interface CategorizedError {
  category: ErrorCategory;
  originalError: Error | unknown;
  message: string;
  userMessage: string;
  retryable: boolean;
  retryDelayMs: number;
  maxRetries: number;
}

// ============================================================================
// Error Classification
// ============================================================================

/**
 * Classify an error into a category with handling strategy
 */
export function classifyError(error: unknown): CategorizedError {
  const errorMessage = error instanceof Error ? error.message : String(error);
  const lowerMessage = errorMessage.toLowerCase();
  
  // Network errors
  if (
    lowerMessage.includes('network') ||
    lowerMessage.includes('fetch') ||
    lowerMessage.includes('connection') ||
    lowerMessage.includes('timeout') ||
    lowerMessage.includes('econnrefused') ||
    lowerMessage.includes('enotfound')
  ) {
    return {
      category: ErrorCategory.NETWORK,
      originalError: error,
      message: errorMessage,
      userMessage: 'Network connection issue. Will retry automatically.',
      retryable: true,
      retryDelayMs: 2000,
      maxRetries: 3,
    };
  }
  
  // Content script errors
  if (
    lowerMessage.includes('receiving end does not exist') ||
    lowerMessage.includes('content script') ||
    lowerMessage.includes('could not establish connection') ||
    lowerMessage.includes('message port closed')
  ) {
    return {
      category: ErrorCategory.CONTENT_SCRIPT,
      originalError: error,
      message: errorMessage,
      userMessage: 'Page connection lost. Attempting to reconnect...',
      retryable: true,
      retryDelayMs: 1000,
      maxRetries: 5,
    };
  }
  
  // DOM errors
  if (
    lowerMessage.includes('queryselectorall') ||
    lowerMessage.includes('dom') ||
    lowerMessage.includes('null') ||
    lowerMessage.includes('undefined') ||
    lowerMessage.includes('documentelement')
  ) {
    return {
      category: ErrorCategory.DOM,
      originalError: error,
      message: errorMessage,
      userMessage: 'Page content not ready. Waiting for page to load...',
      retryable: true,
      retryDelayMs: 1500,
      maxRetries: 4,
    };
  }
  
  // Rate limiting
  if (
    lowerMessage.includes('rate limit') ||
    lowerMessage.includes('429') ||
    lowerMessage.includes('too many requests')
  ) {
    return {
      category: ErrorCategory.RATE_LIMIT,
      originalError: error,
      message: errorMessage,
      userMessage: 'Request rate limited. Waiting before retrying...',
      retryable: true,
      retryDelayMs: 5000,
      maxRetries: 3,
    };
  }
  
  // Authentication errors
  if (
    lowerMessage.includes('401') ||
    lowerMessage.includes('403') ||
    lowerMessage.includes('unauthorized') ||
    lowerMessage.includes('forbidden') ||
    lowerMessage.includes('authentication') ||
    lowerMessage.includes('token')
  ) {
    return {
      category: ErrorCategory.AUTH,
      originalError: error,
      message: errorMessage,
      userMessage: 'Authentication required. Please log in again.',
      retryable: false,
      retryDelayMs: 0,
      maxRetries: 0,
    };
  }
  
  // Tab errors
  if (
    lowerMessage.includes('tab') ||
    lowerMessage.includes('no active tab') ||
    lowerMessage.includes('tab not found') ||
    lowerMessage.includes('cannot access')
  ) {
    return {
      category: ErrorCategory.TAB,
      originalError: error,
      message: errorMessage,
      userMessage: 'Tab is not accessible. Please refresh the page and try again.',
      retryable: false,
      retryDelayMs: 0,
      maxRetries: 0,
    };
  }
  
  // API errors (server-side)
  if (
    lowerMessage.includes('500') ||
    lowerMessage.includes('502') ||
    lowerMessage.includes('503') ||
    lowerMessage.includes('504') ||
    lowerMessage.includes('server error') ||
    lowerMessage.includes('internal error')
  ) {
    return {
      category: ErrorCategory.API,
      originalError: error,
      message: errorMessage,
      userMessage: 'Server temporarily unavailable. Retrying...',
      retryable: true,
      retryDelayMs: 3000,
      maxRetries: 3,
    };
  }
  
  // Unknown/other errors
  return {
    category: ErrorCategory.UNKNOWN,
    originalError: error,
    message: errorMessage,
    userMessage: `An error occurred: ${errorMessage.slice(0, 100)}`,
    retryable: false,
    retryDelayMs: 0,
    maxRetries: 0,
  };
}

// ============================================================================
// Retry Logic
// ============================================================================

export interface RetryOptions {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  backoffMultiplier: number;
  onRetry?: (attempt: number, error: CategorizedError, delayMs: number) => void;
  shouldRetry?: (error: CategorizedError, attempt: number) => boolean;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
};

/**
 * Execute a function with automatic retry on failure
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: Partial<RetryOptions> = {}
): Promise<T> {
  const opts = { ...DEFAULT_RETRY_OPTIONS, ...options };
  let lastError: CategorizedError | null = null;
  
  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = classifyError(error);
      
      // Check if we should retry
      const shouldRetry = opts.shouldRetry
        ? opts.shouldRetry(lastError, attempt)
        : lastError.retryable && attempt < opts.maxRetries;
      
      if (!shouldRetry) {
        throw error;
      }
      
      // Calculate delay with exponential backoff
      const delayMs = Math.min(
        opts.baseDelayMs * Math.pow(opts.backoffMultiplier, attempt),
        opts.maxDelayMs
      );
      
      // Notify about retry
      if (opts.onRetry) {
        opts.onRetry(attempt + 1, lastError, delayMs);
      }
      
      console.log(
        `[ErrorRecovery] Retry ${attempt + 1}/${opts.maxRetries} after ${delayMs}ms: ${lastError.message}`
      );
      
      // Wait before retry
      await sleep(delayMs);
    }
  }
  
  // All retries exhausted
  throw lastError?.originalError || new Error('All retries exhausted');
}

// ============================================================================
// Content Script Recovery
// ============================================================================

/**
 * Attempt to recover content script connection
 */
export async function recoverContentScript(tabId: number): Promise<boolean> {
  console.log(`[ErrorRecovery] Attempting content script recovery for tab ${tabId}`);
  
  // Step 1: Check if tab still exists
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      console.error(`[ErrorRecovery] Tab ${tabId} no longer exists`);
      return false;
    }
    
    // Wait if tab is loading
    if (tab.status === 'loading') {
      console.log(`[ErrorRecovery] Tab ${tabId} is loading, waiting...`);
      await sleep(2000);
    }
  } catch (error) {
    console.error(`[ErrorRecovery] Tab ${tabId} not accessible:`, error);
    return false;
  }
  
  // Step 2: Try to ping existing content script
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (response?.pong) {
      console.log(`[ErrorRecovery] Content script already responding on tab ${tabId}`);
      return true;
    }
  } catch {
    // Content script not responding, continue to injection
  }
  
  // Step 3: Inject content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.bundle.js'],
    });
    console.log(`[ErrorRecovery] Injected content script into tab ${tabId}`);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    if (!msg.includes('already been injected')) {
      console.error(`[ErrorRecovery] Failed to inject content script:`, error);
      return false;
    }
  }
  
  // Step 4: Wait and verify
  await sleep(500);
  
  for (let i = 0; i < 3; i++) {
    try {
      const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
      if (response?.pong) {
        console.log(`[ErrorRecovery] Content script recovered on tab ${tabId}`);
        return true;
      }
    } catch {
      await sleep(500);
    }
  }
  
  console.error(`[ErrorRecovery] Failed to recover content script on tab ${tabId}`);
  return false;
}

// ============================================================================
// State Recovery
// ============================================================================

export interface RecoveryState {
  /** When recovery was initiated */
  timestamp: number;
  /** What triggered recovery */
  trigger: 'service_worker_restart' | 'error' | 'manual';
  /** Tasks that were recovered */
  recoveredTasks: Array<{
    tabId: number;
    status: string;
    restored: boolean;
  }>;
}

/**
 * Recover state after service worker restart
 */
export async function recoverFromServiceWorkerRestart(): Promise<RecoveryState> {
  console.log('[ErrorRecovery] Initiating state recovery after service worker restart');
  
  const recovery: RecoveryState = {
    timestamp: Date.now(),
    trigger: 'service_worker_restart',
    recoveredTasks: [],
  };
  
  try {
    // Get persisted task state
    const result = await chrome.storage.local.get([
      'background_task_state',
      'multi_tab_task_state',
    ]);
    
    // Check single-task state
    if (result.background_task_state?.context) {
      const context = result.background_task_state.context;
      if (context.status === 'running') {
        // Task was running when SW died - mark as interrupted
        console.log(`[ErrorRecovery] Found interrupted task on tab ${context.targetTabId}`);
        
        await chrome.storage.local.set({
          background_task_state: {
            ...result.background_task_state,
            context: {
              ...context,
              status: 'interrupted',
              actionStatus: 'idle',
            },
          },
        });
        
        recovery.recoveredTasks.push({
          tabId: context.targetTabId,
          status: 'interrupted',
          restored: true,
        });
      }
    }
    
    // Check multi-tab state
    if (result.multi_tab_task_state?.tabs) {
      for (const [tabIdStr, tabState] of Object.entries(result.multi_tab_task_state.tabs)) {
        const tabId = Number(tabIdStr);
        const state = tabState as { context?: { status?: string } };
        
        if (state.context?.status === 'running') {
          console.log(`[ErrorRecovery] Found interrupted multi-tab task on tab ${tabId}`);
          
          recovery.recoveredTasks.push({
            tabId,
            status: 'interrupted',
            restored: true,
          });
        }
      }
      
      // Update multi-tab state
      if (recovery.recoveredTasks.length > 0) {
        const updatedTabs = { ...result.multi_tab_task_state.tabs };
        for (const task of recovery.recoveredTasks) {
          if (updatedTabs[task.tabId]?.context) {
            updatedTabs[task.tabId] = {
              ...updatedTabs[task.tabId],
              context: {
                ...updatedTabs[task.tabId].context,
                status: 'interrupted',
                actionStatus: 'idle',
              },
            };
          }
        }
        
        await chrome.storage.local.set({
          multi_tab_task_state: {
            ...result.multi_tab_task_state,
            tabs: updatedTabs,
          },
        });
      }
    }
    
    // Notify UI about recovery
    try {
      await chrome.runtime.sendMessage({
        type: 'STATE_RECOVERED',
        recovery,
      });
    } catch {
      // UI may not be open
    }
    
  } catch (error) {
    console.error('[ErrorRecovery] State recovery failed:', error);
  }
  
  console.log(`[ErrorRecovery] Recovery complete: ${recovery.recoveredTasks.length} tasks affected`);
  return recovery;
}

// ============================================================================
// Error Logging
// ============================================================================

export interface ErrorLogEntry {
  timestamp: number;
  category: ErrorCategory;
  message: string;
  tabId?: number;
  taskId?: string;
  stack?: string;
  recovered: boolean;
}

const ERROR_LOG_KEY = 'error_log';
const MAX_ERROR_LOG_SIZE = 100;

/**
 * Log an error for debugging
 */
export async function logError(
  error: CategorizedError,
  context?: { tabId?: number; taskId?: string }
): Promise<void> {
  try {
    const result = await chrome.storage.local.get(ERROR_LOG_KEY);
    const log: ErrorLogEntry[] = result[ERROR_LOG_KEY] || [];
    
    const entry: ErrorLogEntry = {
      timestamp: Date.now(),
      category: error.category,
      message: error.message,
      tabId: context?.tabId,
      taskId: context?.taskId,
      stack: error.originalError instanceof Error ? error.originalError.stack : undefined,
      recovered: false,
    };
    
    // Add to log, keeping it bounded
    log.push(entry);
    if (log.length > MAX_ERROR_LOG_SIZE) {
      log.splice(0, log.length - MAX_ERROR_LOG_SIZE);
    }
    
    await chrome.storage.local.set({ [ERROR_LOG_KEY]: log });
  } catch {
    // Logging failed, ignore
  }
}

/**
 * Get recent errors
 */
export async function getRecentErrors(limit = 20): Promise<ErrorLogEntry[]> {
  try {
    const result = await chrome.storage.local.get(ERROR_LOG_KEY);
    const log: ErrorLogEntry[] = result[ERROR_LOG_KEY] || [];
    return log.slice(-limit);
  } catch {
    return [];
  }
}

/**
 * Clear error log
 */
export async function clearErrorLog(): Promise<void> {
  await chrome.storage.local.remove(ERROR_LOG_KEY);
}

// ============================================================================
// Utility
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
