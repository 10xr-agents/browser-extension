# Spadeworks Copilot AI - Production Readiness Guide

**Document Version:** 2.4  
**Last Updated:** January 28, 2026  
**Status:** Production-Grade Improvements & DOM Processing  
**Purpose:** Comprehensive guide to production-ready improvements, edge case handling, and robust DOM processing

**Changelog (2.4):** ✅ **IMPLEMENTED** All 6 remaining DOM-related enhancements: Hover Action (2.3), Iframe Support (2.5), New Tab Handling (4.2), Native Dialog Override (4.3), Advanced Scroll Targeting (5.4), and Wait for Condition (5.5). All non-visual DOM improvements now complete.

**Changelog (2.3):** ✅ **IMPLEMENTED** Dynamic Stability Check Enhancement (Section 3.3) with network idle detection and Click Verification (Section 4.4) with side effect detection and retry logic. Both DOM-related improvements now complete.

**Changelog (2.2):** ✅ **IMPLEMENTED** Click Obstruction Check (Section 2.4) and Stale Element Recovery (Section 2.6) - All critical resilience fixes now complete. Resilience rating upgraded to ⭐⭐⭐⭐⭐. Phase 1 Critical Foundation items 1-4 complete.

**Changelog (2.1):** ✅ **IMPLEMENTED** React Input Events (Section 2.1) and Shadow DOM Support (Section 2.2) - Critical resilience and visibility fixes now complete. Updated priority order to reflect completed implementations. Architecture status upgraded: DOM Visibility ⭐⭐⭐⭐⭐, Resilience ⭐⭐⭐⭐.

**Changelog (2.0):** Added Section 5 (Final 5 Blind Spots) covering Visual Verification, File Download Handling, Human-in-the-Loop, Advanced Scroll Targeting, and Wait for Condition. Updated Implementation Checklist with priority-ordered roadmap following `THIN_CLIENT_ROADMAP.md` format. Added Architecture Status Summary.

**This document covers:**
- Virtual element handling for text node menu items (recent fix)
- Production-grade edge case handling (6 Hidden Failure Modes, 4 Missing Layers, 5 Advanced Edge Cases)
- Final 5 Blind Spots for 1% failure rate (Visual Verification, File Downloads, Human-in-the-Loop, Advanced Scrolling, Wait Conditions)
- DOM processing implementation details
- Robustness improvements for real-world web applications
- Implementation roadmap with priority ordering

---

## Table of Contents

1. [Virtual Element Handling (Text Node Menu Items)](#1-virtual-element-handling-text-node-menu-items)
2. [Production Readiness: 6 Hidden Failure Modes](#2-production-readiness-6-hidden-failure-modes)
3. [Production Readiness: 4 Missing Layers of Robustness](#3-production-readiness-4-missing-layers-of-robustness)
4. [Production Readiness: 5 Advanced Edge Cases](#4-production-readiness-5-advanced-edge-cases)
5. [Production Readiness: Final 5 Blind Spots](#5-production-readiness-final-5-blind-spots)
6. [DOM Processing Implementation Details](#6-dom-processing-implementation-details)
7. [Implementation Checklist](#7-implementation-checklist)
8. [Testing Recommendations](#8-testing-recommendations)

---

## 1. Virtual Element Handling (Text Node Menu Items)

### 1.1 The Problem: "Ghost" Menu Items

**Issue:** Menu items that exist as raw text nodes inside `<ul name="menuEntries">` are invisible to standard DOM traversal.

**Example:**
```html
<ul name="menuEntries">
  New/Search Dashboard Visits Records
</ul>
```

The text "New/Search" is a **Text Node**, not an HTML element. Standard `querySelector` and element iteration miss it.

**Impact:**
- Agent can "see" the text in raw HTML
- Agent cannot "touch" it (no element ID in `hybridElements`)
- Agent falls back to clicking parent button (e.g., "Patient" button ID 68)
- Results in infinite loop: Agent keeps clicking parent, never the menu item

### 1.2 The Solution: Virtual Element Creation

**Implementation:** `src/pages/Content/getAnnotatedDOM.ts`

#### 1.2.1 Detection Logic

```typescript
// In getInteractiveElementSnapshot()
if (container.getAttribute('name') === 'menuEntries' || container.getAttribute('role') === 'menu') {
  Array.from(container.childNodes).forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      const textContent = node.textContent?.trim();
      
      if (!textContent || textContent.length === 0 || textContent.length > 100) {
        return; // Skip empty or very long text
      }
      
      // Calculate click coordinates using Range API
      const range = document.createRange();
      range.selectNodeContents(node);
      const rect = range.getBoundingClientRect();
      
      if (rect.width === 0 && rect.height === 0) {
        return; // Skip hidden/collapsed text
      }
      
      // Calculate center coordinates
      const x = rect.left + rect.width / 2;
      const y = rect.top + rect.height / 2;
      
      // Generate stable virtual ID
      const textHash = textContent.substring(0, 20).replace(/\s+/g, '-').toLowerCase();
      const virtualId = `virtual-menu-entry-${textHash}-${Math.floor(rect.top)}-${Math.floor(rect.left)}`;
      
      // Create virtual element
      elements.push({
        id: virtualId,
        tagName: 'TEXT',
        role: 'menuitem',
        text: textContent.substring(0, 100),
        interactive: true,
        virtualCoordinates: { x, y },
        isVirtual: true,
      });
    }
  });
}
```

#### 1.2.2 Merging into HybridElements

**Implementation:** `src/state/currentTask.ts`

Virtual elements are merged into `hybridElements` **before** sending DOM to server:

```typescript
// After getSimplifiedDom() returns
if (domResult.hybridElements) {
  const snapshot = await getInteractiveElementSnapshot();
  const virtualElementsMap = new Map<number, { x: number; y: number }>();
  let nextVirtualIndex = domResult.hybridElements.length;
  
  for (const [, element] of snapshot) {
    if (element.isVirtual && element.virtualCoordinates && element.text) {
      // Check if already exists
      const alreadyExists = domResult.hybridElements.some(he => 
        he.name === element.text || 
        (element.text && he.name?.includes(element.text))
      );
      
      if (!alreadyExists) {
        // Create HybridElement for virtual element
        const virtualHybridElement: HybridElement = {
          id: nextVirtualIndex,
          role: element.role || 'menuitem',
          name: element.text,
          description: null,
          value: null,
          interactive: true,
          attributes: {
            'data-virtual-id': element.id,
            'data-is-virtual': 'true',
          },
          source: 'dom',
        };
        
        domResult.hybridElements.push(virtualHybridElement);
        virtualElementsMap.set(nextVirtualIndex, element.virtualCoordinates);
        nextVirtualIndex++;
      }
    }
  }
  
  // Store coordinates for click handling
  set((state) => {
    state.currentTask.virtualElementCoordinates = virtualElementsMap;
  });
}
```

#### 1.2.3 Click Handling

**Implementation:** `src/helpers/domActions.ts`

```typescript
async function click(payload: { elementId: number }) {
  // Check if this is a virtual element
  const virtualCoordinates = useAppState.getState().currentTask.virtualElementCoordinates;
  if (virtualCoordinates && virtualCoordinates.has(payload.elementId)) {
    const coords = virtualCoordinates.get(payload.elementId)!;
    console.log('Clicking virtual element at coordinates:', {
      elementId: payload.elementId,
      coordinates: coords,
    });
    // Click directly at stored coordinates (no DOM resolution needed)
    await clickAtPosition(coords.x, coords.y);
    return;
  }
  
  // Normal DOM element - resolve and click as usual
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);
  await clickAtPosition(x, y);
}
```

### 1.3 Key Implementation Details

1. **Range API for Coordinates:** Uses `document.createRange()` and `range.getBoundingClientRect()` to calculate precise click coordinates for text nodes
2. **Stable ID Generation:** Virtual IDs use text hash + position to ensure stability across DOM updates
3. **Multi-Item Text Nodes:** Handles text nodes containing multiple menu items (e.g., "New/Search Dashboard Visits") by splitting and creating separate virtual elements
4. **Coordinate Storage:** Virtual element coordinates stored in `currentTask.virtualElementCoordinates` Map for O(1) lookup during click execution

---

## 2. Production Readiness: 6 Hidden Failure Modes

### 2.1 The "React Input" Trap (Synthetic Events)

**Issue:** Modern frameworks (React, Vue, Angular) track input state internally. Direct DOM manipulation (`element.value = "text"`) bypasses framework state, causing forms to submit empty.

**Current Implementation:** `src/helpers/domActions.ts` - `setValue()`

**Required Fix:**
```typescript
async function setValue(payload: { elementId: number; value: string }): Promise<void> {
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);
  
  // Focus the element first
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        this.focus();
      }
    `,
  });
  
  // Clear existing value
  await selectAllText(x, y);
  
  // Use Chrome Debugger API to send native keystrokes (bypasses React)
  for (const char of payload.value) {
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      text: char,
    });
    await sleep(50 + Math.random() * 50); // Human-like typing speed
    await sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      text: char,
    });
  }
  
  // Dispatch input and change events for framework compatibility
  await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        this.dispatchEvent(new Event('input', { bubbles: true }));
        this.dispatchEvent(new Event('change', { bubbles: true }));
        this.blur();
      }
    `,
  });
}
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/helpers/domActions.ts` `setValue()` function

**Implementation Notes:**
- Focus element before typing (wakes up React state)
- Use native `Input.dispatchKeyEvent` for each character (bypasses React event suppression)
- Dispatch `input` and `change` events after typing (syncs React/Angular/Vue state)
- Random delays between keystrokes (50-100ms) for human-like behavior

---

### 2.2 The "Shadow DOM" Blind Spot

**Issue:** Enterprise apps (Salesforce LWC, Google products) use Shadow DOM. Standard DOM traversal stops at `shadow-root`, making elements invisible.

**Current Implementation:** `src/pages/Content/getAnnotatedDOM.ts` - `getInteractiveElementSnapshot()`

**Required Fix:**
```typescript
function traverseWithShadowDOM(element: HTMLElement, elements: ElementSnapshotInfo[]): void {
  // Process current element
  if (isInteractive(element, window.getComputedStyle(element))) {
    // Add to snapshot
  }
  
  // Check for Shadow DOM
  if (element.shadowRoot) {
    // Recursively traverse shadow root
    Array.from(element.shadowRoot.children).forEach((child) => {
      if (child instanceof HTMLElement) {
        traverseWithShadowDOM(child, elements);
      }
    });
  }
  
  // Process regular children
  Array.from(element.children).forEach((child) => {
    if (child instanceof HTMLElement) {
      traverseWithShadowDOM(child, elements);
    }
  });
}
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/pages/Content/getAnnotatedDOM.ts` `traverseWithShadowDOM()` and `traverseDOM()` functions

**Implementation Notes:**
- Added `traverseWithShadowDOM()` recursive function to `getInteractiveElementSnapshot()`
- Updated `traverseDOM()` to check for `element.shadowRoot` and recursively traverse shadow children
- Shadow DOM elements are now included in interactive element snapshots
- Works with Salesforce Lightning Web Components, Google web apps, and other Shadow DOM-based frameworks

---

### 2.3 The "Hover-Only" Elements

**Issue:** Some menus don't exist in DOM until user hovers. Agent scans DOM, doesn't find menu item, fails.

**Required Fix:**
1. **Add `hover(elementId)` action** to `src/helpers/availableActions.ts`
2. **Implement hover execution** in `src/helpers/domActions.ts`:
```typescript
async function hover(payload: { elementId: number }): Promise<void> {
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);
  
  // Dispatch mouseover event
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseMoved',
    x,
    y,
  });
  
  // Wait for DOM to hydrate (menu items to appear)
  await sleep(500);
}
```
3. **Update DOM snapshot timing:** After hover action, wait for DOM mutations to settle before taking snapshot

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/helpers/actionExecutors.ts` `executeHover()` function

**Implementation Notes:**
- Increased wait time from 300ms to 500ms for proper DOM hydration
- Uses Chrome Debugger API `Input.dispatchMouseEvent` with `mouseMoved` type
- Ensures JavaScript hover events are properly triggered
- Next DOM snapshot automatically detects newly appeared menu items (handled by `waitForDOMChangesAfterAction`)

---

### 2.4 The "Click Intercepted" (Obscured Elements)

**Issue:** Overlays (cookie banners, toasts) sit on top of target elements. Click hits overlay instead of target.

**Current Implementation:** `src/helpers/domActions.ts` - `click()`

**Required Fix:**
```typescript
async function click(payload: { elementId: number }) {
  // ... existing virtual element check ...
  
  const objectId = await getObjectId(payload.elementId);
  await scrollIntoView(objectId);
  const { x, y } = await getCenterCoordinates(objectId);
  
  // Hit test: Check what element is actually at these coordinates
  const hitTestResult = await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        const element = document.elementFromPoint(${x}, ${y});
        if (!element) return null;
        return {
          tagName: element.tagName,
          id: element.id,
          className: element.className,
          text: element.textContent?.substring(0, 50),
        };
      })()
    `,
  });
  
  // Verify the element at (x, y) is the target or a child of target
  const targetElement = await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        return {
          tagName: this.tagName,
          id: this.id,
          className: this.className,
        };
      }
    `,
  });
  
  // Check if hit test matches target
  if (hitTestResult && targetElement) {
    const isMatch = hitTestResult.id === targetElement.id ||
                     hitTestResult.tagName === targetElement.tagName;
    
    if (!isMatch) {
      throw new Error(
        `Click obstructed by element: ${hitTestResult.tagName}#${hitTestResult.id || ''}.${hitTestResult.className || ''}`
      );
    }
  }
  
  await clickAtPosition(x, y);
}
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/helpers/domActions.ts` `click()` function

**Implementation Notes:**
- Hit test using `document.elementFromPoint(x, y)` before clicking
- Verifies element at coordinates is target or child of target
- Checks both exact match (by ID) and parent-child relationship
- Throws descriptive error if obstruction detected (includes obstructing element info)
- Gracefully handles hit test failures (logs warning, continues with click)

---

### 2.5 The "Iframe" Black Hole

**Issue:** Many SaaS platforms use `<iframe>` heavily. Content scripts require special handling to access iframe content.

**Current Implementation:** `src/manifest.json`

**Required Fix:**
1. **Update manifest.json:**
```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["contentScript.bundle.js"],
    "all_frames": true  // Critical: Run in all frames
  }]
}
```

2. **Frame Identification:** Tag elements with `frameId` in accessibility tree
3. **Action Routing:** When server sends `click(id)`, client must route to correct frame context

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/manifest.json` and `src/pages/Content/getAnnotatedDOM.ts`

