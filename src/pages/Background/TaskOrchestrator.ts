/**
 * TaskOrchestrator - Background-Centric Task Management
 * 
 * This module owns all task state and orchestration logic, running in the
 * background service worker. The side panel becomes a pure UI renderer.
 * 
 * Architecture Benefits:
 * - Service worker survives side panel close/reopen
 * - Single source of truth in chrome.storage.local
 * - Explicit tab targeting (no assumptions about active tab)
 * - Content script lifecycle managed centrally
 * 
 * Reference: ARCHITECTURE_REVIEW.md §3.2 (Option B: Background-Centric Architecture)
 */

import type { ChatMessage, ActionStep } from '../../types/chatMessage';
import type { ParsedAction } from '../../helpers/parseAction';
import { getSimplifiedDom } from '../../helpers/simplifyDom';

// ============================================================================
// Storage Schema
// ============================================================================

/**
 * Task context stored in chrome.storage.local
 * This is the single source of truth for task state
 */
export interface TaskContext {
  /** The tab we're automating - ALWAYS explicit, never assumed */
  targetTabId: number;
  /** Backend session ID */
  sessionId: string | null;
  /** Current task ID within session */
  taskId: string | null;
  /** Task status */
  status: 'idle' | 'running' | 'paused' | 'success' | 'error' | 'interrupted';
  /** Why task is paused (if status is 'paused') */
  pauseReason?: 'tab_switched' | 'user_input_needed' | 'navigation';
  /** Current action status for UI display */
  actionStatus: 
    | 'idle'
    | 'attaching-debugger'
    | 'pulling-dom'
    | 'transforming-dom'
    | 'performing-query'
    | 'performing-action'
    | 'waiting';
  /** User's task instructions */
  instructions: string;
  /** URL where task started */
  startUrl: string;
  /** Current URL (may differ after navigation) */
  currentUrl: string;
  /** When task started */
  startedAt: number;
  /** Last activity timestamp */
  lastActivityAt: number;
  /** Current step number (1-indexed) */
  currentStep: number | null;
  /** Total steps in plan */
  totalSteps: number | null;
  /** Orchestrator status from server */
  orchestratorStatus: 'planning' | 'executing' | 'verifying' | 'correcting' | 'completed' | 'failed' | null;
  /** Whether org knowledge is available */
  hasOrgKnowledge: boolean | null;
}

/**
 * Display history entry for UI
 */
export interface DisplayHistoryEntry {
  thought: string;
  action: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  parsedAction: ParsedAction;
  expectedOutcome?: string;
  domChanges?: {
    added: string[];
    removed: string[];
    modified: string[];
    summary: string;
    urlChanged: boolean;
    oldUrl?: string;
    newUrl?: string;
  };
}

/**
 * Full task state stored in chrome.storage.local
 */
export interface TaskState {
  context: TaskContext | null;
  displayHistory: DisplayHistoryEntry[];
  messages: ChatMessage[];
  /** Virtual element coordinates for click handling */
  virtualElementCoordinates: Record<number, { x: number; y: number }>;
}

// Storage keys
export const STORAGE_KEYS = {
  TASK_STATE: 'background_task_state',
  PUSHER_STATE: 'background_pusher_state',
} as const;

// ============================================================================
// Default State
// ============================================================================

export const DEFAULT_TASK_STATE: TaskState = {
  context: null,
  displayHistory: [],
  messages: [],
  virtualElementCoordinates: {},
};

// ============================================================================
// Storage Helpers
// ============================================================================

/**
 * Get current task state from chrome.storage.local
 */
export async function getTaskState(): Promise<TaskState> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEYS.TASK_STATE);
    return result[STORAGE_KEYS.TASK_STATE] || DEFAULT_TASK_STATE;
  } catch (error) {
    console.error('[TaskOrchestrator] Failed to get task state:', error);
    return DEFAULT_TASK_STATE;
  }
}

/**
 * Update task state in chrome.storage.local
 * UI components listen to storage changes and update reactively
 */
