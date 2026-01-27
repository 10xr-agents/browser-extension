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
import { apiClient } from '../api/client';
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

      if (!instructions || get().currentTask.status === 'running') return;

      set((state) => {
        state.currentTask.instructions = instructions;
        state.currentTask.displayHistory = [];
        state.currentTask.messages = [];
        state.currentTask.taskId = null; // Reset taskId for new task
        state.currentTask.sessionId = null; // Reset sessionId for new task
        state.currentTask.status = 'running';
        state.currentTask.actionStatus = 'attaching-debugger';
        state.currentTask.createdAt = new Date();
        state.currentTask.lastActionResult = null;
      });
      
      // Add user message to chat
      get().currentTask.actions.addUserMessage(instructions);

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

            // Call agentInteract API with logging and error information
            const response = await apiClient.agentInteract(
              url,
              instructions,
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
              } : undefined
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
            
            // Parse action string
            const parsed = parseAction(response.action);
            
            // Add thought from response
            // Type guard: check if parsed has error property
            const parsedWithThought: ParsedAction = 'error' in parsed
              ? parsed
              : {
                  ...parsed,
                  thought: response.thought,
                };

            // Add to display-only history (backward compatibility)
            set((state) => {
              state.currentTask.displayHistory.push({
                thought: response.thought,
                action: response.action,
                usage: response.usage,
                parsedAction: parsedWithThought,
                expectedOutcome: response.expectedOutcome, // Task 9: Store expected outcome for verification context
              });
            });
            
            // Add assistant message to chat
            const assistantMessageId = get().currentTask.actions.addAssistantMessage(
              response.thought,
              response.action,
              parsedWithThought.parsedAction
            );
            
            // Update message with usage and expected outcome
            if (response.usage || response.expectedOutcome) {
              set((state) => {
                const message = state.currentTask.messages.find(m => m.id === assistantMessageId);
                if (message && message.meta) {
                  if (response.usage) {
                    message.meta.usage = response.usage;
                  }
                  if (response.expectedOutcome) {
                    message.meta.expectedOutcome = response.expectedOutcome;
                  }
                }
              });
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
            const actionString = response.action;
            
            // Create action step
            const stepId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            const stepStartTime = Date.now();
            
            let executionResult: ActionExecutionResult | null = null;
            
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
            
            // Sleep 2 seconds to allow page to settle after action
            await sleep(2000);
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
        
        // Save conversation to history
        const taskState = get().currentTask;
        if (taskState.instructions && taskState.displayHistory.length > 0 && taskState.createdAt) {
          const finalStatus = taskState.status === 'success' || taskState.status === 'error' || taskState.status === 'interrupted'
            ? taskState.status
            : 'error';
          
          get().conversationHistory.actions.addConversation({
            id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
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
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          instructions: taskState.instructions,
          displayHistory: [...taskState.displayHistory],
          status: 'interrupted',
          createdAt: taskState.createdAt,
          completedAt: new Date(),
          url: taskState.url || undefined,
        });
      }
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
      try {
        // Try to load from chrome.storage.local first
        const result = await chrome.storage.local.get(`session_messages_${sessionId}`);
        const storedMessages = result[`session_messages_${sessionId}`];
        
        if (storedMessages && Array.isArray(storedMessages)) {
          set((state) => {
            state.currentTask.messages = storedMessages.map((msg: any) => ({
              ...msg,
              timestamp: new Date(msg.timestamp),
              meta: msg.meta ? {
                ...msg.meta,
                steps: msg.meta.steps?.map((step: any) => ({
                  ...step,
                  timestamp: new Date(step.timestamp),
                })),
              } : undefined,
            }));
          });
          return;
        }
        
        // If not in storage, try to fetch from API
        try {
          const { messages: apiMessages } = await apiClient.getSessionMessages(sessionId);
          
          if (apiMessages && Array.isArray(apiMessages)) {
            set((state) => {
              state.currentTask.messages = apiMessages.map((msg: any) => ({
                id: msg.messageId,
                role: msg.role,
                content: msg.content,
                status: msg.status || 'sent',
                timestamp: new Date(msg.timestamp),
                actionPayload: msg.actionPayload,
                meta: {
                  steps: [], // API doesn't return steps, they're client-side only
                },
                error: msg.error,
              }));
            });
            return;
          }
        } catch (apiError: unknown) {
          // API call failed, continue with empty messages
          console.debug('Failed to load messages from API:', apiError);
        }
        
        // If API also fails, clear messages
        set((state) => {
          state.currentTask.messages = [];
        });
      } catch (error: unknown) {
        console.error('Failed to load messages:', error);
        set((state) => {
          state.currentTask.messages = [];
        });
      }
    },
    addUserMessage: (content: string) => {
      const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      set((state) => {
        state.currentTask.messages.push({
          id: messageId,
          role: 'user',
          content,
          status: 'sent',
          timestamp: new Date(),
        });
      });
    },
    addAssistantMessage: (content: string, action: string, parsedAction: ParsedAction): string => {
      const messageId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      set((state) => {
        state.currentTask.messages.push({
          id: messageId,
          role: 'assistant',
          content,
          status: 'pending',
          timestamp: new Date(),
          actionPayload: {
            action,
            parsedAction,
          },
          meta: {
            steps: [],
          },
        });
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
      });
    },
  },
});