**Implementation Notes:**
- Updated `manifest.json` to set `"all_frames": true` for content scripts
- Added `getFrameId()` function to identify frame context (main frame, iframe, cross-origin)
- Elements tagged with `data-frame-id` attribute during DOM traversal
- `traverseDOM()` and `traverseWithShadowDOM()` now traverse into accessible iframe content
- Cross-origin iframes handled gracefully (cannot access content, expected behavior)
- **Note:** Full action routing to specific frames requires additional backend coordination

---

### 2.6 "Stale Element" Race Conditions

**Issue:** Between DOM scan and click execution (2-5 seconds), React/Vue apps re-render, destroying old elements and creating new ones with different IDs.

**Current Implementation:** `src/helpers/domActions.ts` - `getObjectId()`

**Required Fix:**
```typescript
async function getObjectId(originalId: number): Promise<string> {
  // Store element metadata for recovery
  const hybridElements = useAppState.getState().currentTask.hybridElements;
  const element = hybridElements?.[originalId];
  
  if (!element) {
    throw new Error(`Element ${originalId} not found in hybridElements`);
  }
  
  // Store recovery information
  const recoveryInfo = {
    text: element.name || element.description,
    role: element.role,
    xpath: element.attributes?.['data-xpath'], // If we store XPath
  };
  
  try {
    // Try normal resolution
    return await getObjectIdNormal(originalId);
  } catch (error) {
    // Recovery: Search for element by text/role
    console.warn(`Element ${originalId} not found, attempting recovery search:`, recoveryInfo);
    
    if (recoveryInfo.text) {
      // Search for element with matching text
      const searchResult = await sendCommand('Runtime.evaluate', {
        expression: `
          (function() {
            const walker = document.createTreeWalker(
              document.body,
              NodeFilter.SHOW_ELEMENT,
              null
            );
            
            let node;
            while (node = walker.nextNode()) {
              if (node.textContent?.includes('${recoveryInfo.text}') &&
                  node.getAttribute('role') === '${recoveryInfo.role}') {
                return node;
              }
            }
            return null;
          })()
        `,
      });
      
      if (searchResult && searchResult.objectId) {
        return searchResult.objectId;
      }
    }
    
    throw new Error(`Element ${originalId} not found and recovery failed`);
  }
}
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/helpers/domActions.ts` `getObjectId()` function

**Implementation Notes:**
- Stores recovery information (text, role, interactive flag) from `hybridElements` before attempting resolution
- Tries normal resolution first (accessibility mapping → DOM-based)
- If normal resolution fails, searches DOM tree using `createTreeWalker` for matching element
- Search criteria: text content (exact or contains), role match, interactive flag match
- Returns first candidate found, logs recovery success/failure
- Falls back to original error if recovery fails

---

## 3. Production Readiness: 4 Missing Layers of Robustness

### 3.1 The "Synthetic Event" Trap (React/Angular/Vue Inputs)

**See Section 2.1** - Same issue, detailed implementation above.

**Status:** ⚠️ **TODO**

---

### 3.2 The "Visual Lie" (Overlays & Z-Index)

**See Section 2.4** - Same issue, detailed implementation above.

**Status:** ⚠️ **TODO**

---

### 3.3 The "Dynamic Stability" Check

**Issue:** Hardcoded `wait(2000)` wastes time on fast networks and fails on slow networks.

**Current Implementation:** `src/helpers/domWaiting.ts` - `waitForDOMStabilization()`

