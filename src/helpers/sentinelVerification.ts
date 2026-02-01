/**
 * Sentinel Verification System - Action Outcome Verification (Production-Grade)
 * 
 * PROBLEM SOLVED:
 * The LLM clicks "Save" and assumes it worked. But maybe the site showed a tiny
 * "Invalid Email" toast that vanished in 1 second. The agent continues happily,
 * eventually failing 5 steps later without knowing where it went wrong.
 * 
 * SOLUTION:
 * Every action has a **Success Condition** (Sentinel) verified by the client.
 * The LLM predicts expected outcomes, and the extension verifies them.
 * 
 * WORKFLOW:
 * 1. LLM outputs: { action: "click(12)", expected_outcome: { type: "navigation" } }
 * 2. Extension executes click(12)
 * 3. Extension waits 2s and checks: Did URL change?
 * 4. If NO: Send immediate feedback with visible errors
 * 
 * This creates a tight feedback loop that catches errors instantly.
 * 
 * Reference: DOM_EXTRACTION_ARCHITECTURE.md
 */

import { getRecentMutations, hasRecentErrors, hasRecentSuccess } from '../pages/Content/mutationLog';

/**
 * Types of expected outcomes
 */
export type ExpectedOutcomeType = 
  | 'navigation'       // URL should change
  | 'element_appears'  // Text/element should appear
  | 'element_disappears' // Element should disappear (modal closes)
  | 'value_changes'    // Input value should change
  | 'state_changes'    // Element state should change (checked, disabled)
  | 'download_starts'  // Download should begin
  | 'any_change'       // Any DOM change is acceptable
  | 'no_change';       // No change expected (just verify no errors)

/**
 * Expected outcome specification from LLM
 */
export interface ExpectedOutcome {
  /** Primary expected outcome type */
  type: ExpectedOutcomeType;
  
  /** Text that should appear (for element_appears) */
  text?: string;
  
  /** Element ID that should appear/disappear */
  elementId?: string;
  
  /** Selector for element to check */
  selector?: string;
  
  /** Expected URL pattern (for navigation) */
  urlPattern?: string;
  
  /** Expected value (for value_changes) */
  expectedValue?: string;
  
  /** Expected state (for state_changes) */
  expectedState?: 'checked' | 'unchecked' | 'disabled' | 'enabled' | 'expanded' | 'collapsed';
  
  /** Alternative outcomes (OR logic) */
  orOutcome?: ExpectedOutcome;
  
  /** Timeout in ms (default 2000) */
  timeout?: number;
}

/**
 * Verification result
 */
export interface VerificationResult {
  /** Whether verification passed */
  success: boolean;
  
  /** Which outcome type was verified */
  verifiedOutcome: ExpectedOutcomeType | null;
  
  /** What actually happened */
  actualOutcome: string;
  
  /** Any errors detected */
  errorsDetected: string[];
  
  /** Any success messages detected */
  successMessages: string[];
  
  /** Current page state summary */
  pageState: {
    url: string;
    urlChanged: boolean;
    domChanged: boolean;
    recentMutations: string[];
  };
  
  /** Confidence score (0-1) */
  confidence: number;
  
  /** Feedback message for LLM */
  feedback: string;
}

/**
 * State snapshot before action
 */
interface StateSnapshot {
  url: string;
  timestamp: number;
  visibleText: Set<string>;
  elementStates: Map<string, { value?: string; checked?: boolean; disabled?: boolean }>;
}

// Store the state before action execution
let preActionState: StateSnapshot | null = null;

// =============================================================================
// STATE CAPTURE
// =============================================================================

/**
 * Capture state before executing an action
 * Call this BEFORE the action is executed
 */
export function capturePreActionState(): void {
  try {
    preActionState = {
      url: window.location.href,
      timestamp: Date.now(),
      visibleText: new Set(getVisibleTextContent()),
      elementStates: captureElementStates(),
    };
    console.log('[Sentinel] Pre-action state captured');
  } catch (error) {
    console.warn('[Sentinel] Failed to capture pre-action state:', error);
    preActionState = null;
  }
}

/**
 * Get visible text content on the page
 */
function getVisibleTextContent(): string[] {
  const texts: string[] = [];
  const walker = document.createTreeWalker(
    document.body,
    NodeFilter.SHOW_TEXT,
    null
  );
  
  let node: Text | null;
  while (node = walker.nextNode() as Text) {
    const text = node.textContent?.trim();
    if (text && text.length > 2 && text.length < 200) {
      // Check if parent is visible
      const parent = node.parentElement;
      if (parent) {
        const style = window.getComputedStyle(parent);
        if (style.display !== 'none' && style.visibility !== 'hidden') {
          texts.push(text);
        }
      }
    }
  }
  
  return texts.slice(0, 500); // Limit to 500 text snippets
}

