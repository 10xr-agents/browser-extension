# DOM Extraction Architecture

**Purpose:** Comprehensive documentation of how DOM extraction works in the Spadeworks Copilot AI browser extension and what data is sent to the LLM for decision-making.

**Last Updated:** February 1, 2026

**Implementation Status:** ✅ Fully Integrated

| Component | Status | Location |
|-----------|--------|----------|
| Semantic Extraction (PRIMARY) | ✅ Active | `semanticTree.ts` → `currentTask.ts` |
| Skeleton/Hybrid (Fallback) | ✅ Active | `skeletonDom.ts`, `hybridCapture.ts` |
| Viewport Pruning | ✅ Active | `extractSemanticTreeV3()` |
| Raycasting (Modal Killer) | ✅ Active | `isActuallyClickable()` |
| Label Hunting | ✅ Active | `findLabelForInput()` |
| Mutation Stream | ✅ Implemented | `mutationLog.ts` |
| Delta Hashing | ✅ Implemented | `deltaHash.ts` |
| DOM RAG | ✅ Implemented | `domRag.ts` |
| Sentinel Verification | ✅ Implemented | `sentinelVerification.ts` |
| AXTree (CDP) | ✅ Implemented | `axTreeExtractor.ts` |
| Backend Negotiation | ✅ Active | `currentTask.ts` (needs_context handling) |

## Extraction Flow

```
1. Semantic Extraction (PRIMARY) - ~25-75 tokens
   └── getSemanticDomV3() with viewport pruning, raycasting

2. Skeleton/Hybrid (FALLBACK) - ~500-3000 tokens
   └── selectDomMode() based on query keywords (if semantic fails)

3. Backend Negotiation (ON REQUEST)
   └── needs_context/needs_full_dom → retry with requested artifacts
```

---

## Table of Contents