**Current Status:** ✅ **PARTIALLY IMPLEMENTED** - Uses MutationObserver polling, but can be improved

**Required Enhancement:**
```typescript
export async function waitForDOMStabilization(
  config: DOMWaitConfig = {}
): Promise<{ stabilizationTime: number; timedOut: boolean }> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  
  const startTime = Date.now();
  let lastChangeTime = startTime;
  let previousSnapshot: Map<string, ElementInfo> | null = null;
  let mutationCount = 0;
  
  // Also track network activity
  let networkIdle = false;
  const networkStartTime = Date.now();
  
  // Monitor network requests (if available via Performance API)
  const checkNetworkIdle = () => {
    if (typeof performance !== 'undefined' && performance.getEntriesByType) {
      const networkEntries = performance.getEntriesByType('resource');
      const recentRequests = networkEntries.filter(entry => 
        Date.now() - entry.responseEnd < 1000
      );
      networkIdle = recentRequests.length === 0;
    } else {
      networkIdle = true; // Assume idle if we can't check
    }
  };
  
  // Initial wait
  await sleep(cfg.minWait);
  
  while (Date.now() - startTime < cfg.maxWait) {
    const currentSnapshot = await getInteractiveElementSnapshot();
    checkNetworkIdle();
    
    if (previousSnapshot) {
      const { added, removed } = compareDOMSnapshots(previousSnapshot, currentSnapshot);
      
      if (added.length > 0 || removed.length > 0) {
        // DOM changed, reset stability timer
        lastChangeTime = Date.now();
        mutationCount += added.length + removed.length;
      } else if (
        Date.now() - lastChangeTime >= cfg.stabilityThreshold &&
        networkIdle
      ) {
        // DOM stable AND network idle
        return {
          stabilizationTime: Date.now() - startTime,
          timedOut: false,
        };
      }
    }
    
    previousSnapshot = currentSnapshot;
    await sleep(cfg.pollInterval);
  }
  
  return {
    stabilizationTime: Date.now() - startTime,
    timedOut: true,
  };
}
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - Enhanced with network idle detection in `src/helpers/domWaiting.ts` `waitForDOMStabilization()` function

**Implementation Notes:**
- Added `checkNetworkIdle()` RPC function in content script using Performance API
- `waitForDOMStabilization()` now waits for both DOM stability AND network idle
- Checks for recent network requests (within last 1000ms) using `performance.getEntriesByType('resource')`
- Returns only when both DOM is stable AND network is idle (no recent requests)
- Gracefully handles Performance API unavailability (assumes idle)

---

### 3.4 The "Iframe" Blind Spot

**See Section 2.5** - Same issue, detailed implementation above.

**Status:** ✅ **PARTIALLY IMPLEMENTED** (January 28, 2026) - Frame tagging complete, action routing pending backend coordination

---

## 4. Production Readiness: 5 Advanced Edge Cases

### 4.1 The "Stale Element" Race Condition

**See Section 2.6** - Same issue, detailed implementation above.

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See Section 2.6 for full implementation details

---

### 4.2 The "New Tab" Disconnect

**Issue:** Agent clicks link with `target="_blank"`. Browser opens new tab, agent still focused on old tab.

**Current Implementation:** `src/pages/Background/index.js`

**Required Fix:**
```typescript
// In background script
chrome.tabs.onCreated.addListener((tab) => {
  const currentTask = useAppState.getState().currentTask;
  
  // If task is running and new tab was created immediately after action
  if (currentTask.status === 'running' && 
      Date.now() - currentTask.lastActionTime < 2000) {
    
    // Switch active tab to new tab
    useAppState.getState().currentTask.actions.setTabId(tab.id!);
    
    // Notify LLM via system message
    const systemMessage = `[System] Browser opened new tab (URL: ${tab.url || 'unknown'}). Agent focus switched to new tab.`;
    // Add to conversation history
  }
});

chrome.tabs.onActivated.addListener((activeInfo) => {
  const currentTask = useAppState.getState().currentTask;
  
  // If user manually switched tabs during task execution
  if (currentTask.status === 'running' && 
      currentTask.tabId !== activeInfo.tabId) {
    
    // Update active tab
    useAppState.getState().currentTask.actions.setTabId(activeInfo.tabId);
    
    // Notify LLM
    const systemMessage = `[System] User switched to tab ${activeInfo.tabId}. Agent focus updated.`;
  }
});
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/pages/Background/index.js` and `src/state/currentTask.ts`

**Implementation Notes:**
- Added `chrome.tabs.onCreated` listener to detect new tabs
- Added `chrome.tabs.onActivated` listener to detect tab switches
- Tracks `lastActionTime` in chrome.storage (updated after each action)
- Auto-switches `currentTask.tabId` if new tab created within 2 seconds of action
- Uses chrome.storage events for reliable communication between background and popup
- Adds system message to conversation when tab switches
- Handles both agent-triggered new tabs and user manual tab switches

---

### 4.3 Native Browser Dialogs (The Silent Blockers)

**Issue:** `alert()`, `confirm()`, `prompt()` freeze JavaScript execution. Agent hangs forever.

**Current Implementation:** None

**Required Fix:**
```typescript
// Inject at document_start in content script
(function() {
  // Override native dialogs
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;
  
  window.alert = function(message: string) {
    // Send message to agent
    chrome.runtime.sendMessage({
      type: 'NATIVE_DIALOG',
      dialogType: 'alert',
      message,
    });
    
    // Auto-dismiss after short delay
    return undefined;
  };
  
  window.confirm = function(message: string): boolean {
    // Send message to agent
    chrome.runtime.sendMessage({
      type: 'NATIVE_DIALOG',
      dialogType: 'confirm',
      message,
    });
    
    // Default to true (auto-accept)
    // Agent can override via LLM decision
    return true;
  };
  
  window.prompt = function(message: string, defaultValue?: string): string | null {
    // Send message to agent
    chrome.runtime.sendMessage({
      type: 'NATIVE_DIALOG',
      dialogType: 'prompt',
      message,
      defaultValue,
    });
    
    // Return default value
    return defaultValue || null;
  };
})();
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/pages/Background/index.js` and `src/state/currentTask.ts`

**Implementation Notes:**
- Added `chrome.tabs.onCreated` listener in background script to detect new tabs
- Added `chrome.tabs.onActivated` listener in background script to detect tab switches
- Tracks `lastActionTime` in chrome.storage (updated after each action in currentTask.ts)
- Background script checks if new tab created within 2 seconds of action
- Uses chrome.storage events for reliable communication between background and popup
- Auto-switches `currentTask.tabId` if new tab detected after recent action
- Adds system message to conversation when tab switches
- Handles both agent-triggered new tabs and user manual tab switches
- Storage-based approach ensures reliability even if popup is not open

---

### 4.3 Native Browser Dialogs (The Silent Blockers)

**Issue:** `alert()`, `confirm()`, `prompt()` freeze JavaScript execution. Agent hangs forever.

**Current Implementation:** None

**Required Fix:**
```typescript
// Inject at document_start in content script
(function() {
  // Override native dialogs
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;
  
  window.alert = function(message: string) {
    // Send message to agent
    chrome.runtime.sendMessage({
      type: 'NATIVE_DIALOG',
      dialogType: 'alert',
      message,
    });
    
    // Auto-dismiss after short delay
    return undefined;
  };
  
  window.confirm = function(message: string): boolean {
    // Send message to agent
    chrome.runtime.sendMessage({
      type: 'NATIVE_DIALOG',
      dialogType: 'confirm',
      message,
    });
    
    // Default to true (auto-accept)
    // Agent can override via LLM decision
    return true;
  };
  
  window.prompt = function(message: string, defaultValue?: string): string | null {
    // Send message to agent
    chrome.runtime.sendMessage({
      type: 'NATIVE_DIALOG',
      dialogType: 'prompt',
      message,
      defaultValue,
    });
    
    // Return default value
    return defaultValue || null;
  };
})();
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/pages/Content/nativeDialogOverride.js`, `src/manifest.json`, and `webpack.config.js`

**Implementation Notes:**
- Created `nativeDialogOverride.js` script injected at `document_start`
- Monkey-patches `window.alert`, `window.confirm`, and `window.prompt`
- Sends messages to background script via `chrome.runtime.sendMessage`
- Auto-dismisses dialogs (non-blocking): `alert` returns `undefined`, `confirm` returns `true`, `prompt` returns default value
- Prevents double-injection with `window.__spadeworksDialogOverride` flag
- Added to webpack config (`nativeDialogOverride` entry) and manifest.json content scripts
- Runs in all frames (`all_frames: true`) to catch dialogs in iframes

**Issue:** `alert()`, `confirm()`, `prompt()` freeze JavaScript execution. Agent hangs forever.

**Current Implementation:** None

**Required Fix:**
```typescript
// Inject at document_start in content script
(function() {
  // Override native dialogs
  const originalAlert = window.alert;
  const originalConfirm = window.confirm;
  const originalPrompt = window.prompt;
  
  window.alert = function(message: string) {
    // Send message to agent
    chrome.runtime.sendMessage({
      type: 'NATIVE_DIALOG',
      dialogType: 'alert',
      message,
    });
    
    // Auto-dismiss after short delay
    return undefined;
  };
  
  window.confirm = function(message: string): boolean {
    // Send message to agent
    chrome.runtime.sendMessage({
      type: 'NATIVE_DIALOG',
      dialogType: 'confirm',
      message,
    });
    
    // Default to true (auto-accept)
    // Agent can override via LLM decision
    return true;
  };
  
  window.prompt = function(message: string, defaultValue?: string): string | null {
    // Send message to agent
    chrome.runtime.sendMessage({
      type: 'NATIVE_DIALOG',
      dialogType: 'prompt',
      message,
      defaultValue,
    });
    
    // Return default value
    return defaultValue || null;
  };
})();
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/pages/Content/nativeDialogOverride.js`, `src/manifest.json`, and `webpack.config.js`

**Implementation Notes:**
- Created `nativeDialogOverride.js` script injected at `document_start`
- Monkey-patches `window.alert`, `window.confirm`, and `window.prompt`
- Sends messages to background script via `chrome.runtime.sendMessage`
- Auto-dismisses dialogs (non-blocking): `alert` returns `undefined`, `confirm` returns `true`, `prompt` returns default value
- Prevents double-injection with `window.__spadeworksDialogOverride` flag
- Added to webpack config (`nativeDialogOverride` entry) and manifest.json content scripts
- Runs in all frames (`all_frames: true`) to catch dialogs in iframes

---

### 4.4 The "Hydration Gap" (The Dead Click)

**Issue:** Button visible but not interactive (JavaScript hasn't attached event listeners yet). Click fires but nothing happens.

**Current Implementation:** `src/helpers/domActions.ts` - `click()`

**Required Fix:**
```typescript
async function click(payload: { elementId: number }) {
  // ... existing click logic ...
  
  await clickAtPosition(x, y);
  
  // Verify click had side effects
  await sleep(300);
  
  const sideEffects = await checkClickSideEffects(objectId, beforeState);
  
  if (!sideEffects.detected) {
    console.warn('Click had no side effects, retrying...');
    
    // Retry click
    await clickAtPosition(x, y);
    await sleep(300);
    
    const retrySideEffects = await checkClickSideEffects(objectId, beforeState);
    
    if (!retrySideEffects.detected) {
      throw new Error('Click had no side effects after retry. Element may not be interactive yet.');
    }
  }
}

