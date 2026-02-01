## Backend Page-State Negotiation Contract (Development)

**Purpose:** Define the **backend-driven** contract that ensures the extension sends **semantic JSON first**, and only sends heavier artifacts (skeleton DOM, screenshot, full DOM) when the backend explicitly requests them.

This is the “fix it once and for all” contract to prevent carrying legacy DOM burdens into production.

---

## 1. High-Level Flow

- **Step A (always):** Extension sends `domMode: "semantic_v3"` with `interactiveTree` (V3 minified semantic JSON).
- **Step B (optional):** Backend responds with a request for additional artifacts if needed.
- **Step C:** Extension retries the same `POST /api/agent/interact` call with *only* the requested artifacts.

---

## 2. Request: Extension → Backend

### 2.1 Default Request (Semantic-First)

The extension SHOULD send:

- `domMode: "semantic_v3"`
- `interactiveTree` (minified nodes)
- `viewport`
- `pageTitle`
- `tabId` (Chrome tab id; **debug metadata only**, not stable across restarts)
- Optional V3 advanced metadata: `scrollPosition`, `scrollableContainers`, `recentEvents`, etc.

The extension SHOULD NOT send (by default):

- `dom` (full HTML)
- `skeletonDom`
- `screenshot`

Example:

```json
{
  "url": "https://example.com",
  "query": "Click the Save button",
  "tabId": 123,
  "domMode": "semantic_v3",
  "pageTitle": "Example",
  "viewport": { "width": 1280, "height": 800 },
  "interactiveTree": [
    { "i": "12", "r": "btn", "n": "Save", "xy": [900, 40] }
  ]
}
```

### 2.2 Retry Request (Backend-Requested Artifacts)

The extension MUST include `semantic_v3` again (still primary) and then add ONLY what the backend requested:

- If backend requested `skeleton`: include `skeletonDom`
- If backend requested `hybrid`: include `skeletonDom` + `screenshot` (+ `screenshotHash`)
- If backend requested `full`: include `dom` (+ optionally keep `skeletonDom`)

Example (hybrid):

```json
{
  "url": "https://example.com",
  "query": "Click the blue button",
  "tabId": 123,
  "domMode": "hybrid",
  "pageTitle": "Example",
  "viewport": { "width": 1280, "height": 800 },
  "interactiveTree": [
    { "i": "12", "r": "btn", "n": "Button", "xy": [900, 40], "box": [850, 20, 100, 40] }
  ],
  "skeletonDom": "<button data-llm-id=\"12\">Button</button>",
  "screenshot": "<base64-jpeg>",
  "screenshotHash": "a1b2c3..."
}
```

---

## 3. Response: Backend → Extension

### 3.1 Normal Response (Most Cases)

Backend returns the next action:

```json
{
  "thought": "Click Save",
  "action": "click(12)"
}
```

### 3.2 Negotiation Response (Backend Requests More Context)

Backend requests additional artifacts using any of these supported fields:

- `requestedDomMode: "skeleton" | "hybrid" | "full"`
- `needsSkeletonDom: true`
- `needsScreenshot: true`
- Backward compatibility: `status: "needs_full_dom"`

Example:

```json
{
  "status": "needs_context",
  "requestedDomMode": "hybrid",
  "needsScreenshot": true,
  "needsSkeletonDom": true,
  "reason": "User asked about the 'blue' button; semantic tree doesn't encode color reliably."
}
```

---

## 4. Backend Implementation Notes

### 4.1 Parser / Planner Should Prefer Semantic V3

- Use `interactiveTree` as the canonical representation of interactive elements.
- Use `box` and `xy` fields for spatial reasoning.
- Use `occ: true` to avoid suggesting clicks on covered elements.
- Use `scr` / `scrollableContainers` to decide when to request scroll actions.

### 4.2 When to Request More Artifacts

Request `skeleton` when:
- Semantic tree lacks enough surrounding structure (e.g., duplicated labels).

Request `hybrid` when:
- Query has strong visual references (color, icon-only, “top-right gear”, “second card”).
- There are many similar elements and disambiguation requires layout.

Request `full` when:
- Verification requires raw HTML details not present in semantic/skeleton.
- Server-side selector generation needs attributes missing in skeleton.

### 4.3 Compatibility

During transition:
- If backend still expects `dom`, it MUST tolerate `dom` missing/empty when `domMode === "semantic_v3"`.
- If backend emits `status: "needs_full_dom"`, the extension will retry with `domMode: "full"`.

---

## 5. Source of Truth

- `docs/DOM_EXTRACTION_ARCHITECTURE.md` (client extraction + negotiation flow)
- `docs/SPECS_AND_CONTRACTS.md` (field-by-field contract)

