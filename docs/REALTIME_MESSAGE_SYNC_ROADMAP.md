# Real-Time Message Sync — Documentation & Implementation Feedback

**Document Version:** 2.2  
**Last Updated:** February 1, 2026  
**Status:** Implemented (client + backend). Stability fixes applied (Jan 31).  
**Purpose:** Documentation of the implemented push-based message sync (Pusher/Sockudo) and implementation feedback.

*This document was converted from a task-based roadmap to documentation with implementation feedback (Jan 2026). It describes what was built, how it works, and lessons learned.*

---

## Table of Contents

1. [Implementation Summary](#1-implementation-summary)
2. [Implementation Feedback](#2-implementation-feedback)
3. [Architecture](#3-architecture)
4. [How It Works](#4-how-it-works)
5. [Backend Contract (Sockudo + Main Server)](#5-backend-contract-sockudo--main-server)
6. [Known Issues & Troubleshooting](#6-known-issues--troubleshooting)
7. [File Reference](#7-file-reference)
8. [Completed Checklist](#8-completed-checklist)

---

## 1. Implementation Summary

### 1.1 What Was Built

| Area | Implementation | Notes |
|------|----------------|-------|
| **Transport** | Pusher/Sockudo (Pusher protocol) | Single WebSocket connection; channel switch on **active session** change (no full reconnect). |
| **Auth** | Bearer token → `POST /api/pusher/auth` | Main server (3000) validates user and session; returns signed auth for Sockudo (3005). |
| **Events** | `new_message`, `interact_response` | `new_message` → merge into Zustand; `interact_response` → trigger `loadMessages(sessionId)`. |
| **Connection state** | `wsConnectionState`, `wsFallbackReason` | Exposed in store; ConnectionStatusBadge in debug panel only. |
| **Polling fallback** | Adaptive (3s active, 30s idle) | Used when Pusher not configured, auth fails, or connection fails. |
| **UI** | ConnectionStatusBadge, TypingIndicator | Badge in SystemView (debug panel); TypingIndicator in TaskUI. |
| **Tests** | messageSyncService (6), pollingFallbackService (4) | `yarn test`; Jest config in `jest.config.js`. |

**Backend:** Sockudo (Pusher-compatible) on **port 3005**; main app (Next.js) on **port 3000** (REST + `POST /api/pusher/auth`). Events triggered from interact route: `new_message`, `interact_response`.

### 1.2 Sync With Backend

The backend repo may keep a separate copy of this doc. **Extension-side source of truth:** client implementation is complete (Pusher transport, connection reuse, auth). Backend: **Sockudo** on **3005**, main server on **3000**; auth and 403 troubleshooting: see §5 and §6.

---

## 2. Implementation Feedback

### 2.1 What Worked Well

- **Pusher protocol over raw WebSocket:** Using `pusher-js` and Sockudo avoided custom WebSocket protocol and aligned with backend. Channel-based subscription (`private-session-<sessionId>`) fits session-scoped messaging.
- **Single connection, channel switch:** One Pusher connection per agent session; on chat switch we unsubscribe from the old channel and subscribe to the new one instead of disconnecting/reconnecting. Reduces auth and reconnect churn.
- **Polling fallback:** When `WEBPACK_PUSHER_KEY` is unset or Pusher fails, Message Sync Manager starts polling. Users still get message updates without push.
- **Debug-only badge:** ConnectionStatusBadge moved to the debug panel (SystemView) so the main chat view stays clean; power users can still see Connected/Polling/Disconnected.

### 2.2 Decisions & Trade-offs

- **`interact_response` → loadMessages:** We chose to refresh messages from REST on `interact_response` rather than trust a full payload on the event. Keeps UI in sync with server state and avoids duplicate message logic.
- **Disconnect handling:** pusher-js can throw "WebSocket is already in CLOSING or CLOSED state" during disconnect/session switch. We only call `unsubscribe()` when `connection.state === 'connected'` and only call `disconnect()` when not already disconnected/failed/unavailable; we also suppress that specific error in `App.tsx`. Error may still appear in some cases; it is harmless.
- **Auth 403:** Most 403s from `POST /api/pusher/auth` come from session lookup (session not found or user mismatch). We added **docs/PUSHER_AUTH_403_FIX.md** with a checklist and suggested route changes (e.g. dev-only 403 body with `SESSION_NOT_FOUND` / `USER_MISMATCH`).

### 2.3 Stability Fixes (Jan 31, 2026)

Additional issues discovered and fixed during testing:

- **Sync Deduplication:** Multiple entry points (`App.tsx`, `loadMessages`, visibility handler) could trigger `startSync` simultaneously, causing parallel polling instances. Fixed by tracking `currentSyncSessionId` and `syncInProgress` promise in `messageSyncService`.
- **Auth Failure Cooldown:** On 403 errors, `pusherTransport` was retrying immediately, causing rate limits. Added cooldown mechanism with `authFailureCount` and `AUTH_FAILURE_COOLDOWN` (30 seconds after 3 failures).
- **Frozen Array Mutations:** Zustand with Immer creates immutable state drafts. Calling `.sort()` directly on `state.currentTask.messages` failed with "Cannot assign to read only property". Fixed by using `[...array].sort()` to create a new array.
- **Store Merge Deep Clone:** `lodash.merge` in the `persist` middleware was preserving frozen array references from localStorage. Fixed by explicitly deep cloning `sessions.sessions` array in the merge function.
- **API Call Deduplication:** `sessionService.listSessions` was called on every UI interaction. Added caching with 5-minute TTL and `inFlight` promise deduplication.

### 2.4 Pending / Follow-up

- **Manual QA:** Checklist (e.g. connect with Sockudo running, send message, switch session, verify badge states) is not yet run end-to-end. Recommended before marking production-ready.
- **Typing indicator:** Server does not yet send a dedicated typing event; typing state can be inferred between user message and `interact_response` if desired later.

---

## 3. Architecture

### 3.1 Message Flow (Before vs After)

**Before (poll/on-demand):** UI called `loadMessages(sessionId)` on session select or after actions; no push.

**After (push + fallback):**

```
┌─────────────────┐                          ┌──────────────────┐
│  Chrome Ext     │ ←── Pusher (3005) ──────→│  Sockudo         │
│  pusherTransport│     private-session-*    │  (Pusher protocol)│
└────────┬────────┘                          └────────┬─────────┘
         │                                             │
         │ auth: POST /api/pusher/auth (3000)          │ events from
         │ ←───────────────────────────────────────────│ main server
         ↓                                             │
  Message Sync Manager ←───────────────────────────────┘
         │ (newMessage → merge; interact_response → loadMessages)
         ↓
  Zustand (currentTask.messages, wsConnectionState)
         ↓
  UI (ChatStream, ConnectionStatusBadge in debug panel)
```

### 3.2 Component Roles

| Component | Role |
|-----------|------|
| **pusherTransport.ts** | Connects to Sockudo (wsHost, wsPort 3005), subscribes to `private-session-<sessionId>`, binds `new_message` / `interact_response`, emits `newMessage` / `stateChange` / `fallback`. |
| **messageSyncService.ts** | Uses pusherTransport; on `newMessage` merges into store (dedup, sort by sequenceNumber); on `interact_response` calls `loadMessages(sessionId)`; on `fallback` starts polling. |
| **pollingFallbackService.ts** | When Pusher unavailable; adaptive intervals (3s active, 30s idle); merge into store with dedup/sort. |
| **ConnectionStatusBadge** | Reads `wsConnectionState`, `wsFallbackReason`; shown in SystemView (debug panel) only. |
| **TypingIndicator** | Reads `isServerTyping`; used in TaskUI. |

### 3.2.1 Session Selection Model (Tab → Session)

Real-time messaging is **session-scoped** (channels are `private-session-<sessionId>`), but **which `sessionId` is active** in the extension is determined by a **tab-scoped mapping**:

- **Each Chrome tab** has **one active chat session**: `tabId -> sessionId`
- Navigations **within the same tab** (including cross-domain) keep the **same `sessionId`**; only session metadata (`url`, `domain`) updates.
- Switching tabs changes the active `sessionId` (and therefore the subscribed channel).

This avoids coupling realtime messaging to domain-based session selection.

### 3.3 Connection States

`wsConnectionState`: `disconnected` | `connecting` | `connected` | `reconnecting` | `failed` | `fallback`.  
When `fallback`, `wsFallbackReason` explains (e.g. "Pusher not configured", "Pusher auth failed").

### 3.4 Auto-Reconnection & Visibility Handling

**Auto-Reconnect (added Jan 2026):**
- When WebSocket connection drops unexpectedly (not a manual disconnect), `pusherTransport` automatically attempts to reconnect
- Uses exponential backoff: 2s → 4s → 8s (max 3 attempts, max 30s delay)
- After 3 failed reconnect attempts, emits `fallback` event to switch to polling
- Manual `disconnect()` calls set `isManualDisconnect = true` to prevent auto-reconnect

**Visibility Change Handler (added Jan 2026):**
- In `App.tsx`, a `visibilitychange` event listener reconnects WebSocket when the extension panel becomes visible
- Only reconnects if currently `disconnected`, `failed`, or `fallback` state
- Handles cases where user switches browser tabs or minimizes the browser

**Session Load Sync (added Jan 2026):**
- `loadMessages(sessionId)` in `currentTask.ts` now calls `messageSyncManager.startSync(sessionId)` after loading messages
- This was the missing link — previously, WebSocket sync was only initialized but never started on session changes
- Ensures real-time updates work for the active session after switching chats or on initial load

---

## 4. How It Works

### 4.1 Transport & Auth

- **Connect:** Pusher(key, { cluster: 'local', wsHost, wsPort: 3005, authEndpoint: API_BASE + '/api/pusher/auth', channelAuthorization: { headers: { Authorization: 'Bearer ' + token } } }).
- **Subscribe:** Channel `private-session-<sessionId>`. pusher-js calls `POST /api/pusher/auth` with form `socket_id`, `channel_name` and header `Authorization: Bearer <token>`. Main server validates token and session, returns signed auth; Sockudo allows subscription.
- **Session switch:** Unsubscribe from old channel, subscribe to new channel (same connection). In the extension, the active session is chosen via **tabId → sessionId** (see §3.2.1).

### 4.2 Event Mapping

| Server event | Client action |
|--------------|---------------|
| **new_message** | Payload `message` mapped to `ChatMessage`; emit `newMessage`; Message Sync Manager merges into store (dedup, sort by sequenceNumber). |
| **interact_response** | Message Sync Manager calls `loadMessages(sessionId)` to refresh from REST. |

**Chat UI upgrade (user vs agent bubbles):** For the Side Panel chat to show user messages right (blue) and agent messages left (gray), the **new_message** payload must include **message.role: 'user' \| 'assistant' \| 'system'**. If the server omits `role`, the client defaults to `'assistant'`. Prefer sending the same message shape as GET /api/session/[sessionId]/messages (messageId, role, content, timestamp, status, sequenceNumber, actionPayload, etc.). See **SPECS_AND_CONTRACTS.md §3 (Backend Requirements)** and **§3.5 (WebSocket / push)**.

### 4.3 Env / Build

- Webpack injects `WEBPACK_PUSHER_KEY`, `WEBPACK_PUSHER_WS_HOST`, `WEBPACK_PUSHER_WS_PORT` (and `WEBPACK_API_BASE` for auth endpoint). Set in `.env.local` and rebuild; reload extension after build.

---

## 5. Backend Contract (Sockudo + Main Server)

### 5.1 Server Layout

| Item | Implementation |
|------|----------------|
| **WebSocket server** | **Sockudo** (Pusher-compatible), port **3005**. |
| **Main server** | Next.js on **port 3000**. Serves REST and **POST /api/pusher/auth**. Does not run WebSocket. |
| **Connection URL** | Client connects to **3005** (Sockudo). Session = channel `private-session-<sessionId>`. |
| **Channels** | One **private** channel per session: `private-session-<sessionId>`. |
| **Authentication** | **POST /api/pusher/auth** (main server 3000). Client sends form: `socket_id`, `channel_name`; header: `Authorization: Bearer <token>`. Server validates token, verifies user can subscribe to that session, returns signed auth. |
| **Server events** | **new_message** — when a user/assistant message is persisted. **interact_response** — when interact returns (assistant turn). |
| **Env (server)** | Sockudo: `SOCKUDO_APP_ID`, `SOCKUDO_APP_KEY`, `SOCKUDO_APP_SECRET`, `SOCKUDO_HOST`, `SOCKUDO_PORT` (3005). Main server uses same key/secret to sign channel auth. |
| **Env (client)** | `WEBPACK_PUSHER_KEY`, `WEBPACK_PUSHER_WS_HOST`, `WEBPACK_PUSHER_WS_PORT` (3005), `WEBPACK_API_BASE` (main server). |

### 5.2 new_message payload shape (Chat UI upgrade)

When the backend triggers **new_message** on `private-session-<sessionId>`, the payload should include a **message** object with at least:

- **messageId** (string)
- **role** (string): `'user' | 'assistant' | 'system'` — **required** for correct bubble alignment (user right/blue, agent left/gray). If omitted, client defaults to `'assistant'`.
- **content** (string)
- **timestamp** (ISO string or number)

Optional but recommended (same as GET session messages): `status`, `sequenceNumber`, `actionPayload`, `error`, `meta`. This keeps push and REST in sync and avoids missing fields when the client merges without refetching.

### 5.3 Why POST /api/pusher/auth and 403

Sockudo requires channel auth for private channels. When the client subscribes to `private-session-<sessionId>`, pusher-js calls **POST /api/pusher/auth** on the main server with `socket_id`, `channel_name`, and Bearer token. Main server must validate the user and session and return signed auth. **403** = server rejected auth (e.g. invalid token or user not allowed for that session). See **§6** and **docs/PUSHER_AUTH_403_FIX.md** for fixes.

---

## 6. Known Issues & Troubleshooting

| Issue | Cause | Mitigation | Impact |
|-------|--------|------------|--------|
| **"WebSocket is already in CLOSING or CLOSED state"** | pusher-js calling close/send on an already closing/closed socket (e.g. session switch). | Only unsubscribe when `connection.state === 'connected'`; only disconnect when not already disconnected/failed/unavailable; try/catch; suppress this message in App.tsx error handler. | May still appear in console in some cases; harmless; sync and fallback work. |
| **"Failed to get annotated DOM: Content script is not loaded"** | Restricted page or tab not refreshed after extension reload. | N/A (expected). | User should refresh the tab and use a normal HTTP(S) page. |
| **POST /api/pusher/auth 403** | Server rejected channel auth. Common: session not found or user mismatch (tenantId/userId). | Backend: ensure session lookup uses same tenantId/userId as auth; optional dev-only 403 body (e.g. `SESSION_NOT_FOUND`, `USER_MISMATCH`). See **docs/PUSHER_AUTH_403_FIX.md**. **Jan 31 fix:** Added auth failure cooldown in `pusherTransport`. | Sync falls back to polling; messages still load via REST. |
| **WebSocket disconnects on tab switch** | Browser may throttle or suspend WebSocket connections when extension panel is not visible. | Auto-reconnect with exponential backoff (max 3 attempts); visibility change handler reconnects when panel becomes visible again; polling fallback ensures messages are still received. | May see brief "reconnecting" state; sync resumes automatically within seconds. |
| **WebSocket stuck in "connecting" indefinitely** | Sockudo server unreachable, port blocked, or network issue. | 8-second connection timeout in `pusherTransport`; emits `fallback` event to switch to polling if not connected within timeout. | Polling fallback activates automatically; no user action required. |
| **startSync not called after session change** | (Fixed Jan 2026) Previously, `messageSyncManager.startSync()` was only called at initialization, not when sessions changed. | `loadMessages(sessionId)` now calls `startSync(sessionId)` after loading. | Real-time updates now work for the active session. |
| **429 Rate Limit Exceeded (API calls)** | (Fixed Jan 31) Multiple concurrent `startSync` calls and duplicate polling instances. | `messageSyncManager` now tracks `currentSyncSessionId` and deduplicates; `handleInteractResponse` debounced to 1s; `sessionService` caches `listSessions`. | API call rate reduced significantly. |
| **"Cannot assign to read only property" errors** | (Fixed Jan 31) Mutating frozen Zustand state arrays (from Immer) with `.sort()`. | Changed to `[...array].sort()` in `pollingFallbackService` and `messageSyncService`; deep clone in `store.ts` merge function. | State updates work correctly without errors. |
| **Multiple polling instances** | (Fixed Jan 31) `handleFallback` could start duplicate polling. | Added `!pollingFallbackService.isPolling()` check before starting. | Only one polling instance runs at a time. |

---

## 7. File Reference

**New/created:**  
`src/services/pusherTransport.ts`, `src/services/realtimeTypes.ts`, `src/services/messageSyncService.ts`, `src/services/pollingFallbackService.ts`, `src/common/ConnectionStatusBadge.tsx`, `src/common/TypingIndicator.tsx`, `src/services/messageSyncService.test.ts`, `src/services/pollingFallbackService.test.ts`, `jest.config.js`.

**Removed:**  
`src/services/websocketService.ts`, `src/services/websocketTypes.ts`, `src/services/websocketService.test.ts`.

**Modified:**  
`src/state/currentTask.ts` (wsConnectionState, wsFallbackReason, isServerTyping, serverTypingContext; getSimplifiedDom null check; **Jan 2026: startSync call in loadMessages**), `src/state/store.ts` (init message sync manager; **Jan 31: deep clone sessions in merge function**), `src/common/TaskUI.tsx` (TypingIndicator, startSync/stopSync, visibility reconnect), `src/common/SystemView.tsx` (ConnectionStatusBadge in debug panel), `src/common/App.tsx` (error handler for pusher-js; **Jan 2026: visibility change handler for WebSocket reconnect**), `src/services/pusherTransport.ts` (**Jan 2026: auto-reconnect with exponential backoff; Jan 31: auth failure cooldown**), `src/services/messageSyncService.ts` (**Jan 31: sync deduplication, handleInteractResponse debounce, array mutation fix**), `src/services/pollingFallbackService.ts` (**Jan 31: array mutation fix**), `src/services/sessionService.ts` (**Jan 31: listSessions caching and deduplication**), `webpack.config.js` (WEBPACK_PUSHER_*).

---

## 8. Completed Checklist

- [x] Pusher/Sockudo transport (`pusherTransport.ts`)
- [x] Connection state in store; session switch via channel unsubscribe/subscribe
- [x] Event handling: `new_message` → merge; `interact_response` → loadMessages
- [x] Message Sync Manager (messageSyncService.ts)
- [x] Polling fallback (pollingFallbackService.ts) with adaptive intervals
- [x] ConnectionStatusBadge (debug panel only), TypingIndicator
- [x] Unit tests (messageSyncService, pollingFallbackService)
- [x] Backend: Sockudo 3005, main server `/api/pusher/auth` 3000, events new_message, interact_response
- [x] Auto-reconnect on unexpected disconnect (exponential backoff, max 3 attempts) — **Jan 2026**
- [x] Visibility change handler (reconnect when extension panel becomes visible) — **Jan 2026**
- [x] startSync called after session change (loadMessages now starts WebSocket sync) — **Jan 2026**
- [x] Sync deduplication (prevent duplicate startSync calls) — **Jan 31, 2026**
- [x] Auth failure cooldown (prevent rapid 403 retries) — **Jan 31, 2026**
- [x] API call rate limiting (listSessions caching, handleInteractResponse debounce) — **Jan 31, 2026**
- [x] Array mutation fix (frozen Zustand state compatibility) — **Jan 31, 2026**
- [x] Deep clone sessions in store merge (prevent read-only errors) — **Jan 31, 2026**
- [ ] Manual QA (connect, send message, switch session, badge states) — **pending**

---

**End of Document**