async function checkClickSideEffects(
  objectId: string,
  beforeState: { url: string; domHash: string }
): Promise<{ detected: boolean; reason: string }> {
  // Check URL change
  const currentUrl = await sendCommand('Runtime.evaluate', {
    expression: 'window.location.href',
  });
  
  if (currentUrl !== beforeState.url) {
    return { detected: true, reason: 'URL changed' };
  }
  
  // Check DOM mutations
  const currentDomHash = await sendCommand('Runtime.evaluate', {
    expression: `
      (function() {
        const body = document.body.innerHTML;
        // Simple hash
        let hash = 0;
        for (let i = 0; i < body.length; i++) {
          hash = ((hash << 5) - hash) + body.charCodeAt(i);
          hash = hash & hash;
        }
        return hash.toString();
      })()
    `,
  });
  
  if (currentDomHash !== beforeState.domHash) {
    return { detected: true, reason: 'DOM mutated' };
  }
  
  // Check network requests (if Performance API available)
  // ... network check logic ...
  
  return { detected: false, reason: 'No side effects detected' };
}
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/helpers/domActions.ts` `click()` function

**Implementation Notes:**
- Captures state before click (URL, DOM hash)
- After click, checks for side effects: URL change, DOM mutations
- Retries click if no side effects detected (handles hydration gap)
- Throws error if retry also has no side effects (element not interactive)
- Uses simple hash of body HTML for DOM mutation detection (first 1000 chars)
- Gracefully handles check failures (assumes effects occurred)

---

### 4.5 Bot Detection (Cloudflare/recAPTCHA)

**Issue:** Instant clicks with 0ms delay flag security systems as bots.

**Current Implementation:** `src/helpers/domActions.ts` - `clickAtPosition()`

**Required Fix:**
```typescript
async function clickAtPosition(
  x: number,
  y: number,
  clickCount = 1
): Promise<void> {
  const tabId = useAppState.getState().currentTask.tabId;
  
  // Get current mouse position (if available)
  const currentPos = await sendCommand('Runtime.evaluate', {
    expression: '({ x: window.mouseX || 0, y: window.mouseY || 0 })',
  });
  
  // Generate human-like mouse path (Bezier curve)
  const path = generateMousePath(
    { x: currentPos.x || x, y: currentPos.y || y },
    { x, y },
    10 // Number of waypoints
  );
  
  // Move mouse along path
  for (const point of path) {
    await sendCommand('Input.dispatchMouseEvent', {
      type: 'mouseMoved',
      x: point.x,
      y: point.y,
    });
    
    // Random delay between waypoints (10-30ms)
    await sleep(10 + Math.random() * 20);
  }
  
  // Random delay before click (50-150ms)
  await sleep(50 + Math.random() * 100);
  
  // Visual feedback
  callRPC('ripple', [x, y], 1, tabId);
  
  // Mouse down
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mousePressed',
    x,
    y,
    button: 'left',
    clickCount,
  });
  
  // Random delay between down and up (50-150ms)
  await sleep(50 + Math.random() * 100);
  
  // Mouse up
  await sendCommand('Input.dispatchMouseEvent', {
    type: 'mouseReleased',
    x,
    y,
    button: 'left',
    clickCount,
  });
}

function generateMousePath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  waypoints: number
): Array<{ x: number; y: number }> {
  const path: Array<{ x: number; y: number }> = [];
  
  // Simple Bezier curve with slight randomness
  for (let i = 0; i <= waypoints; i++) {
    const t = i / waypoints;
    const controlX = (start.x + end.x) / 2 + (Math.random() - 0.5) * 20;
    const controlY = (start.y + end.y) / 2 + (Math.random() - 0.5) * 20;
    
    const x = (1 - t) * (1 - t) * start.x + 2 * (1 - t) * t * controlX + t * t * end.x;
    const y = (1 - t) * (1 - t) * start.y + 2 * (1 - t) * t * controlY + t * t * end.y;
    
    path.push({ x, y });
  }
  
  return path;
}
```

**Status:** ⚠️ **TODO** - Needs implementation

---

## 5. Production Readiness: Final 5 Blind Spots

**Status:** ⚠️ **TODO** - Critical improvements for 1% failure rate (Production Grade)

**Overview:** These final 5 improvements address "Blind Spots"—things that are neither in the DOM nor standard JavaScript events. They are essential for reaching production-grade reliability (1% failure rate).

### 5.1 Visual Verification (The "Vision" Fallback)

**The Gap:** Your agent is currently "Blind". It reads code (DOM), but it doesn't *see* the screen.

**Edge Cases:**
- A button is covered by a white `div` (so it looks invisible but exists in DOM)
- The page is a `<canvas>` (like Google Sheets/Figma) which has **zero** DOM nodes
- Elements are visually present but not in the accessibility tree or DOM

**Current Implementation:** None

**Required Fix:**
```typescript
// In src/helpers/domActions.ts or new src/helpers/visualRecovery.ts

interface VisualRecoveryConfig {
  enabled: boolean;
  maxRetries: number;
  visionModel: 'gpt-4o' | 'gpt-4-vision-preview';
}

async function attemptVisualRecovery(
  action: string,
  description: string,
  tabId: number
): Promise<{ x: number; y: number } | null> {
  // Trigger: If an action fails twice, or if the DOM snapshot is empty
  const config = useAppState.getState().settings.visualRecovery;
  
  if (!config.enabled) {
    return null;
  }
  
  try {
    // 1. Client takes a screenshot
    const screenshotDataUrl = await chrome.tabs.captureVisibleTab(
      undefined,
      { format: 'png', quality: 100 }
    );
    
    // 2. Convert to base64
    const base64Image = screenshotDataUrl.split(',')[1];
    
    // 3. Send image to Backend (GPT-4o Vision)
    const response = await apiClient.request('POST', '/api/agent/visual-recovery', {
      image: base64Image,
      action,
      description,
      model: config.visionModel,
    });
    
    // 4. Backend returns (x, y) coordinates relative to image size
    if (response.coordinates) {
      // 5. Convert image coordinates to viewport coordinates
      const viewportSize = await chrome.tabs.executeScript(tabId, {
        code: `({ width: window.innerWidth, height: window.innerHeight })`,
      });
      
      const x = (response.coordinates.x / response.imageWidth) * viewportSize[0].width;
      const y = (response.coordinates.y / response.imageHeight) * viewportSize[0].height;
      
      return { x, y };
    }
    
    return null;
  } catch (error) {
    console.error('Visual recovery failed:', error);
    return null;
  }
}

