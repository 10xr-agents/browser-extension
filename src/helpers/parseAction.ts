/**
 * Parse Action Helper for Thin Client Architecture
 * 
 * Simplified action parser that extracts action name and arguments from action string.
 * Used to map NextActionResponse.action to ActionPayload for execution.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.2 (POST /api/agent/interact)
 * Reference: CHROME_TAB_ACTIONS.md
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
 * Parse a single argument value based on its type
 */
function parseArgValue(
  argString: string,
  expectedType: string,
  isArray: boolean = false
): string | number | boolean | string[] {
  const trimmed = argString.trim();
  
  if (isArray) {
    // Parse array: ["item1", "item2"] or [item1, item2]
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      const content = trimmed.slice(1, -1).trim();
      if (!content) return [];
      
      const items = content.split(',').map(item => {
        const itemTrimmed = item.trim();
        if ((itemTrimmed.startsWith('"') && itemTrimmed.endsWith('"')) ||
            (itemTrimmed.startsWith("'") && itemTrimmed.endsWith("'")) ||
            (itemTrimmed.startsWith('`') && itemTrimmed.endsWith('`'))) {
          return itemTrimmed.slice(1, -1);
        }
        return itemTrimmed;
      });
      return items;
    }
    return [trimmed];
  }
  
  if (expectedType === 'number') {
    const numberValue = Number(trimmed);
    if (isNaN(numberValue)) {
      throw new Error(`Expected a number, got: ${trimmed}`);
    }
    return numberValue;
  }
  
  if (expectedType === 'boolean') {
    const lower = trimmed.toLowerCase();
    if (lower === 'true') return true;
    if (lower === 'false') return false;
    throw new Error(`Expected a boolean (true/false), got: ${trimmed}`);
  }
  
  // String type
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'")) ||
    (trimmed.startsWith('`') && trimmed.endsWith('`'))
  ) {
    return trimmed.slice(1, -1);
  }
  
  // Unquoted string (for backward compatibility)
  return trimmed;
}

/**
 * Parse action string (e.g. "click(123)", "setValue(123, \"x\")", "finish()", "fail()")
 * into ActionPayload for execution
 */