/**
 * Capture states of interactive elements
 */
function captureElementStates(): Map<string, { value?: string; checked?: boolean; disabled?: boolean }> {
  const states = new Map<string, { value?: string; checked?: boolean; disabled?: boolean }>();
  
  const elements = document.querySelectorAll('input, select, textarea, [role="checkbox"], [role="radio"]');
  elements.forEach(el => {
    const id = el.getAttribute('data-llm-id') || el.id;
    if (!id) return;
    
    const state: { value?: string; checked?: boolean; disabled?: boolean } = {};
    
    if (el instanceof HTMLInputElement) {
      state.value = el.value;
      if (el.type === 'checkbox' || el.type === 'radio') {
        state.checked = el.checked;
      }
      state.disabled = el.disabled;
    } else if (el instanceof HTMLSelectElement) {
      state.value = el.value;
      state.disabled = el.disabled;
    } else if (el instanceof HTMLTextAreaElement) {
      state.value = el.value;
      state.disabled = el.disabled;
    } else {
      // ARIA checkboxes
      state.checked = el.getAttribute('aria-checked') === 'true';
      state.disabled = el.getAttribute('aria-disabled') === 'true';
    }
    
    states.set(id, state);
  });
  
  return states;
}

// =============================================================================
// VERIFICATION CHECKS
// =============================================================================

/**
 * Check if URL changed
 */
function checkUrlChanged(urlPattern?: string): { changed: boolean; newUrl: string } {
  const currentUrl = window.location.href;
  const changed = preActionState ? currentUrl !== preActionState.url : false;
  
  // If pattern specified, check if new URL matches
  if (urlPattern && changed) {
    const matches = currentUrl.includes(urlPattern) || new RegExp(urlPattern).test(currentUrl);
    return { changed: matches, newUrl: currentUrl };
  }
  
  return { changed, newUrl: currentUrl };
}

/**
 * Check if text appeared on page
 */
function checkTextAppeared(text: string): boolean {
  if (!text) return false;
  
  const textLower = text.toLowerCase();
  const bodyText = document.body.innerText?.toLowerCase() || '';
  
  // Check if text exists now but didn't before
  const existsNow = bodyText.includes(textLower);
  const existedBefore = preActionState?.visibleText.has(text) || false;
  
  return existsNow && !existedBefore;
}

/**
 * Check if text exists on page (regardless of when it appeared)
 */
function checkTextExists(text: string): boolean {
  if (!text) return false;
  const bodyText = document.body.innerText?.toLowerCase() || '';
  return bodyText.includes(text.toLowerCase());
}

/**
 * Check if element appeared
 */
function checkElementAppeared(elementId?: string, selector?: string): boolean {
  if (elementId) {
    const el = document.querySelector(`[data-llm-id="${elementId}"]`);
    return el !== null;
  }
  
  if (selector) {
    const el = document.querySelector(selector);
    return el !== null;
  }
  
  return false;
}

/**
 * Check if element disappeared
 */
function checkElementDisappeared(elementId?: string, selector?: string): boolean {
  if (elementId) {
    const el = document.querySelector(`[data-llm-id="${elementId}"]`);
    return el === null;
  }
  
  if (selector) {
    const el = document.querySelector(selector);
    return el === null;
  }
  
  return false;
}

/**
 * Check if value changed
 */
function checkValueChanged(elementId: string, expectedValue?: string): boolean {
  const el = document.querySelector(`[data-llm-id="${elementId}"]`) as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null;
  if (!el) return false;
  
  const currentValue = el.value;
  const previousValue = preActionState?.elementStates.get(elementId)?.value;
  
  // Value changed
  if (currentValue !== previousValue) {
    // If expected value specified, check if it matches
    if (expectedValue !== undefined) {
      return currentValue === expectedValue;
    }
    return true;
  }
  
  return false;
}

/**
 * Check if element state changed
 */
function checkStateChanged(
  elementId: string, 
  expectedState: 'checked' | 'unchecked' | 'disabled' | 'enabled' | 'expanded' | 'collapsed'
): boolean {
  const el = document.querySelector(`[data-llm-id="${elementId}"]`);
  if (!el) return false;
  
  switch (expectedState) {
    case 'checked':
      if (el instanceof HTMLInputElement) return el.checked === true;
      return el.getAttribute('aria-checked') === 'true';
      
    case 'unchecked':
      if (el instanceof HTMLInputElement) return el.checked === false;
      return el.getAttribute('aria-checked') === 'false';
      
    case 'disabled':
      if (el instanceof HTMLInputElement) return el.disabled === true;
      return el.getAttribute('aria-disabled') === 'true';
      
    case 'enabled':
      if (el instanceof HTMLInputElement) return el.disabled === false;
      return el.getAttribute('aria-disabled') !== 'true';
      
    case 'expanded':
      return el.getAttribute('aria-expanded') === 'true';
      
    case 'collapsed':
      return el.getAttribute('aria-expanded') === 'false';
  }
  
  return false;
}

