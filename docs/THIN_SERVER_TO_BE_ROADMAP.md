# Thin Client Implementation: Server-Side Roadmap (Debug & Manus Orchestrator)

**Document Version:** 1.0  
**Date:** January 26, 2026  
**Status:** Implementation Plan  
**Source:** `DEBUG_VIEW_IMPROVEMENTS.md` (Debug View requirements), `MANUS_ORCHESTRATOR_ARCHITECTURE.md` (Manus orchestrator architecture)

**Sync:** This document is the **server-side implementation roadmap** for Debug View enhancements and Manus-style orchestrator. The **specifications** are:
- `DEBUG_VIEW_IMPROVEMENTS.md` — Debug View requirements (client-focused, but server provides debug data)
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` — Manus orchestrator architecture specification
- `SERVER_SIDE_AGENT_ARCH.md` — Current server-side agent architecture (to be enhanced)

Keep all documents in sync; on conflict, prefer this roadmap for implementation details, architecture docs for design decisions.

**Counterpart:** Client-side work is in `THIN_CLIENT_TO_BE_ROADMAP.md`. Debug and Manus tasks are **sequential**; server and client work for a given task ship together for end-to-end verification.

**Task Alignment:**
- **Part A (Debug):** Server Tasks 1-5 correspond to Client Tasks 1-5
- **Part B (Manus):** Server Tasks 6-10 correspond to Client Tasks 6-10
- Server and client tasks should be implemented together for each task number

---

## 1. Overview

This document is the **server-side** implementation roadmap for:
1. **Debug View Enhancements** (Tasks 1-5): Server-side support for debug UI improvements
2. **Manus-Style Orchestrator** (Tasks 6-10): Transformation from reactive to proactive agent execution

Each task covers **persistence (Mongoose schemas where needed)** and **API endpoint enhancements** only. We use **MongoDB** with **Prisma (Better Auth)** and **Mongoose (app)**; there are **no SQL migrations**. Extension (client) integration for the same features is described in `THIN_CLIENT_TO_BE_ROADMAP.md`.

### 1.1 Principles

- **Vertical slices:** Each task delivers the backend (DB + API) for one feature. No standalone "schema-only" or "API scaffolding-only" phases.
- **Strict sequencing:** Debug tasks (1-5) can be implemented independently. Manus tasks (6-10) are sequential: Task 7 depends on Task 6, Task 8 depends on Task 7, etc.
- **Tenant + domain isolation:** All DB and RAG access scoped by **Tenant ID** (from session) and **Active Domain** (from request URL) when org-specific. Follows existing patterns in `THIN_SERVER_ROADMAP.md` §1.1.

### 1.2 Prerequisites

- Next.js application (App Router) with deployment target (e.g. Vercel, Node server).
- **MongoDB** (Atlas recommended). **No PostgreSQL, no Drizzle.** See `THIN_SERVER_ROADMAP.md` §1.4 for DB stack.
- CORS configured to allow extension origin (`chrome-extension://<id>`) for `/api/auth/*`, `/api/v1/*`, `/api/agent/*`, `/api/knowledge/*`.
- Existing `POST /api/agent/interact` endpoint implemented (see `THIN_SERVER_ROADMAP.md` §4, `SERVER_SIDE_AGENT_ARCH.md` §4).

### 1.3 Database Stack (MongoDB, Prisma, Mongoose)

**Reference:** `THIN_SERVER_ROADMAP.md` §1.4 (Database Stack)

- **Prisma (Better Auth)** — Used **only** for auth: `User`, `Session`, `Account`, `Organization`, `Member`, `Invitation`, `Verification`. We **reuse** these; we **do not** add new auth tables.
- **Mongoose (Application data)** — Used for all app data. New schemas (debug logs, verification records, etc.) added as **Mongoose schemas** in `lib/models/`, not as Prisma models.

**Tenant:** In normal mode, tenant = **user** (`userId`). In organization mode, tenant = **organization** (`organizationId`). No separate `tenants` table. See `THIN_SERVER_ROADMAP.md` §1.4.

---

## Part A: Debug View Enhancements (Tasks 1-5)

**Objective:** Server-side support for enhanced debug UI. These tasks provide debug data and logging capabilities that the client-side Debug Panel (`DEBUG_VIEW_IMPROVEMENTS.md`) will consume.

**Reference:** `DEBUG_VIEW_IMPROVEMENTS.md` — Client-side debug UI requirements. Server provides the data/logs that the Debug Panel displays.

---

## Task 1: Debug Logging Infrastructure (Server)

**Objective:** Add server-side logging infrastructure to capture API request/response data, execution metrics, and error details for debug UI consumption.

**Deliverable:** Debug logging system that captures API traces, execution metrics, and errors. Logs stored in MongoDB for retrieval by debug UI.

**Reference:** 
- `DEBUG_VIEW_IMPROVEMENTS.md` §4.1 (API & Network Trace Inspector) — Server must log API request/response data for client debug view
- `THIN_CLIENT_TO_BE_ROADMAP.md` §3.1 (Network/API Trace Inspector) — Client displays logs from server

---

### 1.1 Persistence for Task 1

**New Mongoose Model: `debug_logs`**

**Purpose:** Store API request/response logs, execution metrics, and error details for debug UI.

**Fields:**
- `tenantId` (string, indexed) — Tenant isolation
- `taskId` (string, indexed) — Link to task (optional, for task-specific logs)
- `logType` (string, enum) — `'api_request'`, `'api_response'`, `'execution_metric'`, `'error'`
- `endpoint` (string) — API endpoint (e.g., `/api/agent/interact`)
- `method` (string) — HTTP method (e.g., `POST`)
- `requestData` (object) — Request payload (masked for sensitive fields)
- `responseData` (object) — Response payload
- `headers` (object) — Request headers (masked for Authorization)
- `statusCode` (number) — HTTP status code
- `duration` (number) — Request duration in milliseconds
- `timestamp` (Date, indexed) — When log was created
- `error` (object, optional) — Error details if request failed
- `metadata` (object, optional) — Additional debug metadata