// Integration in click() function
async function click(payload: { elementId: number }) {
  let retryCount = 0;
  const maxRetries = 2;
  
  while (retryCount < maxRetries) {
    try {
      // ... existing click logic ...
      return;
    } catch (error) {
      retryCount++;
      
      if (retryCount >= maxRetries) {
        // Attempt visual recovery
        const hybridElements = useAppState.getState().currentTask.hybridElements;
        const element = hybridElements?.[payload.elementId];
        
        if (element) {
          const coords = await attemptVisualRecovery(
            'click',
            element.name || element.description || 'element',
            tabId
          );
          
          if (coords) {
            // Perform "Blind Click" at coordinates
            await clickAtPosition(coords.x, coords.y);
            return;
          }
        }
        
        throw error;
      }
    }
  }
}
```

**Backend API Endpoint:** `POST /api/agent/visual-recovery`
- **Request:** `{ image: string (base64), action: string, description: string, model: string }`
- **Response:** `{ coordinates: { x: number, y: number }, imageWidth: number, imageHeight: number }`
- **Prompt:** "Here is the screenshot. I cannot find the '[description]' button in the DOM. Give me the (x, y) coordinates of the '[description]' button relative to the image size."

**Status:** ⚠️ **TODO** - Needs implementation

---

### 5.2 The "File Download" Black Hole

**The Gap:** A very common enterprise task is *"Download the report and email it to me."*

**Edge Cases:**
- Agent clicks "Download". The browser creates a file. **The Agent has no idea.**
- Agent doesn't know the filename, where it is, or if it finished
- Agent cannot "upload" it later because it can't find it

**Current Implementation:** None

**Required Fix:**
```typescript
// In src/pages/Background/index.js

// Monitor downloads
chrome.downloads.onCreated.addListener((downloadItem) => {
  const currentTask = useAppState.getState().currentTask;
  
  // If task is running, pause execution until download completes
  if (currentTask.status === 'running') {
    // Store download info in task context
    useAppState.getState().currentTask.actions.addDownload({
      id: downloadItem.id,
      filename: downloadItem.filename,
      url: downloadItem.url,
      state: downloadItem.state,
      startTime: Date.now(),
    });
    
    // Pause task execution
    useAppState.getState().currentTask.actions.pause('Waiting for download to complete');
  }
});

chrome.downloads.onChanged.addListener((downloadDelta) => {
  const currentTask = useAppState.getState().currentTask;
  const download = currentTask.downloads?.find(d => d.id === downloadDelta.id);
  
  if (download && downloadDelta.state) {
    // Update download state
    useAppState.getState().currentTask.actions.updateDownload(downloadDelta.id, {
      state: downloadDelta.state.current,
      filename: downloadDelta.filename?.current || download.filename,
    });
    
    // If download completed, resume task
    if (downloadDelta.state.current === 'complete') {
      useAppState.getState().currentTask.actions.resume();
      
      // Notify LLM via system message
      const systemMessage = `[System] Download completed: ${downloadDelta.filename?.current || download.filename}. File saved.`;
      // Add to conversation history
    }
    
    // If download failed, resume with error
    if (downloadDelta.state.current === 'interrupted') {
      useAppState.getState().currentTask.actions.resume();
      
      const systemMessage = `[System] Download failed: ${download.filename}. Error: ${downloadDelta.error?.current || 'Unknown error'}.`;
      // Add to conversation history
    }
  }
});

// For file uploads (setting file input path)
async function setFileInput(payload: { elementId: number; filePath: string }): Promise<void> {
  // Note: Standard JS cannot set input.value for files due to security
  // Must use Chrome Debugger API
  const objectId = await getObjectId(payload.elementId);
  
  await sendCommand('DOM.setFileInputFiles', {
    objectId,
    files: [payload.filePath],
  });
}
```

**State Management Updates:**
```typescript
// In src/state/currentTask.ts
interface DownloadInfo {
  id: number;
  filename: string;
  url: string;
  state: 'in_progress' | 'complete' | 'interrupted';
  startTime: number;
  endTime?: number;
}

interface CurrentTaskState {
  // ... existing fields
  downloads?: DownloadInfo[];
  isPaused?: boolean;
  pauseReason?: string;
}
```

**Status:** ⚠️ **TODO** - Needs implementation

---

### 5.3 "Human-in-the-Loop" Hand-off (2FA & Captcha)

**The Gap:** Some things **cannot** be bypassed by a bot (e.g., SMS 2FA code, strict Captchas).

**Edge Cases:**
- Agent logs in. The page asks for "Enter code sent to +1 555...". The agent fails because it doesn't have your phone
- reCAPTCHA v3 or hCaptcha requires human interaction
- Security questions that require human knowledge

**Current Implementation:** None

**Required Fix:**
```typescript
// In src/pages/Content/getAnnotatedDOM.ts or new src/helpers/userInputDetection.ts

function detectUserInputRequired(dom: string): {
  requiresUserInput: boolean;
  type: '2fa' | 'captcha' | 'security_question' | 'unknown';
  message?: string;
} {
  const lowerDom = dom.toLowerCase();
  
  // Detect 2FA prompts
  if (
    lowerDom.includes('enter code') ||
    lowerDom.includes('verification code') ||
    lowerDom.includes('2fa') ||
    lowerDom.includes('two-factor') ||
    lowerDom.includes('sent to') ||
    lowerDom.includes('sms code')
  ) {
    return {
      requiresUserInput: true,
      type: '2fa',
      message: 'Enter verification code sent to your device',
    };
  }
  
  // Detect Captcha
  if (
    lowerDom.includes('captcha') ||
    lowerDom.includes('recaptcha') ||
    lowerDom.includes('hcaptcha') ||
    lowerDom.includes('verify you are human') ||
    lowerDom.includes('i am not a robot')
  ) {
    return {
      requiresUserInput: true,
      type: 'captcha',
      message: 'Please solve the Captcha',
    };
  }
  
  // Detect security questions
  if (
    lowerDom.includes('security question') ||
    lowerDom.includes('verify it\'s you') ||
    lowerDom.includes('answer the following')
  ) {
    return {
      requiresUserInput: true,
      type: 'security_question',
      message: 'Please answer the security question',
    };
  }
  
  return { requiresUserInput: false, type: 'unknown' };
}

// In src/state/currentTask.ts - after DOM extraction
const userInputCheck = detectUserInputRequired(domResult.simplifiedHTML);
if (userInputCheck.requiresUserInput) {
  // Pause task execution
  set((state) => {
    state.currentTask.status = 'paused';
    state.currentTask.pauseReason = userInputCheck.message || 'User input required';
    state.currentTask.userInputRequired = {
      type: userInputCheck.type,
      message: userInputCheck.message,
    };
  });
  
  // Send status to backend
  await apiClient.request('POST', '/api/agent/status', {
    status: 'NEEDS_USER_INPUT',
    reason: userInputCheck.message,
    type: userInputCheck.type,
  });
  
  return; // Stop execution
}
```

**UI Component:**
```typescript
// In src/common/TaskUI.tsx
const userInputRequired = useAppState((state) => state.currentTask.userInputRequired);

if (userInputRequired) {
  return (
    <Alert status="warning" variant="subtle">
      <AlertIcon />
      <AlertTitle>User Input Required</AlertTitle>
      <AlertDescription>
        {userInputRequired.message}
        <Button
          mt={2}
          onClick={() => {
            // Resume task execution
            useAppState.getState().currentTask.actions.resume();
          }}
        >
          Resume
        </Button>
      </AlertDescription>
    </Alert>
  );
}
```

**Status:** ⚠️ **TODO** - Needs implementation

---

### 5.4 Advanced Scroll Targeting (Container Awareness)

**The Gap:** Your current scroll is likely `element.scrollIntoView()`.

**Edge Cases:**
- An "Infinite Scroll" list inside a pop-up modal
- `scrollIntoView` tries to scroll the *main window*, but the button is hidden inside a specific `div` with `overflow: scroll`
- Nested scroll containers (e.g., sidebar with scroll, main content with scroll)

**Current Implementation:** `src/helpers/domActions.ts` - `scrollIntoView()`

**Required Fix:**
```typescript
// In src/helpers/domActions.ts

async function findScrollParent(objectId: string): Promise<string | null> {
  // Walk up the DOM tree checking for scroll containers
  const result = await sendCommand('Runtime.callFunctionOn', {
    objectId,
    functionDeclaration: `
      function() {
        let element = this;
        
        while (element && element !== document.body) {
          const style = window.getComputedStyle(element);
          const overflowY = style.overflowY;
          const overflowX = style.overflowX;
          
          // Check if element is a scroll container
          if (
            (overflowY === 'auto' || overflowY === 'scroll') ||
            (overflowX === 'auto' || overflowX === 'scroll')
          ) {
            // Check if element actually scrolls (has scrollable content)
            if (element.scrollHeight > element.clientHeight ||
                element.scrollWidth > element.clientWidth) {
              return element;
            }
          }
          
          element = element.parentElement;
        }
        
        return null; // No scroll parent found, use window
      }
    `,
  });
  
  return result?.objectId || null;
}

