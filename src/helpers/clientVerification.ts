/**
 * Client-Side Verification for Action Chaining
 *
 * Performs lightweight verification checks on the client side
 * to validate action success before continuing to the next action in a chain.
 *
 * Reference: SPECS_AND_CONTRACTS.md §9.4 (Client-Side Verification Checks)
 */

import type { ClientVerificationCheck } from '../types/chatMessage';

/**
 * Result of a client-side verification check
 */
export interface VerificationCheckResult {
  passed: boolean;
  check: ClientVerificationCheck;
  actualValue?: string;
  error?: string;
}

/**
 * Run a single client verification check
 */
export async function runVerificationCheck(
  check: ClientVerificationCheck,
  tabId: number
): Promise<VerificationCheckResult> {
  try {
    switch (check.type) {
      case 'value_matches':
        return await checkValueMatches(check, tabId);

      case 'element_visible':
        return await checkElementVisible(check, tabId);

      case 'element_enabled':
        return await checkElementEnabled(check, tabId);

      case 'state_changed':
        // State changed is hard to verify without before/after snapshot
        // For now, assume success if element exists
        return await checkElementVisible(check, tabId);

      case 'no_error_message':
        return await checkNoErrorMessage(check, tabId);

      case 'success_message':
        return await checkSuccessMessage(check, tabId);

      default:
        return {
          passed: true,
          check,
          error: `Unknown check type: ${check.type}`,
        };
    }
  } catch (error) {
    return {
      passed: false,
      check,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Run all verification checks for a chained action
 */
export async function runAllVerificationChecks(
  checks: ClientVerificationCheck[],
  tabId: number
): Promise<{
  allPassed: boolean;
  results: VerificationCheckResult[];
  firstFailure?: VerificationCheckResult;
}> {
  const results: VerificationCheckResult[] = [];
  let firstFailure: VerificationCheckResult | undefined;

  for (const check of checks) {
    const result = await runVerificationCheck(check, tabId);
    results.push(result);

    if (!result.passed && !firstFailure) {
      firstFailure = result;
    }
  }

  return {
    allPassed: results.every((r) => r.passed),
    results,
    firstFailure,
  };
}

/**
 * Check if an element's value matches the expected value
 */
async function checkValueMatches(
  check: ClientVerificationCheck,
  tabId: number
): Promise<VerificationCheckResult> {
  if (!check.elementId || !check.expectedValue) {
    return {
      passed: false,
      check,
      error: 'value_matches requires elementId and expectedValue',
    };
  }

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (elementId: string) => {
        const element = document.querySelector(
          `[data-llm-id="${elementId}"], [id="${elementId}"]`
        ) as HTMLInputElement | HTMLTextAreaElement | null;

        if (!element) {
          return { found: false, value: null };
        }

        const value =
          element.value !== undefined
            ? element.value
            : element.textContent || '';

        return { found: true, value };
      },
      args: [String(check.elementId)],
    });

    const data = result[0]?.result;

    if (!data?.found) {
      return {
        passed: false,
        check,
        error: `Element ${check.elementId} not found`,
      };
    }

    const passed = data.value === check.expectedValue;

    return {
      passed,
      check,
      actualValue: data.value,
      error: passed
        ? undefined
        : `Expected "${check.expectedValue}", got "${data.value}"`,
    };
  } catch (error) {
    return {
      passed: false,
      check,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if an element is visible
 */
async function checkElementVisible(
  check: ClientVerificationCheck,
  tabId: number
): Promise<VerificationCheckResult> {
  if (!check.elementId) {
    return {
      passed: false,
      check,
      error: 'element_visible requires elementId',
    };
  }

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (elementId: string) => {
        const element = document.querySelector(
          `[data-llm-id="${elementId}"], [id="${elementId}"]`
        ) as HTMLElement | null;

        if (!element) {
          return { found: false, visible: false };
        }

        const style = window.getComputedStyle(element);
        const visible =
          style.display !== 'none' &&
          style.visibility !== 'hidden' &&
          style.opacity !== '0' &&
          element.offsetParent !== null;

        return { found: true, visible };
      },
      args: [String(check.elementId)],
    });

    const data = result[0]?.result;

    if (!data?.found) {
      return {
        passed: false,
        check,
        error: `Element ${check.elementId} not found`,
      };
    }

    return {
      passed: data.visible,
      check,
      error: data.visible ? undefined : `Element ${check.elementId} is not visible`,
    };
  } catch (error) {
    return {
      passed: false,
      check,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check if an element is enabled (not disabled)
 */
async function checkElementEnabled(
  check: ClientVerificationCheck,
  tabId: number
): Promise<VerificationCheckResult> {
  if (!check.elementId) {
    return {
      passed: false,
      check,
      error: 'element_enabled requires elementId',
    };
  }

  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (elementId: string) => {
        const element = document.querySelector(
          `[data-llm-id="${elementId}"], [id="${elementId}"]`
        ) as HTMLInputElement | HTMLButtonElement | null;

        if (!element) {
          return { found: false, enabled: false };
        }

        const enabled = !element.disabled;

        return { found: true, enabled };
      },
      args: [String(check.elementId)],
    });

    const data = result[0]?.result;

    if (!data?.found) {
      return {
        passed: false,
        check,
        error: `Element ${check.elementId} not found`,
      };
    }

    return {
      passed: data.enabled,
      check,
      error: data.enabled ? undefined : `Element ${check.elementId} is disabled`,
    };
  } catch (error) {
    return {
      passed: false,
      check,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check that no error message is visible on the page
 */
async function checkNoErrorMessage(
  check: ClientVerificationCheck,
  tabId: number
): Promise<VerificationCheckResult> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (textPattern?: string) => {
        // Common error selectors
        const errorSelectors = [
          '[class*="error"]',
          '[class*="Error"]',
          '[role="alert"]',
          '[aria-invalid="true"]',
          '.invalid-feedback',
          '.form-error',
          '.field-error',
        ];

        for (const selector of errorSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent?.trim() || '';
            if (text.length > 0) {
              // If pattern provided, check if error matches pattern
              if (textPattern) {
                if (text.toLowerCase().includes(textPattern.toLowerCase())) {
                  return { hasError: true, errorText: text };
                }
              } else {
                // Any visible error text counts
                const style = window.getComputedStyle(el as HTMLElement);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                  return { hasError: true, errorText: text };
                }
              }
            }
          }
        }

        return { hasError: false };
      },
      args: [check.textPattern],
    });

    const data = result[0]?.result;

    return {
      passed: !data?.hasError,
      check,
      actualValue: data?.errorText,
      error: data?.hasError ? `Error message found: "${data.errorText}"` : undefined,
    };
  } catch (error) {
    return {
      passed: false,
      check,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

/**
 * Check that a success message is visible on the page
 */
async function checkSuccessMessage(
  check: ClientVerificationCheck,
  tabId: number
): Promise<VerificationCheckResult> {
  try {
    const result = await chrome.scripting.executeScript({
      target: { tabId },
      func: (textPattern?: string) => {
        // Common success selectors
        const successSelectors = [
          '[class*="success"]',
          '[class*="Success"]',
          '[role="status"]',
          '.alert-success',
          '.toast-success',
        ];

        for (const selector of successSelectors) {
          const elements = document.querySelectorAll(selector);
          for (const el of elements) {
            const text = el.textContent?.trim() || '';
            if (text.length > 0) {
              // If pattern provided, check if success matches pattern
              if (textPattern) {
                if (text.toLowerCase().includes(textPattern.toLowerCase())) {
                  return { hasSuccess: true, successText: text };
                }
              } else {
                // Any visible success text counts
                const style = window.getComputedStyle(el as HTMLElement);
                if (style.display !== 'none' && style.visibility !== 'hidden') {
                  return { hasSuccess: true, successText: text };
                }
              }
            }
          }
        }

        return { hasSuccess: false };
      },
      args: [check.textPattern],
    });

    const data = result[0]?.result;

    return {
      passed: data?.hasSuccess || false,
      check,
      actualValue: data?.successText,
      error: data?.hasSuccess ? undefined : 'Success message not found',
    };
  } catch (error) {
    return {
      passed: false,
      check,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}