**Indexes:**
- `{ tenantId, timestamp: -1 }` — For tenant-scoped log queries
- `{ taskId, timestamp: -1 }` — For task-specific log queries
- `{ tenantId, logType, timestamp: -1 }` — For filtered queries

**Why This Schema:**
Enables debug UI to display API traces, network logs, and execution metrics. Tenant isolation ensures multi-tenant security. Task linking enables task-specific debug views.

---

### 1.2 API Endpoint Enhancements (Task 1)

**Enhancement to Existing Endpoints:**

**1. `POST /api/agent/interact` Enhancement:**
- Add debug logging middleware that captures:
  - Request: `url`, `query`, `dom` (truncated for large DOMs), `taskId`
  - Response: `thought`, `action`, `usage`, `taskId`, `hasOrgKnowledge`
  - Headers: `Authorization` (masked), `Content-Type`
  - Duration: Request processing time
  - Status: HTTP status code
- Store log in `debug_logs` collection
- Link log to `taskId` if provided

**2. `GET /api/knowledge/resolve` Enhancement:**
- Add debug logging middleware that captures:
  - Request: `url`, `query`
  - Response: `hasOrgKnowledge`, `context` (truncated), `citations`
  - Headers: `Authorization` (masked)
  - Duration: Request processing time
  - Status: HTTP status code
- Store log in `debug_logs` collection

**3. New Endpoint: `GET /api/debug/logs`**
- **Purpose:** Retrieve debug logs for debug UI
- **Auth:** Bearer token
- **Query params:**
  - `taskId` (optional) — Filter by task
  - `logType` (optional) — Filter by log type
  - `limit` (optional, default: 100) — Max logs to return
  - `since` (optional) — Timestamp to filter logs after
- **Response:** Array of debug log objects
- **Tenant isolation:** Only returns logs for authenticated tenant

**Why These Enhancements:**
Enables debug UI to display API traces and network logs. New endpoint allows client to retrieve logs for display in Debug Panel.

---

### 1.3 Definition of Done / QA Verification (Task 1 — Server)

- [ ] Mongoose model `DebugLog` created with proper indexes
- [ ] Debug logging middleware added to `POST /api/agent/interact`
- [ ] Debug logging middleware added to `GET /api/knowledge/resolve`
- [ ] `GET /api/debug/logs` endpoint implemented with tenant isolation
- [ ] Logs include masked sensitive data (Authorization headers, API keys)
- [ ] Logs linked to `taskId` when available
- [ ] CORS configured for extension origin
- [ ] Tenant isolation verified (no cross-tenant log access)

**Exit criterion:** Task 1 complete when debug logging infrastructure is in place and logs can be retrieved by debug UI. Proceed to Task 2 only after sign-off.

---

## Task 2: RAG Context Debug Data (Server)

**Objective:** Enhance RAG resolution to provide detailed debug information about knowledge selection, domain matching, and RAG mode decisions.

**Deliverable:** RAG resolution returns detailed debug metadata about why org-specific vs public-only knowledge was used, domain matching results, and knowledge availability.

**Reference:**
- `DEBUG_VIEW_IMPROVEMENTS.md` §4.2 (RAG & Knowledge Context Debugger) — Server must provide RAG decision logic for debug UI
- `THIN_CLIENT_TO_BE_ROADMAP.md` §3.2 (RAG Context Debugger) — Client displays RAG context from server

---

### 2.1 Response Enhancement (Task 2)

**Enhancement to `POST /api/agent/interact` Response:**

**New Optional Field: `ragDebug`**
- `hasOrgKnowledge` (boolean) — Whether org-specific RAG was used
- `activeDomain` (string) — Resolved domain from URL
- `domainMatch` (boolean) — Whether domain matches `allowed_domains`
- `ragMode` (string) — `'org_specific'` | `'public_only'`
- `reason` (string) — Explanation of RAG mode decision
- `chunkCount` (number) — Number of chunks retrieved
- `allowedDomains` (array, optional) — Domain patterns for current tenant (for debug)

**Enhancement to `GET /api/knowledge/resolve` Response:**

**New Optional Field: `ragDebug`** (same structure as above)

**Why These Enhancements:**
Enables debug UI to display RAG context and decision logic. Helps developers understand why org-specific knowledge was or wasn't used.

---

### 2.2 Definition of Done / QA Verification (Task 2 — Server)

- [ ] `POST /api/agent/interact` response includes `ragDebug` field (optional)
- [ ] `GET /api/knowledge/resolve` response includes `ragDebug` field (optional)
- [ ] `ragDebug` includes domain matching information
- [ ] `ragDebug` includes RAG mode decision reason
- [ ] `ragDebug` includes chunk count
- [ ] Tenant isolation maintained (no cross-tenant domain patterns exposed)

**Exit criterion:** Task 2 complete when RAG debug data is available in API responses. Proceed to Task 3 only after sign-off.

---

## Task 3: Execution Metrics Collection (Server)

**Objective:** Collect execution metrics (timing, token usage, step counts) for debug UI display.

**Deliverable:** Execution metrics captured and stored with task actions. Metrics available via API for debug UI.

**Reference:** `DEBUG_VIEW_IMPROVEMENTS.md` §3.3 (Compact Headers) — Server must provide metrics for health signals display.

---

### 3.1 Metrics Collection (Task 3)

**Enhancement to `POST /api/agent/interact`:**

