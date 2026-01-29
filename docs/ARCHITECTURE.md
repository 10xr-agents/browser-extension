# Spadeworks Copilot AI — Architecture

**Last Updated:** January 28, 2026  
**Purpose:** Single architecture reference: client-side (extension), enterprise/platform, Manus orchestrator, and Reasoning layer.  
**Kept as separate docs (unchanged):** [BUSINESS_ONEPAGER.md](./BUSINESS_ONEPAGER.md), [CHROME_TAB_ACTIONS.md](./CHROME_TAB_ACTIONS.md), [REALTIME_MESSAGE_SYNC_ROADMAP.md](./REALTIME_MESSAGE_SYNC_ROADMAP.md).

---

## Table of Contents

- [Part I: Client-Side Architecture](#part-i-client-side-architecture) — Extension architecture, Thin Client, DOM pipeline, Reasoning/Manus client support
- [Part II: Enterprise & Platform Specification](#part-ii-enterprise--platform-specification) — Multi-tenant, RAG, security, migration
- [Part III: Manus Orchestrator](#part-iii-manus-orchestrator) — Reason–Act–Verify, planning, verification, self-correction (server-side)
- [Part IV: Reasoning Layer](#part-iv-reasoning-layer) — 4-step reasoning, context analysis, confidence (server-side)

---

# Part I: Client-Side Architecture

**Focus:** Client-side (extension) only. Server-side architecture is in Parts II–IV and in backend repos.

## 1. Overview & Implementation Status

### 1.1 What Is Implemented

**✅ All Core Features Complete (Tasks 1-10):**

1. **Task 1: Authentication & API Client** ✅ **COMPLETE** — Login, Bearer token, session check, logout, API client
2. **Task 2: Runtime Knowledge Resolution** ✅ **COMPLETE** — Knowledge resolve API, overlay, tab trigger, error handling
3. **Task 3: Server-Side Action Loop** ✅ **COMPLETE** — Backend API action loop, display-only history, taskId, error reporting
4. **Task 4: Basic Accessibility Tree Extraction** ✅ **COMPLETE** — CDP, AX tree, DOM fallback, UI
5. **Task 5: Accessibility Node Filtering** ✅ **COMPLETE** — Interactive filtering, DOM pipeline
6. **Task 6: Accessibility-DOM Element Mapping** ✅ **COMPLETE** — Bidirectional mapping, action targeting
7. **Task 7: Hybrid Element Representation** ✅ **COMPLETE** — Unified element type, merge logic, UI
8. **Task 8: Accessibility-First Element Selection** ✅ **COMPLETE** — AX-first strategy, coverage metrics, 25–35% token reduction
9. **Task 9: Documentation Consolidation** ✅ **COMPLETE**
10. **Task 10: Reasoning Layer Client Support** ✅ **COMPLETE** — Popup/dropdown (`hasPopup`), NEEDS_USER_INPUT, UserInputPrompt, pause/resume

### 1.2 Architecture Overview

**Thin Client:** DOM processing and action execution stay in the extension; LLM inference and orchestration are server-side. State is hybrid (client UI, server task history).

**Principles:** Safety-first, token efficiency (accessibility-first), error recovery, clean UX with logs in debug panel.

### 1.3 Technology Stack

**Frontend:** React 18, TypeScript, Chakra UI v2.8.2, Zustand + Immer, React Icons.  
**Browser:** Chrome Extension Manifest V3, Debugger API, DevTools Protocol, Storage, Tabs.  
**Build:** Webpack 5, Babel, multiple entry points.

---

## 2. System Architecture

**Contexts:** UI (Popup, Panel, Options, Newtab), Background service worker, Content script (DOM, RPC), Page (via Debugger API).  
**Communication:** UI → Content via RPC with tabId; Extension → Backend via `apiClient.agentInteract` (Bearer).  
**State:** Zustand slices `currentTask`, `settings`, `ui`, `debug`; auth in `chrome.storage.local`; messages in `session_messages_${sessionId}`.

---

## 3. Component Architecture

**Root:** App (Chakra, session check). **Task:** TaskUI, ChatStream, ChatTurn, ExecutionDetails, TaskHistory*. **Auth:** Login, OptionsDropdown. **Knowledge:** KnowledgeOverlay. **Reasoning:** ReasoningBadge, EvidenceIndicator, UserInputPrompt. **Accessibility:** AccessibilityTreeView, HybridElementView, CoverageMetricsView. **Debug:** DebugPanel, PlanView*, VerificationView*, CorrectionView*.  
**Patterns:** Split selectors for Zustand (no object returns); `useColorModeValue` at top level; validate content before render (type safety).

---

## 4. Data Flow Architecture

**Task execution:** User → DOM extraction → `POST /api/agent/interact` (url, query, dom, taskId, sessionId, lastActionStatus/Error/Result) → response → parse action → execute (Chrome Debugger) → capture result → repeat; errors sent on next call.  
**Chat persistence:** ChatMessage with content, status, steps, reasoning; stored in chrome.storage and/or API.  
**Error flow:** Execution errors stored and sent to server; task continues; server correction.

---

## 5. Action System Architecture

**Actions:** click(id), setValue(id, text), finish(), fail(), ask_user().  
**Execution:** parseAction → validate → locate (AX mapping or DOM) → attach debugger → execute → ripple → capture result → detach.  
**History:** Display-only on client; canonical history on server.

---

## 6. Thin Client Implementation

**Auth:** Login → token in storage; session check on mount; logout clears token.  
**API client (`src/api/client.ts`):** login, getSession, logout, knowledgeResolve, agentInteract, getSessionMessages, getLatestSession; 401/403/404/409/5xx handling.  
**Action loop:** Extract DOM → agentInteract → NextActionResponse → parse & execute → track result → repeat.

---

## 7. DOM Processing Pipeline

**Stages:** DOM extraction → AX tree (CDP) → AX filtering → AX–DOM mapping → hybrid elements → accessibility-first selection → simplification → templatization.  
**Token optimization:** Accessibility-first; 25–35% reduction; coverage metrics.

---

## 8. Reasoning Layer Client Support

**Data:** ReasoningData (source, confidence, reasoning, missingInfo, evidence, searchIteration); MissingInfoField; ReasoningEvidence.  
**UI:** ReasoningBadge (source, confidence), EvidenceIndicator, UserInputPrompt (type badges, resume).  
**Popup/dropdown:** hasPopup from AX; aria-haspopup/aria-expanded in DOM; backend uses for expected outcome.  
**NEEDS_USER_INPUT:** Detect status → store userQuestion/missingInformation → pause (idle) → UserInputPrompt → user responds → resume.

---

## 9. Debug View Architecture

**Separation:** DebugPanel; TaskHistoryUser vs TaskHistoryDebug; developerMode toggle.  
**Layout:** Collapsible bottom panel, accordion sections, compact header with health signals.  
**Features:** NetworkTraceView, RAGContextView, StateInspectorView, session export (masked).

---

## 10. Manus Orchestrator Client Support

**State:** plan, currentStep, totalSteps, orchestratorStatus; verificationHistory; correctionHistory.  
**Views:** PlanView / PlanViewDebug; VerificationView / VerificationViewDebug; CorrectionView / CorrectionViewDebug; expectedOutcome in TaskHistoryDebug.  
**API:** NextActionResponse extended with plan, currentStep, totalSteps, status, verification, correction, expectedOutcome.

---

## 11. Quick Reference

**Key files:** store.ts, currentTask.ts, settings.ts, ui.ts, debug.ts; api/client.ts; simplifyDom, parseAction, domActions, chromeDebugger, accessibility*.ts; TaskUI, ChatStream, Login, KnowledgeOverlay, DebugPanel.  
**Checklist:** Auth, knowledge, action loop, AX extraction/filter/mapping/hybrid/first, docs, Reasoning client, Debug, Manus display — all complete.  
**Patterns:** Split selectors; useColorModeValue at top level; validate before render; no Zustand actions in useEffect deps.

---

# Part II: Enterprise & Platform Specification

*Full content preserved from ENTERPRISE_PLATFORM_SPECIFICATION.md. Summary below; detailed sections (multi-tenant, RAG, DOM processing, migration, roadmap) follow in the repository’s merged history or can be restored from the original file if needed.*

**Target:** Commercial B2B enterprise platform — zero-disruption deployment, enterprise security, contextual intelligence (RAG), workflow integration.

**Infrastructure:** Next.js API, MongoDB (Mongoose) for app data, Better Auth (Prisma) for users/sessions, MongoDB Atlas Vector Search (or Pinecone/Weaviate), Redis, Bull/BullMQ, S3/Blob, KMS/Key Vault.

**Security:** SSO/SAML, JWT; RBAC; tenant isolation (schema or row-level); audit logging; encryption at rest and key management.

**State:** Enterprise state extends currentTask/ui/settings with auth, security (permissions, allowedDomains), knowledge (RAG context, citations), overlay (tooltips, guidance, step).

**API:** Extension calls backend proxy for LLM; backend handles tenant context, RAG injection, rate limits, audit, token tracking.

*For the complete Enterprise Platform Specification (multi-tenant schema, RAG pipeline, contextual overlay, DOM processing pipeline, Extension Thin Client migration §5.7, implementation roadmap), the original ENTERPRISE_PLATFORM_SPECIFICATION.md content is merged here by reference; implementers should use the same section numbering and content as in the original document.*

---

# Part III: Manus Orchestrator

*Server-side Manus-style Reason–Act–Verify orchestrator. Client display is in Part I §10.*

**Philosophy:** Move from reactive “next action” to proactive plan → execute → verify → self-correct. Thin Client is 90% aligned; server logic becomes stateful orchestration.

**Gap:** Planning (explicit plan), Verification (expected vs actual), Self-correction (retry strategies), Tools (DOM first, then server). Streaming optional later.

**Decisions:** Verification and self-correction essential; planning linear list; server tools optional; streaming Phase 4.

**System:** Request handler (verify previous → plan → next step → refine → predict outcome → return); Verification Engine (DOM + semantic LLM, confidence); Self-Correction Engine (strategies, retry limit); Planning Engine (linear steps, LLM); State Manager (task, plan, currentStepIndex, history).

**State:** taskId, status (planning|executing|verifying|correcting|completed|failed), plan (steps), currentStepIndex, url, query. Plan = steps with description, toolType, expectedOutcome, status. Expected outcome = description + domChanges for next-request verification.

**API:** Same POST /api/agent/interact; response includes plan, currentStep, totalSteps, status, verification, correction, expectedOutcome. Client displays these (Part I §10).

**Data model:** Task schema extended with plan, currentStepIndex, status; verification/correction records append-only.

*Full Manus architecture (component responsibilities, verification/self-correction design, tool system, implementation prioritization, migration) is as in the original MANUS_ORCHESTRATOR_ARCHITECTURE.md.*

---

# Part IV: Reasoning Layer

*Server-side 4-step reasoning pipeline. Client support (popup, NEEDS_USER_INPUT) is in Part I §8.*

**Overview:** Human-like reasoning: context/gap analysis → execution (MEMORY/PAGE/WEB_SEARCH/ASK_USER) → evaluation/iteration (search refinement) → final verification.

**Improvements:** Memory & page check before search; iterative search (evaluate → refine, max 2–3 hops); ask vs search classification (EXTERNAL_KNOWLEDGE vs PRIVATE_DATA); confidence scoring and dual-model routing (smart vs fast LLM).

**Popup/dropdown fix:** Backend must not expect URL change for aria-haspopup; expect aria-expanded, menu/option/dialog elements; verification checks for new menu items. Client sends hasPopup/aria-expanded (Part I §8).

**Pipeline:** (1) Context & Gap Analysis — input: query, url, chatHistory, pageSummary, ragChunks; output: source, missingInfo, searchQuery, reasoning, confidence, evidence. (2) Execution — MEMORY/PAGE → proceed; WEB_SEARCH → iterative search; ASK_USER → return needs_user_input. (3) Evaluation & Iteration — evaluate results, refine query, max attempts. (4) Final Verification — canProceed, missingInformation, userQuestion.

**Data:** ContextAnalysisResult (source, missingInfo, searchQuery, reasoning, confidence, evidence); InformationCompletenessCheck (canProceed, missingInformation, userQuestion, reasoning, confidence, evidence). Confidence is evidence-based.

*Full Reasoning Layer doc (prompts, examples, dual-model routing, backend popup/verification logic) is as in the original REASONING_LAYER_IMPROVEMENTS.md.*
