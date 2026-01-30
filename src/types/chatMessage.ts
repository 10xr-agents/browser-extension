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
  };
  
  // Error information (if message represents a failure)
  error?: {
    message: string;
    code: string;
  };
  
  // User input request (when status is 'needs_user_input')
  userQuestion?: string; // Question to ask user
  missingInformation?: Array<{
    field: string;
    type: 'EXTERNAL_KNOWLEDGE' | 'PRIVATE_DATA';
    description: string;
  }>; // Enhanced structure with type classification
};