export function parseAction(actionString: string): ParsedAction {
  // Normalize: trim whitespace/newlines (backend may send with padding)
  const raw = actionString;
  const actionStringTrimmed =
    typeof actionString === 'string' ? actionString.trim() : String(actionString || '').trim();

  if (!actionStringTrimmed) {
    return {
      error: `Invalid action format: Action was empty or not a string. Received: ${JSON.stringify(raw?.slice?.(0, 100) ?? raw)}`,
    };
  }

  const actionPattern = /^(\w+)\((.*)\)\s*$/s;
  const actionParts = actionStringTrimmed.match(actionPattern);

  if (!actionParts) {
    // Handle finish(), fail(), and variants without parens (backend may send "finish" or "done")
    const lower = actionStringTrimmed.toLowerCase();
    const normalizedNoArgs =
      lower === 'finish' || lower === 'fail' || lower === 'done'
        ? lower === 'done'
          ? 'finish()'
          : `${lower}()`
        : null;

    if (normalizedNoArgs) {
      const actionName = normalizedNoArgs.replace('()', '');
      const availableAction = availableActions.find(
        (action) => action.name === actionName
      );

      if (availableAction) {
        return {
          thought: '',
          action: normalizedNoArgs,
          parsedAction: {
            name: actionName,
            args: {},
          } as ActionPayload,
        };
      }
    }

    // Handle finish() and fail() with parens (after trim)
    if (actionStringTrimmed === 'finish()' || actionStringTrimmed === 'fail()') {
      const actionName = actionStringTrimmed.replace('()', '');
      const availableAction = availableActions.find(
        (action) => action.name === actionName
      );

      if (availableAction) {
        return {
          thought: '',
          action: actionStringTrimmed,
          parsedAction: {
            name: actionName,
            args: {},
          } as ActionPayload,
        };
      }
    }

    return {
      error: `Invalid action format: Action should be in the format functionName(arg1, arg2, ...). Received: ${JSON.stringify(actionStringTrimmed.slice(0, 80))}`,
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

  // Handle actions with no arguments (finish, fail, goBack, goForward, etc.)
  if (availableAction.args.length === 0) {
    // For terminal actions (finish, fail), be lenient and ignore any extra arguments
    // The LLM sometimes sends finish("Task completed") or finish("Done")
    const terminalActions = ['finish', 'fail'];
    if (terminalActions.includes(actionName)) {
      if (actionArgsString.trim() !== '') {
        console.warn(`[parseAction] Ignoring unexpected arguments for terminal action "${actionName}": ${actionArgsString.slice(0, 100)}`);
      }
      return {
        thought: '', // Will be set by caller
        action: `${actionName}()`, // Normalize to standard format without args
        parsedAction: {
          name: actionName,
          args: {},
        } as ActionPayload,
      };
    }
    
    // For other no-arg actions, still validate strictly
    if (actionArgsString.trim() !== '') {
      return {
        error: `Invalid number of arguments: Expected 0 for action "${actionName}", but got arguments.`,
      };
    }

    return {
      thought: '', // Will be set by caller
      action: actionStringTrimmed,
      parsedAction: {
        name: actionName,
        args: {},
      } as ActionPayload,
    };
  }

  // Parse arguments - handle quoted strings, nested parentheses, etc.
  const argsArray: string[] = [];
  let currentArg = '';
  let depth = 0;
  let inString = false;
  let stringChar = '';
  
  for (let i = 0; i < actionArgsString.length; i++) {
    const char = actionArgsString[i];
    const prevChar = i > 0 ? actionArgsString[i - 1] : '';
    
    if (!inString && (char === '"' || char === "'" || char === '`')) {
      inString = true;
      stringChar = char;
      currentArg += char;
    } else if (inString && char === stringChar && prevChar !== '\\') {
      inString = false;
      stringChar = '';
      currentArg += char;
    } else if (!inString && char === '(') {
      depth++;
      currentArg += char;
    } else if (!inString && char === ')') {
      depth--;
      currentArg += char;
    } else if (!inString && char === ',' && depth === 0) {
      argsArray.push(currentArg.trim());
      currentArg = '';
    } else {
      currentArg += char;
    }
  }
  
  // Add the last argument
  if (currentArg.trim()) {
    argsArray.push(currentArg.trim());
  }

  // Filter out empty arguments (from trailing commas, etc.)
  const nonEmptyArgs = argsArray.filter(arg => arg !== '');

  // Count required arguments
  const requiredArgs = availableAction.args.filter(arg => !arg.optional);
  
  if (nonEmptyArgs.length < requiredArgs.length) {
    return {
      error: `Invalid number of arguments: Expected at least ${requiredArgs.length} for action "${actionName}", but got ${nonEmptyArgs.length}.`,
    };
  }
  
  if (nonEmptyArgs.length > availableAction.args.length) {
    return {
      error: `Invalid number of arguments: Expected at most ${availableAction.args.length} for action "${actionName}", but got ${nonEmptyArgs.length}.`,
    };
  }

  const parsedArgs: Record<string, number | string | boolean | string[] | undefined> = {};

  for (let i = 0; i < availableAction.args.length; i++) {
    const expectedArg = availableAction.args[i];
    const argValue = nonEmptyArgs[i];

    // Handle optional arguments
    if (expectedArg.optional && argValue === undefined) {
      continue; // Skip optional arguments that weren't provided
    }

    if (!expectedArg.optional && argValue === undefined) {
      return {
        error: `Missing required argument: "${expectedArg.name}" for action "${actionName}".`,
      };
    }

    try {
      const parsedValue = parseArgValue(argValue, expectedArg.type, expectedArg.array);
      parsedArgs[expectedArg.name] = parsedValue;
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      return {
        error: `Invalid argument type for "${expectedArg.name}": ${errorMessage}`,
      };
    }
  }

  const parsedAction = {
    name: availableAction.name,
    args: parsedArgs,
  } as ActionPayload;

  return {
    thought: '', // Will be set by caller
    action: actionStringTrimmed,
    parsedAction,
  };
}
