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
import { apiClient, type DOMChangeInfo } from '../api/client';
import templatize from '../helpers/shrinkHTML/templatize';
import { getSimplifiedDom } from '../helpers/simplifyDom';
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
  plan: null,
  currentStep: null,
  totalSteps: null,
  orchestratorStatus: null,
  verificationHistory: [],
  correctionHistory: [],
  status: 'idle',
  actionStatus: 'idle',
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
      } else {
        // New task - clear everything
        set((state) => {
          state.currentTask.instructions = safeInstructions;
          state.currentTask.displayHistory = [];
          // CRITICAL: Always initialize messages as empty array, NEVER undefined
          state.currentTask.messages = [];
          state.currentTask.taskId = null; // Reset taskId for new task
          state.currentTask.sessionId = null; // Reset sessionId for new task
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
      
      // Generate session title from first few words of instructions
      const sessionTitle = safeInstructions.length > 50 
        ? safeInstructions.substring(0, 50) + '...' 
        : safeInstructions;

      try {
        const activeTab = (
          await chrome.tabs.query({ active: true, currentWindow: true })
        )[0];

        if (!activeTab.id) throw new Error('No active tab found');
        if (!activeTab.url) throw new Error('No active tab URL found');
        
        const tabId = activeTab.id;
        const url = activeTab.url;

        // Only proceed with HTTP/HTTPS URLs
        if (!url.startsWith('http://') && !url.startsWith('https://')) {
          throw new Error('Current page is not a valid web page');
        }

        set((state) => {
          state.currentTask.tabId = tabId;
          state.currentTask.url = url;
        });

        await attachDebugger(tabId);
        await disableIncompatibleExtensions();

        let hasOrgKnowledgeShown = false; // Track if we've shown the dialog

        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (wasStopped()) break;

          setActionStatus('pulling-dom');
          let domResult: SimplifiedDomResult | null = null;
          try {
            domResult = await getSimplifiedDom(tabId);
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
          
          if (!domResult) {
            set((state) => {
              state.currentTask.displayHistory.push({
                thought: 'Error: Could not extract page content. The content script may not be loaded. Try refreshing the page or closing Chrome DevTools if it\'s open.',
                action: '',
                parsedAction: {
                  error: 'Could not extract page content. Content script may not be loaded.',
                },
              });
              state.currentTask.status = 'error';
            });
            break;
          }
          
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
            set((state) => {
              // Use cast to work around Immer's WritableDraft type issue with DOM elements
              state.currentTask.hybridElements = hybridElements as typeof state.currentTask.hybridElements;
            });
          } else {
            set((state) => {
              state.currentTask.hybridElements = null;
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

          if (wasStopped()) break;
          setActionStatus('performing-query');

          try {
            // Get current taskId and sessionId from state
            const currentTaskId = get().currentTask.taskId;
            const currentSessionId = get().currentTask.sessionId;
            const lastActionResult = get().currentTask.lastActionResult;
            const lastDOMChanges = get().currentTask.lastDOMChanges;

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

            // Call agentInteract API with logging, error, and DOM change information
            const response = await apiClient.agentInteract(
              url,
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
              lastDOMChanges || undefined // Pass DOM changes if available
            );

            // Store taskId and sessionId if returned (first request or server-assigned)
            if (response.taskId) {
              set((state) => {
                state.currentTask.taskId = response.taskId!;
                // Use taskId as sessionId if sessionId not provided (backward compatibility)
                if (!state.currentTask.sessionId) {
                  state.currentTask.sessionId = response.taskId;
                }
              });
            }
            if (response.sessionId) {
              set((state) => {
                state.currentTask.sessionId = response.sessionId!;
              });
              
              // Create or update session summary using sessionService
              const sessionTitle = safeInstructions.length > 50 
                ? safeInstructions.substring(0, 50) + '...' 
                : safeInstructions;
              
              // Update or create session entry (updateSession will create if it doesn't exist)
              await get().sessions.actions.updateSession(response.sessionId, {
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
              get().sessions.actions.setCurrentSession(response.sessionId);
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
            
            // Type guard: Ensure response.thought and response.action are strings to prevent React error #130
            const safeThought = typeof response.thought === 'string' ? response.thought : String(response.thought || '');
            const safeAction = typeof response.action === 'string' ? response.action : String(response.action || '');
            
            // Parse action string
            const parsed = parseAction(safeAction);
            
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
            
            // Create action step
            const stepId = generateUUID();
            const stepStartTime = Date.now();
            
            let executionResult: ActionExecutionResult | null = null;
            let domChangeReport: DOMChangeReport | null = null;
            
            // Capture DOM snapshot BEFORE executing action (for change tracking)
            let beforeSnapshot: Map<string, ElementInfo> = new Map();
            try {
              beforeSnapshot = await getInteractiveElementSnapshot();
            } catch (snapshotError: unknown) {
              console.warn('Failed to capture DOM snapshot before action:', snapshotError);
            }
            
            try {
              // Handle legacy actions (click, setValue) via domActions for backward compatibility
              if (actionName === 'click' || actionName === 'setValue') {
                executionResult = await callDOMAction(actionName as 'click' | 'setValue', actionArgs as any);
              } else {
                // Use new action executors for all other actions
                const { executeAction } = await import('../helpers/actionExecutors');
                try {
                  await executeAction(actionName, actionArgs);
                  executionResult = { success: true };
                } catch (error: unknown) {
                  const errorMessage = error instanceof Error ? error.message : String(error);
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
              
              // Wait for DOM changes and track what appeared/disappeared
              try {
                domChangeReport = await waitForDOMChangesAfterAction(beforeSnapshot, {
                  minWait: 500,
                  maxWait: 5000, // Max 5 seconds for dropdown/menu detection
                  stabilityThreshold: 300, // DOM stable for 300ms
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
                  
                  // Enhance execution result with dropdown context
                  if (executionResult) {
                    executionResult.actualState = executionResult.actualState 
                      ? `${executionResult.actualState}. ${dropdownContext}`
                      : dropdownContext;
                  }
                }
                
                // Store DOM changes in state for next API call
                set((state) => {
                  state.currentTask.lastDOMChanges = {
                    addedCount: domChangeReport!.addedElements.length,
                    removedCount: domChangeReport!.removedElements.length,
                    dropdownDetected: domChangeReport!.dropdownDetected,
                    dropdownOptions: domChangeReport!.dropdownItems?.map(i => i.text).filter(Boolean) as string[] | undefined,
                    stabilizationTime: domChangeReport!.stabilizationTime,
                  };
                });
              } catch (domWaitError: unknown) {
                console.warn('DOM change tracking failed, falling back to fixed wait:', domWaitError);
                await sleep(2000); // Fallback to fixed wait
                // Clear DOM changes on failure
                set((state) => {
                  state.currentTask.lastDOMChanges = null;
                });
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
                console.warn('Action execution failed:', executionResult.error);
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
      // Safety: Always initialize messages as empty array first to prevent undefined
      set((state) => {
        state.currentTask.sessionId = sessionId;
        state.currentTask.messages = []; // Initialize as empty array to prevent undefined
      });
      
      try {
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
          
          set((state) => {
            state.currentTask.messages = validMessages;
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
                actionPayload: msg.actionPayload,
                meta: {
                  steps: [], // API doesn't return steps, they're client-side only
                },
                error: msg.error,
              }));
            
            set((state) => {
              state.currentTask.messages = validMessages;
            });
            
            // Save to local storage for offline support
            await get().currentTask.actions.saveMessages();
          } else {
            // If API returned empty array or invalid response, ensure messages is still an array
            set((state) => {
              state.currentTask.messages = [];
            });
          }
        } catch (apiError: unknown) {
          // API call failed - if we have local messages, keep them; otherwise clear
          if (!storedMessages || !Array.isArray(storedMessages) || storedMessages.length === 0) {
            console.debug('Failed to load messages from API and no local cache:', apiError);
            set((state) => {
              state.currentTask.messages = [];
            });
          } else {
            console.debug('API unavailable, using cached messages:', apiError);
          }
        }
      } catch (error: unknown) {
        console.error('Failed to load messages:', error);
        // Safety: Always ensure messages is an array, never undefined
        set((state) => {
          state.currentTask.messages = [];
        });
      }
      
      // Set as current session after loading (or attempting to load)
      get().sessions.actions.setCurrentSession(sessionId);
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
