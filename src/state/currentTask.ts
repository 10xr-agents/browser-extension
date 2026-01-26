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
  taskId: string | null; // Server-assigned task ID for action history continuity
  displayHistory: DisplayHistoryEntry[]; // Display-only history for UI
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
  };
};
export const createCurrentTaskSlice: MyStateCreator<CurrentTaskSlice> = (
  set,
  get
) => ({
  tabId: -1,
  instructions: null,
  taskId: null,
  displayHistory: [],
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
        state.currentTask.taskId = null; // Reset taskId for new task
        state.currentTask.status = 'running';
        state.currentTask.actionStatus = 'attaching-debugger';
      });

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
        });

        await attachDebugger(tabId);
        await disableIncompatibleExtensions();

        let hasOrgKnowledgeShown = false; // Track if we've shown the dialog

        // eslint-disable-next-line no-constant-condition
        while (true) {
          if (wasStopped()) break;

          setActionStatus('pulling-dom');
          const domResult = await getSimplifiedDom(tabId);
          if (!domResult) {
            set((state) => {
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
            // Get current taskId from state (will be null on first request)
            const currentTaskId = get().currentTask.taskId;

            // Get debug actions for logging
            const addNetworkLog = get().debug?.actions.addNetworkLog;

            // Call agentInteract API with logging
            const response = await apiClient.agentInteract(
              url,
              instructions,
              currentDom,
              currentTaskId,
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

            // Store taskId if returned (first request or server-assigned)
            if (response.taskId) {
              set((state) => {
                state.currentTask.taskId = response.taskId!;
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
                state.currentTask.plan = response.plan ?? null;
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
                const correction: CorrectionResult = {
                  stepIndex: response.correction!.stepIndex,
                  strategy: response.correction!.strategy,
                  reason: response.correction!.reason,
                  attemptNumber: response.correction!.attemptNumber,
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

            // Add to display-only history
            set((state) => {
              state.currentTask.displayHistory.push({
                thought: response.thought,
                action: response.action,
                usage: response.usage,
                parsedAction: parsedWithThought,
                expectedOutcome: response.expectedOutcome, // Task 9: Store expected outcome for verification context
              });
            });

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

            // Execute action
            if (parsedWithThought.parsedAction.name === 'click') {
              await callDOMAction('click', parsedWithThought.parsedAction.args);
            } else if (parsedWithThought.parsedAction.name === 'setValue') {
              await callDOMAction('setValue', parsedWithThought.parsedAction.args);
            }

            if (wasStopped()) break;

            // Max steps limit (50)
            if (get().currentTask.displayHistory.length >= 50) {
              onError('Maximum number of actions (50) reached');
              break;
            }

            setActionStatus('waiting');
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
      }
    },
    interrupt: () => {
      set((state) => {
        state.currentTask.status = 'interrupted';
      });
    },
  },
});
