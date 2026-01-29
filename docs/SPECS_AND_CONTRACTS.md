# Specs & Contracts

**Purpose:** API contracts, verification contract, and feature specifications for the Chrome extension and backend.  
**Last Updated:** January 28, 2026

---

## Table of Contents

1. [Verification Contract (Extension → Backend)](#1-verification-contract-extension--backend)
2. [Domain-Aware Sessions](#2-domain-aware-sessions)

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

- **dom:** On every loop iteration we call `getSimplifiedDom(tabId)` then `templatize(html)` and send it as `dom` (capped at 50k chars in the request body).
- **url:** We call `chrome.tabs.query({ active: true, currentWindow: true })` immediately before `apiClient.agentInteract(...)` and pass `currentUrl`. We do **not** use the URL from task start.
- **taskId:** We send `get().currentTask.taskId` when present (set from the previous response); persisted in `chrome.storage.local` per tab with recovery fallback.

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
