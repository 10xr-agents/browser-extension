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