/**
 * Check for any DOM changes
 */
function checkAnyChange(): boolean {
  // Check URL
  if (checkUrlChanged().changed) return true;
  
  // Check mutations
  const mutations = getRecentMutations(5);
  if (mutations.length > 0) return true;
  
  return false;
}

/**
 * Detect visible errors on page
 */
function detectErrors(): string[] {
  const errors: string[] = [];
  
  // Check mutation log for errors
  if (hasRecentErrors()) {
    errors.push('Error detected in recent DOM changes');
  }
  
  // Check for common error patterns in visible text
  const errorPatterns = [
    /error/i,
    /invalid/i,
    /failed/i,
    /incorrect/i,
    /required field/i,
    /please (enter|fill|provide)/i,
    /cannot be empty/i,
    /not found/i,
    /something went wrong/i,
  ];
  
  // Check alert/error role elements
  const alertElements = document.querySelectorAll('[role="alert"], [role="alertdialog"], .error, .alert-danger, .alert-error');
  alertElements.forEach(el => {
    const text = (el as HTMLElement).innerText?.trim();
    if (text && text.length < 200) {
      errors.push(text);
    }
  });
  
  // Check for error-like text that appeared recently
  const bodyText = document.body.innerText || '';
  for (const pattern of errorPatterns) {
    const match = bodyText.match(pattern);
    if (match) {
      // Get surrounding context
      const idx = bodyText.search(pattern);
      const context = bodyText.substring(Math.max(0, idx - 20), idx + 80).trim();
      if (context && !errors.includes(context)) {
        errors.push(context);
      }
    }
  }
  
  return errors.slice(0, 5); // Limit to 5 errors
}

/**
 * Detect success messages
 */
function detectSuccessMessages(): string[] {
  const messages: string[] = [];
  
  // Check mutation log for success
  if (hasRecentSuccess()) {
    messages.push('Success message detected in recent DOM changes');
  }
  
  // Check for success elements
  const successElements = document.querySelectorAll('.success, .alert-success, [role="status"]');
  successElements.forEach(el => {
    const text = (el as HTMLElement).innerText?.trim();
    if (text && text.length < 200) {
      messages.push(text);
    }
  });
  
  return messages.slice(0, 3);
}

// =============================================================================
// MAIN VERIFICATION FUNCTION
// =============================================================================

/**
 * Verify expected outcome after action execution
 * 
 * @param expected - Expected outcome from LLM
 * @param timeout - Time to wait for outcome (default 2000ms)
 * @returns Verification result
 */