**Metrics to Capture:**
- Request processing time (total duration)
- LLM call duration (if applicable)
- RAG retrieval duration (if applicable)
- Token usage (`promptTokens`, `completionTokens`) — already in response
- Action count (from `task_actions` for current task)
- Step index (current step in task)

**Storage:**
- Store metrics in `task_actions` record (extend existing schema)
- Store aggregate metrics in `tasks` record (extend existing schema)

**Why This Enhancement:**
Enables debug UI to display execution metrics in health signals and detailed views. Helps developers understand performance characteristics.

---

### 3.2 Definition of Done / QA Verification (Task 3 — Server)

- [ ] Execution metrics captured in `POST /api/agent/interact`
- [ ] Metrics stored in `task_actions` records
- [ ] Aggregate metrics stored in `tasks` records
- [ ] Metrics include timing, token usage, action counts
- [ ] Metrics available in API responses for debug UI

**Exit criterion:** Task 3 complete when execution metrics are collected and available. Proceed to Task 4 only after sign-off.

---

## Task 4: Error Details Enhancement (Server)

**Objective:** Enhance error responses with detailed debug information for debug UI display.

**Deliverable:** Error responses include detailed error context, stack traces (in debug mode), and recovery suggestions.

**Reference:** `DEBUG_VIEW_IMPROVEMENTS.md` §4.5 (Session Export) — Error details needed for debug session export.

---

### 4.1 Error Response Enhancement (Task 4)

**Enhancement to Error Responses:**

**New Optional Field: `debugInfo` (only when debug mode enabled):**
- `errorType` (string) — Error classification
- `errorMessage` (string) — Detailed error message
- `stackTrace` (string, optional) — Stack trace (server-side only, not exposed to client in production)
- `context` (object) — Error context (request data, task state, etc.)
- `suggestions` (array, optional) — Recovery suggestions

**Error Types:**
- `VALIDATION_ERROR` — Request validation failed
- `LLM_ERROR` — LLM API call failed
- `RAG_ERROR` — RAG retrieval failed
- `EXECUTION_ERROR` — Action execution failed
- `AUTH_ERROR` — Authentication/authorization failed
- `RATE_LIMIT_ERROR` — Rate limit exceeded

**Why This Enhancement:**
Enables debug UI to display detailed error information. Helps developers diagnose issues. Stack traces only in debug mode for security.

---

### 4.2 Definition of Done / QA Verification (Task 4 — Server)

- [ ] Error responses include `debugInfo` field (when debug mode enabled)
- [ ] `debugInfo` includes error type, message, and context
- [ ] Stack traces only included in debug mode (not production)
- [ ] Error context includes relevant request/task data
- [ ] Recovery suggestions provided where applicable

**Exit criterion:** Task 4 complete when error responses include detailed debug information. Proceed to Task 5 only after sign-off.

---

## Task 5: Debug Session Export Support (Server)

**Objective:** Provide API endpoint to export complete debug session data for debugging and support.

**Deliverable:** `GET /api/debug/session/{taskId}/export` endpoint that returns complete debug session data.

**Reference:** `DEBUG_VIEW_IMPROVEMENTS.md` §4.5 (Session Export) — Server must provide session data for export.

---

### 5.1 New Endpoint: `GET /api/debug/session/{taskId}/export`

**Purpose:** Export complete debug session data for a specific task.

**Auth:** Bearer token

**Path Parameters:**
- `taskId` (string, required) — Task ID to export

**Response:**
- Complete task data including:
  - Task metadata (taskId, status, url, query, createdAt, updatedAt)
  - Action history (all `task_actions` for task)
  - Debug logs (all `debug_logs` for task)
  - Execution metrics (aggregate and per-action)
  - Error details (if any)
  - RAG context (if available)
- **Sensitive data:** API keys, tokens masked or excluded

**Tenant Isolation:**
- Only returns data for tasks owned by authenticated tenant
- 404 if task not found or not owned by tenant

**Why This Endpoint:**
Enables debug UI to export complete session data for debugging and support. Provides reproducible data for error investigation.

---

### 5.2 Definition of Done / QA Verification (Task 5 — Server)

- [ ] `GET /api/debug/session/{taskId}/export` endpoint implemented
- [ ] Endpoint returns complete task data (task, actions, logs, metrics)
- [ ] Sensitive data (API keys, tokens) masked or excluded
- [ ] Tenant isolation enforced (404 for cross-tenant access)
- [ ] CORS configured for extension origin
- [ ] Response format suitable for JSON file download

**Exit criterion:** Task 5 complete when debug session export endpoint is available. Debug View enhancements (Part A) complete. Proceed to Part B (Manus Orchestrator) only after sign-off.

---

## Part B: Manus-Style Orchestrator (Tasks 6-10)

**Objective:** Transform the server-side agent from reactive "next action" system to proactive "Reason-Act-Verify" orchestrator that matches the Manus AI philosophy.

**Reference:** `MANUS_ORCHESTRATOR_ARCHITECTURE.md` — Complete architecture specification for Manus-style orchestrator.

---

## Task 6: Planning Engine (Server)

**Objective:** Implement Planning Engine that generates high-level action plans before execution begins.

**Deliverable:** Planning Engine generates linear action plans from user instructions. Plans stored in `tasks.plan` field and reused across requests.

**Reference:**
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §5.4 (Planning Engine), §3.3 (Decision: Planning Can Be Simple)
- `THIN_CLIENT_TO_BE_ROADMAP.md` §6 (Task 6: Plan Display & Visualization) — Client displays plans from server

---

### 6.1 Persistence for Task 6

**Enhancement to Existing `tasks` Schema:**

**New Fields:**
- `plan` (object, optional) — Action plan structure:
  - `steps` (array) — Array of plan step objects
  - `currentStepIndex` (number, default: 0) — Current position in plan
  - `createdAt` (Date) — When plan was created
