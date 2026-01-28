/**
 * Background Service Worker for Spadeworks Copilot AI
 * 
 * Handles side panel toggle functionality:
 * - Listens for extension icon clicks
 * - Toggles side panel open/closed for the current tab
 * - Properly checks actual panel state before toggling
 * 
 * CRITICAL: chrome.sidePanel.open() MUST be called synchronously in the same
 * call stack as the user gesture. Never call it inside .then() or async callbacks.
 * See .cursorrules for the Chrome Side Panel API rule.
 */

// Pre-configure side panel for tabs when they're activated (async, doesn't block)
chrome.tabs.onActivated.addListener((activeInfo) => {
  const tabId = activeInfo.tabId;
  // Ensure panel is configured for this tab
  chrome.sidePanel.setOptions({
    tabId: tabId,
    enabled: true,
    path: 'popup.html',
  }).catch((error) => {
    // Ignore errors - panel may already be configured
    console.debug('Side panel pre-configuration (onActivated):', error);
  });
});

// Also configure when tabs are updated (e.g., navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.status === 'complete') {
    // Ensure panel is configured for this tab
    chrome.sidePanel.setOptions({
      tabId: tabId,
      enabled: true,
      path: 'popup.html',
    }).catch((error) => {
      // Ignore errors - panel may already be configured
      console.debug('Side panel pre-configuration (onUpdated):', error);
    });
  }
});

// Handle extension icon click - toggle side panel
chrome.action.onClicked.addListener((tab) => {
  if (!tab.id) {
    console.error('No tab ID available');
    return;
  }

  const tabId = tab.id;

  // CRITICAL: chrome.sidePanel.open() MUST be called synchronously within user gesture
  // We cannot use async operations before calling open()
  // The panel should be pre-configured via onActivated/onUpdated listeners above.
  // Since manifest.json has side_panel.default_path, the panel is always configured.
  
  // Try to open the panel synchronously (user gesture context)
  // This is the ONLY synchronous call we make - everything else is async
  chrome.sidePanel.open({ tabId: tabId });
  
  // Note: We don't use .catch() here because:
  // 1. If panel is already open, Chrome will handle it gracefully
  // 2. If panel is not configured, the pre-configuration listeners will fix it
  // 3. Using .catch() doesn't break the user gesture, but we want to keep it simple
});

// Listen for tab removal to clean up
chrome.tabs.onRemoved.addListener((tabId) => {
  // No need to clean up panel state - Chrome handles this automatically
});

// ============================================================================
// CRITICAL FIX: New Tab Handling (Section 4.2)
// Auto-follow logic to switch agent's attention when new tabs open
// 
// Reference: PRODUCTION_READINESS.md §4.2 (The "New Tab" Disconnect)
// ============================================================================

const ACTION_WINDOW_MS = 2000; // 2 seconds window

// Listen for new tab creation
chrome.tabs.onCreated.addListener(async (tab) => {
  try {
    // Check if we have a running task by checking chrome.storage
    const storage = await chrome.storage.local.get(['lastActionTime', 'currentTaskStatus']);
    
    if (storage.currentTaskStatus === 'running' && storage.lastActionTime) {
      // Get last action time from storage (set by currentTask.ts)
      const lastActionTime = storage.lastActionTime;
      const now = Date.now();
      
      // If tab was created within action window, assume it's from agent action
      if (now - lastActionTime < ACTION_WINDOW_MS) {
        // Store new tab info in storage for currentTask to pick up
        await chrome.storage.local.set({
          newTabDetected: {
            tabId: tab.id,
            url: tab.url || tab.pendingUrl || 'unknown',
            timestamp: now,
          },
        });
        
        // Also send message (in case popup is listening)
        chrome.runtime.sendMessage({
          type: 'NEW_TAB_DETECTED',
          tabId: tab.id,
          url: tab.url || tab.pendingUrl || 'unknown',
        }).catch(() => {
          // Ignore errors - no listeners registered yet
        });
        
        console.log('New tab detected after agent action:', {
          tabId: tab.id,
          url: tab.url || tab.pendingUrl,
        });
      }
    }
  } catch (error) {
    console.warn('Error handling new tab:', error);
  }
});

// Also handle tab activation (user manually switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  try {
    // Store tab switch info in storage
    await chrome.storage.local.set({
      tabSwitched: {
        tabId: activeInfo.tabId,
        windowId: activeInfo.windowId,
        timestamp: Date.now(),
      },
    });
    
    // Also send message (in case popup is listening)
    chrome.runtime.sendMessage({
      type: 'TAB_SWITCHED',
      tabId: activeInfo.tabId,
      windowId: activeInfo.windowId,
    }).catch(() => {
      // Ignore errors - no listeners registered yet
    });
  } catch (error) {
    console.warn('Error handling tab switch:', error);
  }
});

// Handle keyboard shortcut (Ctrl+Shift+Y / Cmd+Shift+Y)
chrome.commands.onCommand.addListener((command) => {
  if (command === '_execute_action') {
    // Commands also provide user gesture, but chrome.tabs.query is async
    // This breaks the gesture chain, so we can't reliably call open() here
    // Instead, we'll configure the panel and let the user click the icon
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const tab = tabs[0];
      if (tab?.id) {
        const tabId = tab.id;
        
        // Check panel state and toggle
        chrome.sidePanel.getOptions({ tabId: tabId })
          .then((options) => {
            const isEnabled = options?.enabled !== false;
            
            if (isEnabled) {
              // Close the panel
              chrome.sidePanel.setOptions({
                tabId: tabId,
                enabled: false,
              }).catch((error) => {
                console.error('Error closing side panel:', error);
              });
            } else {
              // Enable the panel (open() will work on next click/command)
              chrome.sidePanel.setOptions({
                tabId: tabId,
                enabled: true,
                path: 'popup.html',
              }).catch((error) => {
                console.error('Error enabling side panel:', error);
              });
            }
          })
          .catch((error) => {
            // Panel not configured - configure it
            chrome.sidePanel.setOptions({
              tabId: tabId,
              enabled: true,
              path: 'popup.html',
            }).catch((setError) => {
              console.error('Error setting side panel options:', setError);
            });
          });
      }
    });
  }
});