async function scrollContainer(
  objectId: string,
  direction: 'up' | 'down' | 'left' | 'right' = 'down'
): Promise<void> {
  const scrollParentId = await findScrollParent(objectId);
  
  if (!scrollParentId) {
    // Fallback to standard scrollIntoView
    await sendCommand('Runtime.callFunctionOn', {
      objectId,
      functionDeclaration: `
        function() {
          this.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      `,
    });
    return;
  }
  
  // Scroll the specific container
  await sendCommand('Runtime.callFunctionOn', {
    objectId: scrollParentId,
    functionDeclaration: `
      function() {
        const element = arguments[0];
        const direction = arguments[1];
        
        // Calculate element position relative to scroll container
        const containerRect = this.getBoundingClientRect();
        const elementRect = element.getBoundingClientRect();
        
        const relativeTop = elementRect.top - containerRect.top;
        const relativeLeft = elementRect.left - containerRect.left;
        
        // Scroll to center element in container
        if (direction === 'down' || direction === 'up') {
          this.scrollTop = relativeTop - (this.clientHeight / 2) + (elementRect.height / 2);
        }
        
        if (direction === 'left' || direction === 'right') {
          this.scrollLeft = relativeLeft - (this.clientWidth / 2) + (elementRect.width / 2);
        }
      }
    `,
    arguments: [{ objectId }, direction],
  });
}

// Add new action to availableActions.ts
{
  name: 'scroll_container',
  description: 'Scrolls a specific container to bring an element into view',
  args: [
    { name: 'elementId', type: 'number' },
    { name: 'direction', type: 'string', optional: true }, // 'up' | 'down' | 'left' | 'right'
  ],
}
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/helpers/domActions.ts` `scrollContainer()` and `findScrollParent()` functions, and `src/helpers/actionExecutors.ts` `executeScrollContainer()`

**Implementation Notes:**
- Added `findScrollParent()` to walk up DOM tree checking `overflow` and `scrollHeight > clientHeight`
- Added `scrollContainer()` to scroll specific parent container instead of window
- Updated `scrollIntoView()` to use container-aware scrolling
- Added `scroll_container` action to `availableActions.ts` and `actionExecutors.ts`
- Supports direction parameter: 'up', 'down', 'left', 'right'
- Falls back to standard `scrollIntoView` if no scroll parent found
- Handles infinite scroll lists in modals and nested scroll containers

---

### 5.5 "Wait for Condition" (Smart Patience)

**The Gap:** You likely use `wait(2000)` or `waitForDOMStability`.

**Edge Cases:**
- A report generation takes 45 seconds. The DOM is stable (spinner is spinning). The network is quiet (it's processing server-side)
- Your "Stability Check" thinks it's done, scans, sees a spinner, and fails
- Waiting for specific text or element to appear (e.g., "Download Ready", "Processing Complete")

**Current Implementation:** `src/helpers/domWaiting.ts` - `waitForDOMStabilization()`

**Required Fix:**
```typescript
// In src/helpers/domWaiting.ts

interface WaitCondition {
  type: 'text' | 'selector' | 'element_count' | 'url_change' | 'custom';
  value: string; // Text to find, CSS selector, element count, URL pattern, or custom function
  timeout?: number; // Max wait time in ms (default: 60000)
  pollInterval?: number; // Poll interval in ms (default: 500)
}

async function waitForCondition(
  condition: WaitCondition,
  tabId: number
): Promise<{ success: boolean; elapsed: number; message?: string }> {
  const timeout = condition.timeout || 60000;
  const pollInterval = condition.pollInterval || 500;
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    try {
      const result = await chrome.tabs.executeScript(tabId, {
        code: `
          (function() {
            const condition = ${JSON.stringify(condition)};
            
            switch (condition.type) {
              case 'text':
                return document.body.textContent?.includes(condition.value) || false;
              
              case 'selector':
                return document.querySelector(condition.value) !== null;
              
              case 'element_count':
                const count = document.querySelectorAll(condition.value).length;
                return count >= parseInt(condition.value.split(':')[1] || '1');
              
              case 'url_change':
                return window.location.href.includes(condition.value);
              
              case 'custom':
                // Evaluate custom function
                try {
                  const fn = new Function('return ' + condition.value)();
                  return fn();
                } catch (e) {
                  return false;
                }
              
              default:
                return false;
            }
          })()
        `,
      });
      
      if (result && result[0]) {
        return {
          success: true,
          elapsed: Date.now() - startTime,
          message: `Condition met: ${condition.type} = ${condition.value}`,
        };
      }
    } catch (error) {
      console.warn('Error checking condition:', error);
    }
    
    await sleep(pollInterval);
  }
  
  return {
    success: false,
    elapsed: Date.now() - startTime,
    message: `Timeout waiting for condition: ${condition.type} = ${condition.value}`,
  };
}

// Add new action to availableActions.ts
{
  name: 'wait_for',
  description: 'Waits until a specific condition is met (text appears, selector found, URL changes, etc.)',
  args: [
    { name: 'condition', type: 'string' }, // JSON string of WaitCondition
  ],
}

// LLM Usage Example:
// The LLM Plan: "Click 'Generate' and wait until text 'Download Ready' appears."
// Action: wait_for('{"type":"text","value":"Download Ready","timeout":60000}')
```

**Status:** ✅ **IMPLEMENTED** (January 28, 2026) - See `src/helpers/actionExecutors.ts` `executeWaitFor()` and `src/pages/Content/getAnnotatedDOM.ts` `checkWaitCondition()`

**Implementation Notes:**
- Added `checkWaitCondition()` RPC function in content script
- Added `executeWaitFor()` action executor
- Supports 5 condition types: `text`, `selector`, `element_count`, `url_change`, `custom`
- Polls every 500ms (configurable) for up to 60 seconds (configurable)
- Returns immediately when condition is met
- Throws error with descriptive message if timeout occurs
- Added `wait_for` action to `availableActions.ts` and action executor map

---

## 6. DOM Processing Implementation Details

### 6.1 DOM Extraction Pipeline

**Flow:**
1. **Content Script:** `src/pages/Content/getAnnotatedDOM.ts`
   - Traverses DOM tree
   - Assigns `data-id` attributes
   - Marks interactive/visible elements
   - Returns annotated HTML

2. **DOM Simplification:** `src/helpers/simplifyDom.ts`
   - Extracts accessibility tree (if available)
   - Filters to interactive elements
   - Creates hybrid elements (accessibility + DOM)
   - Generates simplified HTML

3. **Templatization:** `src/helpers/shrinkHTML/templatize.ts`
   - Reduces token count
   - Replaces repeated patterns with templates
   - Self-closing tags where possible

4. **Virtual Element Detection:** `src/pages/Content/getAnnotatedDOM.ts`
   - Scans `ul[name="menuEntries"]` for text nodes
   - Creates virtual elements with coordinates
   - Merges into `hybridElements`

### 6.2 Interactive Element Detection

**Implementation:** `src/pages/Content/getAnnotatedDOM.ts` - `isInteractive()`

```typescript
function isInteractive(
  element: HTMLElement,
  style: CSSStyleDeclaration
): boolean {
  // Check for interactive ARIA roles
  const role = element.getAttribute('role');
  const interactiveRoles = [
    'button', 'link', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'option', 'tab', 'treeitem', 'checkbox', 'radio', 'textbox',
    'searchbox', 'combobox', 'slider', 'switch', 'spinbutton'
  ];
  
  if (role && interactiveRoles.includes(role)) {
    return true;
  }
  
  // Check for interactive tags
  return (
    element.tagName === 'A' ||
    element.tagName === 'INPUT' ||
    element.tagName === 'BUTTON' ||
    element.tagName === 'SELECT' ||
    element.tagName === 'TEXTAREA' ||
    element.hasAttribute('onclick') ||
    element.hasAttribute('onmousedown') ||
    element.hasAttribute('onmouseup') ||
    element.hasAttribute('onkeydown') ||
    element.hasAttribute('onkeyup') ||
    style.cursor === 'pointer'
  );
}
```

### 6.3 Element Snapshot System

**Purpose:** Track DOM changes after actions (e.g., dropdown menus appearing)

**Implementation:** `src/helpers/domWaiting.ts`

**Key Functions:**
- `getInteractiveElementSnapshot()`: Captures current state of all interactive elements
- `compareDOMSnapshots()`: Compares before/after snapshots to detect changes
- `detectDropdownMenu()`: Identifies dropdown menus from added elements
- `waitForDOMChangesAfterAction()`: Waits for DOM to stabilize and reports changes

**Usage:**
```typescript
// Before action
const beforeSnapshot = await getInteractiveElementSnapshot();

// Execute action
await click(elementId);

// Wait for changes
const domChangeReport = await waitForDOMChangesAfterAction(beforeSnapshot, {
  minWait: 500,
  maxWait: 5000,
  stabilityThreshold: 300,
});