export async function setTaskState(state: TaskState): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEYS.TASK_STATE]: state });
  } catch (error) {
    console.error('[TaskOrchestrator] Failed to set task state:', error);
    throw error;
  }
}

/**
 * Update partial task state (merge with existing)
 */
export async function updateTaskState(
  updates: Partial<TaskState> | ((state: TaskState) => Partial<TaskState>)
): Promise<TaskState> {
  const currentState = await getTaskState();
  const newUpdates = typeof updates === 'function' ? updates(currentState) : updates;
  const newState = { ...currentState, ...newUpdates };
  await setTaskState(newState);
  return newState;
}

/**
 * Update task context only
 */
export async function updateTaskContext(
  updates: Partial<TaskContext> | ((context: TaskContext | null) => Partial<TaskContext>)
): Promise<TaskState> {
  const currentState = await getTaskState();
  const currentContext = currentState.context;
  
  if (!currentContext && typeof updates === 'function') {
    console.warn('[TaskOrchestrator] Cannot update null context with function');
    return currentState;
  }
  
  const newUpdates = typeof updates === 'function' ? updates(currentContext) : updates;
  const newContext = currentContext 
    ? { ...currentContext, ...newUpdates }
    : null;
  
  const newState = { ...currentState, context: newContext };
  await setTaskState(newState);
  return newState;
}

/**
 * Clear task state (reset to default)
 */
export async function clearTaskState(): Promise<void> {
  await setTaskState(DEFAULT_TASK_STATE);
}

// ============================================================================
// Content Script Management
// ============================================================================

/**
 * Ensure content script is loaded and responsive on a specific tab
 * Returns true if ready, false if failed
 */
export async function ensureContentScriptReady(tabId: number): Promise<boolean> {
  console.log(`[TaskOrchestrator] Ensuring content script ready on tab ${tabId}`);
  
  // Step 1: Check if tab exists and is ready
  try {
    const tab = await chrome.tabs.get(tabId);
    if (!tab) {
      console.error(`[TaskOrchestrator] Tab ${tabId} does not exist`);
      return false;
    }
    
    // Wait for tab to finish loading if needed
    if (tab.status === 'loading') {
      console.log(`[TaskOrchestrator] Tab ${tabId} is loading, waiting...`);
      await new Promise(resolve => setTimeout(resolve, 1000));
      
      // Re-check status
      const updatedTab = await chrome.tabs.get(tabId);
      if (updatedTab.status === 'loading') {
        // Wait longer
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    // Check URL is valid
    if (!tab.url || (!tab.url.startsWith('http://') && !tab.url.startsWith('https://'))) {
      console.error(`[TaskOrchestrator] Tab ${tabId} has invalid URL: ${tab.url}`);
      return false;
    }
  } catch (error) {
    console.error(`[TaskOrchestrator] Tab ${tabId} does not exist:`, error);
    return false;
  }
  
  // Step 2: Try to ping content script
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (response?.pong) {
      console.log(`[TaskOrchestrator] Content script already loaded on tab ${tabId}`);
      return true;
    }
  } catch (error) {
    // Content script not loaded, need to inject
    console.log(`[TaskOrchestrator] Content script not loaded on tab ${tabId}, injecting...`);
  }
  
  // Step 3: Inject content script
  try {
    await chrome.scripting.executeScript({
      target: { tabId },
      files: ['contentScript.bundle.js'],
    });
    console.log(`[TaskOrchestrator] Injected content script on tab ${tabId}`);
  } catch (error) {
    console.error(`[TaskOrchestrator] Failed to inject content script on tab ${tabId}:`, error);
    return false;
  }
  
  // Step 4: Wait and verify
  await new Promise(resolve => setTimeout(resolve, 200));
  
  try {
    const response = await chrome.tabs.sendMessage(tabId, { type: 'ping' });
    if (response?.pong) {
      console.log(`[TaskOrchestrator] Content script verified on tab ${tabId}`);
      return true;
    }
  } catch (error) {
    console.error(`[TaskOrchestrator] Content script verification failed on tab ${tabId}:`, error);
  }
  
  return false;
}

/**
 * Call RPC method on content script with explicit tabId
 */
export async function callContentScript<T>(
  tabId: number,
  method: string,
  payload: unknown[] = [],
  maxRetries = 3
): Promise<T | null> {
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    // Ensure content script is ready before each attempt
    const isReady = await ensureContentScriptReady(tabId);
    if (!isReady) {
      console.warn(`[TaskOrchestrator] Content script not ready on attempt ${attempt + 1}`);
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (attempt + 1)));
        continue;
      }
      return null;
    }
    
    try {
      const response = await chrome.tabs.sendMessage(tabId, {
        type: method,
        payload,
      });
      return response as T;
    } catch (error) {
      console.warn(`[TaskOrchestrator] RPC ${method} failed on attempt ${attempt + 1}:`, error);
      if (attempt < maxRetries - 1) {
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
      }
    }
  }
  
  return null;
}

