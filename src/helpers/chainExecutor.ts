/**
 * Chain Executor for Action Chaining
 *
 * Executes a chain of actions sequentially with client-side verification
 * between steps. Used when the backend returns chainedActions in the response.
 *
 * Reference: SPECS_AND_CONTRACTS.md §9 (Atomic Actions & Action Chaining)
 */

import { parseAction } from './parseAction';
import { callDOMAction } from './domActions';
import { runAllVerificationChecks } from './clientVerification';
import type { ChainAction, ChainMetadata, ChainPartialState, ChainError } from '../types/chatMessage';

/**
 * Result of executing a chained action
 */
export interface ChainedActionResult {
  action: ChainAction;
  success: boolean;
  error?: string;
  verificationPassed?: boolean;
  verificationError?: string;
}

/**
 * Result of executing an entire chain
 */
export interface ChainExecutionResult {
  success: boolean;
  executedActions: ChainedActionResult[];
  failedAtIndex?: number;
  partialState?: ChainPartialState;
  chainError?: ChainError;
}

/**
 * Execute a single action in the chain
 */
async function executeChainAction(
  action: ChainAction,
  tabId: number
): Promise<{ success: boolean; error?: string }> {
  try {
    const parsed = parseAction(action.action);

    if (!parsed) {
      return { success: false, error: `Failed to parse action: ${action.action}` };
    }

    const { name, args } = parsed;

    // Handle different action types
    if (name === 'click' || name === 'setValue') {
      const result = await callDOMAction(name as 'click' | 'setValue', args as any);
      if (!result.success) {
        return { success: false, error: result.error || 'Action execution failed' };
      }
      return { success: true };
    }

    // For other actions, use the action executors
    const { executeAction } = await import('./actionExecutors');
    await executeAction(name, args);
    return { success: true };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Execute a chain of actions with client-side verification
 */
export async function executeChain(
  chainedActions: ChainAction[],
  metadata: ChainMetadata,
  tabId: number,
  onProgress?: (index: number, total: number, action: ChainAction) => void
): Promise<ChainExecutionResult> {
  const executedActions: ChainedActionResult[] = [];
  const executedActionStrings: string[] = [];

  console.log('[ChainExecutor] Starting chain execution', {
    totalActions: chainedActions.length,
    chainReason: metadata.chainReason,
    clientVerificationSufficient: metadata.clientVerificationSufficient,
  });

  for (let i = 0; i < chainedActions.length; i++) {
    const action = chainedActions[i];

    // Report progress
    if (onProgress) {
      onProgress(i, chainedActions.length, action);
    }

    console.log(`[ChainExecutor] Executing action ${i + 1}/${chainedActions.length}:`, action.action);

    // Execute the action
    const execResult = await executeChainAction(action, tabId);

    if (!execResult.success) {
      console.error(`[ChainExecutor] Action ${i + 1} failed:`, execResult.error);

      const result: ChainedActionResult = {
        action,
        success: false,
        error: execResult.error,
      };
      executedActions.push(result);

      // Return partial failure state
      return {
        success: false,
        executedActions,
        failedAtIndex: i,
        partialState: {
          executedActions: executedActionStrings,
          totalActionsInChain: chainedActions.length,
        },
        chainError: {
          action: action.action,
          message: execResult.error || 'Unknown error',
          code: 'ACTION_FAILED',
          elementId: action.targetElementId,
          failedIndex: i,
        },
      };
    }

    executedActionStrings.push(action.action);

    // Perform client-side verification if this action has verification checks
    // and verification level is 'client'
    let verificationPassed = true;
    let verificationError: string | undefined;

    if (
      action.verificationLevel === 'client' &&
      action.clientVerificationChecks &&
      action.clientVerificationChecks.length > 0
    ) {
      console.log(`[ChainExecutor] Running client verification for action ${i + 1}`);

      // Small delay to allow DOM to update after action
      await new Promise((resolve) => setTimeout(resolve, 100));

      const verifyResult = await runAllVerificationChecks(
        action.clientVerificationChecks,
        tabId
      );

      verificationPassed = verifyResult.allPassed;

      if (!verificationPassed) {
        verificationError = verifyResult.firstFailure?.error || 'Verification failed';
        console.warn(`[ChainExecutor] Client verification failed for action ${i + 1}:`, verificationError);
      } else {
        console.log(`[ChainExecutor] Client verification passed for action ${i + 1}`);
      }
    }

    const result: ChainedActionResult = {
      action,
      success: true,
      verificationPassed,
      verificationError,
    };
    executedActions.push(result);

    // If verification failed, we might still continue based on metadata
    // For now, we continue but log the failure
    if (!verificationPassed) {
      console.warn(`[ChainExecutor] Continuing chain despite verification failure (clientVerificationSufficient: ${metadata.clientVerificationSufficient})`);
    }

    // Small delay between actions for stability
    if (i < chainedActions.length - 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  console.log('[ChainExecutor] Chain execution completed successfully');

  return {
    success: true,
    executedActions,
  };
}

/**
 * Check if a response contains chained actions
 */
export function hasChainedActions(response: {
  chainedActions?: ChainAction[];
  chainMetadata?: ChainMetadata;
}): boolean {
  return !!(
    response.chainedActions &&
    response.chainedActions.length > 0 &&
    response.chainMetadata?.safeToChain
  );
}