- `status` (string, enum) — Extended enum: `'planning'`, `'executing'`, `'verifying'`, `'correcting'`, `'completed'`, `'failed'`, `'interrupted'` (extends existing status enum)

**Plan Step Structure:**
- `index` (number) — Step index in plan
- `description` (string) — High-level step description (e.g., "Enter email address")
- `reasoning` (string, optional) — Why this step is needed
- `toolType` (string, enum) — `'DOM'` | `'SERVER'` | `'MIXED'`
- `status` (string, enum) — `'pending'` | `'active'` | `'completed'` | `'failed'`
- `expectedOutcome` (object, optional) — What should happen after this step (for verification)

**Why These Fields:**
Plan persistence enables resuming tasks and tracking progress. Step index tracks current position. Status enables state machine transitions.

---

### 6.2 Planning Engine Implementation (Task 6)

**Component: `lib/agent/planning-engine.ts`**

**Responsibilities:**
- Generate high-level action plan from user instructions
- Break down task into logical steps
- Determine tool type needed for each step
- Store plan in `tasks.plan` field

**Planning Process:**
1. Receive user instructions and current DOM
2. Use LLM to generate plan (linear list of steps)
3. Each step includes: description, reasoning, toolType, expectedOutcome
4. Store plan in database
5. Return plan in response (for debug UI)

**LLM Integration:**
- Reuse existing LLM client patterns (see `SERVER_SIDE_AGENT_ARCH.md` §4.6)
- Use lightweight model (e.g., GPT-4o-mini) for planning to reduce cost
- Include RAG context if available (see `SERVER_SIDE_AGENT_ARCH.md` §4.5)

**Plan Format:**
- Linear array of steps (no complex DAGs initially)
- Each step is independent (no dependencies initially)
- Can evolve to support dependencies later

**Why This Design:**
Simple linear plans are easier to implement and debug. Sufficient for most tasks. Complexity (dependencies, parallelism) can be added later if needed.

---

### 6.3 Integration with `POST /api/agent/interact` (Task 6)

**Enhancement to Existing Endpoint:**

**New Flow:**
1. Load task (existing)
2. **Check if plan exists:**
   - If no plan → Generate plan → Store in `tasks.plan` → Set status to `'executing'`
   - If plan exists → Use existing plan
3. Get current step from plan (using `currentStepIndex`)
4. Continue with existing execution flow

**Response Enhancement:**
- Include `plan` in response (for debug UI)
- Include `currentStep` and `totalSteps` (for progress tracking)
- Include `status` (explicit status: `'planning'`, `'executing'`, etc.)

**Backward Compatibility:**
- If `plan` is null (legacy task), generate plan on first request
- Existing clients ignore new fields (backward compatible)

**Why This Integration:**
Planning happens automatically when task is created. Plan is reused across requests. Backward compatible with existing tasks.

---

### 6.4 Definition of Done / QA Verification (Task 6 — Server)

- [ ] `tasks` schema extended with `plan` field
- [ ] `tasks.status` enum extended with orchestrator statuses
- [ ] Planning Engine component implemented (`lib/agent/planning-engine.ts`)
- [ ] Planning Engine generates linear action plans
- [ ] Plans stored in `tasks.plan` field
- [ ] `POST /api/agent/interact` generates plan on first request (if no plan exists)
- [ ] `POST /api/agent/interact` uses existing plan on subsequent requests
- [ ] Response includes `plan`, `currentStep`, `totalSteps`, `status`
- [ ] Backward compatibility maintained (existing tasks work)
- [ ] Tenant isolation verified (plans scoped by tenantId)

**Exit criterion:** Task 6 complete when Planning Engine generates and stores action plans. Proceed to Task 7 only after sign-off.

---

## Task 7: Verification Engine (Server)

**Objective:** Implement Verification Engine that compares expected vs actual state after each action.

**Deliverable:** Verification Engine verifies if actions achieved their expected outcomes. Verification results stored and used for self-correction.

**Reference:**
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §8 (Verification Architecture), §3.1 (Decision: Verification is Essential)
- `THIN_CLIENT_TO_BE_ROADMAP.md` §7 (Task 7: Verification Results Display) — Client displays verification results from server

---

### 7.1 Persistence for Task 7

**Enhancement to Existing `task_actions` Schema:**

**New Fields:**
- `expectedOutcome` (object, optional) — What should happen after this action:
  - `description` (string) — Natural language description
  - `domChanges` (object, optional) — DOM-based expectations:
    - `elementShouldExist` (string, optional) — Element selector
    - `elementShouldNotExist` (string, optional) — Element selector
    - `elementShouldHaveText` (object, optional) — `{ selector, text }`
    - `urlShouldChange` (boolean, optional)
- `domSnapshot` (string, optional) — DOM state when action was taken (for comparison)

**New Mongoose Model: `verification_records`**

**Purpose:** Store verification results for each action.

**Fields:**
- `tenantId` (string, indexed) — Tenant isolation
- `taskId` (string, indexed) — Link to task
- `stepIndex` (number) — Step index in plan
- `success` (boolean) — Whether verification passed
- `confidence` (number) — Confidence score (0-1)
- `expectedState` (object) — What was expected
- `actualState` (object) — What actually happened:
  - `domSnapshot` (string) — Current DOM
  - `url` (string) — Current URL
  - `extractedText` (string, optional) — Key text from page
  - `elementStates` (array, optional) — State of key elements
- `comparison` (object) — Detailed comparison results
- `reason` (string) — Explanation of verification result
- `timestamp` (Date, indexed) — When verification occurred

**Indexes:**
- `{ tenantId, taskId, stepIndex }` — For task-specific verification queries
- `{ tenantId, timestamp: -1 }` — For tenant-scoped queries