if (domChangeReport.dropdownDetected) {
  console.log('Dropdown detected with items:', domChangeReport.dropdownItems);
}
```

### 6.4 Hybrid Element System

**Purpose:** Unified element representation combining accessibility tree and DOM data

**Implementation:** `src/helpers/hybridElement.ts`

**Structure:**
```typescript
interface HybridElement {
  id: number; // Element index (for action targeting)
  axNode?: AXNode; // Original accessibility node
  axElement?: SimplifiedAXElement; // Simplified accessibility element
  domElement?: HTMLElement; // Original DOM element
  role: string; // Combined role
  name: string | null; // Combined name
  description: string | null; // Combined description
  value: string | null; // Combined value
  interactive: boolean; // Whether element is interactive
  attributes: Record<string, string>; // Combined attributes
  source: 'accessibility' | 'dom' | 'hybrid'; // Primary data source
  backendDOMNodeId?: number; // Backend DOM node ID for mapping
  hasPopup?: string; // Popup/dropdown indicators
  expanded?: boolean; // Current expanded state
}
```

**Creation:**
- `createHybridElement()`: Creates hybrid element from accessibility + DOM
- `createHybridElements()`: Batch creates hybrid elements from accessibility tree
- `hybridElementToDOM()`: Converts hybrid element back to DOM for simplified HTML

---

## 7. Implementation Checklist

### ✅ Completed

- [x] **Virtual Element Handling:** Text node menu items detected and clickable
- [x] **DOM Change Tracking:** Snapshot system for detecting dropdowns and dynamic content
- [x] **Interactive Element Detection:** ARIA roles and standard tags
- [x] **Hybrid Element System:** Unified accessibility + DOM representation
- [x] **DOM Stabilization:** Basic MutationObserver-based waiting
- [x] **React Input Events:** Native keystrokes + event dispatching for React/Angular/Vue compatibility (Section 2.1) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Shadow DOM Support:** Recursive traversal of shadow roots for Enterprise apps (Section 2.2) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Hover Action:** Enhanced with proper hydration wait (Section 2.3) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Click Obstruction Check:** Hit testing to prevent clicking overlays (Section 2.4) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Iframe Support:** Frame tagging and traversal (Section 2.5) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Stale Element Recovery:** Fallback search by text/role when element ID is stale (Section 2.6) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Dynamic Stability Check:** Network idle detection enhancement (Section 3.3) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **New Tab Handling:** Auto-follow logic with tab listeners (Section 4.2) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Native Dialog Override:** Monkey-patch alert/confirm/prompt (Section 4.3) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Click Verification:** Side effect detection and retry logic (Section 4.4) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Advanced Scroll Targeting:** Container-aware scrolling (Section 5.4) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Wait for Condition:** Smart patience with explicit expectations (Section 5.5) - ✅ **IMPLEMENTED** (January 28, 2026)

### ⚠️ TODO: Critical Production Fixes (6 Hidden Failure Modes)

**Priority 1: High Priority (Blocks Common Use Cases) - ✅ IMPLEMENTED**
- [x] **React Input Events:** Dispatch `input`/`change` events after typing (Section 2.1) - ✅ **IMPLEMENTED** in `src/helpers/domActions.ts`
- [x] **Shadow DOM Support:** Recursive traversal of shadow roots (Section 2.2) - ✅ **IMPLEMENTED** in `src/pages/Content/getAnnotatedDOM.ts`
- [x] **Click Obstruction Check:** `elementFromPoint` verification before clicking (Section 2.4) - ✅ **IMPLEMENTED** in `src/helpers/domActions.ts`
- [x] **Stale Element Recovery:** Fallback to text/XPath search if ID missing (Section 2.6) - ✅ **IMPLEMENTED** in `src/helpers/domActions.ts`
- [x] **Dynamic Stability Check:** Network idle detection enhancement (Section 3.3) - ✅ **IMPLEMENTED** in `src/helpers/domWaiting.ts`
- [x] **Click Verification:** Side effect detection and retry logic (Section 4.4) - ✅ **IMPLEMENTED** in `src/helpers/domActions.ts`

**Priority 2: Medium Priority (Enterprise Apps)**
- [x] **Iframe Support:** `all_frames: true` and frame tagging (Section 2.5) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Hover Action:** Enhanced with proper hydration wait (Section 2.3) - ✅ **IMPLEMENTED** (January 28, 2026)

### ⚠️ TODO: Missing Layers of Robustness (4 Layers)

**Priority 1: High Priority**
- [ ] **Synthetic Event Trap:** React/Angular/Vue input state updates (Section 3.1 - same as 2.1)
- [ ] **Visual Lie:** Overlay obstruction detection (Section 3.2 - same as 2.4)

**Priority 2: Medium Priority**
- [x] **Dynamic Stability Check:** Network idle detection enhancement (Section 3.3) - ✅ **IMPLEMENTED** (January 28, 2026)
- [ ] **Iframe Blind Spot:** Cross-origin iframe support (Section 3.4 - same as 2.5)

### ⚠️ TODO: Advanced Edge Cases (5 Cases)

**Priority 1: High Priority**
- [x] **Stale Element Race Condition:** React re-render recovery (Section 4.1 - same as 2.6) - ✅ **IMPLEMENTED** (January 28, 2026)

**Priority 2: Medium Priority**
- [x] **New Tab Disconnect:** Auto-switch focus on tab creation (Section 4.2) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Native Dialog Override:** Non-blocking `alert`/`confirm`/`prompt` (Section 4.3) - ✅ **IMPLEMENTED** (January 28, 2026)
- [x] **Hydration Gap:** Click verification with side effect detection (Section 4.4) - ✅ **IMPLEMENTED** (January 28, 2026)

**Priority 3: Low Priority (Edge Cases)**
- [ ] **Bot Detection:** Human-like mouse paths and typing delays (Section 4.5)

### ⚠️ TODO: Final 5 Blind Spots (Production Grade - 1% Failure Rate)

**Priority 1: High Priority (Critical for Production)**
- [ ] **Visual Verification:** GPT-4o Vision fallback for canvas/obscured elements (Section 5.1) - **PENDING** (requires backend)
- [ ] **Human-in-the-Loop:** 2FA/Captcha detection and pause/resume (Section 5.3) - **PENDING** (requires backend)
- [x] **Wait for Condition:** Smart patience with explicit expectations (Section 5.5) - ✅ **IMPLEMENTED** (January 28, 2026)

**Priority 2: Medium Priority (Enterprise Features)**
- [ ] **File Download Handling:** Download monitoring and file input support (Section 5.2)
- [x] **Advanced Scroll Targeting:** Container-aware scrolling (Section 5.4) - ✅ **IMPLEMENTED** (January 28, 2026)

### 📊 Overall Priority Order (Implementation Roadmap)

**Phase 1: Critical Foundation (Must Have for Basic Production)**
1. ✅ React Input Events (2.1) - **COMPLETE** - Native keystrokes + event dispatching
2. ✅ Shadow DOM Support (2.2) - **COMPLETE** - Recursive traversal of shadow roots
3. ✅ Click Obstruction Check (2.4) - **COMPLETE** - Hit testing before clicks
4. ✅ Stale Element Recovery (2.6) - **COMPLETE** - Fallback search by text/role
5. Visual Verification (5.1) - **NEXT PRIORITY**
6. Human-in-the-Loop (5.3)

**Phase 2: Enterprise Readiness (Required for Complex Apps)**
7. ✅ Iframe Support (2.5) - **COMPLETE** - Frame tagging and traversal
8. ✅ Hover Action (2.3) - **COMPLETE** - Enhanced with proper hydration wait
9. ✅ Dynamic Stability Check Enhancement (3.3) - **COMPLETE** - Network idle detection
10. ✅ Wait for Condition (5.5) - **COMPLETE** - Smart patience with explicit expectations

**Phase 3: Advanced Features (Edge Cases & Polish)**
11. ✅ New Tab Handling (4.2) - **COMPLETE** - Auto-follow logic with tab listeners
12. ✅ Native Dialog Override (4.3) - **COMPLETE** - Monkey-patch alert/confirm/prompt
13. ✅ Click Verification (4.4) - **COMPLETE** - Side effect detection and retry
14. File Download Handling (5.2) - **Pending** (requires backend coordination)
15. ✅ Advanced Scroll Targeting (5.4) - **COMPLETE** - Container-aware scrolling

**Phase 4: Bot Detection Mitigation (Optional)**
16. Human-like Interaction (4.5)

---

## 8. Testing Recommendations

### 8.1 Test Cases for Virtual Elements

1. **Text Node Menu Items:**
   - Test with `<ul name="menuEntries">New/Search Dashboard</ul>`
   - Verify "New/Search" appears in `hybridElements`
   - Verify click works at calculated coordinates

2. **Multi-Item Text Nodes:**
   - Test with text containing multiple menu items
   - Verify each item gets separate virtual element

3. **Hidden Text Nodes:**
   - Test with `display: none` text nodes
   - Verify they are skipped

### 8.2 Test Cases for Production Fixes

1. **React Forms:**
   - Test `setValue` on React input
   - Verify form submission includes value

2. **Shadow DOM:**
   - Test on Salesforce LWC component
   - Verify elements inside shadow root are detected

3. **Overlays:**
   - Test click with cookie banner overlay
   - Verify obstruction error is returned

4. **Iframes:**
   - Test click inside cross-origin iframe
   - Verify action routes to correct frame

5. **Stale Elements:**
   - Test click after React re-render
   - Verify recovery search finds new element

### 8.3 Test Cases for Final 5 Blind Spots

1. **Visual Verification:**
   - Test on canvas-based app (Google Sheets, Figma)
   - Test with obscured button (white overlay)
   - Verify GPT-4o Vision returns correct coordinates
   - Verify blind click works at returned coordinates

2. **File Download Handling:**
   - Test download monitoring (onCreated, onChanged)
   - Test task pause/resume on download start/complete
   - Test file input setting (Chrome Debugger API)
   - Verify download info stored in task context

3. **Human-in-the-Loop:**
   - Test 2FA detection ("Enter code sent to...")
   - Test Captcha detection ("Verify you are human")
   - Test security question detection
   - Verify task pauses and shows UI notification
   - Verify resume button works

4. **Advanced Scroll Targeting:**
   - Test infinite scroll list in modal
   - Test nested scroll containers
   - Verify correct container is scrolled (not window)
   - Verify element becomes visible after scroll
   - Test `scroll_container` action with different directions

5. **Wait for Condition:**
   - Test text appearance wait ("Download Ready")
   - Test selector wait (element appears)
   - Test URL change wait
   - Test element count wait
   - Test custom condition function
   - Test timeout handling (60s max)
   - Verify polling interval (500ms default)

6. **Hover Action:**
   - Test hover on element that triggers dropdown
   - Verify menu items appear after 500ms wait
   - Test hover on element with tooltip
   - Verify DOM snapshot detects new elements after hover

7. **Iframe Support:**
   - Test elements tagged with `data-frame-id`
   - Test same-origin iframe traversal
   - Test cross-origin iframe handling (should gracefully skip)
   - Verify frame identification works correctly

8. **New Tab Handling:**
   - Test clicking link that opens new tab
   - Verify agent auto-switches to new tab
   - Test user manually switching tabs during task
   - Verify system messages are added to conversation

9. **Native Dialog Override:**
   - Test page that calls `alert()`
   - Test page that calls `confirm()`
   - Test page that calls `prompt()`
   - Verify dialogs don't block execution
   - Verify messages are sent to background script

1. **React Forms:**
   - Test `setValue` on React input
   - Verify form submission includes value

2. **Shadow DOM:**
   - Test on Salesforce LWC component
   - Verify elements inside shadow root are detected

3. **Overlays:**
   - Test click with cookie banner overlay
   - Verify obstruction error is returned

4. **Iframes:**
   - Test click inside cross-origin iframe
   - Verify action routes to correct frame

5. **Stale Elements:**
   - Test click after React re-render
   - Verify recovery search finds new element

---

## 9. Architecture Status Summary

### 9.1 Component Status Overview

| Component | Status | Rating | Notes |
| --- | --- | --- | --- |
| **Logic/Reasoning** | **Excellent** | ⭐⭐⭐⭐⭐ | "Reason-Search-Plan" loop is effectively SOTA. |
| **DOM Visibility** | **Excellent** | ⭐⭐⭐⭐⭐ | Virtual Text Nodes + Shadow DOM + Iframe traversal fixes all major blind spots. All DOM-related visibility improvements complete. |
| **Resilience** | **Excellent** | ⭐⭐⭐⭐⭐ | All critical fixes implemented: React Input Events, Shadow DOM, Click Obstruction, Stale Element Recovery, Hover, Network Idle, Click Verification, New Tab Handling, Native Dialog Override, Advanced Scroll, Wait for Condition. Production-grade robustness achieved. |
| **Visuals/Files** | **Missing** | ⭐ | Needs Vision fallback (Section 5.1) & Download handling (Section 5.2) - pending backend coordination. Human-in-the-Loop (Section 5.3) also pending. |

**Final Verdict:** ✅ **All DOM-Related Enhancements COMPLETE** (Sections 2.1-2.6, 3.3, 4.2-4.4, 5.4-5.5 implemented January 28, 2026). Resilience and DOM Visibility ratings both at ⭐⭐⭐⭐⭐. All non-visual improvements complete. Remaining: **Visual Verification** (Section 5.1) and **Human Handoff** (Section 5.3) - pending backend coordination. **File Download Handling** (Section 5.2) also pending.

### 9.2 Implementation Roadmap Summary

**Current State:**
- ✅ Virtual Element Handling (Text Node Menu Items) - **COMPLETE**
- ✅ DOM Change Tracking - **COMPLETE**
- ✅ Interactive Element Detection - **COMPLETE**
- ✅ Hybrid Element System - **COMPLETE**
- ✅ DOM Stabilization (Basic) - **COMPLETE**
- ✅ React Input Events (Section 2.1) - **COMPLETE** (January 28, 2026)
- ✅ Shadow DOM Support (Section 2.2) - **COMPLETE** (January 28, 2026)
- ✅ Hover Action (Section 2.3) - **COMPLETE** (January 28, 2026)
- ✅ Click Obstruction Check (Section 2.4) - **COMPLETE** (January 28, 2026)
- ✅ Iframe Support (Section 2.5) - **COMPLETE** (January 28, 2026)
- ✅ Stale Element Recovery (Section 2.6) - **COMPLETE** (January 28, 2026)
- ✅ Dynamic Stability Check (Section 3.3) - **COMPLETE** (January 28, 2026)
- ✅ New Tab Handling (Section 4.2) - **COMPLETE** (January 28, 2026)
- ✅ Native Dialog Override (Section 4.3) - **COMPLETE** (January 28, 2026)
- ✅ Click Verification (Section 4.4) - **COMPLETE** (January 28, 2026)
- ✅ Advanced Scroll Targeting (Section 5.4) - **COMPLETE** (January 28, 2026)
- ✅ Wait for Condition (Section 5.5) - **COMPLETE** (January 28, 2026)

**Next Steps (Pending Backend Coordination):**
1. **Visual Verification (Section 5.1)** - **PENDING** - Requires GPT-4o Vision API endpoint
2. **Human-in-the-Loop (Section 5.3)** - **PENDING** - Requires backend NEEDS_USER_INPUT handling
3. **File Download Handling (Section 5.2)** - **PENDING** - Requires download monitoring integration

**Future Enhancements (Pending Backend):**
- Visual Verification (Section 5.1) - Requires GPT-4o Vision API endpoint
- Human-in-the-Loop (Section 5.3) - Requires backend NEEDS_USER_INPUT handling
- File Download Handling (Section 5.2) - Requires download monitoring integration
- Bot Detection Mitigation (Section 4.5) - Optional enhancement

### 9.3 Key Implementation Files Reference

**Core DOM Processing:**
- `src/pages/Content/getAnnotatedDOM.ts` - DOM extraction, virtual element detection
- `src/helpers/simplifyDom.ts` - DOM simplification and accessibility integration
- `src/helpers/domWaiting.ts` - DOM change tracking and stabilization
- `src/helpers/hybridElement.ts` - Hybrid element system

**Action Execution:**
- `src/helpers/domActions.ts` - Browser action execution (click, setValue, scroll, scrollContainer, findScrollParent)
- `src/helpers/actionExecutors.ts` - Action executors (hover, wait_for, scroll_container, executeWaitFor, executeScrollContainer, executeHover)
- `src/helpers/availableActions.ts` - Action definitions (hover, scroll_container, wait_for)
- `src/state/currentTask.ts` - Task execution loop and state management (includes new tab handling via chrome.storage events)

**Recently Implemented (January 28, 2026):**
- `src/pages/Content/nativeDialogOverride.js` - Native dialog override (Section 4.3) - **NEW FILE**
- `src/pages/Background/index.js` - New tab handling listeners (Section 4.2) - **ENHANCED**
- `src/pages/Content/getAnnotatedDOM.ts` - Iframe support, frame tagging, and checkWaitCondition RPC (Sections 2.5, 5.5) - **ENHANCED**
- `src/helpers/domWaiting.ts` - Network idle detection (Section 3.3) - **ENHANCED**
- `src/helpers/domActions.ts` - Click verification (Section 4.4) and scroll container awareness (Section 5.4) - **ENHANCED**
- `src/helpers/actionExecutors.ts` - Hover enhancement (Section 2.3), wait_for executor (Section 5.5), scroll_container executor (Section 5.4) - **ENHANCED**
- `src/helpers/pageRPC.ts` - Registered checkWaitCondition RPC method (Section 5.5) - **ENHANCED**
- `src/manifest.json` - Added all_frames: true and nativeDialogOverride content script (Sections 2.5, 4.3) - **ENHANCED**
- `webpack.config.js` - Added nativeDialogOverride entry point (Section 4.3) - **ENHANCED**

**Future Implementation Targets (Pending Backend):**
- `src/helpers/visualRecovery.ts` - Visual verification (Section 5.1) - **PENDING**
- `src/helpers/userInputDetection.ts` - Human-in-the-loop detection (Section 5.3) - **PENDING**
- `src/pages/Background/index.js` - Download monitoring (Section 5.2) - **PENDING**

---

**End of Document**
