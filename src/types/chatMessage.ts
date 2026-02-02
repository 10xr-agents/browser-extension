/**
 * Chat Message Types for Persistent Conversation Threads
 *
 * Replaces displayHistory with a proper chat message structure that supports
 * persistence, error tracking, and separation of user-facing messages from technical logs.
 *
 * Reference: Client-side fixes for "lying agent" and chat persistence
 * Reference: SPECS_AND_CONTRACTS.md §3 (Chat UI Contract)
 */

import { ParsedAction } from '../helpers/parseAction';
import { ActionExecutionResult } from '../helpers/domActions';

/**
 * Chat message role
 */
export type ChatMessageRole = 'user' | 'assistant' | 'system';

/**
 * Message status
 */
export type MessageStatus = 'sending' | 'sent' | 'error' | 'success' | 'failure' | 'pending';

/**
 * Task-level status for UI (TaskHeader, badges).
 * Derived from currentTask.status; optional on API.
 * TODO: Request from Backend if not already sent in interact response.
 */
export type TaskStatusDisplay = 'running' | 'completed' | 'failed' | 'stopped';

/**
 * Plan structure for Live Plan widget.
 * TODO: Request from Backend if not already sent in POST /api/agent/interact response.
 */
export type PlanDisplay = {
  steps: Array<{ id?: string; description: string; status?: 'pending' | 'active' | 'completed' | 'failed' }>;
  currentStepIndex: number;
};

/**
 * Loading state when agent is thinking (before next message).
 * Client derives from: taskStatus === 'running' && last message is assistant && waiting for next.
 * TODO: Request from Backend as optional isThinking if server can signal earlier.
 */
export type IsThinking = boolean;

/**
 * System message type - distinguishes different system messages
 * Reference: SPECS_AND_CONTRACTS.md §3.5 (Plan Preview Messages)
 */
export type SystemMessageType = 'plan_preview' | 'plan_update' | 'verification_result' | 'correction_applied';

/**
 * Verification level for action chaining
 * Reference: SPECS_AND_CONTRACTS.md §9.3 (Verification Levels)
 */
export type VerificationLevel = 'client' | 'lightweight' | 'full';

/**
 * Client-side verification check types
 * Reference: SPECS_AND_CONTRACTS.md §9.4 (Client-Side Verification Checks)
 */
export type ClientVerificationCheck = {
  type: 'value_matches' | 'state_changed' | 'element_visible' | 'element_enabled' | 'no_error_message' | 'success_message';
  elementId?: number | string;
  expectedValue?: string;
  textPattern?: string;
};

/**
 * Chained action in a chain response
 * Reference: SPECS_AND_CONTRACTS.md §9.2 (Action Chaining Contract)
 */
export type ChainAction = {
  action: string;
  description: string;
  index: number;
  targetElementId?: number | string;
  actionType: string;
  verificationLevel: VerificationLevel;
  clientVerificationChecks?: ClientVerificationCheck[];
};

/**
 * Chain metadata for action chaining
 */
export type ChainMetadata = {
  totalActions: number;
  safeToChain: boolean;
  chainReason: 'FORM_FILL' | 'RELATED_INPUTS' | 'BULK_SELECTION' | 'SEQUENTIAL_STEPS' | 'OPTIMIZED_PATH';
  containerSelector?: string;
  defaultVerificationLevel: VerificationLevel;
  clientVerificationSufficient: boolean;
  finalVerificationLevel: VerificationLevel;
};

/**
 * Partial chain state when chain fails mid-execution
 */
export type ChainPartialState = {
  executedActions: string[];
  domAfterLastSuccess?: string;
  totalActionsInChain: number;
};

/**
 * Chain error when an action in a chain fails
 */
export type ChainError = {
  action: string;
  message: string;
  code: string;
  elementId?: number | string;
  failedIndex: number;
};

/**
 * Action step (technical execution log)
 * Nested inside assistant messages
 */
export type ActionStep = {
  id: string;
  action: string; // e.g., "click(123)"
  parsedAction: ParsedAction;
  status: 'success' | 'failure' | 'pending';
  error?: {
    message: string;
    code: string;
    elementId?: number;
  };
  executionResult?: ActionExecutionResult;
  timestamp: Date;
  duration?: number; // Execution duration in ms
};

/**
 * Chat message structure
 * Represents a single message in the conversation thread
 */
export type ChatMessage = {
  id: string;
  role: ChatMessageRole;
  content: string; // Main text/thought (user instruction or assistant thought)
  status: MessageStatus;
  timestamp: Date;
  /** Backend ordering field; use for reliable sort when available (oldest first) */
  sequenceNumber?: number;
  
  // For assistant messages
  actionPayload?: {
    action: string; // e.g., "click(123)"
    parsedAction: ParsedAction;
  };
  
  // Technical execution logs (nested inside assistant messages)
  // These are the "Clicked button #42", "Scrolled down" logs
  meta?: {
    steps?: ActionStep[]; // Technical action steps
    usage?: {
      promptTokens: number;
      completionTokens: number;
    };
    expectedOutcome?: string;
    // System message type (for plan preview, verification, etc.)
    // Reference: SPECS_AND_CONTRACTS.md §3.5 (Plan Preview Messages)
    messageType?: SystemMessageType;
    // Reasoning layer metadata (optional, Enhanced v2.0)
    reasoning?: {
      source: 'MEMORY' | 'PAGE' | 'WEB_SEARCH' | 'ASK_USER';
      confidence: number; // 0.0 to 1.0 (REQUIRED)
      reasoning: string; // User-friendly explanation
      missingInfo?: Array<{
        field: string;
        type: 'EXTERNAL_KNOWLEDGE' | 'PRIVATE_DATA';
        description: string;
      }>; // Enhanced structure with type classification
      evidence?: {
        sources: string[];
        quality: 'high' | 'medium' | 'low';
        gaps: string[];
      }; // Evidence supporting the decision
      searchIteration?: {
        attempt: number;
        maxAttempts: number;
        refinedQuery?: string;
        evaluationResult?: {
          solved: boolean;
          shouldRetry: boolean;
          shouldAskUser: boolean;
          confidence: number;
        };
      }; // Iterative search information
    };
    reasoningContext?: {
      searchPerformed?: boolean;
      searchSummary?: string;
      searchIterations?: number; // Number of search iterations
      finalQuery?: string; // Final refined query
    };
    // Server-side tool result (for memory operations, etc.)
    // Reference: SPECS_AND_CONTRACTS.md §10 (Server-Side Tool Actions)
    serverToolResult?: {
      toolName: string;
      toolType: 'DOM' | 'SERVER';
      memoryResult?: {
        success: boolean;
        action: string;
        key?: string;
        scope?: 'task' | 'session';
        value?: unknown;
        error?: string;
        message: string;
      };
    };
  };

  // Error information (if message represents a failure)
  error?: {
    message: string;
    code: string;
  };

  // Backend metadata format (alternative to meta, used for plan previews)
  // Reference: SPECS_AND_CONTRACTS.md §3.5 (Plan Preview Messages)
  metadata?: {
    messageType?: SystemMessageType;
    taskId?: string;
    plan?: {
      steps: Array<{
        index: number;
        description: string;
        status: 'pending' | 'active' | 'completed' | 'failed';
      }>;
      totalSteps: number;
      currentStepIndex: number;
    };
  };
  
  // User input request (when status is 'needs_user_input')
  userQuestion?: string; // Question to ask user
  missingInformation?: Array<{
    field: string;
    type: 'EXTERNAL_KNOWLEDGE' | 'PRIVATE_DATA';
    description: string;
  }>; // Enhanced structure with type classification
};