**Why These Schemas:**
Expected outcome enables verification. DOM snapshot enables comparison. Verification records provide audit trail and enable debugging.

---

### 7.2 Verification Engine Implementation (Task 7)

**Component: `lib/agent/verification-engine.ts`**

**Responsibilities:**
- Compare expected vs actual state
- Calculate confidence score
- Determine if step succeeded or failed
- Provide detailed verification report

**Verification Process:**
1. Receive previous action's `expectedOutcome` and current DOM
2. Extract actual state from current DOM
3. Perform DOM-based checks (element existence, text matching, URL changes)
4. Perform semantic verification (LLM-based analysis)
5. Calculate confidence score (weighted: DOM 40%, Semantic 60%)
6. Determine success (confidence >= 0.7 threshold)
7. Store verification result in `verification_records`

**Verification Strategies:**
- **DOM-Based Checks:** Fast, structural checks (element exists, text matches, URL changed)
- **Semantic Verification:** LLM analyzes if page state matches expectation (uses lightweight model for cost efficiency)
- **Hybrid Approach:** Combines both for speed and accuracy

**Why This Design:**
DOM checks are fast but brittle. Semantic verification is slow but robust. Combining both provides speed and accuracy. Confidence scoring enables nuanced decisions.

---

### 7.3 Integration with `POST /api/agent/interact` (Task 7)

**Enhancement to Existing Endpoint:**

**New Flow (at start of request):**
1. Load task and previous action (existing)
2. **If previous action exists and has `expectedOutcome`:**
   - Call Verification Engine to verify previous action
   - Store verification result in `verification_records`
   - **If verification failed:**
     - Trigger Self-Correction Engine (Task 8)
     - Return corrected action or retry
   - **If verification succeeded:**
     - Proceed to next step
3. Continue with existing execution flow

**Response Enhancement:**
- Include `verification` in response (if verification occurred):
  - `success` (boolean)
  - `confidence` (number)
  - `reason` (string)

**Why This Integration:**
Verification happens at start of each request (after client sends new DOM). Enables self-correction on failure. Provides verification results for debug UI.

---

### 7.4 Definition of Done / QA Verification (Task 7 — Server)

- [ ] `task_actions` schema extended with `expectedOutcome` and `domSnapshot` fields
- [ ] `verification_records` Mongoose model created with proper indexes
- [ ] Verification Engine component implemented (`lib/agent/verification-engine.ts`)
- [ ] Verification Engine performs DOM-based checks
- [ ] Verification Engine performs semantic verification (LLM-based)
- [ ] Verification Engine calculates confidence scores
- [ ] `POST /api/agent/interact` verifies previous action at start of request
- [ ] Verification results stored in `verification_records`
- [ ] Response includes `verification` field when applicable
- [ ] Tenant isolation verified (verification records scoped by tenantId)

**Exit criterion:** Task 7 complete when Verification Engine verifies actions and stores results. Proceed to Task 8 only after sign-off.

---

## Task 8: Self-Correction Engine (Server)

**Objective:** Implement Self-Correction Engine that analyzes verification failures and generates alternative approaches.

**Deliverable:** Self-Correction Engine generates correction strategies when verification fails. Failed steps are retried with alternative approaches.

**Reference:**
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §9 (Self-Correction Architecture), §3.2 (Decision: Self-Correction is Essential)
- `THIN_CLIENT_TO_BE_ROADMAP.md` §8 (Task 8: Self-Correction Display) — Client displays correction information from server

---

### 8.1 Persistence for Task 8

**New Mongoose Model: `correction_records`**

**Purpose:** Store self-correction attempts and strategies.

**Fields:**
- `tenantId` (string, indexed) — Tenant isolation
- `taskId` (string, indexed) — Link to task
- `stepIndex` (number) — Step index that failed
- `originalStep` (object) — Original step definition
- `correctedStep` (object) — Corrected step definition
- `strategy` (string, enum) — Correction strategy: `'ALTERNATIVE_SELECTOR'`, `'ALTERNATIVE_TOOL'`, `'GATHER_INFORMATION'`, `'UPDATE_PLAN'`, `'RETRY_WITH_DELAY'`
- `reason` (string) — Why correction was needed
- `attemptNumber` (number) — Retry attempt number (1, 2, 3, etc.)
- `timestamp` (Date, indexed) — When correction occurred

**Indexes:**
- `{ tenantId, taskId, stepIndex, attemptNumber }` — For tracking retry attempts
- `{ tenantId, timestamp: -1 }` — For tenant-scoped queries

**Enhancement to `tasks` Schema:**

**New Fields:**
- `maxRetriesPerStep` (number, default: 3) — Max retries per step
- `consecutiveFailures` (number, default: 0) — Track consecutive failures

**Why These Schemas:**
Correction records provide audit trail of retry attempts. Task-level retry limits prevent infinite loops. Strategy tracking enables analysis of correction effectiveness.

---

### 8.2 Self-Correction Engine Implementation (Task 8)

**Component: `lib/agent/self-correction-engine.ts`**

**Responsibilities:**
- Analyze verification failures
- Generate alternative correction strategies
- Select best strategy based on failure type
- Create corrected step with new approach
- Update plan if needed

**Correction Strategies:**
1. **ALTERNATIVE_SELECTOR:** Try different element selector
2. **ALTERNATIVE_TOOL:** Use different tool (e.g., keyboard instead of click)
3. **GATHER_INFORMATION:** Need more info before proceeding (e.g., search for company name)
4. **UPDATE_PLAN:** Plan assumptions were wrong, update plan
5. **RETRY_WITH_DELAY:** Simple retry with delay (timing issue)

