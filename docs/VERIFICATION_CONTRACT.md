# Verification Contract: Extension → Backend

**Purpose:** Define what the Chrome extension sends on each `POST /api/agent/interact` call so the backend’s **observation-based verification** (v3.0) can run correctly. This is the client-side contract that matches the server’s verification process.

**Backend reference:** Verification process doc (step-by-step walkthrough); `verifyActionWithObservations`, `beforeState`, `buildObservationList`.

---

## Required (Verification Works With Only These)

| Field    | Sent by extension | Purpose |
|----------|-------------------|--------|
| **dom**  | ✅ Every call     | Current page DOM (templatized). Backend uses it as “after” state and saves **beforeState** when generating the next action. |
| **url**  | ✅ Every call     | Current page URL, captured **just before** sending the request (not the URL from task start). Used in before/after comparison. |
| **taskId** | ✅ Every call after first | Backend loads last action and **beforeState** to run observation-based verification. |

**Implementation:**

- **dom:** On every loop iteration we call `getSimplifiedDom(tabId)` then `templatize(html)` and send it as `dom` (capped at 50k chars in the request body).
- **url:** We call `chrome.tabs.query({ active: true, currentWindow: true })` immediately before `apiClient.agentInteract(...)` and pass `currentUrl`. We do **not** use the URL from task start.
- **taskId:** We send `get().currentTask.taskId` when present (set from the previous response).

Without **dom** on every call, the server cannot save **beforeState** and cannot run observation-based verification.

---

## Optional (Improve Accuracy)

| Field                 | Sent by extension | Purpose |
|-----------------------|-------------------|--------|
| **previousUrl**      | ✅ In `domChanges` | URL before the last action. Backend can infer from `beforeState.url` when present; we send it for clarity. |
| **domChanges**        | ✅ When available | `{ addedCount, removedCount, dropdownDetected, stabilizationTime, previousUrl, urlChanged }`. Helps describe what changed. |
| **clientObservations** | ✅ When available | `{ didDomMutate?, didUrlChange? }`. Extension-witnessed facts; reduces false “no change” failures. |
| **clientVerification** | 🔲 Not implemented | `{ elementFound, selector?, urlChanged? }` from `document.querySelector(expectedSelector)`. Would require backend to send expected selector; deferred. |

**clientObservations** is derived from `lastDOMChanges`:

- `didUrlChange` ← `lastDOMChanges.urlChanged`
- `didDomMutate` ← `(addedCount + removedCount) > 0`
- `didNetworkOccur` — not tracked yet (would need content-script network counter).

---

## Request Body Shape (Summary)

```ts
{
  url: string,           // required — current URL (captured just before send)
  query: string,         // required — user instruction
  dom: string,           // required — current DOM (every call)
  taskId?: string,       // required after first request
  sessionId?: string,
  lastActionStatus?: 'success' | 'failure' | 'pending',
  lastActionError?: { message, code, action, elementId? },
  lastActionResult?: { success, actualState? },
  domChanges?: { addedCount, removedCount, dropdownDetected, stabilizationTime, previousUrl?, urlChanged? },
  clientObservations?: { didNetworkOccur?, didDomMutate?, didUrlChange? }
}
```

---

## Flow Alignment With Backend

1. **Extension** executes action (e.g. `click(169)`).
2. **Extension** captures new state: DOM snapshot, current URL; optionally previous URL and DOM diff (added/removed).
3. **Extension** sends `POST /api/agent/interact` with at least `url`, `dom`, `query`, and `taskId` (after first request); optionally `domChanges` and `clientObservations`.
4. **Backend** loads task context: previous action and **beforeState** (url, domHash, optional semanticSkeleton).
5. **Verification** compares beforeState vs current (url, domHash, skeleton), builds observation list, optionally merges `clientObservations`, then LLM semantic verdict on observations only.
6. **Router** decides: success (e.g. confidence ≥ 0.70) → next action or finish; failure → correction.

---

## Changelog

- **v1:** Required: dom, url, taskId. Optional: domChanges (previousUrl, urlChanged), clientObservations (didDomMutate, didUrlChange). URL captured just before each interact call. clientVerification not implemented.
