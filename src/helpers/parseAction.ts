/**
 * Parse Action Helper for Thin Client Architecture
 * 
 * Simplified action parser that extracts action name and arguments from action string.
 * Used to map NextActionResponse.action to ActionPayload for execution.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.2 (POST /api/agent/interact)
 */

import { ActionPayload, availableActions } from './availableActions';

export type ParsedActionSuccess = {
  thought: string;
  action: string;
  parsedAction: ActionPayload;
};

export type ParsedAction =
  | ParsedActionSuccess
  | {
      error: string;
    };

/**
 * Parse action string (e.g. "click(123)", "setValue(123, \"x\")", "finish()", "fail()")
 * into ActionPayload for execution
 */
export function parseAction(actionString: string): ParsedAction {
  const actionPattern = /(\w+)\((.*?)\)/;
  const actionParts = actionString.match(actionPattern);

  if (!actionParts) {
    // Handle finish() and fail() which have no arguments
    if (actionString === 'finish()' || actionString === 'fail()') {
      const actionName = actionString.replace('()', '');
      const availableAction = availableActions.find(
        (action) => action.name === actionName
      );

      if (!availableAction) {
        return {
          error: `Invalid action: "${actionName}" is not a valid action.`,
        };
      }

      return {
        thought: '', // Will be set by caller
        action: actionString,
        parsedAction: {
          name: actionName,
          args: {},
        } as ActionPayload,
      };
    }

    return {
      error:
        'Invalid action format: Action should be in the format functionName(arg1, arg2, ...).',
    };
  }

  const actionName = actionParts[1];
  const actionArgsString = actionParts[2];

  const availableAction = availableActions.find(
    (action) => action.name === actionName
  );

  if (!availableAction) {
    return {
      error: `Invalid action: "${actionName}" is not a valid action.`,
    };
  }

  // Handle actions with no arguments (finish, fail)
  if (availableAction.args.length === 0) {
    if (actionArgsString.trim() !== '') {
      return {
        error: `Invalid number of arguments: Expected 0 for action "${actionName}", but got arguments.`,
      };
    }

    return {
      thought: '', // Will be set by caller
      action: actionString,
      parsedAction: {
        name: actionName,
        args: {},
      } as ActionPayload,
    };
  }

  // Parse arguments
  const argsArray = actionArgsString
    .split(',')
    .map((arg) => arg.trim())
    .filter((arg) => arg !== '');

  if (argsArray.length !== availableAction.args.length) {
    return {
      error: `Invalid number of arguments: Expected ${availableAction.args.length} for action "${actionName}", but got ${argsArray.length}.`,
    };
  }

  const parsedArgs: Record<string, number | string> = {};

  for (let i = 0; i < argsArray.length; i++) {
    const arg = argsArray[i];
    const expectedArg = availableAction.args[i];

    if (expectedArg.type === 'number') {
      const numberValue = Number(arg);

      if (isNaN(numberValue)) {
        return {
          error: `Invalid argument type: Expected a number for argument "${expectedArg.name}", but got "${arg}".`,
        };
      }

      parsedArgs[expectedArg.name] = numberValue;
    } else if (expectedArg.type === 'string') {
      const stringValue =
        (arg.startsWith('"') && arg.endsWith('"')) ||
        (arg.startsWith("'") && arg.endsWith("'")) ||
        (arg.startsWith('`') && arg.endsWith('`'))
          ? arg.slice(1, -1)
          : null;

      if (stringValue === null) {
        return {
          error: `Invalid argument type: Expected a string for argument "${expectedArg.name}", but got "${arg}".`,
        };
      }

      parsedArgs[expectedArg.name] = stringValue;
    } else {
      return {
        // @ts-expect-error this is here to make sure we don't forget to update this code if we add a new arg type
        error: `Invalid argument type: Unknown type "${expectedArg.type}" for argument "${expectedArg.name}".`,
      };
    }
  }

  const parsedAction = {
    name: availableAction.name,
    args: parsedArgs,
  } as ActionPayload;

  return {
    thought: '', // Will be set by caller
    action: actionString,
    parsedAction,
  };
}