**Correction Process:**
1. Receive failed step and verification result
2. Use LLM to analyze failure reason
3. Generate multiple correction strategies
4. Select best strategy based on failure type
5. Create corrected step with new approach
6. Store correction record
7. Return corrected action for retry

**LLM Integration:**
- Reuse existing LLM client patterns (see `SERVER_SIDE_AGENT_ARCH.md` §4.6)
- Use LLM to analyze failure and suggest correction
- Include RAG context if available

**Retry Limits:**
- Max retries per step: 3 (configurable)
- Max consecutive failures: 3 (configurable)
- After max retries: Mark step as failed, task as failed

**Why This Design:**
Different failures require different strategies. LLM analysis ensures intelligent corrections. Retry limits prevent infinite loops.

---

### 8.3 Integration with `POST /api/agent/interact` (Task 8)

**Enhancement to Existing Endpoint:**

**New Flow (when verification fails):**
1. Verification Engine determines failure (Task 7)
2. **Check retry limits:**
   - If max retries exceeded → Mark task as failed, return error
   - If retries available → Proceed to self-correction
3. **Call Self-Correction Engine:**
   - Analyze failure
   - Generate correction strategy
   - Create corrected step
4. **Update plan:**
   - Replace failed step with corrected step
   - Increment retry count
5. **Return corrected action:**
   - Client retries with corrected action
   - Don't advance to next step (retry same step)

**Response Enhancement:**
- Include `correction` in response (if self-correction occurred):
  - `strategy` (string)
  - `reason` (string)
  - `retryAction` (string) — Action to retry

**Why This Integration:**
Self-correction happens automatically when verification fails. Retries same step with alternative approach. Prevents task failure from single action failure.

---

### 8.4 Definition of Done / QA Verification (Task 8 — Server)

- [ ] `correction_records` Mongoose model created with proper indexes
- [ ] `tasks` schema extended with retry limit fields
- [ ] Self-Correction Engine component implemented (`lib/agent/self-correction-engine.ts`)
- [ ] Self-Correction Engine analyzes failures and generates strategies
- [ ] Self-Correction Engine supports multiple correction strategies
- [ ] `POST /api/agent/interact` triggers self-correction on verification failure
- [ ] Correction records stored in `correction_records`
- [ ] Retry limits enforced (max retries per step)
- [ ] Response includes `correction` field when applicable
- [ ] Tenant isolation verified (correction records scoped by tenantId)

**Exit criterion:** Task 8 complete when Self-Correction Engine handles failures and retries steps. Proceed to Task 9 only after sign-off.

---

## Task 9: Outcome Prediction (Server)

**Objective:** Implement Outcome Prediction Engine that predicts what should happen after each action.

**Deliverable:** Outcome Prediction Engine generates expected outcomes for each action. Expected outcomes stored with actions for verification.

**Reference:** `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §4.2 (Execution Flow) — Step 4: Predict Expected Outcome.

---

### 9.1 Outcome Prediction Engine Implementation (Task 9)

**Component: `lib/agent/outcome-prediction-engine.ts`**

**Responsibilities:**
- Predict what should happen after an action
- Generate expected outcome structure
- Store expected outcome with action

**Prediction Process:**
1. Receive tool action and plan step
2. Use LLM to predict expected outcome
3. Generate expected outcome structure:
   - Natural language description
   - DOM-based expectations (element exists, text matches, URL changes)
4. Store expected outcome with action (in `task_actions.expectedOutcome`)

**LLM Integration:**
- Reuse existing LLM client patterns (see `SERVER_SIDE_AGENT_ARCH.md` §4.6)
- Use lightweight model for prediction to reduce cost
- Include current DOM context for accurate prediction

**Why This Design:**
Expected outcomes enable verification. LLM prediction ensures accurate expectations. DOM-based expectations enable fast structural checks.

---

### 9.2 Integration with `POST /api/agent/interact` (Task 9)

**Enhancement to Existing Endpoint:**

**New Flow (before returning action):**
1. Generate action (existing flow)
2. **Call Outcome Prediction Engine:**
   - Predict what should happen after action
   - Generate expected outcome structure
3. **Store expected outcome:**
   - Save in `task_actions.expectedOutcome` field
   - Used for verification in next request

**Response Enhancement:**
- Include `expectedOutcome` in response:
  - `description` (string)
  - `domChanges` (object, optional)

**Why This Integration:**
Expected outcome is generated before action is returned. Stored with action for verification in next request. Enables proactive verification.

---

### 9.3 Definition of Done / QA Verification (Task 9 — Server)

- [ ] Outcome Prediction Engine component implemented (`lib/agent/outcome-prediction-engine.ts`)
- [ ] Outcome Prediction Engine generates expected outcomes
- [ ] Expected outcomes include natural language description
- [ ] Expected outcomes include DOM-based expectations
- [ ] `POST /api/agent/interact` generates expected outcome before returning action
- [ ] Expected outcome stored in `task_actions.expectedOutcome` field
- [ ] Response includes `expectedOutcome` field

**Exit criterion:** Task 9 complete when Outcome Prediction Engine generates expected outcomes. Proceed to Task 10 only after sign-off.

---

## Task 10: Step Refinement & Tool Routing (Server)

**Objective:** Implement Step Refinement Engine that converts high-level plan steps into specific tool actions. Add tool routing for DOM vs Server tools.

**Deliverable:** Step Refinement Engine refines plan steps to tool actions. Tool routing directs DOM tools to client and server tools to server execution.

**Reference:** `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §10 (Tool System Architecture), §3.4 (Decision: Server Tools Optional).

---

### 10.1 Step Refinement Engine Implementation (Task 10)

**Component: `lib/agent/step-refinement-engine.ts`**

