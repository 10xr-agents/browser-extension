# Specs & Contracts

**Purpose:** API contracts, verification contract, and feature specifications for the Chrome extension and backend.  
**Last Updated:** January 29, 2026

---

## Table of Contents

1. [Verification Contract (Extension → Backend)](#1-verification-contract-extension--backend)
2. [Domain-Aware Sessions](#2-domain-aware-sessions)
3. [Chat UI Contract (Backend → Extension)](#3-chat-ui-contract-backend--extension)

---

## 1. Verification Contract (Extension → Backend)

**Purpose:** Define what the Chrome extension sends on each `POST /api/agent/interact` call so the backend’s **observation-based verification** (v3.0) can run correctly. This is the client-side contract that matches the server’s verification process.

**Backend reference:** Verification process doc (step-by-step walkthrough); `verifyActionWithObservations`, `beforeState`, `buildObservationList`.

### Required (Verification Works With Only These)

| Field    | Sent by extension | Purpose |
|----------|-------------------|--------|
| **dom**  | ✅ Every call     | Current page DOM (templatized). Backend uses it as “after” state and saves **beforeState** when generating the next action. |
| **url**  | ✅ Every call     | Current page URL, captured **just before** sending the request (not the URL from task start). Used in before/after comparison. |
| **taskId** | ✅ Every call after first | Backend loads last action and **beforeState** to run observation-based verification. |

**Implementation:**

- **dom:** On every loop iteration we call `getSimplifiedDom(tabId)` then `templatize(html)` and send it as `dom` with **adaptive size limits**:
  - **Default cap:** 50k characters (sufficient for most pages)
  - **Extended cap:** 200k characters (for complex enterprise apps like Salesforce, HubSpot)
  - **Logic:** If initial DOM is truncated AND interactive elements may be cut off, retry with 200k limit
  - **Hard limit:** 200k characters (prevents 6MB Lambda payload issues while accommodating large pages)
- **url:** We call `chrome.tabs.query({ active: true, currentWindow: true })` immediately before `apiClient.agentInteract(...)` and pass `currentUrl`. We do **not** use the URL from task start.
- **taskId:** We send `get().currentTask.taskId` when present (set from the previous response); persisted in `chrome.storage.local` per tab with recovery fallback.

**Adaptive DOM Size Strategy:**

The 50k default keeps payloads small for typical pages. When the DOM exceeds 50k:
1. Check if the truncation point cuts off interactive elements (buttons, inputs, links)
2. If yes, expand to 200k to capture the full interactive surface
3. Log a warning if DOM still exceeds 200k (rare, indicates extremely complex page)

This ensures a "Save" button at character 65,000 on a Salesforce page won't be lost.

Without **dom** on every call, the server cannot save **beforeState** and cannot run observation-based verification.

### Optional (Improve Accuracy)

| Field                 | Sent by extension | Purpose |
|-----------------------|-------------------|--------|
| **previousUrl**      | ✅ In `domChanges` | URL before the last action. Backend can infer from `beforeState.url` when present; we send it for clarity. |
| **domChanges**        | ✅ When available | `{ addedCount, removedCount, dropdownDetected, stabilizationTime, previousUrl, urlChanged }`. Helps describe what changed. |
| **clientObservations** | ✅ When available | `{ didNetworkOccur?, didDomMutate?, didUrlChange? }`. Extension-witnessed facts; reduces false “no change” failures. |
| **clientVerification** | 🔲 Not implemented | `{ elementFound, selector?, urlChanged? }` from `document.querySelector(expectedSelector)`. Would require backend to send expected selector; deferred. |

**clientObservations** is derived from `lastDOMChanges` and content script:

- `didUrlChange` ← `lastDOMChanges.urlChanged`
- `didDomMutate` ← `(addedCount + removedCount) > 0`
- `didNetworkOccur` ← content script network observation mark/since-mark (implemented).

### Request Body Shape (Summary)

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

### Flow Alignment With Backend

1. **Extension** executes action (e.g. `click(169)`).
2. **Extension** captures new state: DOM snapshot, current URL; optionally previous URL and DOM diff (added/removed).
3. **Extension** sends `POST /api/agent/interact` with at least `url`, `dom`, `query`, and `taskId` (after first request); optionally `domChanges` and `clientObservations`.
4. **Backend** loads task context: previous action and **beforeState** (url, domHash, optional semanticSkeleton).
5. **Verification** compares beforeState vs current (url, domHash, skeleton), builds observation list, optionally merges `clientObservations`, then LLM semantic verdict on observations only.
6. **Router** decides: success (e.g. confidence ≥ 0.70) → next action or finish; failure → correction.

---

## 2. Domain-Aware Sessions

**Status:** ✅ **FULLY IMPLEMENTED** (Frontend + Backend)

### Overview

Domain-aware sessions automatically manage chat sessions based on the website domain the user is currently on. When a user navigates to a different domain, the extension will either switch to an existing session for that domain or create a new one.

### Features

**1. Automatic Session Switching**
- When the active tab URL changes to a different domain, the extension automatically:
  - Checks if there's an existing active session for the new domain
  - If yes: switches to that session and loads its messages
  - If no: creates a new session with the domain prefix

**2. Domain-Prefixed Session Titles**
- Session titles follow the format: `{domain}: {task description}`
- Examples:
  - `google.com: Search for flights to NYC`
  - `github.com: Review pull request #123`
  - `localhost: Test login flow`

**3. Session Rename**
- Users can rename sessions via the Chat History drawer
- Domain prefix is automatically preserved when renaming
- Sessions marked as renamed won't auto-update their title

### Frontend Implementation

**New Files**
- `src/helpers/domainUtils.ts` - Domain extraction and formatting utilities

**Modified Files**
- `src/services/sessionService.ts` - Added domain field, findSessionByDomain, renameSession
- `src/state/sessions.ts` - Added switchToUrlSession, renameSession, initializeDomainAwareSessions
- `src/common/App.tsx` - Added URL change listeners and domain-aware initialization
- `src/common/ChatHistoryDrawer.tsx` - Added rename modal and domain badges

**Session Interface Changes**

```typescript
interface Session {
  sessionId: string;
  title: string;
  createdAt: number;
  url: string;
  domain?: string;           // NEW: Root domain (e.g., "google.com")
  updatedAt?: number;
  messageCount?: number;
  status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
  isRenamed?: boolean;       // NEW: Whether user manually renamed the session
}
```

### Backend Implementation ✅ COMPLETE

**1. Session Model Updated ✅**  
**File:** `lib/models/session.ts`
- Added `domain` field (string, optional, indexed)
- Added `title` field (string, optional)
- Added `isRenamed` field (boolean, default: false)
- Added indexes for domain-based queries

**2. New Endpoints**

| Method | Path | Purpose |
|--------|------|---------|
| PATCH | `/api/session/[sessionId]` | Rename session (body: `{ title }`). Sets `isRenamed: true`. |
| GET | `/api/session/[sessionId]` | Get single session by ID. |
| GET | `/api/session/by-domain/[domain]` | Find most recent active session for domain. Query: `status` (default: "active"). Returns `{ session }` or `{ session: null }`. |

**3. Updated Endpoints**
- **GET /api/session** — Now includes `title`, `domain`, `isRenamed`.
- **GET /api/session/latest** — Now includes `title`, `domain`, `isRenamed`.
- **POST /api/agent/interact** — Accepts `domain` and `title`; auto-extracts domain from URL if not provided; auto-generates title `{domain}: {query}`.

**4. Domain Utility ✅**  
**File:** `lib/utils/domain.ts`
- `extractDomain(url)` - Extracts root domain from URL
- `generateSessionTitle(domain, taskDescription)` - Generates session title
- Handles multi-part TLDs (co.uk, com.au, etc.) and special cases (localhost, IP addresses)

**5. Schemas Updated ✅**  
**File:** `lib/agent/schemas.ts`  
- `interactRequestBodySchema` - Added `domain`, `title`
- List/session/rename/by-domain response schemas updated or added as needed

### Domain Extraction Logic

1. **Standard domains:** Extract last 2 parts (e.g. `www.google.com` → `google.com`).
2. **Multi-part TLDs:** Extract last 3 parts (e.g. `www.example.co.uk` → `example.co.uk`).
3. **Special cases:** `localhost` → `localhost`; IP addresses and single-part hostnames kept as-is.

Supported multi-part TLDs include: `.co.uk`, `.com.au`, `.org.uk`, etc.

### Migration Notes

**Existing sessions:** On extension start, migration iterates sessions, extracts domain from URL, and updates sessions. Backend can run a similar migration for sessions where `domain` is null.

### Testing

**Frontend:** New/same domain navigation, domain switching, session rename, migration (sessions without domain get domain from URL).  
**Backend:** PATCH rename, GET session/list/latest with domain fields, POST interact with domain/title.

---

## 3. Chat UI Contract (Backend → Extension)

**Purpose:** Define what the Side Panel chat UI expects from the backend so the user can distinguish user vs agent messages, see the live plan, and understand task completion.

---

### Backend Requirements for Chat UI Upgrade (Checklist)

**Quick summary for backend:**  
(1) **POST /api/agent/interact** — When you have a plan, send `plan: { steps, currentStepIndex }`; when the task is done, send `action: "finish()"` (or `"fail()"` on failure).  
(2) **GET /api/session/[sessionId]/messages** — Every message must include `role: 'user' | 'assistant' | 'system'` so the UI can show user (right/blue) vs agent (left/gray).  
No new endpoints or `isTaskComplete` field; existing responses with the right shape are enough.

Use the checklist below as the single source of what the backend must do for the upgraded Side Panel chat to work properly.

#### 1. POST /api/agent/interact — Response shape

| Requirement | Field / behavior | Client use |
|-------------|------------------|------------|
| **Plan (recommended)** | Include `plan` when the orchestrator has a plan. | **PlanWidget** shows stepper (past / current / future). If missing, UI shows "Planning…" skeleton. |
| **Plan shape** | `plan: { steps: PlanStep[], currentStepIndex: number }` | Stepper highlights current step, dims past, grays future. |
| **PlanStep shape** | Each step: `{ id: string, description: string, status?: 'pending' \| 'active' \| 'completed' \| 'failed' }` | `description` is shown in the list; `status` can be used for styling. |
| **currentStepIndex** | Zero-based index of the step currently being executed. | Must stay in sync with the step that produced this response. |
| **Orchestrator status (optional)** | `status?: 'planning' \| 'executing' \| 'verifying' \| 'correcting' \| 'completed' \| 'failed' \| 'needs_user_input'` | Client stores it; PlanWidget uses `planning` to show skeleton when no steps yet. |
| **Task completion** | When the task is done, return `action: "finish()"`. On failure, return `action: "fail()"`. | Client sets `currentTask.status` to `'success'` or `'error'`; **TaskHeader** and **TaskCompletedCard** use this. |
| **Thought & action** | Keep sending `thought` and `action` as today. | **ChatTurn** shows Thought (collapsible), Action (badge), and Observation (✅/❌). |
| **Reasoning / user question** | Optional `reasoning`, `userQuestion`, `missingInformation` as already defined. | Reasoning badge, UserInputPrompt, and evidence in agent bubbles. |

**Summary:** No new fields are strictly required for the UI to run. Sending `plan` (with `steps` and `currentStepIndex`) and using `finish()` / `fail()` for completion gives the best experience (PlanWidget, TaskHeader, TaskCompletedCard). Existing `thought`, `action`, `reasoning`, `userQuestion` are already used.

#### 2. GET /api/session/[sessionId]/messages — Response shape

| Requirement | Field / behavior | Client use |
|-------------|------------------|------------|
| **role per message** | Every message in the array **must** include `role: 'user' \| 'assistant' \| 'system'`. | **ChatTurn** aligns user messages right (blue) and assistant messages left (gray). If `role` is missing, client defaults to `'assistant'`. |
| **Message shape** | At least: `messageId` (or id), `role`, `content`, `timestamp`. Optional: `status`, `actionPayload`, `meta`, `error`. | Client maps to `ChatMessage` and merges with local messages. |

**Example message from backend:**

```json
{
  "messageId": "uuid",
  "role": "user",
  "content": "Book a flight to NYC",
  "timestamp": "2026-01-28T12:00:00.000Z"
}
```

```json
{
  "messageId": "uuid",
  "role": "assistant",
  "content": "Analyzing the page...",
  "timestamp": "2026-01-28T12:00:01.000Z",
  "actionPayload": { "action": "click(42)", "parsedAction": { ... } },
  "status": "success"
}
```

**Backend action:** Ensure every message returned by GET session messages has a valid `role`. Persist `role` when saving messages (user vs assistant) so history loads with correct alignment.

#### 3. Task completion (no new endpoint)

| Requirement | Backend behavior | Client behavior |
|-------------|-------------------|-----------------|
| **Success** | Return `action: "finish()"` in the interact response when the task is done. | Sets `currentTask.status = 'success'`; shows COMPLETED badge and Task Completed card. |
| **Failure** | Return `action: "fail()"` when the task fails. | Sets `currentTask.status = 'error'`; shows FAILED badge. |
| **Optional** | You may also send `status: 'completed'` or `status: 'failed'` in the same response. | Client already derives completion from `finish()` / `fail()`. |

No separate "task complete" endpoint or `isTaskComplete` flag is required; the existing interact response is enough.

#### 4. What the backend does NOT need to do

- **No new endpoints** — only correct shape of existing responses.
- **No `isTaskComplete` field** — client infers from `action: "finish()"` / `"fail()"`.
- **No change to request body** of POST /api/agent/interact (existing contract stays).

#### 5. WebSocket / push (Pusher/Sockudo) — what needs to change

Real-time message sync uses **Pusher/Sockudo**: channel `private-session-<sessionId>`, events **new_message** and **interact_response**. For the Chat UI upgrade (user vs agent bubbles) to work over push, the following applies.

| Requirement | Backend action | Client behavior |
|-------------|----------------|-----------------|
| **role in new_message** | When triggering **new_message**, the payload must include a **message** object with **role: 'user' \| 'assistant' \| 'system'**. Same rule as GET session messages. | Client maps payload via `pusherTransport.mapMessagePayload`. If `role` is missing, it defaults to `'assistant'`, so all pushed messages appear as agent (left/gray). |
| **Payload shape for new_message** | Recommended: send the same shape as a message in GET /api/session/[sessionId]/messages: `messageId`, `role`, `content`, `timestamp`, and optionally `status`, `sequenceNumber`, `actionPayload`, `error`, `meta`. | Client merges into `currentTask.messages` (dedup by id, sort by sequenceNumber). Full shape avoids gaps when another tab/device receives the push before a REST refetch. |
| **interact_response** | No change. Keep triggering **interact_response** when an interact round completes. | Client calls `loadMessages(sessionId)` and refetches from REST; GET contract (including `role` per message) applies. Plan/task status come from the interact response, not from WebSocket. |
| **Plan / task status over push** | Not required. Plan and task completion are taken from the **POST /api/agent/interact** response. | If you later want other tabs/devices to see plan/status without waiting for the next interact, you could add events like **plan_update** or **task_status**; client would need to handle them. Optional. |

**Summary for WebSocket/push:**

1. **new_message** payload must include **message.role** (and preferably the same message shape as GET session messages). If missing, client defaults to `assistant`.
2. **interact_response** → client refetches via REST; no change to event, but GET response must include **role** per message (see §3.2).
3. No new events required for plan or task completion; they come from the interact response.

---

### Fields the UI Uses Today

| Field | Source | Purpose |
|-------|--------|---------|
| **plan** | `POST /api/agent/interact` response | `{ steps: PlanStep[], currentStepIndex: number }`. Rendered in **PlanWidget** (stepper: past/current/future). |
| **currentStepIndex** | Inside `plan` | Which step is active. |
| **Task status** | Extension state `currentTask.status` | Derived from response flow: `idle` \| `running` \| `success` \| `error` \| `interrupted`. **TaskHeader** shows RUNNING / COMPLETED / FAILED / STOPPED. |
| **sender / role** | Message `role` in `ChatMessage` | `'user' \| 'assistant' \| 'system'`. User messages right-aligned blue; agent left-aligned gray. |

**PlanStep** (from backend): `{ id, description, status?: 'pending' \| 'active' \| 'completed' \| 'failed', ... }`.

**isTaskComplete:** The UI derives completion from `currentTask.status === 'success'` (and from assistant messages that represent `finish()`). No separate backend field required if the backend sets task status or sends a clear completion signal the client maps to `success`.

### Required Backend Behavior (No New Fields If Already Met)

1. **plan** – If the orchestrator produces a plan, include it in the interact response so the client can show **PlanWidget** (steps + currentStepIndex). If missing, the UI shows a "Planning…" skeleton.
2. **currentStepIndex** – Part of `plan`; must reflect the step currently being executed.
3. **Task completion** – Client infers completion from `status: 'success'` (or equivalent) or from an assistant message indicating `finish()`. If the backend uses a different field (e.g. `isTaskComplete: true`), the client should map it to `currentTask.status = 'success'`.
4. **sender/role** – Each message in the conversation must have `role: 'user' \| 'assistant' \| 'system'` so the UI can align user (right/blue) vs agent (left/gray).

### Required Backend Changes (Only If Not Already So)

- If **plan** is not sent in the interact response today, add `plan?: { steps: PlanStep[], currentStepIndex: number }` to the response.
- If **messages** from the server do not include **role**, add `role: 'user' | 'assistant' | 'system'` to each message.
- If completion is signaled only in a way the client does not map to `status === 'success'`, either extend the client to read that signal or have the backend send a clear completion indicator the client already maps to `success`.

### Chat UI – Chakra UI & Chrome Extension alignment

**Chakra UI (v2):**

- All chat UI components use **style props** (bg, color, fontSize, borderWidth, etc.) per Chakra styling.
- **Dark mode:** Every color uses `useColorModeValue(light, dark)`; no hardcoded light-only colors.
- **Components:** Box, Text, VStack, HStack, Badge, Collapse, Skeleton, Icon from `@chakra-ui/react` only; no raw HTML for layout/feedback.
- Color values are defined at component top level (not inside `.map()` or render loops).

**Chrome Extension accessibility (Provide accessible content):**

- **Text:** Chakra `Text` / `fontSize` (xs, sm) used; no text baked into images; extension UI remains usable at 200% zoom.
- **Colors:** Semantic Chakra palette (blue/gray/green) for sufficient contrast; status badges and bubbles have distinct foreground/background.
- **Images/Icons:** Decorative icons use `aria-hidden`; no `<img>` without alt. Status/result icons have `aria-label` where they convey meaning (e.g. TaskStatusIndicator).
- **Interactive:** Collapsible “Thinking” section is a `<button>` with `aria-expanded`, `aria-label`, and keyboard support (Enter/Space). Focus ring via Chakra `_focusVisible`.
- **Live regions:** Task status (TaskHeader), task completed (TaskCompletedCard), live plan (PlanWidget), and “Thinking…” use `role="status"` or `role="region"` with `aria-live="polite"` / `aria-busy` where appropriate so screen readers announce changes.