1. [Overview](#1-overview)
2. [Semantic Architecture - Ultra-Light Extraction](#2-semantic-architecture---ultra-light-extraction)
   - 2.5 [Advanced Features](#25-advanced-features-production-grade)
   - 2.6 [Production-Grade Features](#26-production-grade-features)
   - 2.7 [Element ID Strategy: data-llm-id vs backendNodeId](#27-element-id-strategy-data-llm-id-vs-backendnodeid)
   - 2.8 [Midscene-Inspired Optimizations](#28-midscene-inspired-optimizations)
3. [Extraction Pipeline](#3-extraction-pipeline)
4. [The Tag & Freeze Strategy](#4-the-tag--freeze-strategy)
5. [Shadow DOM Support](#5-shadow-dom-support)
6. [Iframe Support (Distributed Extraction)](#6-iframe-support-distributed-extraction)
7. [Extraction Modes](#7-extraction-modes)
8. [Semantic JSON Protocol](#8-semantic-json-protocol)
9. [Skeleton DOM Extraction](#9-skeleton-dom-extraction)
10. [Full DOM Extraction](#10-full-dom-extraction)
11. [DOM Stability Waiting](#11-dom-stability-waiting)
12. [What Gets Sent to the LLM](#12-what-gets-sent-to-the-llm)
13. [Mode Selection Logic](#13-mode-selection-logic)
14. [Fallback Handling](#14-fallback-handling)
15. [Source Files Reference](#15-source-files-reference)

---

## 1. Overview

The DOM extraction system is responsible for capturing the current state of a web page and transforming it into a format that the LLM can understand and use to make decisions about browser automation actions.

### The Problem

LLMs need to "see" the page to decide what to click, type, or interact with. However:

1. **Raw HTML is huge** - A typical page is 500KB-2MB of HTML, which would consume 100k+ tokens
2. **Most HTML is irrelevant** - Scripts, styles, nested divs are noise for the LLM
3. **Element IDs drift** - On dynamic sites (React, Vue), element positions change after re-renders
4. **Timing matters** - Pages load progressively; extracting too early gives incomplete data

### The Solution

We use a multi-layered extraction system:

```
┌─────────────────────────────────────────────────────────────────┐
│                    DOM EXTRACTION PIPELINE                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────────┐  │
│  │   Tagger     │───▶│   Waiter     │───▶│    Extractor     │  │
│  │              │    │              │    │                  │  │
│  │ Assigns      │    │ Waits for    │    │ Semantic (JSON)  │  │
│  │ data-llm-id  │    │ DOM stable   │    │ Skeleton (HTML)  │  │
│  │              │    │              │    │ Full (HTML)      │  │
│  └──────────────┘    └──────────────┘    └──────────────────┘  │
│                                                                  │
│         ▼                    ▼                    ▼             │
│  Elements tagged      300ms no mutations    Mode selected       │
│  on page load         before extraction     based on query      │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. Semantic Architecture - Ultra-Light Extraction

**Semantic JSON is the current PRIMARY extraction mode.** It provides 99.8% token reduction through key innovations.

### Key Principle

> **Semantic JSON is the ONLY source of truth. Full DOM should NEVER be sent proactively — only when the backend explicitly requests it via `needs_full_dom` response.**

### Semantic Enhancements

| Enhancement | Description | Impact |
|-------------|-------------|--------|
| **Viewport Pruning** | Skip elements below/above the visible viewport | ~60% reduction on long pages |
| **Minified JSON Keys** | `i/r/n/v/s/xy` instead of `id/role/name/value/state/coordinates` | ~30% reduction |
| **Coordinates Included** | `[x, y]` center point for direct click targeting | Eliminates coordinate lookups |
| **AXTree Alternative** | CDP `Accessibility.getFullAXTree` for 100% reliable extraction | Bypasses all DOM issues |

### Token Cost Comparison

| Mode | Typical Size | Token Estimate | Cost @ $0.01/1k |
|------|--------------|----------------|-----------------|
| Full DOM | 50-200 KB | 10,000-50,000 | $0.10-0.50 |
| Skeleton | 2-6 KB | 500-1,500 | $0.005-0.015 |
| **Semantic** | **100-300 bytes** | **25-75** | **$0.00025-0.00075** |

### Semantic Payload Example

```json
{
  "mode": "semantic",
  "url": "https://google.com",
  "title": "Google",
  "viewport": { "width": 1280, "height": 800 },
  "interactive_tree": [
    { "i": "12", "r": "link", "n": "Gmail", "xy": [900, 20] },
    { "i": "14", "r": "inp", "n": "Search", "v": "SpaceX", "xy": [400, 300] },
    { "i": "15", "r": "btn", "n": "Google Search", "xy": [400, 350] }
  ]
}
```

### Key Legend (for System Prompt)

Include this legend in the system prompt so the LLM understands the minified format:

```
LEGEND for interactive_tree format:
- i: element ID (use this in click(i) or setValue(i, text))
- r: role (btn=button, inp=input, link=link, chk=checkbox, sel=select)
- n: name/label visible to user
- v: current value (for inputs)
- s: state (disabled, checked, expanded)
- xy: [x, y] coordinates on screen
- f: frame ID (0 = main frame, omitted if 0)
```

### Role Mapping

| Full Role | Minified |
|-----------|----------|
| `button` | `btn` |
| `link` | `link` |
| `textbox`, `input`, `textarea`, `searchbox` | `inp` |
| `checkbox` | `chk` |
| `radio` | `radio` |
| `select` | `sel` |
| `menuitem` | `menu` |
| `tab` | `tab` |
| `option` | `opt` |
| `switch` | `switch` |
| `slider` | `slider` |

### Viewport Pruning Algorithm

```typescript
// Skip off-screen elements (viewport pruning)
const rect = element.getBoundingClientRect();

// Skip elements completely below viewport
if (rect.top > window.innerHeight) {
  return null; // Don't include in payload
}

// Skip elements completely above viewport  
if (rect.bottom < 0) {
  return null;
}

// Skip elements with no dimensions
if (rect.width === 0 && rect.height === 0) {
  return null;
}
```

**Result:** On a Twitter feed with 100 elements, only ~40 visible elements are sent.

### AXTree Extraction (Alternative)

Semantic mode also provides an AXTree-based extraction via CDP for 100% reliable element detection:

```typescript
// src/helpers/axTreeExtractor.ts
async function extractAXTree(tabId: number) {
  // 1. Enable Accessibility domain
  await chrome.debugger.sendCommand({ tabId }, 'Accessibility.enable');

  // 2. Get clean tree (Chrome handles Shadow DOM + iframes)
  const { nodes } = await chrome.debugger.sendCommand(
    { tabId }, 
    'Accessibility.getFullAXTree'
  );

  // 3. Filter to interactive elements only
  return nodes.filter(node => 
    INTERACTIVE_ROLES.has(node.role?.value) && 
    node.name?.value
  ).map(node => ({
    i: String(node.backendDOMNodeId),
    r: ROLE_MAP[node.role.value] || node.role.value,
    n: node.name.value.substring(0, 50),
    // ... state, value, coordinates
  }));
}
```

**Benefits:**
- 100% reliable (if Chrome says it's a button, it's a button)
- Bypasses Shadow DOM automatically
- Bypasses iframes automatically
- Zero content script overhead

---

## 2.5 Advanced Features (Production-Grade)

The semantic architecture includes production-grade reliability features that match state-of-the-art agents like Browser Use and OpenHands.

### Advanced Feature Summary

| Feature | Problem Solved | Impact |
|---------|---------------|--------|
| **True Visibility Raycasting** | Elements covered by modals/overlays fail to click | Prevents phantom click failures |
| **Explicit Label Association** | Unnamed inputs (`<input id="882">`) confuse LLM | Inputs get meaningful names |
| **Mutation Stream** | Transient toasts/errors missed between snapshots | LLM sees what happened |
| **Delta Hashing** | Sending unchanged DOM wastes bandwidth/tokens | 50%+ bandwidth savings |
| **Virtual List Detection** | Infinite scroll hides content from extraction | LLM knows to scroll for more |
| **Self-Healing Recovery** | Element IDs become stale after React re-render | Auto-recovers from stale IDs |
| **Bounding Box (Set-of-Mark)** | Multimodal vision needs element positions | Future-proof for GPT-4o vision |

### 2.5.1 True Visibility Raycasting (Modal Killer)

**Problem:** An element with `display: block` might be covered by a popup, cookie banner, or transparent overlay. Clicks are intercepted by the overlay.

**Solution (Browser-Use Inspired):** Use **multi-point visibility sampling** with `document.elementFromPoint()` to determine what percentage of an element is actually visible. This is more reliable than single center-point checking, as it catches partial occlusions from overlays, modals, cookie banners, and sticky headers.

```typescript
/**
 * Multi-Point Visibility Score Calculator
 *
 * Uses 5-point sampling (center + 4 corners) to determine
 * what percentage of an element is actually visible.
 */
function getVisibilityScore(element: HTMLElement): number {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return 0;

  // Sample 5 points: center + 4 corners (with 2px inset)
  const points = [
    { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },  // Center
    { x: rect.left + 2, y: rect.top + 2 },                              // Top-left
    { x: rect.right - 2, y: rect.top + 2 },                             // Top-right
    { x: rect.left + 2, y: rect.bottom - 2 },                           // Bottom-left
    { x: rect.right - 2, y: rect.bottom - 2 },                          // Bottom-right
  ];

  let visiblePoints = 0;
  let sampledPoints = 0;

  for (const p of points) {
    if (p.x < 0 || p.y < 0 || p.x > window.innerWidth || p.y > window.innerHeight) continue;
    sampledPoints++;

    const topElement = document.elementFromPoint(p.x, p.y);
    if (topElement && (element === topElement ||
                       element.contains(topElement) ||
                       topElement.contains(element))) {
      visiblePoints++;
    }
  }

  return sampledPoints > 0 ? visiblePoints / sampledPoints : 0;
}

// Element is clickable if >= 50% visible
function isActuallyClickable(element: HTMLElement): boolean {
  return getVisibilityScore(element) >= 0.5;
}
```

**Node Field:** `occ: true` if element visibility score < 50%

**Improvement over Single-Point:** Multi-point sampling catches:
- Elements partially hidden by sticky headers
- Elements with only corners visible
- Elements behind semi-transparent overlays
- Modals that don't cover center but block interaction

### 2.5.1.1 Hidden Event Listener Detection (Browser-Use Inspired)

**Problem:** Modern SPAs (React, Vue, Angular) attach click handlers via JavaScript that are invisible to standard DOM inspection. CDP's `isClickable` flag and our tagger don't detect:
- React's `onClick` (synthetic events)
- Vue's `@click` directives
- Angular's `(click)` bindings
- jQuery's `.on('click', ...)`
- Native `addEventListener('click', ...)`

**Solution:** Execute a script via CDP `Runtime.evaluate` with `includeCommandLineAPI: true`, which enables the DevTools-only `getEventListeners()` API:

```typescript
// src/helpers/hiddenListenerDetector.ts
const DETECTION_SCRIPT = `
(() => {
  if (typeof getEventListeners !== 'function') return { error: 'not available', elements: [] };

  const elementsWithListeners = [];
  for (const el of document.querySelectorAll('*')) {
    const listeners = getEventListeners(el);
    if (listeners.click || listeners.mousedown || listeners.pointerdown) {
      elementsWithListeners.push({
        llmId: el.getAttribute('data-llm-id'),
        tagName: el.tagName.toLowerCase(),
        listenerTypes: Object.keys(listeners)
      });
    }
  }
  return { elements: elementsWithListeners, total: elementsWithListeners.length };
})()
`;

// Execute with DevTools API enabled
const result = await chrome.debugger.sendCommand({ tabId }, 'Runtime.evaluate', {
  expression: DETECTION_SCRIPT,
  includeCommandLineAPI: true,  // THE KEY: enables getEventListeners()
  returnByValue: true,
});
```

**Usage:** Called from background script before DOM extraction to mark interactive elements that don't have explicit `onclick` attributes or ARIA roles.

**Node Field:** `data-has-click-listener="true"` attribute added to detected elements.

**Files:**
- `src/helpers/hiddenListenerDetector.ts` - Detection and marking logic
- Reference: `docs/browser-use-dom-extraction.md` - Full Browser-Use implementation details

### 2.5.2 Explicit Label Association (Form Fix)

**Problem:** Inputs often have no meaningful attributes. The label "Email Address" is in a separate `<span>`.

**Solution:** Hunt for semantic labels using multiple strategies:

```typescript
function findLabelForInput(input: HTMLElement): string {
  // 1. Check <label for="id">
  // 2. Check aria-label / aria-labelledby
  // 3. Check placeholder
  // 4. Pro Move: Look at previous sibling text
  // 5. Check parent <label> element
  // 6. Check data-label attributes
  return foundLabel || "Unknown Input";
}
```

**Impact:** `{"role": "input", "name": "Email Address"}` instead of `{"role": "input", "name": ""}`

### 2.5.3 Mutation Stream (Ghost State Detection)

**Problem:** Static snapshots miss transient events. Success toast appears for 2s and vanishes.

**Solution:** Maintain a running buffer of DOM changes:

```typescript
// src/pages/Content/mutationLog.ts
const observer = new MutationObserver((mutations) => {
  for (const m of mutations) {
    if (m.addedNodes.length > 0) {
      // Log meaningful text changes
      changes.push(`[${Date.now()}] Added: "${node.innerText}"`);
    }
  }
});

export function getRecentMutations(): string[] {
  return changes.slice(-10); // Last 10 events
}
```

**Payload Field:**
```json
{
  "recent_events": [
    "[2s ago] Added: 'Saved Successfully'",
    "[1s ago] Removed button: 'Submit'"
  ],
  "has_errors": false,
  "has_success": true
}
```

### 2.5.4 Delta Hashing (Bandwidth Optimization)

**Problem:** Sending JSON tree every 2s wastes bandwidth if nothing changed.

**Solution:** Hash-based change detection:

```typescript
// src/helpers/deltaHash.ts
let lastTreeHash = "";

export function shouldSendTree(tree: SemanticTreeResultV3): boolean {
  const currentHash = computeTreeHash(tree);
  
  if (currentHash === lastTreeHash) {
    return false; // No change - skip sending
  }
  
  lastTreeHash = currentHash;
  return true;
}
```

**Impact:** ~50% bandwidth reduction during typing/waiting steps

### 2.5.5 Virtual List Detection (Infinite Scroll Fix)

**Problem:** Virtual lists (Twitter, LinkedIn) only render visible items. Hidden content not in DOM.

**Solution:** Detect scrollable containers and report scroll progress:

```typescript
if (element.scrollHeight > element.clientHeight + 50) {
  node.scr = {
    depth: `${Math.round((element.scrollTop / element.scrollHeight) * 100)}%`,
    h: true  // hasMore content below
  };
}
```

**Node Field:**
```json
{ "i": "feed", "r": "list", "n": "Timeline", "scr": { "depth": "10%", "h": true } }
```

**LLM Instruction:** "If target not found, emit `scroll(id)` to load more content"

### 2.5.6 Self-Healing Element Recovery (Stale ID Fix)

**Problem:** React/Vue can destroy/recreate elements between LLM decision and execution. ID becomes invalid.

**Solution:** "Ghost Match" recovery using role + name + coordinates:

```typescript
// src/helpers/domActions.ts
async function findGhostMatch(config: GhostMatchConfig): Promise<GhostMatchResult | null> {
  // Confidence scoring:
  // - Exact text match: +0.4
  // - Role match: +0.3
  // - Coordinates within 50px: +0.3
  
  // Find element with highest confidence >= threshold
  // Return recovered objectId
}
```

**Workflow:**
1. Backend sends: `click(id="55")`
2. Extension: ID 55 not found!
3. Self-Heal: Search for element with same role/name/coordinates
4. If confidence ≥ 50%: Execute on recovered element
5. Report: "Action executed on recovered element (ID 55 → ID 92)"

**Impact:** Saves 5-10 second error loop round-trip

### 2.5.7 Bounding Box for Set-of-Mark

**Problem:** Pure JSON can't describe "the blue button" or "center card".

**Solution:** Include `[x, y, w, h]` for future multimodal support:

```json
{
  "i": "12",
  "r": "btn",
  "n": "Submit",
  "xy": [400, 350],
  "box": [350, 330, 100, 40]
}
```

**Future Use:** Overlay IDs visually on screenshot for GPT-4o vision

### Complete Advanced Payload

```json
{
  "mode": "semantic",
  "url": "https://amazon.com/checkout",
  "title": "Checkout",
  "scroll_position": "25%",
  "viewport": { "width": 1280, "height": 800 },
  "interactive_tree": [
    { "i": "5", "r": "inp", "n": "Full Name", "v": "John Doe", "xy": [200, 150], "box": [100, 140, 200, 30] },
    { "i": "6", "r": "inp", "n": "Street", "focused": true, "xy": [200, 200] },
    { "i": "99", "r": "btn", "n": "Place Order", "xy": [600, 700], "occ": true }
  ],
  "scrollable_containers": [
    { "id": "cart-items", "depth": "0%", "hasMore": true }
  ],
  "recent_events": [
    "[3s ago] Added: 'Shipping calculated'",
    "[1s ago] Error: 'Invalid ZIP code'"
  ]
}
```

---

## 2.6 Production-Grade Features

These features bring the extension to parity with state-of-the-art agents like Devin, MultiOn, and Browser Use.

### Production Feature Summary

| Feature | Component | Purpose |
|---------|-----------|---------|
| **Self-Healing** | `domActions.ts` | Fixes stale element errors locally (saves 5-10s round-trip) |
| **DOM RAG** | `domRag.ts` | Handles massive pages (5000+ elements) without token overflow |
| **Sentinel Verification** | `sentinelVerification.ts` | Verifies actions actually worked (catches silent failures) |

### 2.6.1 Self-Healing (Ghost Match Recovery)

**Already implemented.** See [Section 2.5.6](#256-self-healing-element-recovery-stale-id-fix).

### 2.6.2 DOM RAG (Retrieval-Augmented Generation)

**Problem:** Amazon search results or Wikipedia articles can have 5,000+ elements. Even optimized JSON hits 30k+ tokens.

**Solution:** Client-side chunking + relevance filtering before sending to LLM.

**Architecture:**

```
┌─────────────────────────────────────────────────────────────┐
│                    DOM RAG PIPELINE                          │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. EXTRACTION: Full tree (5000 nodes)                      │
│     └── extractSemanticTree()                               │
│                                                              │
│  2. CHUNKING: Group by spatial proximity/containers         │
│     └── chunkDomNodes() → 50 chunks                         │
│                                                              │
│  3. SCORING: Keyword relevance against user query           │
│     └── scoreChunkRelevance(chunk, query)                   │
│                                                              │
│  4. FILTERING: Keep top chunks within token budget          │
│     └── filterDomForQuery(nodes, { maxTokens: 2000 })       │
│                                                              │
│  5. RESULT: Filtered tree (50-100 nodes, ~500 tokens)       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Client-Side API:**

```typescript
import { filterDomForQuery, needsFiltering, getDomStats } from './domRag';

// Check if filtering needed
const stats = getDomStats(nodes);
if (stats.needsFiltering) {
  const filtered = filterDomForQuery(nodes, {
    query: "Click Add to Cart for Samsung",
    maxNodes: 50,
    maxTokens: 2000,
    minRelevance: 0.1,
  });
  
  // filtered.tree contains only relevant nodes
  // filtered.tokenReduction shows % savings (often 80-95%)
}
```

**Backend Enhancement (Optional):**
Backend can re-rank chunks using embeddings:
- `text-embedding-3-small` (OpenAI)
- `all-MiniLM-L6-v2` (local)

**Filtered Payload Example:**

```json
{
  "mode": "filtered",
  "reason": "Filtered for 'Samsung Price'",
  "originalCount": 500,
  "filteredCount": 8,
  "tokenReduction": 92,
  "tree": [
    { "i": "45", "r": "item", "n": "Samsung Odyssey G7", "v": "$299" },
    { "i": "46", "r": "btn", "n": "Add to Cart" },
    { "i": "47", "r": "link", "n": "See Details" }
  ]
}
```

### 2.6.3 Sentinel Verification System

**Problem:** LLM clicks "Save" and assumes it worked. But a tiny "Invalid Email" toast appeared for 1 second and vanished. The agent continues happily, failing 5 steps later.

**Solution:** Every action has an **Expected Outcome** verified by the client.

**Workflow:**

```
┌─────────────────────────────────────────────────────────────┐
│                 SENTINEL VERIFICATION FLOW                   │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  1. LLM OUTPUT:                                             │
│     {                                                        │
│       "action": "click(12)",                                │
│       "expected_outcome": {                                  │
│         "type": "navigation",                               │
│         "or_element_appears": "Thank you"                   │
│       }                                                      │
│     }                                                        │
│                                                              │
│  2. EXTENSION:                                              │
│     a. capturePreActionState()  // Snapshot before          │
│     b. Execute click(12)                                    │
│     c. Wait 2 seconds                                       │
│     d. verifyOutcome(expectedOutcome)                       │
│                                                              │
│  3. VERIFICATION:                                           │
│     ├── Did URL change? → SUCCESS                           │
│     ├── OR "Thank you" appeared? → SUCCESS                  │
│     └── Neither + Error visible? → FAILURE                  │
│                                                              │
│  4. FEEDBACK TO LLM:                                        │
│     {                                                        │
│       "verification_passed": false,                         │
│       "verification_message": "URL unchanged. Error: 'Invalid email'",│
│       "errors_detected": ["Invalid email format"]           │
│     }                                                        │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Expected Outcome Types:**

| Type | Checks | Use Case |
|------|--------|----------|
| `navigation` | URL changed | Form submit, link click |
| `element_appears` | Text/element appeared | Success toast, modal opens |
| `element_disappears` | Element removed | Modal closes, loading ends |
| `value_changes` | Input value changed | Type action verified |
| `state_changes` | Checkbox/toggle state | Toggle actions |
| `any_change` | Any DOM mutation | Generic action |
| `no_change` | Just check for errors | Verification-only |

**Client-Side API:**

```typescript
import { 
  capturePreActionState, 
  verifyOutcome, 
  quickVerify 
} from './sentinelVerification';

// Before action
capturePreActionState();

// Execute action
await executeClick(12);

// Verify outcome
const result = await verifyOutcome({
  type: 'navigation',
  orOutcome: {
    type: 'element_appears',
    text: 'Thank you',
  },
  timeout: 2000,
});

if (!result.success) {
  // Send feedback to LLM
  console.log('Action failed:', result.feedback);
  console.log('Errors:', result.errorsDetected);
}
```

**Quick Verification (Defaults):**

```typescript
// For simple actions with sensible defaults
const result = await quickVerify('click', elementId);
const result = await quickVerify('setValue', elementId);
const result = await quickVerify('navigate');
```

**Verification Result:**

```typescript
interface VerificationResult {
  success: boolean;
  verifiedOutcome: 'navigation' | 'element_appears' | ...;
  actualOutcome: string;
  errorsDetected: string[];
  successMessages: string[];
  pageState: {
    url: string;
    urlChanged: boolean;
    domChanged: boolean;
    recentMutations: string[];
  };
  confidence: number;  // 0-1
  feedback: string;    // Human-readable for LLM
}
```

### Production-Grade Stack Summary

| Layer | Feature | Impact |
|-------|---------|--------|
| **Extraction** | AXTree (CDP) | 100% reliable structure |
| **Navigation** | Distributed Iframe | Enterprise apps (Salesforce) |
| **Stability** | Self-Healing | Fixes stale elements locally |
| **Speed** | DOM RAG | Handles massive pages |
| **Accuracy** | Sentinel Checks | Catches silent failures |
| **Vision** | Set-of-Mark | Multimodal ready |

---

## 2.7 Element ID Strategy: `data-llm-id` vs `backendNodeId`

### The Trade-Off

Browser-Use uses Chrome's native `backendNodeId` from CDP, while we use injected `data-llm-id` attributes. Each approach has distinct advantages:

| Aspect | Our Approach (`data-llm-id`) | Browser-Use (`backendNodeId`) |
|--------|------------------------------|-------------------------------|
| **ID Source** | Injected attribute via content script | Chrome's internal node identifier |
| **Stability** | Persists across re-renders if element survives | Immutable - assigned by Chrome at node creation |
| **Risk** | Can be wiped if framework destroys/recreates DOM node | Requires active debugger session |
| **Debugger Banner** | ❌ Not required for basic operation | ⚠️ Shows "Chrome is being controlled by automated software" |
| **Stealthiness** | ✅ Extension operates invisibly | ❌ Visible debugging indicator |
| **Shadow DOM** | Requires `querySelectorAllDeep` to pierce | Chrome handles automatically |
| **Iframe Support** | Requires distributed extraction | Chrome stitches frames together |

### Why We Chose `data-llm-id`

1. **User Experience:** No debugging banner that alarms users or triggers bot detection
2. **Stealth Operation:** Extension can work without visible indicators that automation is active
3. **Compatibility:** Works on sites that detect/block debugger connections
4. **Simplicity:** Content script injection is more straightforward than maintaining CDP sessions

### Mitigations for ID Instability

Since injected IDs can be lost when frameworks completely destroy and recreate DOM nodes, we have multiple layers of protection:

#### 1. MutationObserver Re-Tagging (`tagger.ts`)

```typescript
// Automatically re-tags new elements as they appear
const observer = new MutationObserver((mutations) => {
  if (mutations.some(m => m.addedNodes.length > 0)) {
    ensureStableIds(); // Re-tag any untagged interactive elements
  }
});
observer.observe(document.body, { childList: true, subtree: true });
```

#### 2. Self-Healing Ghost Match (`domActions.ts`)

When an ID becomes stale, we recover using role + name + coordinates:

```typescript
// If element ID not found, attempt ghost match recovery
const ghostMatch = await findGhostMatch({
  name: originalName,
  role: originalRole,
  coordinates: originalXY,
  minConfidence: 0.5,
});
// Confidence scoring: exact text +0.4, role match +0.3, coordinates within 50px +0.3
```

#### 3. Coordinate-Based Fallback

Even if ID is lost, the `xy` coordinates in the semantic payload allow CDP-based clicking:

```typescript
// Fallback: click by coordinates via CDP
await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchMouseEvent', {
  type: 'click',
  x: savedCoordinates[0],
  y: savedCoordinates[1],
});
```

### When to Use CDP `backendNodeId`

For operations that **already require the debugger** (hidden listener detection, AXTree extraction), we do use `backendNodeId`:

```typescript
// axTreeExtractor.ts - uses backendDOMNodeId for reliability
const nodes = await chrome.debugger.sendCommand({ tabId }, 'Accessibility.getFullAXTree');
nodes.forEach(node => {
  // node.backendDOMNodeId is stable within the debugger session
  semanticNodes.push({ i: String(node.backendDOMNodeId), ... });
});
```

### Hybrid Approach (Future Consideration)

A potential enhancement: use `data-llm-id` for normal operation, but opportunistically capture `backendNodeId` when debugger is already attached (e.g., for hidden listener detection) and store the mapping:

```typescript
// Potential future enhancement
interface ElementMapping {
  llmId: string;           // Our injected ID
  backendNodeId?: number;  // CDP ID when available
  lastKnownXY: [number, number];
  role: string;
  name: string;
}
```

This would give us the best of both worlds: stealth operation normally, with CDP-grade stability when the debugger is attached anyway.

---

## 2.8 Midscene-Inspired Optimizations

Midscene uses a "vision-first" approach but its optional DOM extractor has several clever optimizations that we've adopted to further reduce token count and improve reliability.

### 2.8.1 Atomic Leaf Traversal (~30% Tree Depth Reduction)

**Problem:** Standard extraction recurses into everything: `div > button > span > i > text`, creating unnecessary depth in the JSON tree.

**Midscene Solution:** Treat certain elements as "Atomic Leaves." Once you hit a `<button>`, STOP recursion and extract all text content at once.

**Implementation:**

```typescript
// Elements that should not have children extracted
const ATOMIC_ROLES = new Set([
  'button', 'link', 'menuitem', 'tab', 'option', 'treeitem',
  'checkbox', 'radio', 'switch', 'slider', 'spinbutton',
  'textbox', 'searchbox', 'combobox',
]);

// Skip elements inside atomic parents
function isInsideAtomicParent(element: HTMLElement): boolean {
  let parent = element.parentElement;
  while (parent) {
    if (['button', 'a', 'select'].includes(parent.tagName.toLowerCase())) {
      return true;
    }
    if (parent.getAttribute('role') && ATOMIC_ROLES.has(parent.getAttribute('role'))) {
      return true;
    }
    parent = parent.parentElement;
  }
  return false;
}

// For atomic elements, get ALL nested text at once
function getAtomicElementText(element: HTMLElement): string {
  return (element.innerText || element.textContent || '').trim();
}
```

**Impact:** Reduces tree depth and token count by ~30% on complex UIs like Gmail, Slack, or Salesforce.

### 2.8.2 The 2/3 Visibility Rule (Precision Pruning)

**Problem:** Simple viewport bounds checking includes elements that are only 1px visible. Clicking the very edge of a partially visible button often fails.

**Midscene Solution:** Discard elements unless **at least 2/3 of their area** is visible in the viewport.

**Implementation:**

```typescript
function isReliablyVisible(element: HTMLElement, minVisibleRatio = 0.66): boolean {
  const rect = element.getBoundingClientRect();
  const viewportHeight = window.innerHeight;
  const viewportWidth = window.innerWidth;

  // Calculate intersection with viewport
  const visibleHeight = Math.min(rect.bottom, viewportHeight) - Math.max(rect.top, 0);
  const visibleWidth = Math.min(rect.right, viewportWidth) - Math.max(rect.left, 0);

  if (visibleHeight <= 0 || visibleWidth <= 0) return false;

  const visibleArea = visibleHeight * visibleWidth;
  const totalArea = rect.width * rect.height;

  // Must be >= 66% visible
  return (visibleArea / totalArea) >= minVisibleRatio;
}
```

**Impact:** Prevents the LLM from trying to interact with half-hidden elements that require scrolling first.

### 2.8.3 Container Classification (Tree Flattening)

**Problem:** Generic `<div>` wrappers without visual styling don't add semantic value but bloat the tree.

**Midscene Solution:** Only keep container elements if they have a visual boundary (background color, border, box shadow).

**Implementation:**

```typescript
function isMeaningfulContainer(element: HTMLElement): boolean {
  const style = window.getComputedStyle(element);

  // Has background color (not transparent)
  if (style.backgroundColor !== 'rgba(0, 0, 0, 0)') return true;

  // Has border
  if (parseFloat(style.borderWidth) > 0) return true;

  // Has box shadow
  if (style.boxShadow !== 'none') return true;

  // Is a semantic landmark
  const role = element.getAttribute('role');
  if (['main', 'navigation', 'form', 'region'].includes(role)) return true;

  return false;
}
```

**Impact:** Flattens the tree by removing invisible wrapper divs that confuse the LLM.

### 2.8.4 Extraction Options

New options available in `extractSemanticTreeV3()`:

| Option | Default | Description |
|--------|---------|-------------|
| `atomicLeafOptimization` | `true` | Skip elements inside atomic parents |
| `minVisibleRatio` | `0.66` | Minimum visible area ratio (2/3 rule) |
| `pruneEmptyContainers` | `true` | Strip generic containers without visual boundaries |

### 2.8.5 Combined Impact

| Optimization | Token Reduction | Reliability Improvement |
|--------------|-----------------|-------------------------|
| Atomic Leaf Traversal | ~30% | Cleaner, flatter tree |
| 2/3 Visibility Rule | ~10-15% | No partial-element failures |
| Container Pruning | ~15-20% | Less noise for LLM |
| **Combined** | **~50-60%** | **Significantly more reliable** |

### 2.8.6 Comparison with Midscene

| Aspect | Midscene | Spadeworks V4 |
|--------|----------|---------------|
| **DOM Extraction** | Optional (vision-first) | Primary mode |
| **Atomic Stopping** | ✅ BUTTON/INPUT = Leaf | ✅ Adopted |
| **Visibility Threshold** | 2/3 (66%) | ✅ Adopted (configurable) |
| **Container Pruning** | Background/border check | ✅ Adopted + landmarks |
| **Element IDs** | Hash based on rect+content | Injected `data-llm-id` |
| **Vision Integration** | Primary | Hybrid mode only |

**Key Difference:** Midscene uses vision (VLM) as the primary method for element location, with DOM as optional context. We use DOM extraction as primary with vision as enhancement for spatial queries.

---

## 3. Extraction Pipeline

This section is now integrated into the main extraction pipeline documentation below.

---

## 4. The Tag & Freeze Strategy

### Step-by-Step Flow

When a task runs, the following sequence occurs on each action cycle:

```
1. TAGGER (runs on page load)
   └── Injects data-llm-id="1", "2", "3"... into interactive elements
   └── MutationObserver watches for new elements

2. DOM STABILITY WAIT (before extraction)
   └── Wait up to 3 seconds for DOM mutations to settle
   └── Wait for network activity to complete
   └── Minimum 300ms of "quiet" before proceeding

3. MODE SELECTION
   └── Analyze user query for visual keywords
   └── Check page complexity (element count)
   └── Select: semantic | skeleton | hybrid | full

4. EXTRACTION (based on mode)
   └── SEMANTIC: Extract JSON array of tagged elements
   └── SKELETON: Extract minimal HTML of interactive elements
   └── HYBRID: Screenshot + skeleton
   └── FULL: Complete templatized HTML

5. PAYLOAD CONSTRUCTION
   └── Build request body with selected mode
   └── Always include fallback fields
   └── Send to POST /api/agent/interact

6. LLM DECISION
   └── Backend processes payload
   └── Returns: { thought, action: "click(7)" }

7. ACTION EXECUTION
   └── Find element by [data-llm-id="7"]
   └── Execute click/setValue/etc.
   └── Loop back to step 2
```

### Code Location

The main extraction logic lives in `src/state/currentTask.ts` within the `runTaskLoop()` function, specifically around the "transforming-dom" action status phase.

---

## 5. The Tag & Freeze Strategy

### Problem: ID Drift

Traditional DOM extraction calculates IDs during extraction:

```javascript
// OLD APPROACH (problematic)
elements.forEach((el, index) => {
  el.setAttribute('data-id', index);  // ID assigned during extraction
});
```

By the time the LLM returns an action (2-5 seconds later), React/Vue may have re-rendered the page, and the element at index 6 might now be index 8 or gone entirely.

### Solution: Persistent Tagging

We inject stable IDs **early and permanently**:

```javascript
// NEW APPROACH (stable)
// tagger.ts runs when page loads
el.setAttribute('data-llm-id', uniqueIdCounter++);  // ID stamped permanently
```

### How the Tagger Works

**File:** `src/pages/Content/tagger.ts`

```typescript
// 1. Selectors for interactive elements
const INTERACTIVE_SELECTORS = [
  'a[href]', 'button', 'input', 'textarea', 'select',
  '[role="button"]', '[role="link"]', '[role="menuitem"]',
  '[onclick]', '[tabindex]:not([tabindex="-1"])',
  '[contenteditable="true"]'
].join(', ');

// 2. Tag function
function tagElement(el: Element): boolean {
  if (el.hasAttribute(LLM_ID_ATTR)) return false;  // Already tagged
  if (!isVisibleAndInteractive(el)) return false;   // Skip hidden
  
  el.setAttribute('data-llm-id', String(uniqueIdCounter++));
  return true;
}

// 3. Auto-tagger with MutationObserver
const observer = new MutationObserver((mutations) => {
  // Debounce and re-tag when DOM changes
  debounceTimer = setTimeout(() => {
    if (mutations.some(m => m.addedNodes.length > 0)) {
      ensureStableIds();
    }
  }, 100);
});

observer.observe(document.body, { childList: true, subtree: true });
```

### Result in the DOM

```html
<!-- Before tagging -->
<button class="btn-primary">Submit</button>
<input type="text" placeholder="Search">

<!-- After tagging -->
<button class="btn-primary" data-llm-id="1">Submit</button>
<input type="text" placeholder="Search" data-llm-id="2">
```

These IDs persist even if the page re-renders, because the tagger only adds IDs to elements that don't already have them.

---

## 6. Shadow DOM Support

### The Problem

Enterprise applications (Salesforce LWC, Google products, Shopify) use Shadow DOM to encapsulate components. Standard `document.querySelectorAll()` **cannot see inside Shadow Roots**.

```html
<!-- Standard query CANNOT see inside #shadow-root -->
<my-component>
  #shadow-root (open)
    <button>Save</button>  <!-- INVISIBLE to querySelectorAll -->
</my-component>
```

### The Solution: `query-selector-shadow-dom`

The extension uses the `query-selector-shadow-dom` library to pierce Shadow DOM boundaries:

```typescript
// V1 (broken for Shadow DOM)
const elements = document.querySelectorAll('button');  // Misses shadow buttons

// V2 (pierces Shadow DOM)
import { querySelectorAllDeep } from 'query-selector-shadow-dom';
const elements = querySelectorAllDeep('button');  // Finds ALL buttons
```

### How It Works in the Tagger

```typescript
// src/pages/Content/tagger.ts
import { querySelectorAllDeep } from 'query-selector-shadow-dom';

export function ensureStableIds(): number {
  // V2: Use deep query to find elements inside Shadow DOMs
  const candidates = querySelectorAllDeep(INTERACTIVE_SELECTORS, document.body);
  
  candidates.forEach(el => {
    if (!el.hasAttribute(LLM_ID_ATTR)) {
      el.setAttribute(LLM_ID_ATTR, String(uniqueIdCounter++));
      
      // V2: Track if inside Shadow DOM
      if (isInShadowDom(el)) {
        el.setAttribute('data-llm-in-shadow', 'true');
      }
    }
  });
}

function isInShadowDom(el: Element): boolean {
  let parent = el.parentNode;
  while (parent) {
    if (parent instanceof ShadowRoot) return true;
    parent = parent.parentNode;
  }
  return false;
}
```

### Resulting Node Structure

```json
{
  "id": "42",
  "role": "button",
  "name": "Save",
  "isInShadow": true  // Indicates element is inside Shadow DOM
}
```

---

## 7. Iframe Support - Distributed Extraction

### The Problem

Content scripts cannot access cross-origin iframe content from the parent page. Each iframe is an isolated context.

```
┌─────────────────────────────────────┐
│  Main Page (example.com)            │
│                                     │
│  ┌───────────────────────────────┐  │
│  │  Iframe (analytics.com)       │  │  ← Cannot access from parent!
│  │  ┌─────────────────────────┐  │  │
│  │  │ <button>Track</button>  │  │  │
│  │  └─────────────────────────┘  │  │
│  └───────────────────────────────┘  │
└─────────────────────────────────────┘
```

### The Solution: Distributed Extraction

**Step 1: Manifest Configuration**

```json
{
  "content_scripts": [{
    "matches": ["<all_urls>"],
    "js": ["contentScript.bundle.js"],
    "all_frames": true  // ← Content script runs in EVERY frame
  }]
}
```

**Step 2: Background Aggregation**

Each frame runs its own tagger and extractor. The background script aggregates results:

```typescript
// src/helpers/domAggregator.ts
async function extractFromAllFrames(tabId: number): Promise<AggregatedDomResult> {
  // Execute extraction in ALL frames
  const results = await chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    func: extractLocalFrame,  // Runs inside each frame
  });
  
  // Stitch results together
  return {
    nodes: [
      ...mainFrameNodes,           // frameId = 0
      ...iframe1Nodes,             // frameId = 1
      ...iframe2Nodes,             // frameId = 2
    ],
    frameCount: results.length,
  };
}
```

**Step 3: Frame ID Tracking**

Each element gets a `frameId` attribute:

```json
[
  { "id": "1", "role": "button", "name": "Save", "frameId": 0 },
  { "id": "f1_5", "role": "button", "name": "Track", "frameId": 1 }
]
```

### Global ID Generation

To avoid ID collisions across frames, IDs are prefixed:

| Frame | Original ID | Global ID |
|-------|-------------|-----------|
| Main (0) | `5` | `5` |
| Iframe 1 | `5` | `f1_5` |
| Iframe 2 | `5` | `f2_5` |

### Limitations

| Scenario | Supported? |
|----------|------------|
| Same-origin iframes | ✅ Yes |
| Cross-origin iframes | ✅ Yes (with `all_frames: true`) |
| Sandboxed iframes | ⚠️ Partial (depends on sandbox flags) |
| Deeply nested iframes | ✅ Yes (recursive) |

---

## 8. Extraction Modes

The extension supports four extraction modes:

| Mode | Primary Data | Token Cost | Use Case |
|------|--------------|------------|----------|
| **`semantic`** | **Minified JSON + viewport pruning** | **~25-75 tokens** | **PRIMARY - Default** |
| `skeleton` | Minimal HTML | ~500-1500 tokens | Semantic fails |
| `hybrid` | Screenshot + skeleton | ~2000-3000 tokens | Visual/spatial queries |
| `full` | Complete HTML | ~10000-50000 tokens | **ONLY on explicit backend request** |

### Mode Comparison

```
SEMANTIC MODE (~25-75 tokens) ← PRIMARY
───────────────────────────────────────
[
  { "i": "1", "r": "btn", "n": "Submit", "xy": [600, 400] },
  { "i": "2", "r": "inp", "n": "Search", "xy": [400, 300] }
]

SKELETON MODE (~500 tokens)
──────────────────────────
<button id="1">Submit</button>
<input id="2" type="text" placeholder="Type here..." role="searchbox" />

FULL MODE (~10000+ tokens) ← ONLY ON BACKEND REQUEST
────────────────────────────────────────────────────
<html><head>...</head><body>
  <div class="container mx-auto p-4">
    <div class="flex items-center justify-between">
      <div class="search-wrapper relative">
        <input data-id="2" data-interactive="true" data-visible="true" 
               type="text" placeholder="Type here..." class="input-primary
               w-full px-4 py-2 rounded-lg border border-gray-300" />
      </div>
      <button data-id="1" data-interactive="true" data-visible="true"
              class="btn btn-primary px-6 py-2 bg-blue-500 text-white
              rounded-lg hover:bg-blue-600">Submit</button>
    </div>
  </div>
</body></html>
```

---

## 9. Semantic JSON Protocol

**File:** `src/pages/Content/semanticTree.ts`

The semantic extractor builds a clean JSON array from tagged elements.

### SemanticNode Structure

```typescript
interface SemanticNode {
  id: string;           // Stable data-llm-id
  role: string;         // Semantic role: 'button', 'link', 'input', etc.
  name: string;         // Human-readable label
  value?: string;       // Current value for inputs
  state?: string;       // 'checked', 'disabled', 'selected', etc.
  type?: string;        // Input type
  placeholder?: string;
  href?: string;        // For links
}
```

### How Names Are Determined

The `name` field uses this priority order:

```typescript
function getElementName(el: HTMLElement): string {
  // 1. Explicit aria-label
  if (el.getAttribute('aria-label')) return ariaLabel;
  
  // 2. aria-labelledby reference
  if (el.getAttribute('aria-labelledby')) { /* ... */ }
  
  // 3. Associated <label for="...">
  if (el.id) { /* ... */ }
  
  // 4. Inner text content (truncated to 100 chars)
  if (el.innerText) return cleanText(el.innerText);
  
  // 5. Placeholder
  if (el.getAttribute('placeholder')) return placeholder;
  
  // 6. Title attribute
  if (el.getAttribute('title')) return title;
  
  // 7. Name attribute
  if (el.getAttribute('name')) return name;
  
  // 8. Alt text (for images)
  if (el.getAttribute('alt')) return alt;
  
  // 9. Fallback to tag name
  return el.tagName.toLowerCase();
}
```

### How Roles Are Determined

```typescript
function getElementRole(el: HTMLElement): string {
  // 1. Explicit ARIA role takes priority
  if (el.getAttribute('role')) return ariaRole;
  
  // 2. Special handling for inputs
  if (el.tagName === 'INPUT') {
    const type = el.type || 'text';
    // text → textbox, checkbox → checkbox, etc.
    return INPUT_TYPE_ROLE_MAP[type];
  }
  
  // 3. Map from tag name
  // a → link, button → button, textarea → textbox
  return TAG_ROLE_MAP[el.tagName.toLowerCase()];
}
```

### Extraction Example

Given this HTML:

```html
<form>
  <input data-llm-id="5" type="email" placeholder="Enter email" value="john@example.com">
  <input data-llm-id="6" type="checkbox" aria-label="Subscribe to newsletter" checked>
  <button data-llm-id="7" type="submit">Sign Up</button>
</form>
```

Produces this JSON:

```json
[
  {
    "id": "5",
    "role": "textbox",
    "name": "Enter email",
    "value": "john@example.com",
    "type": "email",
    "placeholder": "Enter email"
  },
  {
    "id": "6",
    "role": "checkbox",
    "name": "Subscribe to newsletter",
    "state": "checked"
  },
  {
    "id": "7",
    "role": "button",
    "name": "Sign Up"
  }
]
```

---

## 10. Skeleton DOM Extraction

**File:** `src/helpers/skeletonDom.ts`

The skeleton extractor creates minimal HTML containing only interactive elements.

### What Gets Kept

```typescript
// Interactive tags
const INTERACTIVE_TAGS = ['a', 'button', 'input', 'select', 'textarea', 'option'];

// Interactive roles
const INTERACTIVE_ROLES = [
  'button', 'link', 'menuitem', 'tab', 'checkbox', 'radio',
  'switch', 'option', 'combobox', 'listbox', 'textbox'
];

// Attributes to keep
const KEEP_ATTRS = [
  'name', 'type', 'href', 'value', 'placeholder', 'role',
  'aria-label', 'title', 'data-testid', 'data-id',
  'disabled', 'readonly', 'checked', 'selected'
];
```

### What Gets Discarded

```typescript
const DISCARD_TAGS = [
  'style', 'script', 'noscript', 'svg', 'path', 'link',
  'meta', 'head', 'title', 'template', 'slot', 'iframe'
];
```

### Skeleton Output Example

```html
<a id="1" href="/home">Home</a>
<button id="2" type="submit">Search</button>
<input id="3" name="q" type="text" placeholder="Search..." />
<select id="4" name="category">
  <option value="all">All Categories</option>
  <option value="books" selected>Books</option>
</select>
```

---

## 11. Full DOM Extraction

**File:** `src/pages/Content/getAnnotatedDOM.ts`

The full DOM extraction provides complete HTML with annotations.

### Process

1. **Clone the DOM** - Create a deep clone of `document.documentElement`
2. **Traverse and Annotate** - Walk every element and add:
   - `data-id="N"` - Sequential index
   - `data-interactive="true/false"` - Is element interactive?
   - `data-visible="true/false"` - Is element visible?
   - `data-frame-id="..."` - Frame identifier for iframes
3. **Strip Heavy Elements** - Remove scripts, styles, SVGs, comments
4. **Templatize** - Compress repeated patterns
5. **Serialize** - Return `outerHTML`

### Annotations Added

```html
<!-- Before annotation -->
<button class="btn">Click</button>

<!-- After annotation -->
<button class="btn" 
        data-id="42" 
        data-interactive="true" 
        data-visible="true"
        data-frame-id="main-frame">Click</button>
```

### Heavy Element Removal

Before serialization, these are removed to reduce size:

```typescript
const HEAVY_ELEMENT_SELECTORS = [
  'script',                    // JavaScript code
  'style',                     // CSS rules
  'svg',                       // Vector graphics (often huge)
  'noscript',                  // Fallback content
  'template',                  // Unused templates
  'link[rel="stylesheet"]',    // External CSS refs
  'meta',                      // Page metadata
];
```

This can reduce payload by 80-90%.

### Templatization

**File:** `src/helpers/shrinkHTML/templatize.ts`

Repeated HTML patterns are compressed:

```html
<!-- Before -->
<div class="item"><span class="price">$10</span></div>
<div class="item"><span class="price">$20</span></div>
<div class="item"><span class="price">$30</span></div>

<!-- After (conceptual) -->
<template id="t1"><div class="item"><span class="price">{{v}}</span></div></template>
<t1 v="$10"/><t1 v="$20"/><t1 v="$30"/>
```

---

## 12. DOM Stability Waiting

**File:** `src/pages/Content/domWait.ts`

Before extracting, we wait for the DOM to stabilize. This prevents capturing "skeleton" pages that are still loading.

### Why This Matters

Modern sites load progressively:

```
t=0ms    Page request sent
t=200ms  Initial HTML received (skeleton)
t=500ms  React hydration begins
t=800ms  First components render
t=1200ms API calls return data
t=1500ms Full content rendered
```

Extracting at t=200ms would give us an empty page!

### Stability Detection

```typescript
function waitForDomStability(config = {}): Promise<void> {
  const {
    timeout = 3000,           // Max wait
    stabilityThreshold = 300, // Time without mutations
    waitForNetwork = true,
    networkIdleThreshold = 500
  } = config;
  
  let lastMutationTime = Date.now();
  
  // MutationObserver tracks DOM changes
  const observer = new MutationObserver(() => {
    lastMutationTime = Date.now();
  });
  
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    characterData: true
  });
  
  // Check periodically
  const checkInterval = setInterval(() => {
    const timeSinceMutation = Date.now() - lastMutationTime;
    
    // DOM stable if no mutations for 300ms
    if (timeSinceMutation >= stabilityThreshold) {
      cleanup();
      resolve();
    }
  }, 50);
}
```

### Network Idle Detection

```typescript
// Also wait for network to be idle
if (waitForNetwork) {
  const entries = performance.getEntriesByType('resource');
  const recentRequests = entries.filter(entry => {
    return (Date.now() - entry.responseEnd) < networkIdleThreshold;
  });
  
  const networkIdle = recentRequests.length === 0;
}
```

---

## 13. What Gets Sent to the LLM

### API Request Structure

**Endpoint:** `POST /api/agent/interact`

```typescript
interface AgentInteractRequest {
  // === REQUIRED FIELDS ===
  url: string;                    // Current page URL
  query: string;                  // User's task instruction
  dom: string;                    // HTML (minimal fallback, ~10KB max)
  
  // === SESSION TRACKING ===
  taskId?: string;                // Task identifier (after first request)
  sessionId?: string;             // Session identifier
  
  // === ACTION RESULT (after first action) ===
  lastActionStatus?: 'success' | 'failure' | 'pending';
  lastActionError?: {
    message: string;
    code: string;
    action: string;
    elementId?: number;
  };
  lastActionResult?: {
    success: boolean;
    actualState?: string;
  };
  
  // === DOM CHANGE INFO ===
  domChanges?: {
    addedCount: number;
    removedCount: number;
    dropdownDetected: boolean;
    dropdownOptions?: string[];
    stabilizationTime: number;
    previousUrl?: string;
    urlChanged?: boolean;
    didNetworkOccur?: boolean;
  };
  
  // === CLIENT OBSERVATIONS ===
  clientObservations?: {
    didNetworkOccur?: boolean;
    didDomMutate?: boolean;
    didUrlChange?: boolean;
  };
  
  // === DOM MODE ===
  domMode?: 'semantic' | 'skeleton' | 'hybrid' | 'full';

  // SEMANTIC MODE (PRIMARY - recommended)
  interactiveTree?: SemanticNode[];  // Minified JSON array
  viewport?: { width: number; height: number };
  pageTitle?: string;
  
  // SKELETON/HYBRID MODE
  skeletonDom?: string;            // Minimal HTML
  screenshot?: string | null;       // Base64 JPEG (hybrid only)
  screenshotHash?: string;
}
```

### Example: Semantic Mode Request (PRIMARY)

```json
{
  "url": "https://www.google.com",
  "query": "Search for SpaceX",
  "dom": "<html>...</html>",
  "domMode": "semantic",
  "viewport": { "width": 1280, "height": 800 },
  "interactiveTree": [
    { "i": "1", "r": "inp", "n": "Search", "v": "", "xy": [400, 300] },
    { "i": "2", "r": "btn", "n": "Google Search", "xy": [400, 350] },
    { "i": "3", "r": "btn", "n": "I'm Feeling Lucky", "xy": [550, 350] },
    { "i": "4", "r": "link", "n": "Gmail", "xy": [900, 20] },
    { "i": "5", "r": "link", "n": "Images", "xy": [950, 20] }
  ],
  "pageTitle": "Google"
}
```

**Token count:** ~50-75 tokens (vs 10k+ for full DOM)

### Example: Skeleton Mode Request

```json
{
  "url": "https://www.google.com",
  "query": "Search for SpaceX",
  "dom": "<html>...</html>",
  "domMode": "skeleton",
  "skeletonDom": "<input id=\"1\" name=\"q\" type=\"text\" />\n<button id=\"2\">Google Search</button>\n<button id=\"3\">I'm Feeling Lucky</button>\n<a id=\"4\" href=\"/gmail\">Gmail</a>"
}
```

### Example: Hybrid Mode Request

```json
{
  "url": "https://example.com/dashboard",
  "query": "Click the gear icon in the top right corner",
  "dom": "<html>...</html>",
  "domMode": "hybrid",
  "skeletonDom": "<button id=\"1\" aria-label=\"Settings\">⚙️</button>...",
  "screenshot": "/9j/4AAQSkZJRgABAQEASABIAAD...",
  "screenshotHash": "1010101010101010..."
}
```

---

## 14. Mode Selection Logic (Backend-Driven Negotiation)

**File:** `src/state/currentTask.ts` and `src/api/client.ts`

**Key Principle:** The extension **always sends semantic first** and the **backend decides** if it needs additional artifacts (skeleton, screenshot, or full DOM).

### Default Mode (Client)

The extension ALWAYS starts with:
- `domMode: "semantic"`
- `interactiveTree`, `viewport`, `pageTitle` (+ V3 advanced fields)
- No `dom`, no `skeletonDom`, no `screenshot`

### Backend Requests (Negotiation)

If the backend cannot plan/verify using semantic JSON alone, it responds requesting additional artifacts:

**Signals (supported):**
- `requestedDomMode: "skeleton" | "hybrid" | "full"`
- `needsSkeletonDom: true`
- `needsScreenshot: true`
- legacy: `status: "needs_full_dom"`

### Negotiation Flow

```
1) Client sends semantic only
2) Backend responds:
   - normal action → proceed
   - OR requests additional context → client retries with only what was requested
3) Backend receives retry payload and returns final action
```

### Why Backend-Driven?

- Keeps client simple (no keyword heuristics)
- Avoids sending heavy payloads "just in case"
- Guarantees the backend controls what it needs for verification

### Actual Implementation (currentTask.ts)

```typescript
// Semantic extraction is PRIMARY
if (USE_SEMANTIC_EXTRACTION) {
  // 1. Try semantic extraction (ultra-light, ~25-75 tokens)
  const semanticResult = await callRPC('getSemanticDomV3', ...);
  if (semanticResult?.interactive_tree?.length > 0) {
    domMode = 'semantic'; // API field name for backend compatibility
    interactiveTree = semanticResult.interactive_tree;
  } else {
    // 2. Fallback to skeleton/hybrid based on query keywords
    domMode = selectDomMode(query, context);
  }
}

// 3. Backend requests more → retry with requested artifacts
if (response.status === 'needs_context' || response.status === 'needs_full_dom') {
  // Send skeleton/hybrid/full as backend requested
}
```

### Visual/Spatial Keywords (Fallback Mode Selection)

These keywords trigger hybrid mode when semantic extraction fails:

```typescript
const VISUAL_KEYWORDS = [
  // Visual elements
  'icon', 'image', 'logo', 'picture', 'photo', 'avatar',
  
  // Appearance
  'looks like', 'appears', 'color', 'shape', 'blue', 'red', 'green',
  
  // Spatial references
  'top', 'bottom', 'left', 'right', 'corner', 'side', 'edge',
  'next to', 'above', 'below', 'beside', 'near', 'between',
  'first', 'second', 'third', 'last', 'middle',
  
  // Visual queries
  'what is', 'what does', 'how much', 'price', 'see', 'show',
  'chart', 'graph', 'table', 'grid', 'card', 'thumbnail',
];
```

### Simple Action Keywords

These keywords prefer skeleton mode:

```typescript
const SIMPLE_ACTIONS = [
  'click', 'type', 'fill', 'select', 'enter', 'press', 'submit',
  'check', 'uncheck', 'toggle', 'expand', 'collapse', 'open', 'close',
  'scroll', 'navigate', 'go to', 'search', 'find',
];
```

---

## 15. Fallback Handling

### Server Requests Full DOM

If the backend can't process the semantic/skeleton data:

```json
{
  "status": "needs_full_dom",
  "needsFullDomReason": "Element not found in skeleton",
  "requestedElement": "submit button with text 'Confirm'"
}
```

The extension automatically retries with `domMode: "full"`:

```typescript
if (response.status === 'needs_full_dom') {
  console.log('[CurrentTask] Server requested full DOM, retrying...');
  
  response = await apiClient.agentInteract(
    currentUrl,
    safeInstructions,
    currentDom,
    // ... other params
    {
      domMode: 'full',  // Override to full mode
      // Still send skeleton as backup
      skeletonDom,
      screenshot: screenshotBase64,
    }
  );
}
```

### Semantic Extraction Fails

If semantic extraction returns empty or throws:

```typescript
try {
  const semanticResult = await callRPC('getSemanticDom', ...);
  
  if (semanticResult?.nodes?.length > 0) {
    domMode = 'semantic';
  } else {
    console.warn('Semantic extraction empty, falling back to skeleton');
    domMode = selectDomMode(query, context);  // Skeleton or hybrid
  }
} catch (error) {
  console.warn('Semantic extraction failed:', error);
  domMode = selectDomMode(query, context);  // Fallback
}
```

---

## 16. Source Files Reference

### Core Extraction Files

| File | Purpose | Features |
|------|---------|----------|
| `src/pages/Content/tagger.ts` | Injects stable `data-llm-id` attributes | Uses `querySelectorAllDeep`, tracks Shadow DOM |
| `src/pages/Content/semanticTree.ts` | Extracts JSON representation | Multi-point raycasting, label hunting, scrollable detection, atomic leaves, 2/3 visibility |
| `src/pages/Content/domWait.ts` | Waits for DOM stability | - |
| `src/pages/Content/getAnnotatedDOM.ts` | Full DOM extraction with annotations | - |
| `src/pages/Content/mutationLog.ts` | Tracks DOM changes for ghost state detection | - |
| `src/helpers/skeletonDom.ts` | Skeleton HTML extraction | - |
| `src/helpers/shrinkHTML/templatize.ts` | HTML compression | - |
| `src/helpers/hybridCapture.ts` | Mode selection logic | - |
| `src/helpers/domAggregator.ts` | Aggregates DOM from all frames | - |
| `src/helpers/axTreeExtractor.ts` | CDP-based accessibility tree extraction | - |
| `src/helpers/deltaHash.ts` | Hash-based change detection for bandwidth optimization | - |
| `src/helpers/domRag.ts` | DOM chunking and relevance filtering for huge pages | Production-Grade |
| `src/helpers/sentinelVerification.ts` | Action outcome verification system | Production-Grade |
| `src/helpers/hiddenListenerDetector.ts` | Detects React/Vue/Angular click handlers via CDP | Browser-Use Inspired |

### Integration Files

| File | Purpose |
|------|---------|
| `src/helpers/pageRPC.ts` | RPC methods exposed to background (includes mutation log methods) |
| `src/state/currentTask.ts` | Main action loop orchestration |
| `src/api/client.ts` | API client with payload construction |
| `src/pages/Content/index.ts` | Content script entry (starts tagger + mutation logger) |
| `src/helpers/domActions.ts` | Action execution with self-healing recovery |

### Key Functions

| Function | File | Purpose |
|----------|------|---------|
| `extractSemanticTree()` | semanticTree.ts | Ultra-light extraction with raycasting, labels, scrollable |
| `getVisibilityScore()` | semanticTree.ts | Multi-point visibility scoring (0.0-1.0) for occlusion detection |
| `isActuallyClickable()` | semanticTree.ts | Multi-point raycasting to detect occluded elements (≥50% visible) |
| `detectHiddenClickListeners()` | hiddenListenerDetector.ts | CDP-based detection of React/Vue/Angular click handlers |
| `detectAndMarkHiddenListeners()` | hiddenListenerDetector.ts | Full pipeline: detect + mark elements in DOM |
| `isInsideAtomicParent()` | semanticTree.ts | Midscene: Check if element is inside button/link (skip extraction) |
| `isReliablyVisible()` | semanticTree.ts | Midscene: 2/3 visibility rule (≥66% in viewport) |
| `isMeaningfulContainer()` | semanticTree.ts | Midscene: Check if container has visual boundaries |
| `getAtomicElementText()` | semanticTree.ts | Midscene: Get combined text from atomic elements |
| `findLabelForInput()` | semanticTree.ts | Hunts for semantic labels |
| `getScrollableInfo()` | semanticTree.ts | Detects virtual list containers |
| `getRecentMutations()` | mutationLog.ts | Returns recent DOM changes |
| `getMutationSummary()` | mutationLog.ts | Summary with error/success flags |
| `shouldSendTree()` | deltaHash.ts | Hash-based change detection |
| `findGhostMatch()` | domActions.ts | Self-healing element recovery |
| `getSemanticDom()` | pageRPC.ts | RPC wrapper for semantic extraction |
| `extractAXTree()` | axTreeExtractor.ts | CDP-based accessibility tree |
| `getSemanticLegend()` | semanticTree.ts | Returns legend for system prompt |
| `ensureStableIds()` | tagger.ts | Tags all interactive elements (pierces Shadow DOM) |
| `startAutoTagger()` | tagger.ts | Starts MutationObserver |
| `startMutationLogger()` | mutationLog.ts | Starts mutation tracking |
| `findElementByIdDeep()` | tagger.ts | Finds element by ID, piercing Shadow DOM |
| `isInShadowDom()` | tagger.ts | Checks if element is in Shadow Root |
| `waitForDomStability()` | domWait.ts | Waits for mutations to stop |
| `extractSkeletonDom()` | skeletonDom.ts | Returns minimal HTML |
| `getAnnotatedDOM()` | getAnnotatedDOM.ts | Returns full annotated HTML |
| `selectDomMode()` | hybridCapture.ts | Chooses extraction mode |
| `agentInteract()` | client.ts | Sends payload to backend |
| `extractFromAllFrames()` | domAggregator.ts | Aggregates extraction from all frames |

### Types

```typescript
// Minified semantic node
interface SemanticNode {
  i: string;                           // Element ID
  r: string;                           // Role (minified)
  n: string;                           // Name
  v?: string;                          // Value
  s?: string;                          // State
  xy?: [number, number];               // Center coordinates
  f?: number;                          // Frame ID
  // Advanced fields:
  box?: [number, number, number, number]; // Bounding box [x,y,w,h]
  scr?: { depth: string; h: boolean };    // Scrollable info
  occ?: boolean;                          // Occluded by overlay
}

// Semantic extraction result
interface SemanticTreeResult {
  mode: 'semantic';
  url: string;
  title: string;
  viewport: { width: number; height: number };
  scroll_position?: string;           // Page scroll depth
  interactive_tree: SemanticNode[];
  scrollable_containers?: Array<{     // Virtual lists
    id: string;
    depth: string;
    hasMore: boolean;
  }>;
  meta: {
    totalElements: number;
    viewportElements: number;
    prunedElements: number;
    occludedElements: number;         // Elements behind modals
    extractionTimeMs: number;
    estimatedTokens: number;
  };
}

// Self-healing ghost match config
interface GhostMatchConfig {
  name: string | null;
  role: string | null;
  coordinates: [number, number] | null;
  interactive: boolean;
  minConfidence: number;
}

// Mutation entry
interface MutationEntry {
  timestamp: number;
  type: 'added' | 'removed' | 'changed';
  category: 'text' | 'element' | 'error' | 'success' | 'warning' | 'loading' | 'form';
  description: string;
}
```

### Libraries

| Library | Version | Purpose |
|---------|---------|---------|
| `query-selector-shadow-dom` | ^1.0.1 | Pierces Shadow DOM for element queries |

---

## Appendix: Token Cost Comparison

| Mode | Typical Size | Token Estimate | Cost @ $0.01/1k tokens |
|------|--------------|----------------|------------------------|
| **Semantic** | **100-300 bytes** | **25-75 tokens** | **$0.00025-0.00075** |
| Skeleton | 2-6 KB | 500-1500 tokens | $0.005-0.015 |
| Hybrid | 2-6 KB + 100KB image | 2000-3000 tokens | $0.02-0.03 |
| Full | 40-200 KB | 10000-50000 tokens | $0.10-0.50 |

**Semantic mode provides 99.8%+ cost reduction compared to full mode.**

---

## Appendix: Debugging Tips

### Check If Tagger Is Working

In DevTools console on the target page:

```javascript
// Count tagged elements
document.querySelectorAll('[data-llm-id]').length

// See all tagged elements
document.querySelectorAll('[data-llm-id]').forEach(el => {
  console.log(el.getAttribute('data-llm-id'), el.tagName, el.innerText?.slice(0,30));
});

// Check viewport pruning stats
const viewportHeight = window.innerHeight;
const allElements = document.querySelectorAll('[data-llm-id]');
const visibleElements = [...allElements].filter(el => {
  const rect = el.getBoundingClientRect();
  return rect.top <= viewportHeight && rect.bottom >= 0;
});
console.log(`Total: ${allElements.length}, Visible: ${visibleElements.length}, Pruned: ${allElements.length - visibleElements.length}`);
```

### Force Specific Mode

In `src/state/currentTask.ts`:

```typescript
// Enable semantic extraction (default)
const USE_SEMANTIC_EXTRACTION = true;

// Force legacy mode (skeleton/hybrid) - disable semantic
const USE_SEMANTIC_EXTRACTION = false;
```

### View Extracted Data

Enable debug logging:

```typescript
console.log('[CurrentTask] SEMANTIC extraction:', {
  nodeCount: result.interactive_tree.length,
  viewport: result.viewport,
  prunedElements: result.meta.prunedElements,
  estimatedTokens: result.meta.estimatedTokens,
  extractionTimeMs: result.meta.extractionTimeMs,
});
```

### Test Extraction Directly

In content script context:

```javascript
// Get semantic extraction result
const result = await extractSemanticTree({ viewportOnly: true, minified: true });
console.log('Result:', result);
console.log('Token estimate:', result.meta.estimatedTokens);
console.log('Sample nodes:', result.interactive_tree.slice(0, 5));
```

### Common Issues

| Issue | Cause | Solution |
|-------|-------|----------|
| "Element not found" | ID drift after framework re-render | Self-Healing will attempt ghost match; check MutationObserver is running |
| Empty extraction | Page not ready | Increase stability timeout |
| Huge payload | Full mode triggered | Check fallback conditions |
| Missing elements | Not tagged as interactive | Add role/tabindex to elements |
| Elements pruned | Below viewport | Scroll page or disable viewportOnly |
| Extraction fails | Library issue | Falls back to skeleton automatically |
| IDs lost after navigation | Framework destroyed DOM nodes | MutationObserver will re-tag; Self-Healing recovers by role/name/coordinates |
| React/Vue elements not detected | Hidden event listeners | Use `detectHiddenClickListeners()` via CDP (requires debugger) |

### ID Strategy Debugging

If elements are frequently losing their `data-llm-id`:

1. **Check MutationObserver is active:**
   ```javascript
   // In DevTools console
   console.log('[Tagger] Observer active:', !!window.__llmTaggerObserver);
   ```

2. **Verify Self-Healing is working:**
   ```javascript
   // Check ghost match confidence scores in console logs
   // Look for: "[DomActions] Ghost match found with confidence: 0.7"
   ```

3. **Consider hybrid ID approach:** For CDP-heavy operations, the `backendNodeId` from `Accessibility.getFullAXTree` is more stable. See §2.7 for details.
