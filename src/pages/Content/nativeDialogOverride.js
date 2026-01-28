/**
 * Native Dialog Override for Browser Automation
 * 
 * CRITICAL FIX: Native Browser Dialogs (Section 4.3)
 * Monkey-patches window.alert, window.confirm, and window.prompt to be non-blocking
 * 
 * Reference: PRODUCTION_READINESS.md §4.3 (Native Browser Dialogs)
 * 
 * This script must be injected at document_start to override dialogs before page scripts run
 */

(function() {
  'use strict';
  
  // Only override if not already overridden (prevent double-injection)
  if (window.__spadeworksDialogOverride) {
    return;
  }
  window.__spadeworksDialogOverride = true;
  
  // Store original functions
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;
  
  /**
   * Override window.alert
   * Sends message to agent instead of blocking execution
   */
  window.alert = function(message) {
    const messageText = typeof message === 'string' ? message : String(message || '');
    
    // Send message to background script
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'NATIVE_DIALOG',
          dialogType: 'alert',
          message: messageText,
        }).catch(() => {
          // Ignore errors - background script may not be ready
        });
      }
    } catch (error) {
      // Fallback: log to console
      console.log('[Spadeworks] Alert suppressed:', messageText);
    }
    
    // Auto-dismiss (non-blocking)
    return undefined;
  };
  
  /**
   * Override window.confirm
   * Sends message to agent and returns default value (true = auto-accept)
   */
  window.confirm = function(message) {
    const messageText = typeof message === 'string' ? message : String(message || '');
    
    // Send message to background script
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'NATIVE_DIALOG',
          dialogType: 'confirm',
          message: messageText,
        }).catch(() => {
          // Ignore errors - background script may not be ready
        });
      }
    } catch (error) {
      // Fallback: log to console
      console.log('[Spadeworks] Confirm suppressed (auto-accept):', messageText);
    }
    
    // Default to true (auto-accept) - agent can override via LLM decision if needed
    return true;
  };
  
  /**
   * Override window.prompt
   * Sends message to agent and returns default value
   */
  window.prompt = function(message, defaultValue) {
    const messageText = typeof message === 'string' ? message : String(message || '');
    const defaultVal = defaultValue !== undefined ? String(defaultValue) : '';
    
    // Send message to background script
    try {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage({
          type: 'NATIVE_DIALOG',
          dialogType: 'prompt',
          message: messageText,
          defaultValue: defaultVal,
        }).catch(() => {
          // Ignore errors - background script may not be ready
        });
      }
    } catch (error) {
      // Fallback: log to console
      console.log('[Spadeworks] Prompt suppressed (returning default):', messageText, defaultVal);
    }
    
    // Return default value (non-blocking)
    return defaultVal || null;
  };
  
  // Log that override is active
  console.log('[Spadeworks] Native dialog override active');
})();