**Responsibilities:**
- Convert high-level plan step to specific tool action
- Determine which tool to use (DOM vs Server)
- Generate tool parameters
- Route to appropriate handler

**Refinement Process:**
1. Receive plan step and current DOM
2. Use LLM to refine step to tool action
3. Determine tool type (DOM vs SERVER)
4. Generate tool parameters
5. Return tool action for execution

**LLM Integration:**
- Reuse existing LLM client patterns (see `SERVER_SIDE_AGENT_ARCH.md` §4.6)
- Include current DOM context for accurate refinement
- Include action history for context

**Tool Routing:**
- **DOM Tools:** Return action to client for execution
- **Server Tools:** Execute on server directly (Phase 3+)

**Why This Design:**
Planning generates high-level steps. Refinement converts to specific tool actions. Tool routing ensures correct execution path.

---

### 10.2 Integration with `POST /api/agent/interact` (Task 10)

**Enhancement to Existing Endpoint:**

**New Flow (after getting current step from plan):**
1. Get current step from plan (Task 6)
2. **Call Step Refinement Engine:**
   - Refine step to tool action
   - Determine tool type
   - Generate tool parameters
3. **Route tool execution:**
   - **DOM Tools:** Return action to client (existing flow)
   - **Server Tools:** Execute on server (Phase 3+, not in Task 10)
4. Continue with existing execution flow

**Response Enhancement:**
- Include `toolAction` in response:
  - `toolName` (string)
  - `toolType` (string) — `'DOM'` | `'SERVER'`
  - `parameters` (object)

**Why This Integration:**
Refinement happens after planning, before execution. Tool routing ensures correct execution path. DOM tools continue to use existing client execution flow.

---

### 10.3 Definition of Done / QA Verification (Task 10 — Server)

- [ ] Step Refinement Engine component implemented (`lib/agent/step-refinement-engine.ts`)
- [ ] Step Refinement Engine converts plan steps to tool actions
- [ ] Step Refinement Engine determines tool type (DOM vs SERVER)
- [ ] Tool routing implemented (DOM tools to client, server tools to server)
- [ ] `POST /api/agent/interact` refines steps before execution
- [ ] Response includes `toolAction` field
- [ ] Backward compatibility maintained (existing actions still work)

**Exit criterion:** Task 10 complete when Step Refinement Engine refines steps and routes tools. Manus Orchestrator (Part B) complete. All tasks complete.

---

## Task Order and Dependencies

### Part A: Debug View Enhancements

| Order | Task | Depends on | Server delivers |
|-------|------|------------|-----------------|
| **1** | Debug Logging Infrastructure | Prerequisites | Debug logs model, API logging, logs endpoint |
| **2** | RAG Context Debug Data | Task 1 | RAG debug metadata in responses |
| **3** | Execution Metrics Collection | Task 1 | Metrics collection and storage |
| **4** | Error Details Enhancement | Task 1 | Enhanced error responses with debug info |
| **5** | Debug Session Export Support | Task 1, Task 2, Task 3, Task 4 | Session export endpoint |

### Part B: Manus-Style Orchestrator

| Order | Task | Depends on | Server delivers |
|-------|------|------------|-----------------|
| **6** | Planning Engine | Prerequisites | Planning engine, plan storage, plan generation |
| **7** | Verification Engine | Task 6 | Verification engine, verification records, verification logic |
| **8** | Self-Correction Engine | Task 7 | Self-correction engine, correction records, retry logic |
| **9** | Outcome Prediction | Task 6, Task 7 | Outcome prediction engine, expected outcome generation |
| **10** | Step Refinement & Tool Routing | Task 6, Task 9 | Step refinement engine, tool routing |

**Dependencies:**
- **Part A (Debug):** Tasks 1-5 can be implemented independently (parallel development possible)
- **Part B (Manus):** Tasks 6-10 are sequential:
  - Task 7 depends on Task 6 (verification needs plans)
  - Task 8 depends on Task 7 (correction needs verification)
  - Task 9 depends on Task 6 (prediction needs plans)
  - Task 10 depends on Task 6 and Task 9 (refinement needs plans and prediction)

---

## Implementation Checklist

### Part A: Debug View Enhancements

**Task 1: Debug Logging Infrastructure**
- [ ] Create `DebugLog` Mongoose model
- [ ] Add debug logging middleware to `POST /api/agent/interact`
- [ ] Add debug logging middleware to `GET /api/knowledge/resolve`
- [ ] Implement `GET /api/debug/logs` endpoint
- [ ] Test tenant isolation
- [ ] Test log retrieval

**Task 2: RAG Context Debug Data**
- [ ] Enhance `POST /api/agent/interact` response with `ragDebug` field
- [ ] Enhance `GET /api/knowledge/resolve` response with `ragDebug` field
- [ ] Test RAG debug data in responses
- [ ] Verify domain matching information

**Task 3: Execution Metrics Collection**
- [ ] Capture execution metrics in `POST /api/agent/interact`
- [ ] Store metrics in `task_actions` records
- [ ] Store aggregate metrics in `tasks` records
- [ ] Test metrics collection

**Task 4: Error Details Enhancement**
- [ ] Enhance error responses with `debugInfo` field
- [ ] Implement error type classification
- [ ] Add error context and suggestions
- [ ] Test error responses in debug mode

**Task 5: Debug Session Export Support**
- [ ] Implement `GET /api/debug/session/{taskId}/export` endpoint
- [ ] Aggregate task data (task, actions, logs, metrics)
- [ ] Mask sensitive data
- [ ] Test session export

### Part B: Manus-Style Orchestrator

**Task 6: Planning Engine**
- [ ] Extend `tasks` schema with `plan` field
- [ ] Extend `tasks.status` enum
- [ ] Implement Planning Engine (`lib/agent/planning-engine.ts`)
- [ ] Integrate planning into `POST /api/agent/interact`
- [ ] Test plan generation
- [ ] Test plan persistence

