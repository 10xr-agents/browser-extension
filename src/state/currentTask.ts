/**
 * Current Task State for Thin Client Architecture
 * 
 * Display-only history for UI. Server owns canonical action history.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §5.7.3.6 (Display-Only History)
 */

import { attachDebugger, detachDebugger } from '../helpers/chromeDebugger';
import {
  disableIncompatibleExtensions,
  reenableExtensions,
} from '../helpers/disableExtensions';
import { callDOMAction } from '../helpers/domActions';
import { parseAction, ParsedAction } from '../helpers/parseAction';
import { apiClient, type DOMChangeInfo, type ClientObservations, RateLimitError, NotFoundError } from '../api/client';
import templatize from '../helpers/shrinkHTML/templatize';
import { getSimplifiedDom, type SimplifiedDomResult } from '../helpers/simplifyDom';
import { extractDomViaInjection, type FallbackDomResult } from '../helpers/fallbackDomExtractor';
import { sleep } from '../helpers/utils';
import { MyStateCreator } from './store';
import type { AccessibilityTree } from '../types/accessibility';
import type { SimplifiedAXElement } from '../helpers/accessibilityFilter';
import type { AccessibilityMapping } from '../helpers/accessibilityMapping';
import type { HybridElement } from '../types/hybridElement';
import type { CoverageMetrics } from '../helpers/accessibilityFirst';
import { createAccessibilityMapping } from '../helpers/accessibilityMapping';
import type { ChatMessage, ActionStep } from '../types/chatMessage';
import type { ActionExecutionResult } from '../helpers/domActions';
import {
  getInteractiveElementSnapshot,
  waitForDOMChangesAfterAction,
  formatDOMChangeReport,
  type DOMChangeReport,
  type ElementInfo,
} from '../helpers/domWaiting';
import { 
  persistTaskState, 
  getTaskIdForTab, 
  persistActiveTaskState, 
  clearActiveTaskState,
  updateActiveTaskTimestamp,
  type ActiveTaskState,
} from '../helpers/taskPersistence';
// CDP-based lifecycle management (replaces content script dependencies)
import {
  waitForPageReady as cdpWaitForPageReady,
  waitForNetworkIdle,
  setNetworkObservationMark as cdpSetNetworkObservationMark,
  getDidNetworkOccurSinceMark as cdpGetDidNetworkOccurSinceMark,
} from '../helpers/cdpLifecycle';
import { extractDomViaCDP, type SemanticNodeV3 } from '../helpers/cdpDomExtractor';
import { startKeepAlive, stopKeepAlive } from '../helpers/serviceWorkerKeepAlive';
import { validatePayloadSize, PayloadTooLargeError, PAYLOAD_TOO_LARGE_MESSAGE } from '../helpers/payloadValidation';
import {
  captureAndOptimizeScreenshot,
  resetScreenshotHashCache
} from '../helpers/screenshotCapture';
import {
  extractSkeletonDom,
  getSkeletonStats,
  extractInteractiveTreeFromSkeleton,
} from '../helpers/skeletonDom';
import { selectDomMode, type DomMode } from '../helpers/hybridCapture';

// === SEMANTIC JSON PROTOCOL ===
// Ultra-light semantic extraction with viewport pruning (~25-75 tokens)
// If semantic fails → fallback to skeleton/hybrid based on query keywords
// If backend needs more → responds to negotiation (needs_context/needs_full_dom)
// Reference: DOM_EXTRACTION_ARCHITECTURE.md
const USE_SEMANTIC_EXTRACTION = true;

// Semantic node type (minified keys for token efficiency)
interface SemanticNode {
  i: string;                           // Element ID
  r: string;                           // Role (minified: btn, inp, link, chk, etc.)
  n: string;                           // Name/label
  v?: string;                          // Value
  s?: string;                          // State
  xy?: [number, number];               // Center coordinates
  f?: number;                          // Frame ID (0 = main frame, omitted if 0)
  box?: [number, number, number, number]; // Bounding box [x,y,w,h]
  scr?: { depth: string; h: boolean }; // Scrollable container info
  occ?: boolean;                       // Occluded by overlay
}

// Semantic extraction result
interface SemanticTreeResult {
  mode: 'semantic';
  url: string;
  title: string;
  viewport: { width: number; height: number };
  scroll_position?: string;
  interactive_tree: SemanticNode[];
  scrollable_containers?: Array<{
    id: string;
    depth: string;
    hasMore: boolean;
  }>;
  meta: {
    totalElements: number;
    viewportElements: number;
    prunedElements: number;
    occludedElements: number;
    extractionTimeMs: number;
    estimatedTokens: number;
  };
}
// Dynamic import for messageSyncManager to avoid circular dependency
// Used for starting WebSocket sync when session changes
let messageSyncManagerPromise: Promise<typeof import('../services/messageSyncService')> | null = null;
const getMessageSyncManager = async () => {
  if (!messageSyncManagerPromise) {
    messageSyncManagerPromise = import('../services/messageSyncService');
  }
  return messageSyncManagerPromise;
};

/**
 * Generate a UUID v4
 * Uses crypto.randomUUID() if available (Chrome 92+), otherwise falls back to manual generation
 */
function generateUUID(): string {
  // Use Web Crypto API if available (Chrome extensions support this)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback: Generate UUID v4 manually
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Wait for page to be ready on a tab (CDP-based)
 *
 * Uses CDP lifecycle events for page readiness detection.
 * No content script dependency - uses CDP Page and Network domains.
 *
 * @param tabId - The tab ID to check
 * @param timeoutMs - Maximum time to wait (default 10 seconds)
 * @returns Promise<boolean> - true if page is ready, false if timeout
 */
async function waitForPageReadiness(tabId: number, timeoutMs: number = 10000): Promise<boolean> {
  // Use CDP-based page readiness detection
  return cdpWaitForPageReady(tabId, timeoutMs);
}

/**
 * Create a SimplifiedDomResult from the fallback DOM extraction result.
 * 
 * This converts the direct injection result into a format that can be used
 * by the rest of the DOM processing pipeline.
 * 
 * @param fallbackResult - The result from extractDomViaInjection
 * @returns SimplifiedDomResult or null if conversion fails
 */
function createSimplifiedDomFromFallback(fallbackResult: FallbackDomResult): SimplifiedDomResult | null {
  if (!fallbackResult.success || !fallbackResult.html) {
    return null;
  }

  try {
    // Create a DOM element from the HTML
    const parser = new DOMParser();
    const doc = parser.parseFromString(
      `<!DOCTYPE html><html><head><title>${fallbackResult.title || ''}</title></head><body>${fallbackResult.html}</body></html>`,
      'text/html'
    );

    // Mark interactive elements with data-element-id for action targeting
    if (fallbackResult.interactiveElements && fallbackResult.interactiveElements.length > 0) {
      // Create a mapping of interactive elements
      const interactiveSelectors = [
        'a[href]', 'button', 'input', 'textarea', 'select',
        '[role="button"]', '[role="link"]', '[role="textbox"]',
        '[onclick]', '[tabindex]:not([tabindex="-1"])',
      ].join(', ');

      const elements = doc.querySelectorAll(interactiveSelectors);
      let elementId = 0;

      elements.forEach((el) => {
        // Only mark visible elements
        if (!el.hasAttribute('data-element-id')) {
          el.setAttribute('data-element-id', String(elementId++));
        }
      });

      console.log(`[createSimplifiedDomFromFallback] Marked ${elementId} interactive elements`);
    }

    // Create HybridElements from the fallback data
    const hybridElements: HybridElement[] = (fallbackResult.interactiveElements || []).map((el, index) => ({
      id: index,
      tag: el.tag,
      role: el.role || undefined,
      name: el.text || el.ariaLabel || el.placeholder || '',
      description: '',
      value: el.value || '',
      isInteractive: true,
      boundingBox: el.rect,
      attributes: {
        id: el.id || undefined,
        name: el.name || undefined,
        type: el.type || undefined,
        href: el.href || undefined,
        placeholder: el.placeholder || undefined,
        'aria-label': el.ariaLabel || undefined,
      },
      axNodeId: undefined,
      domIndex: index,
    }));

    return {
      dom: doc.body,
      usedAccessibility: false,
      hybridElements,
    };
  } catch (error) {
    console.error('[createSimplifiedDomFromFallback] Failed to convert fallback result:', error);
    return null;
  }
}


/**
 * Plan step structure from Manus orchestrator
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §6.2 (Action Plan Structure)
 */
export type PlanStep = {
  id: string;
  description: string;
  status: 'pending' | 'active' | 'completed' | 'failed';
  toolType?: 'dom' | 'server';
  reasoning?: string;
  expectedOutcome?: string;
};

/**
 * Action plan structure from Manus orchestrator
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §6.2 (Action Plan Structure)
 */
export type ActionPlan = {
  steps: PlanStep[];
  currentStepIndex: number;
};

/**
 * Verification result from Manus orchestrator
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §6.4 (Verification Result Model)
 */
export type VerificationResult = {
  stepIndex: number;
  success: boolean;
  confidence: number; // 0-1 score
  expectedState?: string; // What was expected
  actualState?: string; // What actually happened
  reason: string; // Explanation of result
  timestamp: Date;
};

/**
 * Self-correction result from Manus orchestrator
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §9 (Self-Correction Architecture)
 */
export type CorrectionResult = {
  stepIndex: number;
  strategy: string; // Correction strategy used (e.g., "ALTERNATIVE_SELECTOR", "ALTERNATIVE_TOOL", etc.)
  reason: string; // Why correction was needed
  attemptNumber: number; // Retry attempt number (1-indexed)
  originalStep?: string; // Original step description (if available)
  correctedStep?: string; // Corrected step description (if available)
  timestamp: Date;
};

/**
 * Display-only history entry for UI
 * Server owns the canonical history used for prompts
 */
export type DisplayHistoryEntry = {
  thought: string;
  action: string;
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
  parsedAction: ParsedAction;
  expectedOutcome?: string; // Expected outcome for verification (Task 9)
  domChanges?: DOMChangeReport; // DOM changes after action execution
};

export type CurrentTaskSlice = {
  tabId: number;
  instructions: string | null;
  taskId: string | null; // Server-assigned task ID for action history continuity (legacy)
  sessionId: string | null; // Session ID for new chat persistence structure
  displayHistory: DisplayHistoryEntry[]; // Display-only history for UI (deprecated, use messages)
  messages: ChatMessage[]; // Chat messages for persistent conversation threads
  createdAt: Date | null; // When the current task started
  url: string | null; // URL where the task is being performed
  lastActionResult: ActionExecutionResult | null; // Last action execution result (for error reporting)
  lastDOMChanges: DOMChangeInfo | null; // DOM changes after last action (for server context)
  accessibilityTree: AccessibilityTree | null; // Accessibility tree for UI display (Task 4)
  accessibilityElements: SimplifiedAXElement[] | null; // Filtered accessibility elements (Task 5)
  accessibilityMapping: AccessibilityMapping | null; // Bidirectional mapping for action targeting (Task 6)
  hybridElements: HybridElement[] | null; // Hybrid elements combining accessibility and DOM data (Task 7)
  coverageMetrics: CoverageMetrics | null; // Coverage metrics for accessibility-first selection (Task 8)
  hasOrgKnowledge: boolean | null; // RAG mode: true = org-specific, false = public-only, null = unknown
  virtualElementCoordinates: Map<number, { x: number; y: number }>; // Map of virtual element indices to click coordinates
  // Manus orchestrator plan data (Task 6)
  plan: ActionPlan | null; // Action plan from orchestrator
  currentStep: number | null; // Current step number (1-indexed, from API)
  totalSteps: number | null; // Total steps in plan (from API)
  orchestratorStatus: 'planning' | 'executing' | 'verifying' | 'correcting' | 'completed' | 'failed' | null; // Orchestrator status
  // Manus orchestrator verification data (Task 7)
  verificationHistory: VerificationResult[]; // Verification results from server
  // Manus orchestrator correction data (Task 8)
  correctionHistory: CorrectionResult[]; // Self-correction attempts from server
  status: 'idle' | 'running' | 'success' | 'error' | 'interrupted'; // Legacy task status (kept for backward compatibility)
  actionStatus:
    | 'idle'
    | 'attaching-debugger'
    | 'pulling-dom'
    | 'transforming-dom'
    | 'performing-query'
    | 'performing-action'
    | 'waiting';
  // Message loading state (prevents infinite retry loops)
  messagesLoadingState: {
    isLoading: boolean;
    lastAttemptSessionId: string | null;
    lastAttemptTime: number | null;
    error: string | null;
    retryCount: number;
  };
  // Real-time message sync (WebSocket + polling fallback)
  // Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md
  wsConnectionState: 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'failed' | 'fallback';
  /** When wsConnectionState is 'fallback', explains why (e.g. 'No token', 'Pusher auth failed'). */
  wsFallbackReason: string | null;
  isServerTyping: boolean;
  serverTypingContext: string | null;
  actions: {
    runTask: (onError: (error: string) => void) => Promise<void>;
    interrupt: () => void;
    startNewChat: () => void; // Reset state for new chat
    saveMessages: () => Promise<void>; // Save messages to chrome.storage
    loadMessages: (sessionId: string) => Promise<void>; // Load messages from chrome.storage or API
    addUserMessage: (content: string) => void; // Add user message to chat
    addAssistantMessage: (content: string, action: string, parsedAction: ParsedAction) => void; // Add assistant message
    addActionStep: (messageId: string, step: ActionStep) => void; // Add action step to assistant message
    updateMessageStatus: (messageId: string, status: ChatMessage['status'], error?: { message: string; code: string }) => void; // Update message status
  };
};
// ============================================================================
// CRITICAL FIX: New Tab Handling (Section 4.2)
// Track last action time and handle new tab/tab switch events
// 
// Reference: PRODUCTION_READINESS.md §4.2 (The "New Tab" Disconnect)
// 
// NOTE: These listeners are set up after the store is created in setupNewTabListeners()
// to ensure useAppState is available. The function is called at the end of this file.
// ============================================================================

/**
 * Setup chrome listeners for new tab/tab switch detection.
 * Must be called after store is created to ensure useAppState is available.
 * 
 * This is a deferred setup to avoid "get is not defined" errors when the
 * module is first loaded (before the store slice is created).
 */
function setupNewTabListeners() {
  // Import useAppState dynamically to avoid circular dependencies
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useAppState } = require('./store');
  
  // Listen for storage changes (new tab/tab switch detected by background script)
  if (typeof chrome !== 'undefined' && chrome.storage && chrome.storage.onChanged) {
    chrome.storage.onChanged.addListener((changes, areaName) => {
      if (areaName !== 'local') return;
      
      // Use useAppState.getState() instead of get() since we're at module level
      const state = useAppState.getState();
      const currentTask = state.currentTask;
      if (!currentTask || currentTask.status !== 'running') return;
      
      // Handle new tab detection
      if (changes.newTabDetected && changes.newTabDetected.newValue) {
        const newTabInfo = changes.newTabDetected.newValue;
        const now = Date.now();
        
        // Check if this is recent (within 2 seconds)
        if (now - newTabInfo.timestamp < 2000) {
          console.log('Auto-switching to new tab after agent action:', {
            oldTabId: currentTask.tabId,
            newTabId: newTabInfo.tabId,
            newTabUrl: newTabInfo.url,
          });
          
          // Update active tab ID using useAppState.setState with Immer
          useAppState.setState((draft: any) => {
            draft.currentTask.tabId = newTabInfo.tabId;
            draft.currentTask.url = newTabInfo.url || null;
          });
          
          // Add system message to conversation
          useAppState.getState().currentTask.actions.addAssistantMessage(
            `[System] Browser opened new tab (URL: ${newTabInfo.url || 'unknown'}). Agent focus switched to new tab.`,
            'system',
            { name: 'system', args: {} }
          );
          
          // Clear the flag
          chrome.storage.local.remove('newTabDetected').catch(() => {});
        }
      }
      
      // Handle tab switch
      // When user switches tabs, update the tabId so the next command runs on the new tab.
      // Only interrupt if task was actively running (prevents DOM mismatch during action execution).
      // User's next command will start fresh on the new tab automatically.
      // Reference: ARCHITECTURE_REVIEW.md §4.3 (Handle Tab Switch in Side Panel)
      if (changes.tabSwitched && changes.tabSwitched.newValue) {
        const switchInfo = changes.tabSwitched.newValue;
        
        if (currentTask.tabId !== switchInfo.tabId) {
          console.log('[TabSwitch] User switched to new tab:', {
            originalTabId: currentTask.tabId,
            newTabId: switchInfo.tabId,
            taskStatus: currentTask.status,
          });
          
          // If task is actively running, we need to stop it because DOM context changed
          // But update tabId so user's next command works on the new tab
          if (currentTask.status === 'running') {
            useAppState.setState((draft: any) => {
              // Update tabId to new tab - user's next command will work on this tab
              draft.currentTask.tabId = switchInfo.tabId;
              // Set to idle so user can start a new command immediately
              draft.currentTask.status = 'idle';
              draft.currentTask.actionStatus = 'idle';
            });
            
            console.log('[TabSwitch] Task stopped, ready for new command on tab:', switchInfo.tabId);
          } else {
            // Task wasn't running - just update tabId silently
            useAppState.setState((draft: any) => {
              draft.currentTask.tabId = switchInfo.tabId;
            });
          }
          
          // Clear the flag
          chrome.storage.local.remove('tabSwitched').catch(() => {});
        }
      }
    });
  }

  // Also listen for runtime messages (backup mechanism)
  if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      if (message.type === 'NEW_TAB_DETECTED' || message.type === 'TAB_SWITCHED') {
        // Handle via storage listener above (more reliable)
        // This is just a backup
      }
      return false;
    });
  }
}

