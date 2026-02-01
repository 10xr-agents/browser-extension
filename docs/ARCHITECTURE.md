# Spadeworks Copilot AI — Architecture

**Last Updated:** January 29, 2026  
**Version:** 2.0 (Consolidated)  
**Purpose:** Comprehensive architecture reference consolidating: client-side extension, Phase 1-4 improvements, Storage-First architecture, enterprise/platform specification, Manus orchestrator, and Reasoning layer.

**This document consolidates:**
- `ARCHITECTURE_REVIEW.md` - Phase 1-4 implementation details
- `CLIENT_ARCHITECTURE.md` - Complete client-side architecture
- `ENTERPRISE_PLATFORM_SPECIFICATION.md` - Enterprise platform specification

**Kept as separate docs:** [BUSINESS_ONEPAGER.md](./BUSINESS_ONEPAGER.md), [CHROME_TAB_ACTIONS.md](./CHROME_TAB_ACTIONS.md), [REALTIME_MESSAGE_SYNC_ROADMAP.md](./REALTIME_MESSAGE_SYNC_ROADMAP.md), [MANUS_ORCHESTRATOR_ARCHITECTURE.md](./MANUS_ORCHESTRATOR_ARCHITECTURE.md).

---

## Table of Contents

- [Part I: Architecture Improvements (Phases 1-4)](#part-i-architecture-improvements-phases-1-4)
- [Part II: Client-Side Architecture](#part-ii-client-side-architecture)
- [Part III: Storage-First Architecture (Phase 4)](#part-iii-storage-first-architecture-phase-4)
- [Part IV: Enterprise & Platform Specification](#part-iv-enterprise--platform-specification)
- [Part V: Manus Orchestrator](#part-v-manus-orchestrator)
- [Part VI: Reasoning Layer](#part-vi-reasoning-layer)
- [Part VII: Quick Reference](#part-vii-quick-reference)

---

# Part I: Architecture Improvements (Phases 1-4)

## 1.1 Executive Summary

The Chrome extension architecture has undergone four phases of improvements to address synchronization, tab switching, and DOM processing issues. The core problem was **complexity accumulation** - multiple layers of state, communication channels, and lifecycle management that interact in unpredictable ways.

**Key Insight:** Most individual components were well-designed. The issues arose from how they interacted - specifically, trying to "sync" state between components rather than sharing a single source of truth.

## 1.2 Implementation Summary

| Phase | Status | Key Deliverable |
|-------|--------|-----------------|
| Phase 1 | ✅ Complete | Explicit targetTabId, content script ping/inject, tab switch pausing |
| Phase 2 | ✅ Complete | Background TaskOrchestrator, PusherService, TaskProvider context |
| Phase 3 | ✅ Complete | Multi-tab support, error recovery, component migration hooks |
| Phase 4 | ✅ Complete | **Storage-First architecture** - single source of truth, observer pattern |

## 1.3 New Files Created (All Phases)

### Phase 2: Background-Centric Architecture

| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/Background/TaskOrchestrator.ts` | ~950 | Central task management, state schema, task loop |
| `src/pages/Background/PusherService.ts` | ~470 | Background WebSocket, channel management |
| `src/state/taskBridge.ts` | ~335 | React hooks for task state, commands to background |
| `src/state/pusherBridge.ts` | ~330 | React hooks for Pusher state |
| `src/state/TaskProvider.tsx` | ~280 | React context provider |

### Phase 3: Multi-Tab & Error Recovery

| File | Lines | Purpose |
|------|-------|---------|
| `src/pages/Background/TabTaskManager.ts` | ~500 | Multi-tab task state, concurrent task management |
| `src/pages/Background/ErrorRecovery.ts` | ~450 | Error classification, retry logic, state recovery |
| `src/state/multiTabBridge.ts` | ~300 | React hooks for multi-tab support |
| `src/state/errorRecoveryBridge.ts` | ~250 | React hooks for error recovery |

### Phase 4: Storage-First

| File | Lines | Purpose |
|------|-------|---------|
| `src/state/StorageFirstManager.ts` | ~400 | Storage-as-database layer with per-tab sessions |
| `src/state/MultiplexedSocket.ts` | ~400 | Single WebSocket with tabId-based routing |
| `src/state/useStorageSubscription.ts` | ~450 | React hooks for direct storage binding |

## 1.4 Architecture Evolution

### Before (Anti-Patterns)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PROBLEMS IDENTIFIED                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  1. MULTIPLE SOURCES OF TRUTH:                                               │
│     - Zustand + localStorage (Side Panel only)                               │
│     - chrome.storage.local (Accessible everywhere, async)                    │
│     - In-memory JS variables (Dies with Service Worker)                      │
│     - Content script state (Dies on navigation)                              │
│                                                                              │
│  2. IMPLICIT TAB TARGETING:                                                  │
│     - Side panel assumed active tab was the target                           │
│     - Tab switch = wrong DOM, wrong tab, errors                              │
│                                                                              │
│  3. COMPLEX COMMUNICATION:                                                   │
│     - 5 different communication paths                                        │
│     - Tab switch required switching Pusher, DOM, task state, content script  │
│     - Any failure = cascading errors                                         │
│                                                                              │
│  4. CONTENT SCRIPT LIFECYCLE:                                                │
│     - Dies on navigation (Chrome behavior)                                   │
│     - Race condition window after navigation                                 │
│     - No reliable readiness detection                                        │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

### After (Storage-First Architecture)

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    STORAGE-FIRST ARCHITECTURE                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────────┐│
│  │                     Service Worker (Background)                          ││
│  │                                                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │  TaskOrchestrator                                               │    ││
│  │  │  - Owns all task state, manages tab targeting                   │    ││
│  │  │  - Handles content script lifecycle                             │    ││
│  │  │  - Calls backend API, broadcasts state via storage              │    ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │                                                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │  TabTaskManager                                                 │    ││
│  │  │  - Multi-tab support, concurrent task management                │    ││
│  │  │  - Tab lifecycle handling                                       │    ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │                                                                          ││
│  │  ┌─────────────────────────────────────────────────────────────────┐    ││
│  │  │  ErrorRecovery                                                  │    ││
│  │  │  - Error classification, retry logic, state recovery            │    ││
│  │  └─────────────────────────────────────────────────────────────────┘    ││
│  │                              │                                           ││
│  │  ┌───────────────────────────▼───────────────────────────────────────┐  ││
│  │  │  chrome.storage.local (SINGLE SOURCE OF TRUTH)                     │  ││
│  │  │  - session_{tabId}: Per-tab task state                             │  ││
│  │  │  - active_tab_id: Currently viewed tab                             │  ││
│  │  │  - connection_state: WebSocket status                              │  ││
│  │  │  - global_settings: User preferences                               │  ││
│  │  └────────────────────────────────────────────────────────────────────┘  ││
│  └─────────────────────────────────────────────────────────────────────────┘│
│                              │                                               │
│            ┌─────────────────┴─────────────────┐                            │
│            ▼                                   ▼                            │
│  ┌─────────────────────┐            ┌─────────────────────┐                │
│  │   Side Panel (UI)   │            │  Content Scripts    │                │
│  │                     │            │  (per tab)          │                │
│  │  - Pure renderer    │            │                     │                │
│  │  - Subscribes to    │            │  - DOM extraction   │                │
│  │    storage.onChanged│            │  - Action execution │                │
│  │  - Sends commands   │            │  - Health ping      │                │
│  │  - Zero task logic  │            │                     │                │
│  └─────────────────────┘            └─────────────────────┘                │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

## 1.5 Phase-by-Phase Details

### Phase 1: Immediate Fixes ✅

**1. Store targetTabId at Task Start**
- Location: `src/state/currentTask.ts`
- Task's `tabId` stored when task starts, used for explicit tab targeting

**2. Verify Content Script Before Every RPC**
- Location: `src/helpers/pageRPC.ts`
- `pingContentScript()` checks readiness, `ensureContentScriptReady()` injects if needed
- 3-retry verification after injection

**3. Handle Tab Switch - PAUSE Task**
- Location: `src/state/currentTask.ts`
- When user switches tabs, task is PAUSED (status='interrupted')
- Prevents DOM mismatch errors from auto-following user

**4. Add Ping Handler to Content Script**
- Location: `src/helpers/pageRPC.ts`
- Handles `{ type: 'ping' }` messages
- Returns `{ pong: true, timestamp }` for health checks

### Phase 2: Background-Centric Architecture ✅

- **TaskOrchestrator.ts**: Central task management in service worker
- **PusherService.ts**: WebSocket in background, survives side panel close
- **TaskProvider.tsx**: React context for UI components
- **Single source of truth**: `chrome.storage.local['background_task_state']`

### Phase 3: Multi-Tab & Error Recovery ✅

**Multi-Tab Support:**
- Per-tab task contexts (`Record<tabId, TabTaskState>`)
- Concurrent task limit (default max 3)
- Tab lifecycle handling
- Auto-pause option

**Error Recovery:**
- 8 error categories with handling strategies
- Automatic retry with exponential backoff
- Content script recovery
- Service worker restart recovery
- Persistent error log

### Phase 4: Storage-First ✅

The fundamental shift: **Stop syncing state. Share a single source of truth.**

**Storage Schema:**
```typescript
{
  "session_123": {           // Per-tab session (tabId = 123)
    tabId: 123,
    url: "https://...",
    sessionId: "...",
    taskId: "...",
    status: "running" | "paused" | "idle" | "success" | "error",
    messages: [...],
    displayHistory: [...],
    unreadCount: 0
  },
  "active_tab_id": 123,
  "connection_state": { connected: true, subscriptions: {...} },
  "global_settings": { maxConcurrentTasks: 3, ... }
}
```

**Key Changes:**

| Before | After |
|--------|-------|
| State in Zustand + storage + SW | **Single source in chrome.storage** |
| Tab switch = re-fetch, re-sync | **Just read different key** |
| N WebSocket channels per tab | **One multiplexed socket** |
| Message passing between components | **Observer pattern** |

---

# Part II: Client-Side Architecture

## 2.1 Overview & Implementation Status

**✅ All Core Features Complete (Tasks 1-10):**

1. **Task 1: Authentication & API Client** ✅ — Login, Bearer token, session check, logout
2. **Task 2: Runtime Knowledge Resolution** ✅ — Knowledge resolve API, overlay, tab trigger
3. **Task 3: Server-Side Action Loop** ✅ — Backend API action loop, display-only history, taskId
4. **Task 4: Basic Accessibility Tree Extraction** ✅ — CDP, AX tree, DOM fallback
5. **Task 5: Accessibility Node Filtering** ✅ — Interactive filtering, DOM pipeline
6. **Task 6: Accessibility-DOM Element Mapping** ✅ — Bidirectional mapping, action targeting
7. **Task 7: Hybrid Element Representation** ✅ — Unified element type, merge logic
8. **Task 8: Accessibility-First Element Selection** ✅ — AX-first strategy, 25–35% token reduction
9. **Task 9: Documentation Consolidation** ✅
10. **Task 10: Reasoning Layer Client Support** ✅ — Popup/dropdown, NEEDS_USER_INPUT, pause/resume

## 2.2 Technology Stack

**Frontend:** React 18, TypeScript, Chakra UI v2.8.2, Zustand + Immer, React Icons  
**Browser APIs:** Chrome Extension Manifest V3, Debugger API, DevTools Protocol, Storage, Tabs  
**Build:** Webpack 5, Babel, multiple entry points

## 2.3 Extension Contexts

1. **UI Contexts (Side Panel, Popup, Panel)** - React + Chakra UI, Zustand state, API client
2. **Background Service Worker** - TaskOrchestrator, PusherService, TabTaskManager, ErrorRecovery
3. **Content Script** - DOM extraction, action execution, RPC handler, health ping
4. **Page Context** - Accessed via Chrome Debugger API

## 2.4 Communication Patterns

**UI ↔ Storage (Phase 4):**
```typescript
// UI subscribes to storage
const { session } = useActiveSession();  // Auto-updates on storage.onChanged

// UI sends commands to background
chrome.runtime.sendMessage({ type: 'TASK_COMMAND', command: {...} });
```

**Background → Storage → UI:**
```typescript
// Background writes to storage
await chrome.storage.local.set({ [key]: updated });
// UI auto-updates via observer pattern
```

## 2.5 Data Flow Architecture

**Task Execution (Storage-First):**

1. User enters instructions → UI sends `START_TASK` command
2. Background TaskOrchestrator receives command
3. Content script extracts DOM (with health check)
4. Background calls `POST /api/agent/interact`
5. Response parsed, action executed
6. State written to `chrome.storage.local`
7. UI auto-updates via `storage.onChanged`
8. Repeat until `finish()` or `fail()`

**Tab Switch (Storage-First):**

```
User clicks Tab B
└── chrome.tabs.onActivated fires
    └── Background updates active_tab_id in storage
        └── UI reads storage["session_B"]
            └── INSTANT. No network. No sync.
```

## 2.6 Action System

**Available Actions:** `click(id)`, `setValue(id, text)`, `finish()`, `fail()`, `ask_user()`

**Execution Flow:**
1. Action string parsed
2. Element located (AX mapping or DOM)
3. Chrome Debugger API attached
4. Action executed
5. Visual feedback (ripple)
6. Result captured
7. Debugger detached

## 2.7 DOM Processing Pipeline

**Stages:**
1. DOM extraction (content script)
2. Accessibility tree extraction (CDP)
3. AX node filtering (interactive only)
4. AX-DOM mapping
5. Hybrid element creation
6. Accessibility-first selection
7. DOM simplification
8. HTML templatization

**Token Optimization:** 25-35% reduction via accessibility-first strategy

## 2.8 Reasoning Layer Client Support

**Data Structures:**
```typescript
interface ReasoningData {
  source: 'MEMORY' | 'PAGE' | 'WEB_SEARCH' | 'ASK_USER';
  confidence: number;
  reasoning: string;
  missingInfo?: MissingInfoField[];
  evidence?: ReasoningEvidence;
}
```

**NEEDS_USER_INPUT Handling:**
1. Response detected → userQuestion stored
2. Task paused (status: 'idle')
3. UserInputPrompt displayed
4. User provides input → task resumes

## 2.9 Debug View Architecture

- **DebugPanel**: Collapsible bottom panel with accordion sections
- **TaskHistoryUser** vs **TaskHistoryDebug**: User-facing vs technical views
- **developerMode**: Toggle controls visibility
- **Features**: NetworkTraceView, RAGContextView, StateInspectorView, session export

## 2.10 Critical Fixes (Issues 1-7)

| Issue | Problem | Solution |
|-------|---------|----------|
| Service Worker Death | 30s timeout kills long API calls | Heartbeat keep-alive pattern |
| Payload Explosion | 6MB+ DOM exceeds limits | Client-side stripping (87% reduction) |
| State Wipe on Navigation | Content script dies | Persist to chrome.storage |
| Tab Switching Breaks RPC | tabId not passed | Explicit tabId in all RPC calls |
| Navigation Timing | DOM not ready | Multi-layer retry, null guards |
| Script Injection Fails | Missing permissions | Added host_permissions |
| Stale taskId | Old taskId cached | Clear storage on new task |

---

# Part III: Storage-First Architecture (Phase 4)

## 3.1 The Fundamental Shift

**Problem:** Your issues stem from trying to "sync" state between components.  
**Solution:** Stop syncing. Share a single source of truth.

**Treat `chrome.storage.local` as your Redux Store:**
- Writers (Background) ONLY write to storage, never send messages to UI
- Readers (Side Panel) ONLY read from storage via subscriptions
- Zero synchronization logic - UI always reflects storage

## 3.2 Storage Schema

```typescript
const STORAGE_KEYS = {
  SESSION_PREFIX: 'session_',      // Per-tab: session_{tabId}
  ACTIVE_TAB: 'active_tab_id',     // Currently viewed tab
  CONNECTION_STATE: 'connection_state',  // WebSocket status
  GLOBAL_SETTINGS: 'global_settings',    // User preferences
  PENDING_NOTIFICATIONS: 'pending_notifications'
};

interface TabSession {
  tabId: number;
  url: string;
  sessionId: string | null;
  taskId: string | null;
  status: 'idle' | 'running' | 'paused' | 'success' | 'error' | 'interrupted';
  actionStatus: string;
  instructions: string;
  messages: ChatMessage[];
  displayHistory: DisplayHistoryEntry[];
  lastActivityAt: number;
  unreadCount: number;
}
```

## 3.3 Multiplexed WebSocket

**One Socket, Multiple Tabs:**
```typescript
// Instead of N channels per tab:
// ONE Pusher socket, route by tabId

interface MessageEnvelope {
  tabId: number;
  sessionId: string;
  type: 'message' | 'task_update' | 'interact_response';
  payload: unknown;
}

// Handler writes to storage, never sends to UI
async routeMessage(tabId, payload) {
  await routeIncomingMessage(tabId, message);
  // storage.onChanged fires → UI auto-updates
}
```

## 3.4 React Hooks (Observer Pattern)

```typescript
// Main hook - subscribe to active tab's session
const { session, tabId, switchTab } = useActiveSession();

// Messages - auto-updates on storage change
const { messages, addMessage } = useActiveMessages();

// Connection status
const { state } = useConnectionState();

// All sessions for tab overview
const { sessions, unreadByTab } = useAllSessions();

// Task status convenience
const { status, isRunning, isPaused } = useTaskStatus();

// Browser tab sync
useBrowserTabSync();  // Auto-sync active tab with Chrome tabs API
```

## 3.5 Message Flows

**Tab Switch:**
```
1. User clicks Tab B
2. chrome.tabs.onActivated fires
3. setActiveTabId(B) writes to storage
4. UI re-renders via useActiveSession()
5. Reads from storage["session_B"]
6. INSTANT. No network. No sync.
```

**Message Received:**
```
1. WebSocket receives { tabId: A, payload: {...} }
2. MultiplexedSocket.routeMessage(A, payload)
3. routeIncomingMessage(A, message)
4. chrome.storage.local.set({ session_A: updated })
5. If user on Tab A: storage.onChanged → UI re-renders
6. If user on Tab B: unreadCount++ → badge shows
7. User switches to Tab A later → data waiting
```

## 3.6 Why This Fixes Issues

| Issue | Root Cause | Storage-First Fix |
|-------|------------|-------------------|
| Tab switch desync | useEffect re-fetch chains | Just read different key |
| "Suddenly stops" | SW death kills socket | Writes to storage survive |
| Message lost on close | State in React | State in chrome.storage |
| Multiple sources | Zustand + storage + SW | Storage is ONLY truth |
| useEffect chains | Trying to "sync" | Observer pattern only |
| N channels overhead | Per-tab channels | One multiplexed socket |

---

# Part IV: Enterprise & Platform Specification

## 4.1 Overview

**Target:** Commercial B2B enterprise platform  
**Core Value:** Zero-disruption deployment, enterprise security, contextual intelligence (RAG)

## 4.2 Infrastructure

- **API Server:** Node.js/TypeScript with Next.js (App Router)
- **Database:** MongoDB (Mongoose ODM)
- **Auth:** Better Auth (Prisma)
- **Vector DB:** MongoDB Atlas Vector Search (or Pinecone/Weaviate)
- **Cache:** Redis for sessions
- **Queue:** Bull/BullMQ for background jobs
- **Storage:** S3/Blob for documents

## 4.3 Multi-Tenant Architecture

**Tenant Isolation:**
- Schema-level isolation (recommended)
- Row-level security (alternative)
- All queries filter by tenantId

**Security:**
- SSO/SAML + JWT tokens
- RBAC with permissions model
- Domain allowlists
- Audit logging
- Encryption at rest

## 4.4 RAG Pipeline

**Flow:**
1. Document ingestion (PDF, DOCX, Markdown)
2. Text extraction → Chunking → Embedding
3. Vector storage (MongoDB Atlas Vector Search)
4. Query-time retrieval (semantic + keyword)
5. LLM context injection with citations

## 4.5 Thin Client Migration

The extension is a **Thin Client**:
- **Client:** DOM extraction, action execution
- **Server:** LLM inference, RAG, action history
- **Auth:** Bearer token (no API keys in extension)

---

# Part V: Manus Orchestrator

*Server-side Reason–Act–Verify orchestrator. Client display is in Part II.*

**Philosophy:** Proactive plan → execute → verify → self-correct

**Components:**
- **Planning Engine:** Linear steps with LLM
- **Verification Engine:** DOM + semantic LLM
- **Self-Correction Engine:** Retry strategies

**State:**
- taskId, status, plan, currentStepIndex
- verificationHistory, correctionHistory

**API Response:** Includes plan, currentStep, totalSteps, verification, correction, expectedOutcome

---

# Part VI: Reasoning Layer

*Server-side 4-step reasoning pipeline.*

**Pipeline:**
1. **Context & Gap Analysis:** Query, URL, history, page summary → source, missingInfo, confidence
2. **Execution:** MEMORY/PAGE → proceed; WEB_SEARCH → iterate; ASK_USER → pause
3. **Evaluation & Iteration:** Evaluate results, refine query
4. **Final Verification:** canProceed, missingInformation, userQuestion

**Client Support:**
- ReasoningBadge (source, confidence)
- EvidenceIndicator (quality, gaps)
- UserInputPrompt (pause/resume)

---

# Part VII: Quick Reference

## 7.1 Key Files (Phase 4 Architecture)

**Background Services:**
```
src/pages/Background/
├── TaskOrchestrator.ts    - Central task management
├── TabTaskManager.ts      - Multi-tab support
├── PusherService.ts       - WebSocket in background
├── ErrorRecovery.ts       - Error classification & recovery
└── index.ts               - Message routing, tab handlers
```

**State Management (Storage-First):**
```
src/state/
├── StorageFirstManager.ts     - Storage-as-database layer
├── MultiplexedSocket.ts       - Single WebSocket with tabId routing
├── useStorageSubscription.ts  - React hooks for storage binding
├── taskBridge.ts              - Commands to background
├── pusherBridge.ts            - Pusher commands
├── multiTabBridge.ts          - Multi-tab hooks
├── errorRecoveryBridge.ts     - Error recovery hooks
└── TaskProvider.tsx           - React context provider
```

**Legacy (still in use):**
```
src/state/store.ts, currentTask.ts, settings.ts, ui.ts, debug.ts
src/api/client.ts
src/helpers/simplifyDom, parseAction, domActions, chromeDebugger, accessibility*.ts
src/common/TaskUI, ChatStream, Login, KnowledgeOverlay, DebugPanel
```

## 7.2 Patterns

### Storage-First
```typescript
// Subscribe to state
const { session } = useActiveSession();
const { messages } = useActiveMessages();

// Send commands
chrome.runtime.sendMessage({ type: 'TASK_COMMAND', command: {...} });
```

### Split Selectors (Zustand)
```typescript
// ✅ CORRECT
const value = useAppState((state) => state.settings.value);

// ❌ WRONG - Causes infinite loops
const state = useAppState((state) => ({ value: state.settings.value }));
```

### useColorModeValue
```typescript
// ✅ At component top level
const bg = useColorModeValue('white', 'gray.900');

// ❌ Not in render loops
```

### Type Safety
```typescript
// ✅ Always validate before rendering
{typeof value === 'string' ? value : String(value || '')}
```

### useEffect Dependencies
```typescript
// ✅ Don't include Zustand actions (stable references)
useEffect(() => { loadMessages(id); }, [id]);
```

## 7.3 Critical Safety Nets

1. **Always pass tabId to RPC calls**
2. **Clear storage on new task**
3. **Guard against null DOM**
4. **Keep-alive for long operations**
5. **Retry with exponential backoff**
6. **Adaptive DOM size limits** (see §7.6)
7. **No `window` in Service Worker** (see §7.7)
8. **No session switch during active task** (see §7.8)

## 7.4 Error Categories

| Category | Retryable | User Message |
|----------|-----------|--------------|
| `network` | ✅ 3x | "Network connection issue. Will retry." |
| `content_script` | ✅ 5x | "Page connection lost. Reconnecting..." |
| `dom` | ✅ 4x | "Page content not ready. Waiting..." |
| `rate_limit` | ✅ 3x | "Rate limited. Waiting..." |
| `api` | ✅ 3x | "Server unavailable. Retrying..." |
| `auth` | ❌ | "Authentication required." |
| `tab` | ❌ | "Tab not accessible." |

## 7.5 Migration Guide

```tsx
// BEFORE (Phase 2/3 - message passing)
import { useTask } from '../state/TaskProvider';
const { messages, status, startTask } = useTask();

// AFTER (Phase 4 - storage subscription)
import { useActiveSession, useActiveMessages } from '../state/useStorageSubscription';
const { session, updateSession } = useActiveSession();
const { messages, addMessage } = useActiveMessages();
const status = session?.status || 'idle';
```

## 7.6 Adaptive DOM Size Limits

**Problem:** Fixed 50k character cap could truncate interactive elements on complex enterprise pages (Salesforce, HubSpot).

**Solution:** Adaptive sizing in `src/api/client.ts`:

| DOM Size | Behavior |
|----------|----------|
| ≤ 50k chars | Use 50k limit (efficient for most pages) |
| > 50k chars | Extend to 200k limit (captures all interactive elements) |
| > 200k chars | Truncate at 200k + log warning |

```typescript
const DEFAULT_DOM_LIMIT = 50000;
const EXTENDED_DOM_LIMIT = 200000;

let domLimit = DEFAULT_DOM_LIMIT;
if (dom.length > DEFAULT_DOM_LIMIT) {
  domLimit = EXTENDED_DOM_LIMIT;
  console.log(`[ApiClient] DOM exceeds 50k, using extended 200k limit`);
}
```

**Why 200k?** Ensures a "Save" button at character 65,000 on a complex page won't be lost, while still protecting against payload explosion (hard limit is 4MB in `payloadValidation.ts`).

## 7.7 Service Worker Constraints

**Problem:** Service Worker registration failed (Status code 15) because `pusher-js` uses `window` which doesn't exist in Service Workers.

**Root Cause:** Background service worker imported `PusherService.ts` which imports `pusher-js`. The library requires browser `window` context.

**Solution:** Removed Pusher import from background. WebSocket/Pusher runs in **Side Panel context** (browser window) where `window` is available.

```
┌─────────────────────────────────────────────────────────────────┐
│  Service Worker (Background)     │  Side Panel (Browser Context)│
├──────────────────────────────────┼──────────────────────────────┤
│  ✅ chrome.* APIs                │  ✅ window object            │
│  ✅ chrome.storage.local         │  ✅ pusher-js / WebSocket    │
│  ✅ Task orchestration           │  ✅ React UI                 │
│  ❌ window (undefined)           │  ✅ usePusher hook           │
│  ❌ DOM APIs                     │  ✅ localStorage             │
│  ❌ pusher-js                    │                              │
└──────────────────────────────────┴──────────────────────────────┘
```

**Background now delegates** Pusher commands to storage for UI to pick up:

```typescript
// Background stores command intent
await chrome.storage.local.set({
  pusher_command: { type: 'CONNECT', sessionId, timestamp: Date.now() }
});

// Side Panel picks up and executes via usePusher hook
```

**Files Changed:**
- `src/pages/Background/index.ts` - Removed `PusherService` import, added lightweight command handler
- `src/pages/Background/PusherService.ts` - No longer imported by background (still exists for reference)

## 7.8 Cross-Domain Navigation During Tasks

**Problem:** Multi-step tasks like "Go to Google, search for X, click Y" fail because:
1. Session selection changes can interrupt task context (especially when switching tabs mid-run)
2. Content script dies on navigation
3. WebSocket gets closed/reconnected mid-task
4. Task context is lost

**Symptoms:**
- `Cannot read properties of null (reading 'querySelectorAll')`
- `WebSocket is already in CLOSING or CLOSED state`
- `Receiving end does not exist`
- Task works for first action, fails on subsequent actions

**Solution:** Three-pronged fix:

### 1. Skip Session Switch During Active Task

**File:** `src/common/App.tsx`

```typescript
const handleTabUrlChange = async (tabId: number, url: string) => {
  // SAFETY: If a task is running on a different tab, don't switch the UI's session.
  // This avoids breaking multi-step automation that navigates across domains within the task tab.
  const currentStatus = useAppState.getState().currentTask.status;
  if (currentStatus === 'running') {
    const activeTaskTabId = useAppState.getState().currentTask.tabId;
    if (typeof activeTaskTabId === 'number' && activeTaskTabId !== tabId) {
      console.debug('[App] Skipping tab session switch - task is running on another tab.');
      return;
    }
  }

  await switchToTabSession(tabId, url);
};
```

### 2. Proper Navigation Wait

**File:** `src/helpers/actionExecutors.ts`

```typescript
async function waitForTabComplete(tabId: number, timeoutMs: number = 15000): Promise<boolean> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve(false);
    }, timeoutMs);
    
    const listener = (updatedTabId: number, changeInfo: chrome.tabs.TabChangeInfo) => {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        clearTimeout(timeout);
        chrome.tabs.onUpdated.removeListener(listener);
        resolve(true);
      }
    };
    
    chrome.tabs.onUpdated.addListener(listener);
  });
}

export async function executeNavigate(args: { url: string }) {
  await chrome.storage.local.set({ isNavigating: true });
  await chrome.tabs.update(tabId, { url: args.url });
  await waitForTabComplete(tabId, 15000);
  await chrome.storage.local.set({ isNavigating: false });
  await sleep(1000); // Buffer for content script init
}
```

### 3. DOM Safety Checks

**File:** `src/pages/Content/getAnnotatedDOM.ts`

The DOM extraction function already has guards against null document during navigation:
- Checks `document.documentElement` exists
- Checks `document.readyState` isn't 'loading'
- Returns `null` instead of crashing (triggers retry in caller)

**Files Changed:**
- `src/common/App.tsx` - Added task status check in `handleUrlChange`
- `src/state/sessions.ts` - Tab-scoped session mapping (`tabSessionMap`), `switchToTabSession()`
- `src/helpers/actionExecutors.ts` - Improved `executeNavigate` to wait for page load
- `src/helpers/simplifyDom.ts` - Already has retry logic with exponential backoff

---

**Document Status:** Consolidated - All architecture docs merged  
**Last Updated:** January 29, 2026  
**Version:** 2.2