**Task 7: Verification Engine**
- [ ] Extend `task_actions` schema with `expectedOutcome` and `domSnapshot`
- [ ] Create `VerificationRecord` Mongoose model
- [ ] Implement Verification Engine (`lib/agent/verification-engine.ts`)
- [ ] Integrate verification into `POST /api/agent/interact`
- [ ] Test verification logic
- [ ] Test verification storage

**Task 8: Self-Correction Engine**
- [ ] Create `CorrectionRecord` Mongoose model
- [ ] Extend `tasks` schema with retry limit fields
- [ ] Implement Self-Correction Engine (`lib/agent/self-correction-engine.ts`)
- [ ] Integrate self-correction into `POST /api/agent/interact`
- [ ] Test correction strategies
- [ ] Test retry limits

**Task 9: Outcome Prediction**
- [ ] Implement Outcome Prediction Engine (`lib/agent/outcome-prediction-engine.ts`)
- [ ] Integrate prediction into `POST /api/agent/interact`
- [ ] Test outcome prediction
- [ ] Test expected outcome storage

**Task 10: Step Refinement & Tool Routing**
- [ ] Implement Step Refinement Engine (`lib/agent/step-refinement-engine.ts`)
- [ ] Implement tool routing logic
- [ ] Integrate refinement into `POST /api/agent/interact`
- [ ] Test step refinement
- [ ] Test tool routing

---

## References

### Internal Documentation

| Document | Purpose | Key Sections |
|----------|---------|--------------|
| **`DEBUG_VIEW_IMPROVEMENTS.md`** | Debug View requirements (client-focused) | §4.1 (API & Network Trace), §4.2 (RAG Context), §4.5 (Session Export) |
| **`MANUS_ORCHESTRATOR_ARCHITECTURE.md`** | Manus orchestrator architecture specification | §5 (Component Responsibilities), §8 (Verification), §9 (Self-Correction), §10 (Tool System) |
| **`SERVER_SIDE_AGENT_ARCH.md`** | Current server-side agent architecture | §4 (`POST /api/agent/interact`), §4.4 (action history), §4.5 (RAG pipeline) |
| **`THIN_SERVER_ROADMAP.md`** | Server implementation patterns | §1.4 (Database Stack), §2.4 (Better Auth & Next.js), §4.1 (Task models) |

### Implementation Patterns to Follow

**Database:**
- Use Mongoose for all new schemas (see `THIN_SERVER_ROADMAP.md` §1.4)
- Follow tenant isolation patterns (see `THIN_SERVER_ROADMAP.md` §1.1)
- Extend existing `tasks` and `task_actions` models (see `THIN_SERVER_ROADMAP.md` §4.1)

**API Endpoints:**
- Follow existing route handler patterns (see `THIN_SERVER_ROADMAP.md` §2.4.2)
- Use CORS helpers (see `THIN_SERVER_ROADMAP.md` §2.4.3)
- Validate with Zod schemas (see `THIN_SERVER_ROADMAP.md` §4.2)

**Auth & Session:**
- Use `getSessionFromRequest` helper (see `THIN_SERVER_ROADMAP.md` §2.4.3)
- Follow Bearer token patterns (see `THIN_SERVER_ROADMAP.md` §2.4.1)

**LLM Integration:**
- Reuse existing LLM client patterns (see `SERVER_SIDE_AGENT_ARCH.md` §4.6)
- Use lightweight models for planning/verification to reduce cost
- Include RAG context when available (see `SERVER_SIDE_AGENT_ARCH.md` §4.5)

---

## Summary

### Part A: Debug View Enhancements (Tasks 1-5)

**Objective:** Server-side support for enhanced debug UI that provides debug data and logging capabilities.

**Tasks:**
1. **Debug Logging Infrastructure** — Log API requests/responses, execution metrics, errors
2. **RAG Context Debug Data** — Provide RAG decision logic and domain matching information
3. **Execution Metrics Collection** — Capture timing, token usage, step counts
4. **Error Details Enhancement** — Enhanced error responses with debug information
5. **Debug Session Export Support** — API endpoint for exporting complete debug sessions

**Dependencies:** Tasks 1-5 can be implemented independently (parallel development possible).

**Client Counterpart:** `THIN_CLIENT_TO_BE_ROADMAP.md` Part A (Tasks 1-5) — Client displays debug data from server.

---

### Part B: Manus-Style Orchestrator (Tasks 6-10)

**Objective:** Transform server-side agent from reactive to proactive orchestrator with planning, verification, and self-correction.

**Tasks:**
6. **Planning Engine** — Generate high-level action plans before execution
7. **Verification Engine** — Verify actions achieved expected outcomes
8. **Self-Correction Engine** — Analyze failures and generate alternative approaches
9. **Outcome Prediction** — Predict what should happen after each action
10. **Step Refinement & Tool Routing** — Convert plan steps to tool actions and route execution

**Dependencies:** Tasks 6-10 are sequential:
- Task 7 depends on Task 6 (verification needs plans)
- Task 8 depends on Task 7 (correction needs verification)
- Task 9 depends on Task 6 (prediction needs plans)
- Task 10 depends on Task 6 and Task 9 (refinement needs plans and prediction)

**Client Counterpart:** `THIN_CLIENT_TO_BE_ROADMAP.md` Part B (Tasks 6-10) — Client displays orchestrator state from server.

---

**Document Status:** Implementation Plan - Ready for Review  
**Next Steps:** 
1. Review and approve implementation plan
2. Begin Task 1 (Debug Logging Infrastructure)
3. Coordinate with client-side implementation in `THIN_CLIENT_TO_BE_ROADMAP.md`