// Flag to track if listeners have been set up (prevent double initialization)
let newTabListenersInitialized = false;

/**
 * Initialize new tab listeners (called once when store is ready)
 * Safe to call multiple times - will only initialize once
 */
export function initializeNewTabListeners(): void {
  if (newTabListenersInitialized) return;
  newTabListenersInitialized = true;
  
  // Defer setup to ensure store is fully initialized
  // Use setTimeout to avoid potential circular dependency issues during initial load
  setTimeout(() => {
    try {
      setupNewTabListeners();
      console.log('[CurrentTask] New tab listeners initialized');
    } catch (error) {
      console.error('[CurrentTask] Failed to setup new tab listeners:', error);
    }
  }, 0);
}

export const createCurrentTaskSlice: MyStateCreator<CurrentTaskSlice> = (
  set,
  get
) => ({
  tabId: -1,
  instructions: null,
  taskId: null,
  sessionId: null,
  displayHistory: [],
  messages: [],
  createdAt: null,
  url: null,
  lastActionResult: null,
  lastDOMChanges: null,
  accessibilityTree: null,
  accessibilityElements: null,
  accessibilityMapping: null,
  hybridElements: null,
  coverageMetrics: null,
  hasOrgKnowledge: null,
  virtualElementCoordinates: new Map(),
  plan: null,
  currentStep: null,
  totalSteps: null,
  orchestratorStatus: null,
  verificationHistory: [],
  correctionHistory: [],
  status: 'idle',
  actionStatus: 'idle',
  messagesLoadingState: {
    isLoading: false,
    lastAttemptSessionId: null,
    lastAttemptTime: null,
    error: null,
    retryCount: 0,
  },
  wsConnectionState: 'disconnected',
  wsFallbackReason: null,
  isServerTyping: false,
  serverTypingContext: null,
  actions: {
    runTask: async (onError) => {
      /**
       * Thin Client Action Runner
       * 
       * Captures DOM, sends to POST /api/agent/interact, executes actions, loops until done.
       * Server owns action history; client maintains display-only history for UI.
       * 
       * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
       * Reference: SERVER_SIDE_AGENT_ARCH.md §4.2 (POST /api/agent/interact)
       */
      const wasStopped = () => get().currentTask.status !== 'running';
      const setActionStatus = (status: CurrentTaskSlice['actionStatus']) => {
        set((state) => {
          state.currentTask.actionStatus = status;
        });
      };

      const instructions = get().ui.instructions;

      // Type guard: Ensure instructions is a string and not empty
      const safeInstructions = typeof instructions === 'string' ? instructions : String(instructions || '').trim();
      
      // Check if we're waiting for user input (status is 'idle' but we have a pending user question)
      const isWaitingForInput = get().currentTask.status === 'idle' && 
                                get().currentTask.messages.length > 0 &&
                                get().currentTask.messages[get().currentTask.messages.length - 1]?.userQuestion;
      
      // Don't start if already running (unless we're resuming from user input)
      if (get().currentTask.status === 'running' && !isWaitingForInput) return;
      
      // Don't start if no instructions (unless we're resuming from user input with new instructions)
      if (!safeInstructions && !isWaitingForInput) return;

      // Track if this is a truly new task (not resuming from user input or navigation)
      let isNewTask = false;
      
      // If resuming from user input, don't clear messages/history
      // Just update instructions and continue
      if (isWaitingForInput) {
        set((state) => {
          state.currentTask.instructions = safeInstructions;
          state.currentTask.status = 'running';
          state.currentTask.actionStatus = 'attaching-debugger';
          // Update the last message status to indicate we're continuing
          const lastMessage = state.currentTask.messages[state.currentTask.messages.length - 1];
          if (lastMessage && lastMessage.userQuestion) {
            lastMessage.status = 'sent'; // Mark the question as sent, we're now continuing
          }
        });
        
        // Add user's response as a new user message
        get().currentTask.actions.addUserMessage(safeInstructions);
        // NOT a new task - we're resuming after user answered a question
        isNewTask = false;
      } else {
        // This IS a new task
        isNewTask = true;
        
        // Reset screenshot hash cache for new task (ensures first screenshot is captured)
        // Reference: HYBRID_VISION_SKELETON_EXTENSION_SPEC.md
        resetScreenshotHashCache();
        
        // New task - preserve existing sessionId to continue the same chat context
        // Only clear task-specific state, not sessionId (sessionId is only cleared via startNewChat)
        const existingSessionId = get().currentTask.sessionId;
        const currentSessionId = get().sessions.currentSessionId;
        const existingMessages = get().currentTask.messages;
        
        // Use existing sessionId if available, otherwise use currentSessionId from sessions state
        // If neither exists, session will be created lazily by the server on first API call
        const sessionIdToUse = existingSessionId || currentSessionId;
        
        // If we have a sessionId but no messages, load them first
        if (sessionIdToUse && (!existingMessages || existingMessages.length === 0)) {
          await get().currentTask.actions.loadMessages(sessionIdToUse);
        }
        
        set((state) => {
          state.currentTask.instructions = safeInstructions;
          state.currentTask.displayHistory = [];
          // CRITICAL: Preserve existing messages when continuing same session
          // Only clear messages when starting a new chat (via startNewChat)
          // This ensures all messages in the session are visible (Cursor-like scrollable chat)
          if (!sessionIdToUse) {
            // No sessionId = new chat, clear messages
            state.currentTask.messages = [];
          } else {
            // If sessionIdToUse exists, preserve existing messages
            // They're already loaded above if they were missing
            // This allows users to scroll up and see all previous messages in the session
            if (!Array.isArray(state.currentTask.messages)) {
              state.currentTask.messages = [];
            }
            // Messages array is preserved - don't clear it
          }
          state.currentTask.taskId = null; // Reset taskId for new task
          // Preserve sessionId - don't reset it, continue using the same chat session
          // sessionId is only cleared when user explicitly starts a new chat via startNewChat
          if (sessionIdToUse) {
            state.currentTask.sessionId = sessionIdToUse;
            // Ensure this session is set as current in sessions state
            get().sessions.actions.setCurrentSession(sessionIdToUse);
          }
          state.currentTask.status = 'running';
          state.currentTask.actionStatus = 'attaching-debugger';
          state.currentTask.createdAt = new Date();
          state.currentTask.lastActionResult = null;
          state.currentTask.lastDOMChanges = null;
        });
        
        // Safety: Ensure messages array exists before adding user message
        // This prevents race condition where addUserMessage runs before state update completes
        const currentMessages = get().currentTask.messages;
        if (!Array.isArray(currentMessages)) {
          set((state) => {
            state.currentTask.messages = [];
          });
        }
        
        // Add user message to chat
        get().currentTask.actions.addUserMessage(safeInstructions);
      }

      // Clear input immediately after message is dispatched (fix: input not flushing after send)
      get().ui.actions.setInstructions('');
      
      // Generate session title from first few words of instructions
      const sessionTitle = safeInstructions.length > 50 
        ? safeInstructions.substring(0, 50) + '...' 
        : safeInstructions;

      try {
        // Get ALL tabs in the current window to debug tab selection
        const allTabs = await chrome.tabs.query({ currentWindow: true });
        console.log('[CurrentTask] All tabs in window:', allTabs.map(t => ({
          id: t.id,
          active: t.active,
          url: t.url?.substring(0, 50) + '...',
        })));
        
        const activeTab = (
          await chrome.tabs.query({ active: true, currentWindow: true })
        )[0];

        console.log('[CurrentTask] Selected active tab:', {
          id: activeTab?.id,
          url: activeTab?.url,
          active: activeTab?.active,
        });

        if (!activeTab.id) throw new Error('No active tab found');
        if (!activeTab.url) throw new Error('No active tab URL found');
        
        const tabId = activeTab.id;
        const url = activeTab.url;

        // Only proceed with HTTP/HTTPS URLs
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          throw new Error('Current page is not a valid web page');
        }

        console.log(`[CurrentTask] Starting task on tab ${tabId}: ${url}`);

        set((state) => {
          state.currentTask.tabId = tabId;
          state.currentTask.url = url;
        });

        // CRITICAL FIX: Clear old taskId from storage when starting a NEW task
        // This prevents recovering a stale taskId from a previous failed/completed task
        // We clear both the tab-specific storage AND the active task state
        // BUT: Only do this for truly new tasks, not when resuming from user input
        if (isNewTask) {
          try {
            await chrome.storage.local.remove([`task_${tabId}`, 'active_task_state']);
            console.debug('[CurrentTask] Cleared old taskId from storage for new task');
          } catch (clearError) {
            console.warn('[CurrentTask] Failed to clear old taskId from storage:', clearError);
          }
        }

        // CDP-based page readiness check (replaces content script ping)
        try {
          await cdpWaitForPageReady(tabId, 5000);
          console.log('[CurrentTask] Page verified ready via CDP on tab', tabId);
        } catch (pageReadyError) {
          console.warn('[CurrentTask] Page readiness check failed, will retry during DOM extraction:', pageReadyError);
          // Continue - DOM extraction has its own retry logic
        }

        await attachDebugger(tabId);
        await disableIncompatibleExtensions();

        // CRITICAL FIX: Persist active task state for navigation survival (Issue #3)
        // This allows the task to resume after page navigations
        // Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)
        const taskId = get().currentTask.taskId;
        const sessionId = get().currentTask.sessionId;
        await persistActiveTaskState({
          taskId: taskId || `pending_${Date.now()}`, // Use pending ID if no taskId yet
          sessionId: sessionId,
          tabId,
          status: 'running',
          currentUrl: url,
          lastActionTimestamp: Date.now(),
          instructions: safeInstructions,
        });

        let hasOrgKnowledgeShown = false; // Track if we've shown the dialog
        let consecutiveDomFailures = 0; // Track consecutive DOM extraction failures
        const MAX_DOM_FAILURES = 10; // Maximum consecutive failures before giving up

        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (wasStopped()) break;

          setActionStatus('pulling-dom');
          let domResult: SimplifiedDomResult | null = null;
          
          // ============================================================================
          // CDP-FIRST ARCHITECTURE: Page Readiness Check
          //
          // Uses Chrome DevTools Protocol (CDP) to detect page readiness:
          // - Monitors Page.loadEventFired and Page.domContentEventFired
          // - Tracks network idle state (no pending requests)
          // - No longer depends on content script messaging
          // ============================================================================

          console.log(`[CurrentTask] Waiting for page readiness via CDP on tab ${tabId}...`);
          const pageReady = await waitForPageReadiness(tabId, 15000); // 15 second timeout

          if (pageReady) {
            console.log(`[CurrentTask] Page confirmed ready on tab ${tabId}`);
          } else {
            console.warn(`[CurrentTask] Page not ready after timeout, will try DOM extraction anyway...`);
          }
          
          // ============================================================================
          // ROBUST DOM EXTRACTION with Exponential Backoff (CDP-First Architecture)
          //
          // Uses CDP for DOM extraction which is more reliable than content scripts.
          // Exponential backoff handles cases where the page is still loading.
          // ============================================================================
          let domRetryCount = 0;
          const MAX_DOM_RETRIES = 10;
          const MIN_RETRY_DELAY = 1500; // Minimum 1.5 seconds between retries
          const MAX_RETRY_DELAY = 10000; // Cap at 10 seconds

          // Exponential backoff function: 1.5s, 2s, 3s, 4.5s, 6s, 8s, 10s...
          const getRetryDelay = (attempt: number): number => {
            const delay = MIN_RETRY_DELAY * Math.pow(1.5, attempt - 1);
            return Math.min(Math.round(delay), MAX_RETRY_DELAY);
          };

          while (domRetryCount < MAX_DOM_RETRIES) {
            try {
              domResult = await getSimplifiedDom(tabId);

              if (domResult) {
                // Success! Reset failure counter
                consecutiveDomFailures = 0;
                if (domRetryCount > 0) {
                  console.log(`[CurrentTask] DOM extraction succeeded on attempt ${domRetryCount + 1}/${MAX_DOM_RETRIES}`);
                }
                break;
              }

              // DOM was null - page may be loading
              domRetryCount++;
              if (domRetryCount < MAX_DOM_RETRIES) {
                const retryDelay = getRetryDelay(domRetryCount);
                console.log(`[CurrentTask] DOM extraction returned null (attempt ${domRetryCount}/${MAX_DOM_RETRIES}), waiting ${retryDelay}ms...`);
                await sleep(retryDelay);
              }
            } catch (error: unknown) {
              const errorMessage = error instanceof Error ? error.message : String(error);
              domRetryCount++;

              // CDP extraction error - apply exponential backoff
              if (domRetryCount < MAX_DOM_RETRIES) {
                const retryDelay = getRetryDelay(domRetryCount);
                console.log(`[CurrentTask] CDP DOM extraction error (attempt ${domRetryCount}/${MAX_DOM_RETRIES}): ${errorMessage}`);
                console.log(`[CurrentTask] Waiting ${retryDelay}ms before retry...`);
                await sleep(retryDelay);
              } else if (domRetryCount >= MAX_DOM_RETRIES) {
                // ============================================================================
                // LAST RESORT: Direct Function Injection Fallback
                // 
                // When all content script communication fails (common on google.com), we
                // bypass the message channel entirely by directly injecting a DOM extraction
                // function into the page using chrome.scripting.executeScript().
                // ============================================================================
                console.warn(`[CurrentTask] All ${MAX_DOM_RETRIES} retries exhausted. Attempting direct injection fallback...`);
                
                try {
                  const fallbackResult = await extractDomViaInjection(tabId);
                  
                  if (fallbackResult.success && fallbackResult.html) {
                    console.log(`[CurrentTask] Direct injection fallback SUCCEEDED!`, {
                      url: fallbackResult.url?.substring(0, 50),
                      interactiveElements: fallbackResult.interactiveElements?.length || 0,
                    });
                    
                    // Create a minimal SimplifiedDomResult from the fallback
                    domResult = createSimplifiedDomFromFallback(fallbackResult);
                    
                    if (domResult) {
                      consecutiveDomFailures = 0;
                      break; // Exit the retry loop with success
                    }
                  } else {
                    console.error(`[CurrentTask] Direct injection fallback failed:`, fallbackResult.error);
                  }
                } catch (fallbackError) {
                  console.error(`[CurrentTask] Direct injection fallback threw:`, fallbackError);
                }
                
                // If fallback also failed, throw the original error
                console.error('[CurrentTask] DOM extraction failed after all retries AND fallback:', errorMessage);
                throw error; // Let outer catch handle it
              } else {
                throw error; // Non-retryable error
              }
            }
          }

          // Guard: content script may not be loaded (getSimplifiedDom returns null after all retries)
          if (!domResult) {
            // Try direct injection fallback before giving up
            console.warn(`[CurrentTask] DOM result is null after retries. Attempting direct injection fallback...`);
            
            try {
              const fallbackResult = await extractDomViaInjection(tabId);
              
              if (fallbackResult.success && fallbackResult.html) {
                console.log(`[CurrentTask] Direct injection fallback SUCCEEDED (null result case)!`, {
                  url: fallbackResult.url?.substring(0, 50),
                  interactiveElements: fallbackResult.interactiveElements?.length || 0,
                });
                
                domResult = createSimplifiedDomFromFallback(fallbackResult);
              }
            } catch (fallbackError) {
              console.error(`[CurrentTask] Direct injection fallback failed:`, fallbackError);
            }
          }
          
          // Final check after all fallbacks
          if (!domResult) {
            consecutiveDomFailures++;
            
            if (consecutiveDomFailures >= MAX_DOM_FAILURES) {
              set((state) => {
                state.currentTask.displayHistory.push({
                  thought:
                    'Error: Could not extract page content after multiple attempts including direct injection fallback. The page may be protected or inaccessible.',
                  action: '',
                  parsedAction: {
                    error: 'Could not extract page content. All extraction methods failed.',
                  },
                });
                state.currentTask.status = 'error';
              });
              break;
            }
            
            // Wait and try again on next iteration
            console.log(`[CurrentTask] DOM extraction failed, will retry (failure ${consecutiveDomFailures}/${MAX_DOM_FAILURES})...`);
            await sleep(2000);
            continue;
          }

          try {
            // CRITICAL FIX: Merge virtual elements (text node menu items) into hybridElements
            // BEFORE sending DOM to server, so LLM can see and click them
            if (domResult.hybridElements) {
              try {
                // Pass tabId to ensure we target the correct tab
                const snapshot = await getInteractiveElementSnapshot(tabId);
                const virtualElementsMap = new Map<number, { x: number; y: number }>();
                let nextVirtualIndex = domResult.hybridElements.length;
                
                // Find virtual elements in the snapshot that aren't in hybridElements
                for (const [, element] of snapshot) {
                  if (element.isVirtual && element.virtualCoordinates && element.id) {
                    // Check if this virtual element is already represented in hybridElements
                    const alreadyExists = domResult.hybridElements.some(he => 
                      he.name === element.text || 
                      (element.text && he.name?.includes(element.text)) ||
                      (element.text && he.description?.includes(element.text))
                    );
                    
                    if (!alreadyExists && element.text) {
                      // Create a HybridElement for this virtual element
                      const virtualHybridElement: HybridElement = {
                        id: nextVirtualIndex,
                        role: element.role || 'menuitem',
                        name: element.text,
                        description: null,
                        value: null,
                        interactive: true,
                        attributes: {
                          'data-virtual-id': element.id,
                          'data-is-virtual': 'true',
                        },
                        source: 'dom',
                      };
                      
                      domResult.hybridElements.push(virtualHybridElement);
                      virtualElementsMap.set(nextVirtualIndex, element.virtualCoordinates);
                      nextVirtualIndex++;
                      
                      console.log('Merged virtual element into hybridElements (before server):', {
                        virtualId: element.id,
                        hybridIndex: nextVirtualIndex - 1,
                        text: element.text,
                        coordinates: element.virtualCoordinates,
                      });
                    }
                  }
                }
                
                // Store virtual element coordinates for click handling
                set((state) => {
                  state.currentTask.virtualElementCoordinates = virtualElementsMap;
                });
              } catch (virtualMergeError: unknown) {
                const errorMessage = virtualMergeError instanceof Error ? virtualMergeError.message : String(virtualMergeError);
                console.warn('Failed to merge virtual elements before server, continuing without them:', errorMessage);
              }
            }
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error('Failed to get simplified DOM:', errorMessage);
            
            // Add error to history
            set((state) => {
              state.currentTask.displayHistory.push({
                thought: `Error: Failed to communicate with page content script. ${errorMessage}`,
                action: '',
                parsedAction: {
                  error: errorMessage,
                },
              });
              state.currentTask.status = 'error';
            });
            break;
          }

          // domResult is non-null here (early check above)
          // Store accessibility tree and elements for UI display (if available)
          if (domResult.accessibilityTree) {
            set((state) => {
              state.currentTask.accessibilityTree = domResult.accessibilityTree!;
            });
          } else {
            // Clear accessibility tree if not available
            set((state) => {
              state.currentTask.accessibilityTree = null;
            });
          }

          // Store filtered accessibility elements (Task 5)
          if (domResult.accessibilityElements) {
            set((state) => {
              state.currentTask.accessibilityElements = domResult.accessibilityElements!;
            });
          } else {
            set((state) => {
              state.currentTask.accessibilityElements = null;
            });
          }

          // Create accessibility mapping for action targeting (Task 6)
          if (domResult.accessibilityElements && domResult.elementMapping) {
            const mapping = createAccessibilityMapping(
              domResult.accessibilityElements,
              domResult.elementMapping
            );
            set((state) => {
              state.currentTask.accessibilityMapping = mapping;
            });
          } else {
            set((state) => {
              state.currentTask.accessibilityMapping = null;
            });
          }

          // Store hybrid elements for UI display (Task 7)
          if (domResult.hybridElements) {
            const hybridElements = domResult.hybridElements;
            
            // CRITICAL FIX: Merge virtual elements (text node menu items) into hybridElements
            // Virtual elements are detected client-side from text nodes in ul[name="menuEntries"]
            // They need to be added to hybridElements so the LLM can see and click them
            try {
              // Pass tabId to ensure we target the correct tab
              const snapshot = await getInteractiveElementSnapshot(tabId);
              const virtualElementsMap = new Map<number, { x: number; y: number }>();
              let nextVirtualIndex = hybridElements.length;
              
              // Find virtual elements in the snapshot that aren't in hybridElements
              for (const [, element] of snapshot) {
                if (element.isVirtual && element.virtualCoordinates && element.id) {
                  // Check if this virtual element is already represented in hybridElements
                  // by checking if any hybridElement has matching text
                  const alreadyExists = hybridElements.some(he => 
                    he.name === element.text || 
                    (element.text && he.name?.includes(element.text)) ||
                    (element.text && he.description?.includes(element.text))
                  );
                  
                  if (!alreadyExists && element.text) {
                    // Create a HybridElement for this virtual element
                    const virtualHybridElement: HybridElement = {
                      id: nextVirtualIndex,
                      role: element.role || 'menuitem',
                      name: element.text,
                      description: null,
                      value: null,
                      interactive: true,
                      attributes: {
                        'data-virtual-id': element.id,
                        'data-is-virtual': 'true',
                      },
                      source: 'dom',
                    };
                    
                    hybridElements.push(virtualHybridElement);
                    virtualElementsMap.set(nextVirtualIndex, element.virtualCoordinates);
                    nextVirtualIndex++;
                    
                    console.log('Merged virtual element into hybridElements:', {
                      virtualId: element.id,
                      hybridIndex: nextVirtualIndex - 1,
                      text: element.text,
                      coordinates: element.virtualCoordinates,
                    });
                  }
                }
              }
              
              set((state) => {
                // Use cast to work around Immer's WritableDraft type issue with DOM elements
                state.currentTask.hybridElements = hybridElements as typeof state.currentTask.hybridElements;
                // Store virtual element coordinates for click handling
                state.currentTask.virtualElementCoordinates = virtualElementsMap;
              });
            } catch (virtualMergeError: unknown) {
              const errorMessage = virtualMergeError instanceof Error ? virtualMergeError.message : String(virtualMergeError);
              console.warn('Failed to merge virtual elements, continuing without them:', errorMessage);
              set((state) => {
                // Use cast to work around Immer's WritableDraft type issue with DOM elements
                state.currentTask.hybridElements = hybridElements as typeof state.currentTask.hybridElements;
                state.currentTask.virtualElementCoordinates = new Map();
              });
            }
          } else {
            set((state) => {
              state.currentTask.hybridElements = null;
              state.currentTask.virtualElementCoordinates = new Map();
            });
          }

          // Store coverage metrics for UI display (Task 8)
          if (domResult.coverageMetrics) {
            set((state) => {
              state.currentTask.coverageMetrics = domResult.coverageMetrics!;
            });
          } else {
            set((state) => {
              state.currentTask.coverageMetrics = null;
            });
          }
          
          const html = domResult.dom.outerHTML;

          if (wasStopped()) break;
          setActionStatus('transforming-dom');
          const currentDom = templatize(html);

          // === DOM EXTRACTION MODE SELECTION ===
          // Choose between:
          // 1. SEMANTIC mode (new): JSON-based, stable IDs, ~95% token reduction
          // 2. SKELETON mode: HTML-based, lightweight
          // 3. HYBRID mode: Screenshot + skeleton for visual tasks
          // 4. FULL mode: Full HTML (fallback)
          
          // Extract skeleton from the RAW annotated DOM, not the templatized HTML.
          // Templatization injects `{T1(...)}`-style placeholders that DOMParser treats as text,
          // which can drop interactive elements/IDs (e.g. nav links like id=241) and break element mapping.
          const annotatedDomHtml =
            typeof domResult.annotatedDomHtml === 'string' ? domResult.annotatedDomHtml : html;
          const skeletonDom = extractSkeletonDom(annotatedDomHtml);
          const skeletonStats = getSkeletonStats(annotatedDomHtml.length, skeletonDom);
          
          // Semantic extraction variables
          let interactiveTree: SemanticNode[] | undefined;
          let pageTitle: string | undefined;
          let viewport: { width: number; height: number } | undefined;
          let domMode: DomMode | 'semantic' = 'skeleton'; // Default

          // Screenshot capture variables
          let screenshotBase64: string | null = null;
          let screenshotHash: string | null = null;

          // === CDP-BASED SEMANTIC EXTRACTION (PRIMARY) ===
          // Ultra-light format using CDP Accessibility.getFullAXTree
          // No content script dependencies - eliminates race conditions
          // Reference: CDP_DOM_EXTRACTION_MIGRATION.md
          if (USE_SEMANTIC_EXTRACTION) {
            try {
              console.log('[CurrentTask] Attempting CDP semantic extraction...');
              const cdpResult = await extractDomViaCDP(tabId);

              if (cdpResult && cdpResult.interactiveTree && cdpResult.interactiveTree.length > 0) {
                interactiveTree = cdpResult.interactiveTree;
                pageTitle = cdpResult.pageTitle;
                viewport = cdpResult.viewport;
                domMode = 'semantic';

                console.log('[CurrentTask] CDP semantic extraction:', {
                  mode: 'semantic',
                  nodeCount: interactiveTree.length,
                  axNodeCount: cdpResult.meta.axNodeCount,
                  estimatedTokens: cdpResult.meta.estimatedTokens,
                  extractionTimeMs: cdpResult.meta.extractionTimeMs,
                  tokenReduction: `${Math.round((1 - (cdpResult.meta.estimatedTokens * 4) / Math.max(currentDom.length, 1)) * 100)}%`,
                });
              } else {
                console.warn('[CurrentTask] CDP extraction returned empty result:', {
                  hasResult: !!cdpResult,
                  hasTree: !!(cdpResult && cdpResult.interactiveTree),
                  treeLength: cdpResult?.interactiveTree?.length ?? 0,
                });

                // FALLBACK: Extract minimal interactive tree from skeleton DOM
                // This keeps domMode as 'semantic' and avoids sending full skeletonDom
                console.log('[CurrentTask] Using skeleton-based semantic fallback');
                const fallbackTree = extractInteractiveTreeFromSkeleton(skeletonDom);

                if (fallbackTree.length > 0) {
                  // Convert MinimalSemanticNode[] to SemanticNode[]
                  interactiveTree = fallbackTree.map(node => ({
                    i: node.i,
                    r: node.r,
                    n: node.n,
                    v: node.v,
                  }));
                  domMode = 'semantic';
                  console.log('[CurrentTask] Skeleton-based semantic fallback:', {
                    nodeCount: interactiveTree.length,
                    skeletonLength: skeletonDom.length,
                    estimatedTokens: interactiveTree.length * 10, // ~10 tokens per node
                  });
                } else {
                  console.warn('[CurrentTask] Skeleton fallback also empty, using skeleton mode');
                  domMode = selectDomMode(safeInstructions, {
                    interactiveElementCount: skeletonStats.interactiveCount,
                  });
                }
              }
            } catch (semanticError: unknown) {
              const errorMessage = semanticError instanceof Error ? semanticError.message : String(semanticError);
              console.error('[CurrentTask] Semantic extraction RPC failed:', errorMessage);

              // FALLBACK: Extract minimal interactive tree from skeleton DOM
              // This keeps domMode as 'semantic' and avoids sending full skeletonDom
              console.log('[CurrentTask] RPC failed - using skeleton-based semantic fallback');
              const fallbackTree = extractInteractiveTreeFromSkeleton(skeletonDom);

              if (fallbackTree.length > 0) {
                interactiveTree = fallbackTree.map(node => ({
                  i: node.i,
                  r: node.r,
                  n: node.n,
                  v: node.v,
                }));
                domMode = 'semantic';
                console.log('[CurrentTask] Skeleton-based semantic fallback (RPC error):', {
                  nodeCount: interactiveTree.length,
                  errorMessage,
                });
              } else {
                console.warn('[CurrentTask] Skeleton fallback also empty, using skeleton mode');
                domMode = selectDomMode(safeInstructions, {
                  interactiveElementCount: skeletonStats.interactiveCount,
                });
              }
            }
          } else {
            // Semantic disabled - use skeleton/hybrid mode selection
            domMode = selectDomMode(safeInstructions, {
              interactiveElementCount: skeletonStats.interactiveCount,
            });
          }
          
          // Capture screenshot for hybrid mode (skip for skeleton-only and semantic modes)
          if (domMode === 'hybrid') {
            try {
              const screenshotResult = await captureAndOptimizeScreenshot();
              if (screenshotResult) {
                screenshotBase64 = screenshotResult.base64;
                screenshotHash = screenshotResult.hash;
                console.log('[CurrentTask] Screenshot captured:', {
                  width: screenshotResult.width,
                  height: screenshotResult.height,
                  sizeKB: Math.round(screenshotResult.sizeBytes / 1024),
                });
              } else {
                console.log('[CurrentTask] Screenshot unchanged (hash match), skipping');
              }
            } catch (screenshotError) {
              console.warn('[CurrentTask] Screenshot capture failed, continuing without:', screenshotError);
              // Continue without screenshot - skeleton still provides value
            }
          }
          
          // Log extraction summary
          if (domMode !== 'semantic') {
            console.log('[CurrentTask] Hybrid capture:', {
              domMode,
              fullDomLength: currentDom.length,
              skeletonLength: skeletonDom.length,
              compressionRatio: `${skeletonStats.compressionRatio}%`,
              interactiveElements: skeletonStats.interactiveCount,
              hasScreenshot: screenshotBase64 !== null,
            });
          }

          // CRITICAL FIX: Validate payload size before sending to backend
          // Prevents 413 Payload Too Large errors and reduces API costs
          // Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #2 (Payload Explosion)
          try {
            validatePayloadSize(currentDom);
          } catch (payloadError) {
            if (payloadError instanceof PayloadTooLargeError) {
              console.error('[CurrentTask] DOM payload too large:', {
                actualSize: payloadError.actualSize,
                maxSize: payloadError.maxSize,
              });
              
              // Add error to history
              set((state) => {
                state.currentTask.displayHistory.push({
                  thought: `Error: ${PAYLOAD_TOO_LARGE_MESSAGE}`,
                  action: '',
                  parsedAction: {
                    error: PAYLOAD_TOO_LARGE_MESSAGE,
                  },
                });
                state.currentTask.status = 'error';
              });
              
              // Show user-friendly error
              onError(PAYLOAD_TOO_LARGE_MESSAGE);
              break;
            }
            throw payloadError; // Re-throw unexpected errors
          }

          if (wasStopped()) break;
          setActionStatus('performing-query');

          try {
            // Get current taskId and sessionId (recover from storage if state lost — e.g. refresh)
            // Reference: INTERACT_FLOW_WALKTHROUGH.md § Client Contract: taskId Persistence
            let currentTaskId = get().currentTask.taskId;
            const currentSessionId = get().currentTask.sessionId;
            if (!currentTaskId) {
              currentTaskId = (await getTaskIdForTab(tabId)) ?? undefined;
              if (currentTaskId) {
                set((state) => {
                  state.currentTask.taskId = currentTaskId!;
                });
                console.debug('[CurrentTask] Recovered taskId from storage:', currentTaskId.slice(0, 8) + '...');
              }
            }
            if (currentTaskId) {
              console.debug('[CurrentTask] Sending follow-up request with taskId:', currentTaskId.slice(0, 8) + '...');
            }
            const lastActionResult = get().currentTask.lastActionResult;
            const lastDOMChanges = get().currentTask.lastDOMChanges;

            // CRITICAL: Capture the CURRENT URL just before sending interact request
            // This ensures the server receives the actual current page URL, not the stale URL from task start
            // The lastDOMChanges.previousUrl (if any) contains the URL BEFORE the last action was executed
            let currentUrl = url; // Default to initial URL
            try {
              const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
              if (currentTab?.url) {
                currentUrl = currentTab.url;
                // Update stored URL in state
                if (currentUrl !== get().currentTask.url) {
                  console.log('[CurrentTask] URL changed since task start:', {
                    originalUrl: url,
                    currentUrl,
                  });
                  set((state) => {
                    state.currentTask.url = currentUrl;
                  });
                }
              }
            } catch (urlError: unknown) {
              console.warn('Failed to capture current URL before interact:', urlError);
            }

            // NOTE: Removed API fallback for taskId recovery (GET /api/session/{sessionId}/task/active)
            // We now rely solely on chrome.storage.local for task persistence (Issue #3 fix)
            // Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)

            // Get debug actions for logging
            const addNetworkLog = get().debug?.actions.addNetworkLog;

            // Prepare error information for server
            const lastActionStatus = lastActionResult 
              ? (lastActionResult.success ? 'success' : 'failure')
              : undefined;
            const lastActionError = lastActionResult && !lastActionResult.success && lastActionResult.error
              ? lastActionResult.error
              : undefined;
            const lastActionResultPayload = lastActionResult
              ? {
                  success: lastActionResult.success,
                  actualState: lastActionResult.actualState,
                }
              : undefined;

            // Build clientObservations from lastDOMChanges (optional; improves verification accuracy)
            // Reference: INTERACT_FLOW_WALKTHROUGH.md § Client Contract: clientObservations
            const clientObservations: ClientObservations | undefined = lastDOMChanges
              ? {
                  didUrlChange: lastDOMChanges.urlChanged,
                  didDomMutate:
                    (lastDOMChanges.addedCount ?? 0) + (lastDOMChanges.removedCount ?? 0) > 0,
                  didNetworkOccur: lastDOMChanges.didNetworkOccur,
                }
              : undefined;

            // CRITICAL FIX: Start keep-alive heartbeat before LLM API call
            // This prevents Chrome from killing the Service Worker during long-running requests
            // Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #1 (Service Worker Death)
            await startKeepAlive();

            // Call agentInteract API with logging, error, DOM change, and client observations
            // IMPORTANT: Use currentUrl (just captured above), not the stale 'url' from task start
            // HYBRID: Pass screenshot and skeleton DOM when available
            let response: Awaited<ReturnType<typeof apiClient.agentInteract>>;
            try {
              response = await apiClient.agentInteract(
                currentUrl,
                safeInstructions,
                currentDom,
                currentTaskId,
                currentSessionId,
                lastActionStatus,
                lastActionError,
                lastActionResultPayload,
                addNetworkLog ? (log) => {
                  addNetworkLog({
                    method: log.method,
                    endpoint: log.endpoint,
                    request: log.request,
                    response: log.response,
                    duration: log.duration,
                    error: log.error,
                  });
                } : undefined,
                lastDOMChanges || undefined,
                clientObservations,
                // V3 Semantic (PRIMARY) + Skeleton/Hybrid (fallback)
                // Reference: DOM_EXTRACTION_ARCHITECTURE.md §2 (V3 Architecture)
                {
                  screenshot: screenshotBase64,
                  skeletonDom,
                  domMode: domMode as 'skeleton' | 'full' | 'hybrid' | 'semantic',
                  screenshotHash: screenshotHash || undefined,
                  // Semantic JSON Protocol (PRIMARY - ultra-light format)
                  interactiveTree: domMode === 'semantic' ? interactiveTree : undefined,
                  viewport: domMode === 'semantic' ? viewport : undefined,
                  pageTitle: pageTitle,
                },
                tabId
              );
            } finally {
              // CRITICAL: Stop keep-alive as soon as API response is received
              // This is in the finally block to ensure cleanup even on errors
              await stopKeepAlive();
            }

            // Normalize response: support top-level or wrapped { data: { ... } } (backend contract)
            const res = response && typeof response === 'object' && 'data' in response && response.data && typeof response.data === 'object'
              ? (response as { data: Record<string, unknown> }).data
              : (response as Record<string, unknown>);

            // BACKEND-DRIVEN NEGOTIATION: Handle needs_full_dom or needs_context responses
            // When semantic/skeleton DOM is insufficient, server requests additional artifacts
            // Reference: SPECS_AND_CONTRACTS.md §5.4.3 (Backend-Driven Negotiation)
            if (response.status === 'needs_full_dom' || response.status === 'needs_context') {
              const requestedMode = response.requestedDomMode || 'full';
              const needsScreenshot = response.needsScreenshot ?? (requestedMode === 'hybrid');
              const needsSkeleton = response.needsSkeletonDom ?? true;

              console.log('[CurrentTask] Server requested additional context:', {
                status: response.status,
                requestedMode,
                needsScreenshot,
                needsSkeleton,
                reason: response.reason || response.needsFullDomReason,
                requestedElement: response.requestedElement,
              });

              // Capture screenshot if requested and not already available
              let retryScreenshot = screenshotBase64;
              if (needsScreenshot && !retryScreenshot) {
                try {
                  const screenshotResult = await captureAndOptimizeScreenshot();
                  if (screenshotResult) {
                    retryScreenshot = screenshotResult.base64;
                  }
                } catch (err) {
                  console.warn('[CurrentTask] Screenshot capture failed for retry:', err);
                }
              }

              // Retry the same request with requested artifacts
              await startKeepAlive();
              try {
                response = await apiClient.agentInteract(
                  currentUrl,
                  safeInstructions,
                  currentDom,
                  currentTaskId,
                  currentSessionId,
                  lastActionStatus,
                  lastActionError,
                  lastActionResultPayload,
                  addNetworkLog ? (log) => {
                    addNetworkLog({
                      method: log.method,
                      endpoint: log.endpoint,
                      request: log.request,
                      response: log.response,
                      duration: log.duration,
                      error: log.error,
                    });
                  } : undefined,
                  lastDOMChanges || undefined,
                  clientObservations,
                  // Send only what backend requested
                  {
                    screenshot: needsScreenshot ? retryScreenshot : undefined,
                    skeletonDom: needsSkeleton ? skeletonDom : undefined,
                    domMode: requestedMode as 'skeleton' | 'full' | 'hybrid',
                    screenshotHash: screenshotHash || undefined,
                  },
                  tabId
                );
              } finally {
                await stopKeepAlive();
              }

              console.log('[CurrentTask] Retry with', requestedMode, 'mode completed');
            }

            // Store taskId from response so follow-up requests send it (required for loop to advance)
            // Support both camelCase (taskId) and snake_case (task_id)
            const taskIdFromResponse = (res?.taskId ?? (res?.task_id as string | undefined)) as string | undefined;
            if (taskIdFromResponse) {
              set((state) => {
                state.currentTask.taskId = taskIdFromResponse;
                if (!state.currentTask.sessionId) {
                  state.currentTask.sessionId = taskIdFromResponse;
                }
              });
              // Persist taskId by tab so we recover after refresh/restart (INTERACT_FLOW_WALKTHROUGH § taskId Persistence)
              const urlToStore = get().currentTask.url ?? url;
              persistTaskState(tabId, {
                taskId: taskIdFromResponse,
                sessionId: (res?.sessionId as string | undefined) ?? get().currentTask.sessionId ?? null,
                url: urlToStore,
                timestamp: Date.now(),
              }).catch(() => {});
              console.debug('[CurrentTask] Stored taskId for follow-up requests:', taskIdFromResponse.slice(0, 8) + '...');
            }

            // Store sessionId if returned
            const sessionIdFromResponse = res?.sessionId as string | undefined;
            if (sessionIdFromResponse) {
              set((state) => {
                state.currentTask.sessionId = sessionIdFromResponse;
              });
              
              // Create or update session summary using sessionService
              const sessionTitle = safeInstructions.length > 50 
                ? safeInstructions.substring(0, 50) + '...' 
                : safeInstructions;
              
              // Update or create session entry (updateSession will create if it doesn't exist)
              await get().sessions.actions.updateSession(sessionIdFromResponse, {
                title: sessionTitle,
                url: url,
                createdAt: get().currentTask.createdAt?.getTime() || Date.now(),
                updatedAt: Date.now(),
                messageCount: get().currentTask.messages.length,
                status: 'active',
              });
              
              // Reload sessions to ensure state is in sync
              await get().sessions.actions.loadSessions();
              
              // Set as current session
              get().sessions.actions.setCurrentSession(sessionIdFromResponse);
            } else if (get().currentTask.sessionId) {
              // If we already have a sessionId but server didn't return one, update the session
              const sessionTitle = safeInstructions.length > 50 
                ? safeInstructions.substring(0, 50) + '...' 
                : safeInstructions;
              
              await get().sessions.actions.updateSession(get().currentTask.sessionId, {
                title: sessionTitle,
                url: url,
                updatedAt: Date.now(),
                messageCount: get().currentTask.messages.length,
              });
            }

            // Store hasOrgKnowledge for debug panel health signals
            if (response.hasOrgKnowledge !== undefined) {
              set((state) => {
                state.currentTask.hasOrgKnowledge = response.hasOrgKnowledge ?? null;
              });
            }

            // Store orchestrator plan data (Task 6)
            if (response.plan) {
              set((state) => {
                // Validate and transform plan steps to ensure description is always a string
                const validatedPlan: ActionPlan = {
                  steps: (response.plan!.steps || []).map((step) => ({
                    id: step.id || '',
                    description: typeof step.description === 'string' 
                      ? step.description 
                      : (typeof step.description === 'object' && step.description !== null && 'description' in step.description)
                        ? String(step.description.description || '')
                        : String(step.description || ''),
                    status: step.status || 'pending',
                    toolType: step.toolType,
                    reasoning: step.reasoning,
                    expectedOutcome: step.expectedOutcome,
                  })),
                  currentStepIndex: response.plan!.currentStepIndex ?? 0,
                };
                state.currentTask.plan = validatedPlan;
              });
            }
            if (response.currentStep !== undefined) {
              set((state) => {
                state.currentTask.currentStep = response.currentStep ?? null;
              });
            }
            if (response.totalSteps !== undefined) {
              set((state) => {
                state.currentTask.totalSteps = response.totalSteps ?? null;
              });
            }
            if (response.status) {
              set((state) => {
                state.currentTask.orchestratorStatus = response.status ?? null;
              });
            }

            // Store verification result (Task 7)
            if (response.verification) {
              set((state) => {
                const verification: VerificationResult = {
                  stepIndex: response.verification!.stepIndex,
                  success: response.verification!.success,
                  confidence: response.verification!.confidence,
                  expectedState: response.verification!.expectedState,
                  actualState: response.verification!.actualState,
                  reason: response.verification!.reason,
                  timestamp: response.verification!.timestamp
                    ? new Date(response.verification!.timestamp)
                    : new Date(),
                };
                state.currentTask.verificationHistory.push(verification);
              });
            }

            // Store correction result (Task 8)
            if (response.correction) {
              set((state) => {
                // Use currentStep as fallback if stepIndex is missing or invalid
                const fallbackStepIndex = typeof state.currentTask.currentStep === 'number' 
                  ? state.currentTask.currentStep 
                  : 0;
                
                const correction: CorrectionResult = {
                  stepIndex: typeof response.correction!.stepIndex === 'number' && !isNaN(response.correction!.stepIndex)
                    ? response.correction!.stepIndex
                    : fallbackStepIndex,
                  strategy: response.correction!.strategy || 'UNKNOWN',
                  reason: response.correction!.reason || 'No reason provided',
                  attemptNumber: typeof response.correction!.attemptNumber === 'number' && !isNaN(response.correction!.attemptNumber)
                    ? response.correction!.attemptNumber
                    : 1,
                  originalStep: response.correction!.originalStep,
                  correctedStep: response.correction!.correctedStep,
                  timestamp: response.correction!.timestamp
                    ? new Date(response.correction!.timestamp)
                    : new Date(),
                };
                state.currentTask.correctionHistory.push(correction);
              });
            }

            // Show hasOrgKnowledge dialog if false (only once per task)
            if (response.hasOrgKnowledge === false && !hasOrgKnowledgeShown) {
              hasOrgKnowledgeShown = true;
              // Show dialog - this is a non-blocking notification
              // Reference: THIN_CLIENT_ROADMAP.md §1.4, §4.1
              onError('No organization knowledge available for this website. Using public knowledge only.');
            }

            if (wasStopped()) break;

            setActionStatus('performing-action');
            
            // Use normalized res (defined above) for thought and action
            const actionValue = res?.action;
            const thoughtValue = res?.thought;
            
            // Type guard: Ensure thought and action are strings to prevent React error #130
            const safeThought = typeof thoughtValue === 'string' ? thoughtValue : String(thoughtValue ?? '');
            const safeActionRaw = typeof actionValue === 'string' ? actionValue : String(actionValue ?? '');
            const safeAction = safeActionRaw.trim(); // Backend may send with whitespace/newlines
            
            // Client-side verification: log when action is missing so we can confirm backend contract
            if (!safeAction) {
              console.warn(
                '[CurrentTask] Interact response missing or empty action. Backend should return { action: "click(123)" }. Received keys:',
                res && typeof res === 'object' ? Object.keys(res) : 'non-object',
                'action type:',
                typeof actionValue
              );
            }
            
            // Parse action string (parseAction also trims and normalizes)
            const parsed = parseAction(safeAction);
            
            // DEBUG: Log parsed action for troubleshooting
            console.log('[CurrentTask] Action received from backend:', {
              rawAction: safeAction,
              rawThought: safeThought?.substring(0, 100) + (safeThought?.length > 100 ? '...' : ''),
              parsedResult: 'error' in parsed ? { error: parsed.error } : { 
                name: parsed.parsedAction.name, 
                args: parsed.parsedAction.args 
              },
            });
            
            // Add thought from response
            // Type guard: check if parsed has error property
            const parsedWithThought: ParsedAction = 'error' in parsed
              ? parsed
              : {
                  ...parsed,
                  thought: safeThought,
                };

            // Add to display-only history (backward compatibility)
            set((state) => {
              state.currentTask.displayHistory.push({
                thought: safeThought,
                action: safeAction,
                usage: response.usage,
                parsedAction: parsedWithThought,
                expectedOutcome: response.expectedOutcome, // Task 9: Store expected outcome for verification context
              });
            });
            
            // Check if this is a NEEDS_USER_INPUT response
            const isNeedsUserInput = response.status === 'needs_user_input' || 
                                     safeAction.toLowerCase() === 'ask_user()' ||
                                     (response.userQuestion && response.userQuestion.trim().length > 0);
            
            // Add assistant message to chat
            const assistantMessageId = get().currentTask.actions.addAssistantMessage(
              safeThought,
              safeAction,
              parsedWithThought.parsedAction
            );
            
            // Update message with usage, expected outcome, and reasoning data
            if (response.usage || response.expectedOutcome || response.reasoning || isNeedsUserInput) {
              set((state) => {
                const message = state.currentTask.messages.find(m => m.id === assistantMessageId);
                if (message) {
                  if (!message.meta) {
                    message.meta = {};
                  }
                  if (response.usage) {
                    message.meta.usage = response.usage;
                  }
                  if (response.expectedOutcome) {
                    message.meta.expectedOutcome = response.expectedOutcome;
                  }
                  // Add reasoning metadata (Enhanced v2.0)
                  if (response.reasoning) {
                    message.meta.reasoning = {
                      source: response.reasoning.source,
                      confidence: typeof response.reasoning.confidence === 'number' 
                        ? Math.max(0, Math.min(1, response.reasoning.confidence)) // Clamp to 0-1
                        : 0.5,
                      reasoning: typeof response.reasoning.reasoning === 'string'
                        ? response.reasoning.reasoning
                        : String(response.reasoning.reasoning || ''),
                      missingInfo: Array.isArray(response.reasoning.missingInfo)
                        ? response.reasoning.missingInfo.map((item) => {
                            // Handle both old format (string) and new format (object)
                            if (typeof item === 'string') {
                              return {
                                field: item,
                                type: 'PRIVATE_DATA' as const,
                                description: item,
                              };
                            }
                            return {
                              field: typeof item.field === 'string' ? item.field : String(item.field || ''),
                              type: (item.type === 'EXTERNAL_KNOWLEDGE' || item.type === 'PRIVATE_DATA')
                                ? item.type
                                : 'PRIVATE_DATA' as const,
                              description: typeof item.description === 'string' 
                                ? item.description 
                                : String(item.description || item.field || ''),
                            };
                          })
                        : undefined,
                      evidence: response.reasoning.evidence ? {
                        sources: Array.isArray(response.reasoning.evidence.sources)
                          ? response.reasoning.evidence.sources.map(s => typeof s === 'string' ? s : String(s || ''))
                          : [],
                        quality: (response.reasoning.evidence.quality === 'high' || 
                                 response.reasoning.evidence.quality === 'medium' || 
                                 response.reasoning.evidence.quality === 'low')
                          ? response.reasoning.evidence.quality
                          : 'medium' as const,
                        gaps: Array.isArray(response.reasoning.evidence.gaps)
                          ? response.reasoning.evidence.gaps.map(g => typeof g === 'string' ? g : String(g || ''))
                          : [],
                      } : undefined,
                      searchIteration: response.reasoning.searchIteration ? {
                        attempt: typeof response.reasoning.searchIteration.attempt === 'number'
                          ? response.reasoning.searchIteration.attempt
                          : 1,
                        maxAttempts: typeof response.reasoning.searchIteration.maxAttempts === 'number'
                          ? response.reasoning.searchIteration.maxAttempts
                          : 3,
                        refinedQuery: typeof response.reasoning.searchIteration.refinedQuery === 'string'
                          ? response.reasoning.searchIteration.refinedQuery
                          : undefined,
                        evaluationResult: response.reasoning.searchIteration.evaluationResult ? {
                          solved: Boolean(response.reasoning.searchIteration.evaluationResult.solved),
                          shouldRetry: Boolean(response.reasoning.searchIteration.evaluationResult.shouldRetry),
                          shouldAskUser: Boolean(response.reasoning.searchIteration.evaluationResult.shouldAskUser),
                          confidence: typeof response.reasoning.searchIteration.evaluationResult.confidence === 'number'
                            ? Math.max(0, Math.min(1, response.reasoning.searchIteration.evaluationResult.confidence))
                            : 0.5,
                        } : undefined,
                      } : undefined,
                    };
                  }
                  // Add reasoning context
                  if (response.reasoningContext) {
                    message.meta.reasoningContext = {
                      searchPerformed: response.reasoningContext.searchPerformed || false,
                      searchSummary: typeof response.reasoningContext.searchSummary === 'string'
                        ? response.reasoningContext.searchSummary
                        : undefined,
                    };
                  }
                  // Handle NEEDS_USER_INPUT status (Enhanced v2.0)
                  if (isNeedsUserInput) {
                    message.status = 'pending'; // Keep as pending until user responds
                    message.userQuestion = typeof response.userQuestion === 'string'
                      ? response.userQuestion
                      : safeThought; // Fallback to thought if no specific question
                    // Handle both old format (string[]) and new format (MissingInfoField[])
                    message.missingInformation = Array.isArray(response.missingInformation)
                      ? response.missingInformation.map((item) => {
                          if (typeof item === 'string') {
                            return {
                              field: item,
                              type: 'PRIVATE_DATA' as const,
                              description: item,
                            };
                          }
                          return {
                            field: typeof item.field === 'string' ? item.field : String(item.field || ''),
                            type: (item.type === 'EXTERNAL_KNOWLEDGE' || item.type === 'PRIVATE_DATA')
                              ? item.type
                              : 'PRIVATE_DATA' as const,
                            description: typeof item.description === 'string' 
                              ? item.description 
                              : String(item.description || item.field || ''),
                          };
                        })
                      : [];
                  }
                }
              });
            }

            // Handle NEEDS_USER_INPUT - stop execution and wait for user response
            if (isNeedsUserInput) {
              set((state) => {
                state.currentTask.status = 'idle'; // Pause execution (not 'running')
                state.currentTask.actionStatus = 'idle';
              });
              // Break the loop - wait for user to provide input
              // When user submits new instructions, runTask will be called again
              // and the loop will continue with the new context
              break;
            }

            // Handle errors
            if ('error' in parsedWithThought) {
              onError(parsedWithThought.error);
              break;
            }

            // Handle finish/fail actions
            if (
              parsedWithThought.parsedAction.name === 'finish' ||
              parsedWithThought.parsedAction.name === 'fail'
            ) {
              break;
            }

            // Execute action and track result
            const actionName = parsedWithThought.parsedAction.name;
            const actionArgs = parsedWithThought.parsedAction.args;
            const actionString = safeAction; // Use validated safeAction instead of response.action
            
            // Extract selectorPath from actionDetails if available (for robust element finding)
            // Reference: ROBUST_ELEMENT_SELECTORS_SPEC.md
            const selectorPath = response.actionDetails?.selectorPath;
            
            // Create action step
            const stepId = generateUUID();
            const stepStartTime = Date.now();
            
            let executionResult: ActionExecutionResult | null = null;
            let domChangeReport: DOMChangeReport | null = null;
            
            // CRITICAL: Capture URL BEFORE executing action (for verification)
            // This allows the server to detect URL changes after actions like click()
            let beforeUrl: string = url; // Default to initial URL
            try {
              const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
              if (currentTab?.url) {
                beforeUrl = currentTab.url;
              }
            } catch (urlError: unknown) {
              console.warn('Failed to capture URL before action:', urlError);
            }
            
            // Capture DOM snapshot BEFORE executing action (for change tracking)
            let beforeSnapshot: Map<string, ElementInfo> = new Map();
            try {
              // Pass tabId to ensure we target the correct tab
              beforeSnapshot = await getInteractiveElementSnapshot(tabId);
            } catch (snapshotError: unknown) {
              console.warn('Failed to capture DOM snapshot before action:', snapshotError);
            }

            // Mark start of network observation window for clientObservations.didNetworkOccur
            // CDP-based network tracking (no content script needed)
            // Reference: INTERACT_FLOW_WALKTHROUGH.md § Client Contract: clientObservations
            cdpSetNetworkObservationMark(tabId);
            
            // Check if we're clicking a dropdown/popup button (hasPopup attribute)
            // This helps us wait longer for menu items to appear
            let isDropdownClick = false;
            if (actionName === 'click' && actionArgs && 'elementId' in actionArgs) {
              const elementId = actionArgs.elementId as number;
              const hybridElements = get().currentTask.hybridElements;
              if (hybridElements && Array.isArray(hybridElements) && elementId >= 0 && elementId < hybridElements.length) {
                const element = hybridElements[elementId];
                // Check if element has hasPopup attribute (indicates dropdown/popup button)
                if (element && (element.hasPopup || element.attributes?.['aria-haspopup'] || element.attributes?.['data-has-popup'])) {
                  isDropdownClick = true;
                  console.log('Detected dropdown/popup button click, will wait longer for menu items to appear', {
                    elementId,
                    hasPopup: element.hasPopup,
                    ariaHaspopup: element.attributes?.['aria-haspopup'],
                  });
                }
              }
            }
            
            try {
              // DEBUG: Log before action execution
              console.log('[CurrentTask] Executing action:', {
                actionName,
                actionArgs,
                actionString,
                tabId,
              });
              
              // Handle legacy actions (click, setValue) via domActions for backward compatibility
              if (actionName === 'click' || actionName === 'setValue') {
                console.log('[CurrentTask] Using callDOMAction for:', actionName);
                // Include selectorPath for robust element finding (fixes stale element ID issues)
                // Reference: ROBUST_ELEMENT_SELECTORS_SPEC.md
                const argsWithSelector = selectorPath 
                  ? { ...(actionArgs as Record<string, unknown>), selectorPath }
                  : actionArgs;
                executionResult = await callDOMAction(actionName as 'click' | 'setValue', argsWithSelector as any);
                console.log('[CurrentTask] callDOMAction result:', executionResult);
              } else {
                // Use new action executors for all other actions
                console.log('[CurrentTask] Using executeAction for:', actionName);
                const { executeAction } = await import('../helpers/actionExecutors');
                try {
                  await executeAction(actionName, actionArgs);
                  executionResult = { success: true };
                  console.log('[CurrentTask] executeAction completed successfully');
                } catch (error: unknown) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
                  console.error('[CurrentTask] executeAction failed:', errorMessage);
                  
                  // CRITICAL FIX: Try fallback injection for press actions
                  // The debugger-based approach may fail due to connection issues or
                  // parameter serialization problems (e.g., modifiers type mismatch)
                  const isRecoverableError = 
                    errorMessage.includes('Failed to deserialize') ||
                    errorMessage.includes('Invalid parameters') ||
                    errorMessage.includes('Receiving end does not exist') ||
                    errorMessage.includes('Could not establish connection') ||
                    errorMessage.includes('int32 value expected');
                  
                  if (isRecoverableError && (actionName === 'press' || actionName === 'pressKey')) {
                    console.warn('[CurrentTask] Attempting fallback injection for press action...');
                    try {
                      const keyArg = actionArgs && typeof actionArgs === 'object' && 'key' in actionArgs 
                        ? (actionArgs as { key: string }).key 
                        : undefined;
                      
                      if (keyArg && tabId) {
                        // Use direct script injection to dispatch keyboard event
                        const results = await chrome.scripting.executeScript({
                          target: { tabId },
                          func: (keyName: string) => {
                            try {
                              var targetElement = document.activeElement || document.body;
                              
                              // Key mapping for common keys
                              var keyMap: { [key: string]: { key: string; code: string; keyCode: number } } = {
                                'Enter': { key: 'Enter', code: 'Enter', keyCode: 13 },
                                'Tab': { key: 'Tab', code: 'Tab', keyCode: 9 },
                                'Escape': { key: 'Escape', code: 'Escape', keyCode: 27 },
                                'Backspace': { key: 'Backspace', code: 'Backspace', keyCode: 8 },
                                'Delete': { key: 'Delete', code: 'Delete', keyCode: 46 },
                                'ArrowUp': { key: 'ArrowUp', code: 'ArrowUp', keyCode: 38 },
                                'ArrowDown': { key: 'ArrowDown', code: 'ArrowDown', keyCode: 40 },
                                'ArrowLeft': { key: 'ArrowLeft', code: 'ArrowLeft', keyCode: 37 },
                                'ArrowRight': { key: 'ArrowRight', code: 'ArrowRight', keyCode: 39 },
                                'Space': { key: ' ', code: 'Space', keyCode: 32 },
                                ' ': { key: ' ', code: 'Space', keyCode: 32 },
                              };
                              
                              var keyInfo = keyMap[keyName] || { key: keyName, code: keyName, keyCode: 0 };
                              
                              // Dispatch keydown
                              var keydownEvent = new KeyboardEvent('keydown', {
                                key: keyInfo.key,
                                code: keyInfo.code,
                                keyCode: keyInfo.keyCode,
                                which: keyInfo.keyCode,
                                bubbles: true,
                                cancelable: true,
                              });
                              targetElement.dispatchEvent(keydownEvent);
                              
                              // For Enter key on inputs in forms, try to submit
                              if (keyName === 'Enter') {
                                var inputElement = targetElement as HTMLInputElement;
                                if (inputElement && inputElement.form) {
                                  var submitEvent = new Event('submit', { bubbles: true, cancelable: true });
                                  var shouldSubmit = inputElement.form.dispatchEvent(submitEvent);
                                  if (shouldSubmit) {
                                    inputElement.form.submit();
                                  }
                                }
                              }
                              
                              // Dispatch keyup
                              var keyupEvent = new KeyboardEvent('keyup', {
                                key: keyInfo.key,
                                code: keyInfo.code,
                                keyCode: keyInfo.keyCode,
                                which: keyInfo.keyCode,
                                bubbles: true,
                                cancelable: true,
                              });
                              targetElement.dispatchEvent(keyupEvent);
                              
                              return { success: true };
                            } catch (e) {
                              return { success: false, error: e instanceof Error ? e.message : String(e) };
                            }
                          },
                          args: [keyArg],
                          world: 'MAIN',
                        });
                        
                        if (results && results[0] && results[0].result && results[0].result.success) {
                          console.log('[CurrentTask] Fallback press injection succeeded');
                          executionResult = { success: true };
                        } else {
                          const fallbackError = results?.[0]?.result?.error || 'Unknown fallback error';
                          console.error('[CurrentTask] Fallback press injection failed:', fallbackError);
                          executionResult = {
                            success: false,
                            error: {
                              message: `Action failed: ${errorMessage}. Fallback also failed: ${fallbackError}`,
                              code: 'ACTION_EXECUTION_FAILED',
                              action: actionString,
                            },
                            actualState: errorMessage,
                          };
                        }
                      } else {
                        // No key argument or tabId, can't do fallback
                        executionResult = {
                          success: false,
                          error: {
                            message: errorMessage,
                            code: 'ACTION_EXECUTION_FAILED',
                            action: actionString,
                          },
                          actualState: errorMessage,
                        };
                      }
                    } catch (fallbackError: unknown) {
                      const fallbackErrorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
                      console.error('[CurrentTask] Fallback press injection threw:', fallbackErrorMessage);
                      executionResult = {
                        success: false,
                        error: {
                          message: `Action failed: ${errorMessage}. Fallback error: ${fallbackErrorMessage}`,
                          code: 'ACTION_EXECUTION_FAILED',
                          action: actionString,
                        },
                        actualState: errorMessage,
                      };
                    }
                  } else {
                    executionResult = {
                      success: false,
                      error: {
                        message: errorMessage,
                        code: 'ACTION_EXECUTION_FAILED',
                        action: actionString,
                      },
                      actualState: errorMessage,
                    };
                  }
                }
              }
              
              // CRITICAL FIX: Update last action time for new tab detection
              // Store in chrome.storage so background script can access it
              const actionTime = Date.now();
              try {
                await chrome.storage.local.set({
                  lastActionTime: actionTime,
                  currentTaskStatus: get().currentTask.status,
                });
              } catch (error) {
                console.warn('Failed to store last action time:', error);
              }
              
              // CRITICAL FIX: Update active task timestamp (Issue #3)
              // This prevents the task from being considered stale during long operations
              // Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)
              await updateActiveTaskTimestamp();
              
              // CRITICAL FIX: Detect navigation actions BEFORE trying to access content script
              // Navigation actions (navigate, goBack, goForward, search) kill the content script
              // on the old page, so waitForDOMChangesAfterAction will fail
              const navigationActions = ['navigate', 'goBack', 'goForward', 'search'];
              const isNavigationAction = navigationActions.includes(actionName);
              
              if (isNavigationAction) {
                // For navigation actions, the content script died - DON'T try to get DOM changes
                // Instead, wait for the new page to load and content script to initialize
                console.log('[CurrentTask] Navigation action detected, waiting for new page...');
                
                // Capture URL AFTER navigation
                let afterUrl: string = beforeUrl;
                try {
                  const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                  if (currentTab?.url) {
                    afterUrl = currentTab.url;
                  }
                } catch (urlError: unknown) {
                  console.warn('Failed to capture URL after navigation:', urlError);
                }
                
                const urlChanged = beforeUrl !== afterUrl;
                console.log('[CurrentTask] Navigation result:', { beforeUrl, afterUrl, urlChanged });
                
                // Wait for new page's content script to be ready
                console.log('[CurrentTask] Waiting for new page content script...');
                await sleep(2000); // Initial wait for page to start loading
                
                // Try to ping the content script to verify it's ready
                // Wait for page to be ready via CDP (no content script needed)
                const pageReady = await cdpWaitForPageReady(tabId, 12000); // 12 second timeout
                if (pageReady) {
                  console.log('[CurrentTask] Page ready after navigation (CDP)');
                } else {
                  console.warn('[CurrentTask] Page readiness timeout after navigation - will retry in DOM extraction');
                }
                
                // Store minimal DOM changes for navigation (no actual DOM diff available)
                set((state) => {
                  state.currentTask.lastDOMChanges = {
                    addedCount: 0,
                    removedCount: 0,
                    dropdownDetected: false,
                    stabilizationTime: 0,
                    previousUrl: beforeUrl,
                    urlChanged,
                    didNetworkOccur: true, // Navigation always involves network
                  };
                  if (urlChanged) {
                    state.currentTask.url = afterUrl;
                  }
                });
              } else {
                // For non-navigation actions, use normal DOM change tracking
                // Wait for DOM stability before next capture (prevents "snapshot race" — INTERACT_FLOW_WALKTHROUGH § Stability Wait)
                // minWait 500ms, DOM settled 300ms, network idle; dropdown clicks use longer waits
                try {
                  const waitConfig = isDropdownClick
                    ? {
                        minWait: 1000, // Wait at least 1 second for dropdown to open
                        maxWait: 8000, // Max 8 seconds for menu items to appear
                        stabilityThreshold: 500, // DOM stable for 500ms (longer for dropdowns)
                      }
                    : {
                        minWait: 500,
                        maxWait: 5000, // Max 5 seconds for dropdown/menu detection
                        stabilityThreshold: 300, // DOM stable for 300ms
                      };
                  
                  console.log('Waiting for DOM changes after action', {
                    action: actionString,
                    isDropdownClick,
                    waitConfig,
                    beforeSnapshotSize: beforeSnapshot.size,
                  });
                  
                  // Pass tabId to ensure we target the correct tab
                  domChangeReport = await waitForDOMChangesAfterAction(beforeSnapshot, waitConfig, tabId);
                  
                  console.log('DOM changes detected', {
                    addedCount: domChangeReport.addedElements.length,
                    removedCount: domChangeReport.removedElements.length,
                    dropdownDetected: domChangeReport.dropdownDetected,
                    dropdownItemsCount: domChangeReport.dropdownItems?.length || 0,
                    stabilizationTime: domChangeReport.stabilizationTime,
                    addedElements: domChangeReport.addedElements.slice(0, 5).map(el => ({
                      tagName: el.tagName,
                      role: el.role,
                      text: el.text?.substring(0, 30),
                      id: el.id,
                      interactive: el.interactive,
                    })),
                  });
                  
                  // Log DOM changes for debugging
                  if (domChangeReport.mutationCount > 0) {
                    console.log(formatDOMChangeReport(domChangeReport));
                  }
                  
                  // If dropdown detected, add context to execution result
                  if (domChangeReport.dropdownDetected && domChangeReport.dropdownItems) {
                    const dropdownContext = `Dropdown menu appeared with ${domChangeReport.dropdownItems.length} options: ${
                      domChangeReport.dropdownItems.slice(0, 5).map(i => i.text).filter(Boolean).join(', ')
                    }${domChangeReport.dropdownItems.length > 5 ? '...' : ''}`;
                    
                    console.log('Dropdown menu detected after click:', {
                      itemCount: domChangeReport.dropdownItems.length,
                      items: domChangeReport.dropdownItems.map(i => ({
                        text: i.text,
                        role: i.role,
                        id: i.id,
                        interactive: i.interactive,
                      })),
                      stabilizationTime: domChangeReport.stabilizationTime,
                    });
                    
                    // Enhance execution result with dropdown context
                    if (executionResult) {
                      executionResult.actualState = executionResult.actualState 
                        ? `${executionResult.actualState}. ${dropdownContext}`
                        : dropdownContext;
                    }
                    
                    // If dropdown was detected but no menu items found, log warning
                    if (domChangeReport.dropdownItems.length === 0) {
                      console.warn('Dropdown detected but no menu items found - menu items may not be interactive yet');
                    }
                  } else if (isDropdownClick && !domChangeReport.dropdownDetected) {
                    // If we clicked a dropdown but didn't detect it, log warning
                    console.warn('Clicked dropdown button but dropdown not detected - menu may not have appeared', {
                      elementId: actionArgs && 'elementId' in actionArgs ? actionArgs.elementId : 'unknown',
                      addedElements: domChangeReport.addedElements.length,
                      removedElements: domChangeReport.removedElements.length,
                    });
                  }
                  
                  // Capture URL AFTER action execution (for detecting navigation caused by click)
                  let afterUrl: string = beforeUrl;
                  try {
                    const [currentTab] = await chrome.tabs.query({ active: true, currentWindow: true });
                    if (currentTab?.url) {
                      afterUrl = currentTab.url;
                    }
                  } catch (urlError: unknown) {
                    console.warn('Failed to capture URL after action:', urlError);
                  }
                  
                  const urlChanged = beforeUrl !== afterUrl;
                  if (urlChanged) {
                    console.log('URL changed after action (navigation detected):', {
                      action: actionString,
                      beforeUrl,
                      afterUrl,
                    });
                    
                    // Wait for new page's content script to be ready after click-triggered navigation
                    console.log('[CurrentTask] Waiting for new page content script after click-triggered navigation...');
                    await sleep(2000);
                    
                    // Wait for page to be ready via CDP
                    const pageReady = await cdpWaitForPageReady(tabId, 5000);
                    if (pageReady) {
                      console.log('[CurrentTask] Page ready after click-triggered navigation (CDP)');
                    } else {
                      console.warn('[CurrentTask] Page readiness timeout after click-triggered navigation');
                    }
                  }

                  // Did any network request occur during/after action? (CDP-based tracking)
                  const didNetworkOccur = cdpGetDidNetworkOccurSinceMark(tabId);
                  
                  // Store DOM changes in state for next API call (including URL change info for verification)
                  set((state) => {
                    state.currentTask.lastDOMChanges = {
                      addedCount: domChangeReport!.addedElements.length,
                      removedCount: domChangeReport!.removedElements.length,
                      dropdownDetected: domChangeReport!.dropdownDetected,
                      dropdownOptions: domChangeReport!.dropdownItems?.map(i => i.text).filter(Boolean) as string[] | undefined,
                      stabilizationTime: domChangeReport!.stabilizationTime,
                      // Include URL change info for server-side verification
                      previousUrl: beforeUrl,
                      urlChanged,
                      didNetworkOccur,
                    };
                    // Update stored URL if it changed
                    if (urlChanged) {
                      state.currentTask.url = afterUrl;
                    }
                  });
                } catch (domWaitError: unknown) {
                  console.warn('DOM change tracking failed, falling back to fixed wait:', domWaitError);
                  await sleep(2000); // Fallback to fixed wait
                  // Clear DOM changes on failure
                  set((state) => {
                    state.currentTask.lastDOMChanges = null;
                  });
                }
              }
              
              // Store execution result for next API call
              set((state) => {
                state.currentTask.lastActionResult = executionResult;
              });
              
              // Add action step to message
              const stepDuration = Date.now() - stepStartTime;
              get().currentTask.actions.addActionStep(assistantMessageId, {
                id: stepId,
                action: actionString,
                parsedAction: parsedWithThought.parsedAction,
                status: executionResult.success ? 'success' : 'failure',
                error: executionResult.error,
                executionResult,
                timestamp: new Date(),
                duration: stepDuration,
              });
              
              // Update message status based on execution result
              get().currentTask.actions.updateMessageStatus(
                assistantMessageId,
                executionResult.success ? 'success' : 'failure',
                executionResult.error
              );
              
              // If action failed, log but continue (server will handle retry)
              if (!executionResult.success) {
                // CRITICAL FIX: Properly format error for logging to avoid [object Object]
                const errorMsg = executionResult.error
                  ? `${executionResult.error.message || 'Unknown error'} (code: ${executionResult.error.code || 'unknown'})`
                  : 'Unknown action error';
                console.warn('Action execution failed:', errorMsg);
                // Don't break - let server decide next action based on error
              }
            } catch (error: unknown) {
              // Unexpected error during execution
              const errorMessage = error instanceof Error ? error.message : String(error);
              executionResult = {
                success: false,
                error: {
                  message: errorMessage,
                  code: 'UNEXPECTED_ERROR',
                  action: actionString,
                },
                actualState: errorMessage,
              };
              
              set((state) => {
                state.currentTask.lastActionResult = executionResult;
              });
              
              // Add failed step
              get().currentTask.actions.addActionStep(assistantMessageId, {
                id: stepId,
                action: actionString,
                parsedAction: parsedWithThought.parsedAction,
                status: 'failure',
                error: executionResult.error,
                executionResult,
                timestamp: new Date(),
                duration: Date.now() - stepStartTime,
              });
              
              get().currentTask.actions.updateMessageStatus(
                assistantMessageId,
                'failure',
                executionResult.error
              );
              
              console.error('Unexpected error during action execution:', error);
              // Don't break - let server handle the error
            }

            if (wasStopped()) break;

            // If dropdown was detected, add extra wait to ensure menu items are fully interactive
            // This helps ensure menu items are included in the next DOM capture
            if (domChangeReport?.dropdownDetected && domChangeReport.dropdownItems && domChangeReport.dropdownItems.length > 0) {
              console.log('Dropdown detected, adding extra wait to ensure menu items are interactive before next DOM capture');
              await sleep(500); // Additional 500ms wait to ensure menu items are fully rendered and interactive
            }

            // Max steps limit (50)
            if (get().currentTask.displayHistory.length >= 50) {
              onError('Maximum number of actions (50) reached');
              break;
            }

            setActionStatus('waiting');
            
            // Save messages periodically
            await get().currentTask.actions.saveMessages();
            
            // Note: DOM waiting is now handled adaptively after action execution
            // using waitForDOMChangesAfterAction() instead of fixed sleep
          } catch (error: unknown) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            
            // Handle 401 - clear token, show login, halt task
            if (errorMessage === 'UNAUTHORIZED') {
              await chrome.storage.local.remove(['accessToken', 'expiresAt', 'user', 'tenantId', 'tenantName']);
              onError('Please log in to continue');
              set((state) => {
                state.currentTask.status = 'error';
              });
              break;
            }

            // Handle 404 - task not found
            if (errorMessage.includes('404') || errorMessage.includes('not found')) {
              onError('Task not found. Please start a new task.');
              set((state) => {
                state.currentTask.status = 'error';
              });
              break;
            }

            // Handle 409 - task already completed/failed
            if (errorMessage.includes('409') || errorMessage.includes('conflict')) {
              onError('Task has already been completed or failed.');
              set((state) => {
                state.currentTask.status = 'error';
              });
              break;
            }
            
            // Handle MAX_RETRIES_EXCEEDED - task failed after multiple correction attempts
            if (errorMessage.includes('MAX_RETRIES_EXCEEDED')) {
              const userMessage = errorMessage.split(': ').slice(1).join(': ') || 
                'The task could not be completed after multiple attempts. The page may have changed or the action could not be verified. Please try again or simplify your request.';
              onError(userMessage);
              
              // Add a final message to the chat showing the failure
              set((state) => {
                const failureMessage = {
                  id: generateUUID(),
                  role: 'assistant' as const,
                  content: `I was unable to complete this task after several attempts. ${userMessage}`,
                  status: 'failure' as const,
                  timestamp: new Date(),
                  error: {
                    message: userMessage,
                    code: 'MAX_RETRIES_EXCEEDED',
                  },
                };
                if (Array.isArray(state.currentTask.messages)) {
                  state.currentTask.messages.push(failureMessage);
                }
                state.currentTask.status = 'error';
              });
              break;
            }
            
            // Handle VERIFICATION_FAILED - action couldn't be verified
            if (errorMessage.includes('VERIFICATION_FAILED')) {
              const userMessage = errorMessage.split(': ').slice(1).join(': ') || 
                'The action was attempted but could not be verified. The page may not have responded as expected.';
              onError(userMessage);
              set((state) => {
                state.currentTask.status = 'error';
              });
              break;
            }
            
            // Handle ELEMENT_NOT_FOUND - couldn't find the target element
            if (errorMessage.includes('ELEMENT_NOT_FOUND')) {
              const userMessage = errorMessage.split(': ').slice(1).join(': ') || 
                'Could not find the element to interact with. The page may have changed.';
              onError(userMessage);
              set((state) => {
                state.currentTask.status = 'error';
              });
              break;
            }
            
            // Handle INVALID_ACTION - action not valid
            if (errorMessage.includes('INVALID_ACTION')) {
              const userMessage = errorMessage.split(': ').slice(1).join(': ') || 
                'The requested action is not valid for this page.';
              onError(userMessage);
              set((state) => {
                state.currentTask.status = 'error';
              });
              break;
            }
            
            // Handle BAD_REQUEST - generic 400 errors
            if (errorMessage.includes('BAD_REQUEST')) {
              const userMessage = errorMessage.split(': ').slice(1).join(': ') || 
                'The request could not be processed. Please try again.';
              onError(userMessage);
              set((state) => {
                state.currentTask.status = 'error';
              });
              break;
            }

            // Handle 5xx and network errors
            onError(`Error: ${errorMessage}`);
            set((state) => {
              state.currentTask.status = 'error';
            });
            break;
          }
        }
        set((state) => {
          state.currentTask.status = 'success';
        });
      } catch (e: unknown) {
        const errorMessage = e instanceof Error ? e.message : String(e);
        onError(errorMessage);
        set((state) => {
          state.currentTask.status = 'error';
        });
      } finally {
        await detachDebugger(get().currentTask.tabId);
        await reenableExtensions();
        
        // CRITICAL FIX: Clear active task state on completion (Issue #3)
        // This prevents stale tasks from being resumed after the task ends
        // Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)
        await clearActiveTaskState();
        
        // Save messages one final time
        await get().currentTask.actions.saveMessages();
        
        // Update session summary on completion
        const taskState = get().currentTask;
        if (taskState.sessionId) {
          const finalStatus = taskState.status === 'success' 
            ? 'completed' 
            : taskState.status === 'error' 
            ? 'failed' 
            : 'active';
          
          await get().sessions.actions.updateSession(taskState.sessionId, {
            updatedAt: Date.now(),
            messageCount: taskState.messages.length,
            status: finalStatus,
          });
        }
        
        // Save conversation to history
        if (taskState.instructions && taskState.displayHistory.length > 0 && taskState.createdAt) {
          const finalStatus = taskState.status === 'success' || taskState.status === 'error' || taskState.status === 'interrupted'
            ? taskState.status
            : 'error';
          
          get().conversationHistory.actions.addConversation({
        id: generateUUID(),
          instructions: taskState.instructions,
            displayHistory: [...taskState.displayHistory],
            status: finalStatus,
            createdAt: taskState.createdAt,
            completedAt: new Date(),
            url: taskState.url || undefined,
          });
        }
      }
    },
    interrupt: () => {
      set((state) => {
        state.currentTask.status = 'interrupted';
      });
      
      // CRITICAL FIX: Clear active task state on interruption (Issue #3)
      // Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)
      clearActiveTaskState().catch((err) => {
        console.warn('Failed to clear active task state on interrupt:', err);
      });
      
      // Save conversation to history when interrupted
      const taskState = get().currentTask;
      if (taskState.instructions && taskState.displayHistory.length > 0 && taskState.createdAt) {
        get().conversationHistory.actions.addConversation({
          id: generateUUID(),
          instructions: taskState.instructions,
          displayHistory: [...taskState.displayHistory],
          status: 'interrupted',
          createdAt: taskState.createdAt,
          completedAt: new Date(),
          url: taskState.url || undefined,
        });
      }
    },
    startNewChat: () => {
      // CRITICAL FIX: Clear active task state when starting new chat (Issue #3)
      // Reference: CLIENT_ARCHITECTURE_BLOCKERS.md §Issue #3 (State Wipe on Navigation)
      clearActiveTaskState().catch((err) => {
        console.warn('Failed to clear active task state on new chat:', err);
      });
      
      set((state) => {
        // Stop any running task
        if (state.currentTask.status === 'running') {
          state.currentTask.status = 'interrupted';
        }
        
        // Clear all task state
        // CRITICAL: Always set messages to empty array, NEVER undefined
        state.currentTask.instructions = null;
        state.currentTask.displayHistory = [];
        state.currentTask.messages = []; // MUST be empty array, not undefined
        state.currentTask.taskId = null;
        state.currentTask.sessionId = null;
        state.currentTask.status = 'idle';
        state.currentTask.actionStatus = 'idle';
        state.currentTask.createdAt = null;
        state.currentTask.url = null;
        state.currentTask.lastActionResult = null;
        state.currentTask.lastDOMChanges = null;
        
        // Reset messages loading state (prevents stale error states)
        state.currentTask.messagesLoadingState = {
          isLoading: false,
          lastAttemptSessionId: null,
          lastAttemptTime: null,
          error: null,
          retryCount: 0,
        };

        // Reset real-time sync state (MessageSyncManager.stopSync called by UI)
        state.currentTask.wsConnectionState = 'disconnected';
        state.currentTask.wsFallbackReason = null;
        state.currentTask.isServerTyping = false;
        state.currentTask.serverTypingContext = null;
        
        // Clear orchestrator state
        state.currentTask.plan = null;
        state.currentTask.currentStep = null;
        state.currentTask.totalSteps = null;
        state.currentTask.orchestratorStatus = null;
        state.currentTask.verificationHistory = [];
        state.currentTask.correctionHistory = [];
        
        // Clear UI instructions
        state.ui.instructions = '';
      });
      
      // Clear current session
      get().sessions.actions.setCurrentSession(null);
    },
    saveMessages: async () => {
      const taskState = get().currentTask;
      if (!taskState.sessionId || taskState.messages.length === 0) return;
      
      try {
        // Save messages to chrome.storage.local
        await chrome.storage.local.set({
          [`session_messages_${taskState.sessionId}`]: taskState.messages.map(msg => ({
            ...msg,
            timestamp: msg.timestamp.toISOString(),
            meta: msg.meta ? {
              ...msg.meta,
              steps: msg.meta.steps?.map(step => ({
                ...step,
                timestamp: step.timestamp.toISOString(),
              })),
            } : undefined,
          })),
        });
      } catch (error: unknown) {
        console.error('Failed to save messages:', error);
      }
    },
    loadMessages: async (sessionId: string) => {
      const loadingState = get().currentTask.messagesLoadingState;
      const now = Date.now();
      
      // === PREVENT INFINITE LOOPS ===
      // 1. Check if already loading
      if (loadingState.isLoading) {
        console.debug('[loadMessages] Already loading, skipping duplicate call');
        return;
      }
      
      // 2. Check if this is the same session we just tried (with cooldown)
      // Minimum 5 seconds between retries for the same session
      const MIN_RETRY_INTERVAL = 5000;
      // Maximum 60 seconds for rate limit errors
      const MAX_RETRY_INTERVAL = 60000;
      
      if (loadingState.lastAttemptSessionId === sessionId && loadingState.lastAttemptTime) {
        const timeSinceLastAttempt = now - loadingState.lastAttemptTime;
        
        // If we have an error, use exponential backoff
        if (loadingState.error) {
          const backoffMs = Math.min(
            MIN_RETRY_INTERVAL * Math.pow(2, loadingState.retryCount),
            MAX_RETRY_INTERVAL
          );
          
          if (timeSinceLastAttempt < backoffMs) {
            console.debug(`[loadMessages] In backoff period (${Math.round((backoffMs - timeSinceLastAttempt) / 1000)}s remaining), skipping`);
            return;
          }
        } else {
          // No error, but still apply minimum interval
          if (timeSinceLastAttempt < MIN_RETRY_INTERVAL) {
            console.debug('[loadMessages] Too soon since last attempt, skipping');
            return;
          }
        }
      }
      
      // 3. Check if we've exceeded max retries (10 attempts)
      const MAX_RETRIES = 10;
      if (loadingState.lastAttemptSessionId === sessionId && loadingState.retryCount >= MAX_RETRIES) {
        console.warn(`[loadMessages] Max retries (${MAX_RETRIES}) exceeded for session ${sessionId}`);
        return;
      }
      
      // Mark as loading
      set((state) => {
        state.currentTask.messagesLoadingState.isLoading = true;
        state.currentTask.messagesLoadingState.lastAttemptSessionId = sessionId;
        state.currentTask.messagesLoadingState.lastAttemptTime = now;
      });
      
      // Get current messages BEFORE loading (to preserve newly added messages that haven't been saved yet)
      const existingMessages = get().currentTask.messages || [];
      const previousSessionId = get().currentTask.sessionId;
      
      // Safety: Always initialize messages as empty array first to prevent undefined
      // BUT: Only clear if we're switching to a different session
      // If it's the same session, preserve existing messages to avoid losing newly added ones
      set((state) => {
        state.currentTask.sessionId = sessionId;
        // Reset retry count if switching sessions
        if (previousSessionId !== sessionId) {
          state.currentTask.messages = [];
          state.currentTask.messagesLoadingState.retryCount = 0;
          state.currentTask.messagesLoadingState.error = null;
        } else if (!Array.isArray(state.currentTask.messages)) {
          state.currentTask.messages = [];
        }
      });
      
      // Helper function to merge messages by ID (preserves existing messages, updates/adds new ones)
      // Sort by sequenceNumber when available (backend ordering), else by timestamp
      const mergeMessages = (existing: ChatMessage[], loaded: ChatMessage[]): ChatMessage[] => {
        const messageMap = new Map<string, ChatMessage>();
        
        // First, add all existing messages to the map (preserve newly added messages)
        existing.forEach(msg => {
          if (msg && msg.id) {
            messageMap.set(msg.id, msg);
          }
        });
        
        // Then, update/add loaded messages (loaded messages take precedence for updates)
        loaded.forEach(msg => {
          if (msg && msg.id) {
            messageMap.set(msg.id, msg);
          }
        });
        
        // Convert back to array and sort: prefer sequenceNumber (backend ordering), fallback to timestamp
        const merged = Array.from(messageMap.values());
        merged.sort((a, b) => {
          const seqA = a.sequenceNumber;
          const seqB = b.sequenceNumber;
          if (typeof seqA === 'number' && typeof seqB === 'number') {
            return seqA - seqB;
          }
          const timeA = a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp).getTime();
          const timeB = b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp).getTime();
          return timeA - timeB;
        });
        
        return merged;
      };
      
      try {
        // Get current messages (may have been preserved above)
        let currentMessages = get().currentTask.messages || [];
        
        // Try to load from chrome.storage.local first (for offline support)
        const result = await chrome.storage.local.get(`session_messages_${sessionId}`);
        const storedMessages = result[`session_messages_${sessionId}`];
        
        if (storedMessages && Array.isArray(storedMessages) && storedMessages.length > 0) {
          // Filter out any invalid messages and ensure all required fields exist
          const validMessages = storedMessages
            .filter((msg: any) => msg && typeof msg === 'object' && msg.id && msg.role)
            .map((msg: any) => ({
              id: typeof msg.id === 'string' ? msg.id : String(msg.id || generateUUID()),
              role: typeof msg.role === 'string' ? msg.role : 'assistant',
              content: typeof msg.content === 'string' ? msg.content : String(msg.content || ''),
              status: msg.status || 'sent',
              timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
              sequenceNumber: typeof msg.sequenceNumber === 'number' ? msg.sequenceNumber : undefined,
              actionPayload: msg.actionPayload,
              meta: msg.meta ? {
                ...msg.meta,
                steps: Array.isArray(msg.meta.steps) ? msg.meta.steps.map((step: any) => ({
                  ...step,
                  timestamp: step.timestamp ? new Date(step.timestamp) : new Date(),
                })) : [],
              } : undefined,
              error: msg.error,
            }));
          
          // Merge with existing messages instead of replacing
          currentMessages = mergeMessages(currentMessages, validMessages);
          set((state) => {
            state.currentTask.messages = currentMessages;
          });
        }
        
        // Always try to fetch from API to get latest messages (with fallback handled)
        // Uses GET /api/session/[sessionId]/messages with default limit=50
        try {
          const { messages: apiMessages } = await apiClient.getSessionMessages(sessionId, 50);
          
          if (apiMessages && Array.isArray(apiMessages) && apiMessages.length > 0) {
            // Filter out invalid messages and convert API response format to ChatMessage format
            const validMessages = apiMessages
              .filter((msg: any) => msg && typeof msg === 'object' && (msg.messageId || msg.role))
              .map((msg: any) => ({
                id: typeof msg.messageId === 'string' 
                  ? msg.messageId 
                  : generateUUID(),
                role: typeof msg.role === 'string' ? msg.role : 'assistant',
                content: typeof msg.content === 'string' ? msg.content : String(msg.content || ''),
                status: msg.status || 'sent',
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(), // API returns ISO 8601 string
                sequenceNumber: typeof msg.sequenceNumber === 'number' ? msg.sequenceNumber : undefined,
                actionPayload: msg.actionPayload,
                meta: {
                  steps: [], // API doesn't return steps, they're client-side only
                },
                error: msg.error,
              }));
            
            // Merge with existing messages instead of replacing
            currentMessages = get().currentTask.messages || [];
            const merged = mergeMessages(currentMessages, validMessages);
            set((state) => {
              state.currentTask.messages = merged;
              // Clear error state on success
              state.currentTask.messagesLoadingState.error = null;
              state.currentTask.messagesLoadingState.retryCount = 0;
            });
            
            // Save to local storage for offline support
            await get().currentTask.actions.saveMessages();
          } else {
            // If API returned empty array or invalid response, preserve existing messages
            // Only clear if we have no existing messages
            currentMessages = get().currentTask.messages || [];
            if (currentMessages.length === 0) {
              set((state) => {
                state.currentTask.messages = [];
                // Clear error state - empty response is not an error
                state.currentTask.messagesLoadingState.error = null;
                state.currentTask.messagesLoadingState.retryCount = 0;
              });
            }
          }
        } catch (apiError: unknown) {
          // === HANDLE API ERRORS WITH PROPER BACKOFF ===
          const errorMessage = apiError instanceof Error ? apiError.message : String(apiError);
          
          // Handle rate limit errors - don't retry immediately
          if (apiError instanceof RateLimitError) {
            console.warn('[loadMessages] Rate limit hit:', errorMessage);
            set((state) => {
              state.currentTask.messagesLoadingState.error = 'RATE_LIMITED';
              state.currentTask.messagesLoadingState.retryCount += 1;
            });
          }
          // Handle not found errors - session doesn't exist, stop retrying
          else if (apiError instanceof NotFoundError) {
            console.warn('[loadMessages] Session not found:', sessionId);
            set((state) => {
              state.currentTask.messagesLoadingState.error = 'NOT_FOUND';
              state.currentTask.messagesLoadingState.retryCount = MAX_RETRIES; // Stop retrying
            });
          }
          // Handle other errors with backoff
          else {
            console.debug('Failed to load messages from API:', errorMessage);
            set((state) => {
              state.currentTask.messagesLoadingState.error = errorMessage;
              state.currentTask.messagesLoadingState.retryCount += 1;
            });
          }
          
          // API call failed - preserve existing messages if we have them
          currentMessages = get().currentTask.messages || [];
          if (currentMessages.length === 0 && (!storedMessages || !Array.isArray(storedMessages) || storedMessages.length === 0)) {
            set((state) => {
              state.currentTask.messages = [];
            });
          }
        }
      } catch (error: unknown) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error('Failed to load messages:', error);
        
        // Record error for backoff
        set((state) => {
          state.currentTask.messagesLoadingState.error = errorMessage;
          state.currentTask.messagesLoadingState.retryCount += 1;
        });
        
        // Safety: Always ensure messages is an array, never undefined
        set((state) => {
          state.currentTask.messages = [];
        });
      } finally {
        // Always clear loading state
        set((state) => {
          state.currentTask.messagesLoadingState.isLoading = false;
        });
      }
      
      // Set as current session after loading (or attempting to load)
      get().sessions.actions.setCurrentSession(sessionId);
      
      // Start WebSocket sync for real-time message updates
      // This is the CRITICAL missing piece - startSync was never called after loadMessages
      // Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §7 (Task 4)
      try {
        const { messageSyncManager } = await getMessageSyncManager();
        void messageSyncManager.startSync(sessionId).catch((syncError: unknown) => {
          console.debug('[loadMessages] Failed to start WebSocket sync:', syncError);
          // Sync failure is non-fatal - polling fallback will handle it
        });
      } catch (importError: unknown) {
        console.debug('[loadMessages] Failed to import messageSyncManager:', importError);
      }
    },
    addUserMessage: (content: string) => {
      // Type guard: Ensure content is always a string to prevent React error #130
      const safeContent = typeof content === 'string' ? content : String(content || '');
      
      // Don't add empty messages
      if (!safeContent.trim()) {
        return;
      }
      
      const messageId = generateUUID();
      set((state) => {
        // CRITICAL SAFETY: Ensure messages array exists before pushing
        // This prevents "Cannot read property 'push' of undefined" errors
        if (!Array.isArray(state.currentTask.messages)) {
          console.warn('addUserMessage: messages was not an array, reinitializing');
          state.currentTask.messages = [];
        }
        
        // Create the message with all required properties explicitly set
        const newMessage: ChatMessage = {
          id: messageId,
          role: 'user',
          content: safeContent,
          status: 'sent',
          timestamp: new Date(),
        };
        
        state.currentTask.messages.push(newMessage);
        
        // If this is the first user message and we have a sessionId, update session title
        const userMessages = state.currentTask.messages.filter(m => m && m.role === 'user');
        if (userMessages.length === 1 && state.currentTask.sessionId) {
          // Type guard: Ensure content is a string before using .length
          const safeContentForTitle = typeof content === 'string' ? content : String(content || '');
          const sessionTitle = safeContentForTitle.length > 50 
            ? safeContentForTitle.substring(0, 50) + '...' 
            : safeContentForTitle;
          
          // Update session title via sessionService
          get().sessions.actions.updateSession(state.currentTask.sessionId, {
            title: sessionTitle,
            updatedAt: Date.now(),
          }).catch(err => console.error('Failed to update session title:', err));
        }
      });
    },
    addAssistantMessage: (content: string, action: string, parsedAction: ParsedAction): string => {
      // Type guard: Ensure content is always a string to prevent React error #130
      const safeContent = typeof content === 'string' ? content : String(content || '');
      // Type guard: Ensure action is always a string
      const safeAction = typeof action === 'string' ? action : String(action || '');
      
      const messageId = generateUUID();
      set((state) => {
        // CRITICAL SAFETY: Ensure messages array exists before pushing
        if (!Array.isArray(state.currentTask.messages)) {
          console.warn('addAssistantMessage: messages was not an array, reinitializing');
          state.currentTask.messages = [];
        }
        
        // Create the message with all required properties explicitly set
        const newMessage: ChatMessage = {
          id: messageId,
          role: 'assistant',
          content: safeContent,
          status: 'pending',
          timestamp: new Date(),
          actionPayload: {
            action: safeAction,
            parsedAction,
          },
          meta: {
            steps: [],
            // Reasoning data will be added via updateMessageStatus or directly in runTask
          },
        };
        
        state.currentTask.messages.push(newMessage);
      });
      return messageId;
    },
    addActionStep: (messageId: string, step: ActionStep) => {
      set((state) => {
        const message = state.currentTask.messages.find(m => m.id === messageId);
        if (message && message.meta) {
          if (!message.meta.steps) {
            message.meta.steps = [];
          }
          message.meta.steps.push(step);
        }
      });
    },
    updateMessageStatus: (messageId: string, status: ChatMessage['status'], error?: { message: string; code: string }) => {
      set((state) => {
        const message = state.currentTask.messages.find(m => m.id === messageId);
        if (message) {
          message.status = status;
          if (error) {
            message.error = error;
          }
        }
        
        // Update session message count
        if (state.currentTask.sessionId) {
          get().sessions.actions.updateSession(state.currentTask.sessionId, {
            updatedAt: Date.now(),
            messageCount: state.currentTask.messages.length,
          });
        }
      });
    },
  },
});