// ============================================================================
// Task Commands (Called from UI via chrome.runtime.sendMessage)
// ============================================================================

export type TaskCommand = 
  | { type: 'START_TASK'; instructions: string; tabId?: number }
  | { type: 'STOP_TASK' }
  | { type: 'PAUSE_TASK'; reason: TaskContext['pauseReason'] }
  | { type: 'RESUME_TASK' }
  | { type: 'CLEAR_TASK' }
  | { type: 'GET_STATE' }
  | { type: 'ADD_USER_MESSAGE'; content: string }
  | { type: 'SWITCH_SESSION'; sessionId: string };

export type TaskCommandResponse = 
  | { success: true; state?: TaskState }
  | { success: false; error: string };

/**
 * Handle task command from UI
 */
export async function handleTaskCommand(
  command: TaskCommand
): Promise<TaskCommandResponse> {
  console.log('[TaskOrchestrator] Handling command:', command.type);
  
  try {
    switch (command.type) {
      case 'START_TASK':
        return await startTask(command.instructions, command.tabId);
      
      case 'STOP_TASK':
        return await stopTask();
      
      case 'PAUSE_TASK':
        return await pauseTask(command.reason);
      
      case 'RESUME_TASK':
        return await resumeTask();
      
      case 'CLEAR_TASK':
        await clearTaskState();
        return { success: true, state: DEFAULT_TASK_STATE };
      
      case 'GET_STATE':
        const state = await getTaskState();
        return { success: true, state };
      
      case 'ADD_USER_MESSAGE':
        return await addUserMessage(command.content);
      
      case 'SWITCH_SESSION':
        return await switchSession(command.sessionId);
      
      default:
        return { success: false, error: `Unknown command: ${(command as TaskCommand).type}` };
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[TaskOrchestrator] Command failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

// ============================================================================
// Task Operations
// ============================================================================

/**
 * Start a new task
 */
async function startTask(
  instructions: string,
  explicitTabId?: number
): Promise<TaskCommandResponse> {
  console.log('[TaskOrchestrator] Starting task:', { instructions: instructions.slice(0, 50) + '...' });
  
  // Get target tab - explicit if provided, otherwise active tab
  let targetTabId: number;
  let targetUrl: string;
  
  if (explicitTabId) {
    targetTabId = explicitTabId;
    try {
      const tab = await chrome.tabs.get(explicitTabId);
      targetUrl = tab.url || '';
    } catch (error) {
      return { success: false, error: `Tab ${explicitTabId} does not exist` };
    }
  } else {
    const [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!activeTab?.id || !activeTab?.url) {
      return { success: false, error: 'No active tab found' };
    }
    targetTabId = activeTab.id;
    targetUrl = activeTab.url;
  }
  
  // Validate URL
  if (!targetUrl.startsWith('http://') && !targetUrl.startsWith('https://')) {
    return { success: false, error: 'Current page is not a valid web page' };
  }
  
  console.log(`[TaskOrchestrator] Target tab: ${targetTabId}, URL: ${targetUrl}`);
  
  // Verify content script is ready
  const isReady = await ensureContentScriptReady(targetTabId);
  if (!isReady) {
    return { success: false, error: 'Content script is not loaded on this page. Try refreshing.' };
  }
  
  // Get current state to preserve sessionId if continuing
  const currentState = await getTaskState();
  const existingSessionId = currentState.context?.sessionId || null;
  
  // Create new task context
  const now = Date.now();
  const context: TaskContext = {
    targetTabId,
    sessionId: existingSessionId,
    taskId: null, // Will be set after first API call
    status: 'running',
    actionStatus: 'attaching-debugger',
    instructions,
    startUrl: targetUrl,
    currentUrl: targetUrl,
    startedAt: now,
    lastActivityAt: now,
    currentStep: null,
    totalSteps: null,
    orchestratorStatus: null,
    hasOrgKnowledge: null,
  };
  
  // Generate user message ID
  const userMessageId = generateMessageId();
  const userMessage: ChatMessage = {
    id: userMessageId,
    role: 'user',
    content: instructions,
    status: 'sent',
    timestamp: new Date(),
  };
  
  // Update state
  const newState: TaskState = {
    context,
    displayHistory: [],
    messages: [...currentState.messages, userMessage],
    virtualElementCoordinates: {},
  };
  
  await setTaskState(newState);
  
  // Start keep-alive heartbeat
  startKeepAlive();
  
  // Start the task loop (runs asynchronously)
  runTaskLoop(targetTabId).catch((error) => {
    console.error('[TaskOrchestrator] Task loop error:', error);
    updateTaskContext({ status: 'error' });
    stopKeepAlive();
  });
  
  return { success: true, state: newState };
}

/**
 * Stop the current task
 */
async function stopTask(): Promise<TaskCommandResponse> {
  console.log('[TaskOrchestrator] Stopping task');
  
  const state = await getTaskState();
  if (!state.context) {
    return { success: true };
  }
  
  // Update status to interrupted
  const newState = await updateTaskContext({
    status: 'interrupted',
    actionStatus: 'idle',
  });
  
  // Stop keep-alive
  stopKeepAlive();
  
  // Detach debugger
  if (state.context.targetTabId) {
    try {
      await chrome.debugger.detach({ tabId: state.context.targetTabId });
    } catch (error) {
      // Debugger may already be detached
    }
  }
  
  return { success: true, state: newState };
}

/**
 * Pause the current task
 */
async function pauseTask(reason?: TaskContext['pauseReason']): Promise<TaskCommandResponse> {
  console.log('[TaskOrchestrator] Pausing task:', reason);
  
  const newState = await updateTaskContext({
    status: 'paused',
    pauseReason: reason,
    actionStatus: 'idle',
  });
  
  return { success: true, state: newState };
}

/**
 * Resume a paused task
 */
async function resumeTask(): Promise<TaskCommandResponse> {
  console.log('[TaskOrchestrator] Resuming task');
  
  const state = await getTaskState();
  if (!state.context || state.context.status !== 'paused') {
    return { success: false, error: 'No paused task to resume' };
  }
  
  const newState = await updateTaskContext({
    status: 'running',
    pauseReason: undefined,
    lastActivityAt: Date.now(),
  });
  
  // Start keep-alive and resume loop
  startKeepAlive();
  runTaskLoop(state.context.targetTabId).catch((error) => {
    console.error('[TaskOrchestrator] Task loop error:', error);
    updateTaskContext({ status: 'error' });
    stopKeepAlive();
  });
  
  return { success: true, state: newState };
}

/**
 * Add user message
 */
async function addUserMessage(content: string): Promise<TaskCommandResponse> {
  const state = await getTaskState();
  
  const userMessage: ChatMessage = {
    id: generateMessageId(),
    role: 'user',
    content,
    status: 'sent',
    timestamp: new Date(),
  };
  
  const newState = await updateTaskState({
    messages: [...state.messages, userMessage],
  });
  
  return { success: true, state: newState };
}

/**
 * Switch to a different session
 */
async function switchSession(sessionId: string): Promise<TaskCommandResponse> {
  console.log('[TaskOrchestrator] Switching to session:', sessionId);
  
  // Stop current task if running
  const state = await getTaskState();
  if (state.context?.status === 'running') {
    await stopTask();
  }
  
  // Update session ID, clear task-specific state
  const newState = await updateTaskState({
    context: state.context ? {
      ...state.context,
      sessionId,
      taskId: null,
      status: 'idle',
    } : null,
    displayHistory: [],
    messages: [], // Will be loaded from API
    virtualElementCoordinates: {},
  });
  
  return { success: true, state: newState };
}

// ============================================================================
// Task Loop (Core Automation Logic)
// ============================================================================

/**
 * Main task loop - extracts DOM, calls API, executes actions
 * This runs in the background and updates storage which triggers UI updates
 */
async function runTaskLoop(tabId: number): Promise<void> {
  console.log(`[TaskOrchestrator] Starting task loop on tab ${tabId}`);
  
  const MAX_ACTIONS = 50;
  let actionCount = 0;
  
  while (actionCount < MAX_ACTIONS) {
    // Check if we should stop
    const state = await getTaskState();
    if (!state.context || state.context.status !== 'running') {
      console.log('[TaskOrchestrator] Task loop stopped (status changed)');
      break;
    }
    
    // Update current tab URL (may have changed after action)
    try {
      const tab = await chrome.tabs.get(tabId);
      if (tab.url !== state.context.currentUrl) {
        console.log(`[TaskOrchestrator] URL changed: ${state.context.currentUrl} -> ${tab.url}`);
        await updateTaskContext({ currentUrl: tab.url || state.context.currentUrl });
        
        // Wait for navigation to complete
        if (tab.status === 'loading') {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      }
    } catch (error) {
      console.error('[TaskOrchestrator] Failed to get tab info:', error);
      await updateTaskContext({ status: 'error' });
      break;
    }
    
    // Step 1: Extract DOM (CDP-first architecture)
    await updateTaskContext({ actionStatus: 'pulling-dom' });

    const domResult = await getSimplifiedDom(tabId);
    if (!domResult) {
      console.error('[TaskOrchestrator] Failed to extract DOM via CDP');
      await addDisplayHistoryEntry({
        thought: 'Error: Failed to extract page content.',
        action: '',
        parsedAction: { error: 'DOM extraction failed' },
      });
      await updateTaskContext({ status: 'error' });
      break;
    }

    // Step 2: Transform DOM
    await updateTaskContext({ actionStatus: 'transforming-dom' });

    // Use CDP result if available, otherwise fall back to annotated HTML
    let templateDom: string;
    if (domResult.cdpResult) {
      // CDP-first: Use semantic tree JSON for API
      templateDom = JSON.stringify({
        mode: 'semantic',
        tree: domResult.cdpResult.interactiveTree,
        meta: domResult.cdpResult.meta,
      });
      console.log('[TaskOrchestrator] Using CDP semantic tree', {
        nodeCount: domResult.cdpResult.meta.nodeCount,
      });
    } else {
      // Fallback: templatize the annotated HTML
      const { default: templatize } = await import('../../helpers/shrinkHTML/templatize');
      templateDom = templatize(domResult.annotatedDomHtml);
    }
    
    // Step 3: Call API
    await updateTaskContext({ actionStatus: 'performing-query' });
    
    const updatedState = await getTaskState();
    if (!updatedState.context) break;
    
    // Import API client dynamically
    const { apiClient } = await import('../../api/client');
    
    try {
      const response = await apiClient.interact({
        sessionId: updatedState.context.sessionId || undefined,
        taskId: updatedState.context.taskId || undefined,
        url: updatedState.context.currentUrl,
        dom: templateDom,
        instructions: updatedState.context.instructions,
        // Add other fields as needed
      });
      
      // Update taskId and sessionId from response
      await updateTaskContext({
        taskId: response.taskId || updatedState.context.taskId,
        sessionId: response.sessionId || updatedState.context.sessionId,
        currentStep: response.currentStep || null,
        totalSteps: response.totalSteps || null,
        orchestratorStatus: response.status as TaskContext['orchestratorStatus'] || null,
        hasOrgKnowledge: response.hasOrgKnowledge ?? null,
        lastActivityAt: Date.now(),
      });
      
      // Check if task is complete
      if (response.status === 'completed' || response.action === 'finish()') {
        console.log('[TaskOrchestrator] Task completed');
        await addDisplayHistoryEntry({
          thought: response.thought || 'Task completed',
          action: response.action || 'finish()',
          parsedAction: { name: 'finish', args: {} },
        });
        await updateTaskContext({ status: 'success', actionStatus: 'idle' });
        break;
      }
      
      // Check for user input needed
      if (response.status === 'needs_user_input' || response.userQuestion) {
        console.log('[TaskOrchestrator] User input needed');
        await updateTaskContext({ status: 'paused', pauseReason: 'user_input_needed' });
        // Add assistant message with question
        const assistantMessage: ChatMessage = {
          id: generateMessageId(),
          role: 'assistant',
          content: response.thought || 'I need more information to proceed.',
          status: 'sent',
          timestamp: new Date(),
          userQuestion: response.userQuestion,
        };
        const currentState = await getTaskState();
        await updateTaskState({ messages: [...currentState.messages, assistantMessage] });
        break;
      }
      
      // Parse and execute action
      if (!response.action || typeof response.action !== 'string') {
        console.error('[TaskOrchestrator] Invalid action from API:', response.action);
        await addDisplayHistoryEntry({
          thought: response.thought || 'Error: Invalid action',
          action: response.action || '',
          parsedAction: { error: 'Invalid action format' },
        });
        await updateTaskContext({ status: 'error' });
        break;
      }
      
      // Step 4: Execute action
      await updateTaskContext({ actionStatus: 'performing-action' });
      
      // Import action parser
      const { parseAction } = await import('../../helpers/parseAction');
      const parsedAction = parseAction(response.action);
      
      if ('error' in parsedAction) {
        console.error('[TaskOrchestrator] Failed to parse action:', parsedAction.error);
        await addDisplayHistoryEntry({
          thought: response.thought || '',
          action: response.action,
          parsedAction,
        });
        await updateTaskContext({ status: 'error' });
        break;
      }
      
      // Add to display history
      await addDisplayHistoryEntry({
        thought: response.thought || '',
        action: response.action,
        parsedAction,
        usage: response.usage,
      });
      
      // Execute the action - only for click and setValue (DOM actions)
      // CRITICAL FIX: Pass correct arguments to callDOMAction
      const actionName = parsedAction.parsedAction.name;
      const actionArgs = parsedAction.parsedAction.args;
      
      if (actionName === 'click' || actionName === 'setValue') {
        const { callDOMAction } = await import('../../helpers/domActions');
        const actionResult = await callDOMAction(
          actionName as 'click' | 'setValue',
          actionArgs as any
        );
        
        if (!actionResult.success) {
          // CRITICAL FIX: Properly format error for logging to avoid [object Object]
          const errorMsg = actionResult.error
            ? `${actionResult.error.message || 'Unknown error'} (code: ${actionResult.error.code || 'unknown'})`
            : 'Unknown action error';
          console.error('[TaskOrchestrator] Action failed:', errorMsg);
          await updateTaskContext({ status: 'error' });
          break;
        }
      } else if (actionName === 'finish' || actionName === 'fail') {
        // Terminal actions - handled below
        break;
      } else {
        // Other actions - use actionExecutors
        try {
          const { executeAction } = await import('../../helpers/actionExecutors');
          await executeAction(actionName, actionArgs);
        } catch (error: unknown) {
          const errorMessage = error instanceof Error ? error.message : String(error);
          console.error('[TaskOrchestrator] Action failed:', errorMessage);
          await updateTaskContext({ status: 'error' });
          break;
        }
      }
      
      // Wait for DOM to stabilize after action
      await updateTaskContext({ actionStatus: 'waiting' });
      await new Promise(resolve => setTimeout(resolve, 500));
      
      actionCount++;
      
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[TaskOrchestrator] API call failed:', errorMessage);
      
      await addDisplayHistoryEntry({
        thought: `Error: API call failed - ${errorMessage}`,
        action: '',
        parsedAction: { error: errorMessage },
      });
      
      // Check for specific error types
      if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
        // Pause on rate limit, allow resume
        await updateTaskContext({ status: 'paused', pauseReason: 'navigation' });
      } else {
        await updateTaskContext({ status: 'error' });
      }
      break;
    }
  }
  
  // Cleanup
  stopKeepAlive();
  
  const finalState = await getTaskState();
  if (finalState.context?.status === 'running') {
    // Hit max actions
    await updateTaskContext({ status: 'interrupted' });
    console.log('[TaskOrchestrator] Task loop ended (max actions reached)');
  }
  
  // Detach debugger
  try {
    await chrome.debugger.detach({ tabId });
  } catch (error) {
    // Already detached
  }
  
  console.log('[TaskOrchestrator] Task loop completed');
}

/**
 * Add entry to display history
 */
async function addDisplayHistoryEntry(entry: DisplayHistoryEntry): Promise<void> {
  const state = await getTaskState();
  await updateTaskState({
    displayHistory: [...state.displayHistory, entry],
  });
}

// ============================================================================
// Keep-Alive Helpers
// ============================================================================

let keepAliveInterval: ReturnType<typeof setInterval> | null = null;
let keepAlivePort: chrome.runtime.Port | null = null;

function startKeepAlive(): void {
  if (keepAliveInterval) return;
  
  try {
    keepAlivePort = chrome.runtime.connect({ name: 'taskOrchestratorKeepAlive' });
    
    keepAliveInterval = setInterval(() => {
      try {
        if (keepAlivePort) {
          keepAlivePort.postMessage({ type: 'ping', timestamp: Date.now() });
        }
      } catch (error) {
        // Port disconnected
      }
    }, 25000);
    
    keepAlivePort.onDisconnect.addListener(() => {
      if (keepAliveInterval) {
        clearInterval(keepAliveInterval);
        keepAliveInterval = null;
      }
      keepAlivePort = null;
    });
    
    console.log('[TaskOrchestrator] Keep-alive started');
  } catch (error) {
    console.error('[TaskOrchestrator] Failed to start keep-alive:', error);
  }
}

function stopKeepAlive(): void {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
  if (keepAlivePort) {
    try {
      keepAlivePort.disconnect();
    } catch (error) {
      // Already disconnected
    }
    keepAlivePort = null;
  }
  console.log('[TaskOrchestrator] Keep-alive stopped');
}

// ============================================================================
// Utility Functions
// ============================================================================

function generateMessageId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// ============================================================================
// Tab Switch Handling
// ============================================================================

/**
 * Handle tab switch event from chrome.tabs.onActivated
 * If user switches away from automation tab, pause the task
 */
export async function handleTabSwitch(newTabId: number, windowId: number): Promise<void> {
  const state = await getTaskState();
  
  if (!state.context || state.context.status !== 'running') {
    return; // No active task
  }
  
  if (state.context.targetTabId !== newTabId) {
    console.log('[TaskOrchestrator] User switched away from automation tab');
    await pauseTask('tab_switched');
  }
}

/**
 * Handle tab removal
 */
export async function handleTabRemoved(tabId: number): Promise<void> {
  const state = await getTaskState();
  
  if (state.context?.targetTabId === tabId) {
    console.log('[TaskOrchestrator] Automation tab was closed');
    await updateTaskContext({ status: 'interrupted' });
    stopKeepAlive();
  }
}

/**
 * Handle tab URL change (navigation)
 */
export async function handleTabUpdated(
  tabId: number, 
  changeInfo: chrome.tabs.TabChangeInfo
): Promise<void> {
  const state = await getTaskState();
  
  if (!state.context || state.context.targetTabId !== tabId) {
    return; // Not our tab
  }
  
  if (changeInfo.url && changeInfo.url !== state.context.currentUrl) {
    console.log('[TaskOrchestrator] Tab URL changed:', changeInfo.url);
    await updateTaskContext({ currentUrl: changeInfo.url });
  }
}