export async function verifyOutcome(
  expected: ExpectedOutcome,
  timeout = 2000
): Promise<VerificationResult> {
  // Wait for DOM to settle
  await new Promise(resolve => setTimeout(resolve, timeout));
  
  let success = false;
  let verifiedOutcome: ExpectedOutcomeType | null = null;
  let actualOutcome = '';
  
  // Check primary outcome
  switch (expected.type) {
    case 'navigation':
      const urlResult = checkUrlChanged(expected.urlPattern);
      success = urlResult.changed;
      actualOutcome = urlResult.changed 
        ? `URL changed to: ${urlResult.newUrl.substring(0, 80)}`
        : `URL unchanged: ${urlResult.newUrl.substring(0, 80)}`;
      if (success) verifiedOutcome = 'navigation';
      break;
      
    case 'element_appears':
      if (expected.text) {
        success = checkTextAppeared(expected.text) || checkTextExists(expected.text);
        actualOutcome = success 
          ? `Text "${expected.text}" appeared`
          : `Text "${expected.text}" not found`;
      } else {
        success = checkElementAppeared(expected.elementId, expected.selector);
        actualOutcome = success
          ? `Element appeared`
          : `Element not found`;
      }
      if (success) verifiedOutcome = 'element_appears';
      break;
      
    case 'element_disappears':
      success = checkElementDisappeared(expected.elementId, expected.selector);
      actualOutcome = success
        ? `Element disappeared as expected`
        : `Element still visible`;
      if (success) verifiedOutcome = 'element_disappears';
      break;
      
    case 'value_changes':
      if (expected.elementId) {
        success = checkValueChanged(expected.elementId, expected.expectedValue);
        actualOutcome = success
          ? `Value changed ${expected.expectedValue ? `to "${expected.expectedValue}"` : ''}`
          : `Value unchanged`;
      }
      if (success) verifiedOutcome = 'value_changes';
      break;
      
    case 'state_changes':
      if (expected.elementId && expected.expectedState) {
        success = checkStateChanged(expected.elementId, expected.expectedState);
        actualOutcome = success
          ? `State changed to ${expected.expectedState}`
          : `State did not change to ${expected.expectedState}`;
      }
      if (success) verifiedOutcome = 'state_changes';
      break;
      
    case 'any_change':
      success = checkAnyChange();
      actualOutcome = success
        ? 'DOM changes detected'
        : 'No DOM changes detected';
      if (success) verifiedOutcome = 'any_change';
      break;
      
    case 'no_change':
      success = true; // Just checking for errors
      actualOutcome = 'Checking for errors';
      verifiedOutcome = 'no_change';
      break;
  }
  
  // If primary failed, check alternative outcome
  if (!success && expected.orOutcome) {
    const altResult = await verifyOutcome(expected.orOutcome, 500); // Shorter timeout for alt
    if (altResult.success) {
      return altResult;
    }
  }
  
  // Detect errors and success messages
  const errorsDetected = detectErrors();
  const successMessages = detectSuccessMessages();
  
  // Override success if errors detected
  if (errorsDetected.length > 0 && expected.type !== 'no_change') {
    success = false;
  }
  
  // Build feedback message for LLM
  let feedback = '';
  if (success) {
    feedback = `✓ Action verified: ${actualOutcome}`;
    if (successMessages.length > 0) {
      feedback += `. Success message: "${successMessages[0]}"`;
    }
  } else {
    feedback = `✗ Action may have failed: ${actualOutcome}`;
    if (errorsDetected.length > 0) {
      feedback += `. Errors detected: "${errorsDetected[0]}"`;
    }
  }
  
  // Calculate confidence
  let confidence = success ? 0.8 : 0.3;
  if (successMessages.length > 0) confidence = Math.min(1, confidence + 0.2);
  if (errorsDetected.length > 0) confidence = Math.max(0, confidence - 0.3);
  
  const result: VerificationResult = {
    success,
    verifiedOutcome,
    actualOutcome,
    errorsDetected,
    successMessages,
    pageState: {
      url: window.location.href,
      urlChanged: checkUrlChanged().changed,
      domChanged: checkAnyChange(),
      recentMutations: getRecentMutations(5),
    },
    confidence,
    feedback,
  };
  
  console.log('[Sentinel] Verification result:', result);
  
  // Clear pre-action state
  preActionState = null;
  
  return result;
}

/**
 * Quick verification for simple actions
 * Uses sensible defaults based on action type
 */
export async function quickVerify(
  actionType: 'click' | 'setValue' | 'navigate' | 'scroll',
  elementId?: string
): Promise<VerificationResult> {
  const defaultOutcomes: Record<string, ExpectedOutcome> = {
    click: { type: 'any_change', timeout: 2000 },
    setValue: { 
      type: 'value_changes', 
      elementId, 
      timeout: 1000 
    },
    navigate: { type: 'navigation', timeout: 3000 },
    scroll: { type: 'any_change', timeout: 1000 },
  };
  
  const expected = defaultOutcomes[actionType] || { type: 'any_change' };
  return verifyOutcome(expected, expected.timeout);
}

/**
 * Parse expected outcome from LLM response
 */
export function parseExpectedOutcome(llmOutput: any): ExpectedOutcome | null {
  if (!llmOutput?.expected_outcome) return null;
  
  const eo = llmOutput.expected_outcome;
  
  const outcome: ExpectedOutcome = {
    type: eo.type || 'any_change',
  };
  
  if (eo.or_element_appears) {
    outcome.orOutcome = {
      type: 'element_appears',
      text: eo.or_element_appears,
    };
  }
  
  if (eo.or_url_contains) {
    outcome.orOutcome = {
      type: 'navigation',
      urlPattern: eo.or_url_contains,
    };
  }
  
  if (eo.text) outcome.text = eo.text;
  if (eo.element_id) outcome.elementId = eo.element_id;
  if (eo.selector) outcome.selector = eo.selector;
  if (eo.url_pattern) outcome.urlPattern = eo.url_pattern;
  if (eo.expected_value) outcome.expectedValue = eo.expected_value;
  if (eo.expected_state) outcome.expectedState = eo.expected_state;
  if (eo.timeout) outcome.timeout = eo.timeout;
  
  return outcome;
}

/**
 * Create verification payload for backend
 * Include this in the next request to inform LLM of verification results
 */
export function createVerificationPayload(result: VerificationResult): {
  verification_passed: boolean;
  verification_message: string;
  errors_detected: string[];
  success_messages: string[];
  page_state: {
    url_changed: boolean;
    dom_changed: boolean;
  };
} {
  return {
    verification_passed: result.success,
    verification_message: result.feedback,
    errors_detected: result.errorsDetected,
    success_messages: result.successMessages,
    page_state: {
      url_changed: result.pageState.urlChanged,
      dom_changed: result.pageState.domChanged,
    },
  };
}
