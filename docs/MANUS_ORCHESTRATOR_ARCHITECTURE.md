# Manus-Style Agent Orchestrator: Architecture & Design Decisions

**⚠️ CLIENT-SIDE INFORMATION CONSOLIDATED**

**Client-side display and interaction details have been consolidated.** All client-side Manus Orchestrator support (plan display, verification display, correction display, etc.) is now documented in **[CLIENT_ARCHITECTURE.md](./CLIENT_ARCHITECTURE.md)** §10 (Manus Orchestrator Client Support).

**For client-side Manus Orchestrator information, see:**
- **[CLIENT_ARCHITECTURE.md](./CLIENT_ARCHITECTURE.md)** §10 — Complete Manus Orchestrator client support (Tasks 6-10 complete)
- **[THIN_CLIENT_ROADMAP.md](./THIN_CLIENT_ROADMAP.md)** Part 2, Tasks 6-10 — Detailed task-based implementation reference

**This document focuses on server-side Manus Orchestrator architecture and design decisions.** Client-side parts are documented in CLIENT_ARCHITECTURE.md.

---

**Document Version:** 1.0  
**Date:** January 26, 2026  
**Status:** Architecture Specification — **Server-Side Focus**  
**Purpose:** Architectural decisions and design rationale for transforming the agent system into a Manus-style autonomous executor

**Target:** Next.js Intelligence Layer (Thin Client backend) - Enhancement to existing `POST /api/agent/interact`

**Sync:** This document defines the **architectural specification** for the Manus-style orchestrator (server-side). Implementation details (MongoDB, Mongoose, Better Auth, Next.js patterns) follow `THIN_SERVER_ROADMAP.md` conventions. The current reactive implementation is specified in `SERVER_SIDE_AGENT_ARCH.md` §4. Keep all documents in sync; on conflict, prefer this document for orchestrator architecture decisions, `SERVER_SIDE_AGENT_ARCH.md` for current implementation details, and `THIN_SERVER_ROADMAP.md` for implementation patterns.

**Reference Documents:**
- **`SERVER_SIDE_AGENT_ARCH.md`** — Current server-side agent architecture specification. See §4 (`POST /api/agent/interact`) for existing reactive implementation. This orchestrator architecture **extends** the existing endpoint with planning, verification, and self-correction.
- **`THIN_SERVER_ROADMAP.md`** — Server implementation roadmap. See §1.4 (Database Stack - MongoDB/Mongoose), §2.4 (Better Auth & Next.js patterns), §4.2 (Task 3 implementation patterns) for implementation conventions to follow.
- **`CLIENT_ARCHITECTURE.md`** — Client-side architecture. See §10 (Manus Orchestrator Client Support) for client-side display and interaction.
- **`ENTERPRISE_PLATFORM_SPECIFICATION.md`** — Enterprise platform context. See §1 (Multi-Tenant Architecture) for tenant isolation patterns, §2 (RAG Pipeline) for knowledge injection context, §3 (Contextual Overlay) for DOM processing.

---

## Executive Summary

This document defines the **architectural decisions** for transforming Spadeworks Copilot AI from a **reactive "next action" system** into a **proactive "Reason-Act-Verify" orchestrator** that matches the Manus AI philosophy.

**Key Insight:** The existing **Thin Client architecture** is already 90% aligned with Manus requirements. The transformation primarily requires upgrading the **server-side agent logic** from stateless reaction to stateful orchestration.

**Architecture Fit:** 90% - Thin Client model is ideal for Manus  
**Logic Fit:** 40% - Needs transformation from reactive to proactive

**Current Implementation Reference:**
- Existing `POST /api/agent/interact` endpoint: `SERVER_SIDE_AGENT_ARCH.md` §4
- Current task and action history: `SERVER_SIDE_AGENT_ARCH.md` §4.4
- Thin Client architecture: `COMPREHENSIVE_ARCHITECTURE.md` §6
- Implementation patterns: `THIN_SERVER_ROADMAP.md` §4

---

## Table of Contents

1. [Architectural Philosophy](#1-architectural-philosophy)
2. [Gap Analysis: Current vs. Manus](#2-gap-analysis-current-vs-manus)
3. [Core Architectural Decisions](#3-core-architectural-decisions)
4. [System Architecture](#4-system-architecture)
5. [Component Responsibilities](#5-component-responsibilities)
6. [State Management Architecture](#6-state-management-architecture)
7. [API Protocol Design](#7-api-protocol-design)
8. [Verification Architecture](#8-verification-architecture)
9. [Self-Correction Architecture](#9-self-correction-architecture)
10. [Tool System Architecture](#10-tool-system-architecture)
11. [Data Model Design](#11-data-model-design)
12. [Implementation Prioritization](#12-implementation-prioritization)
13. [Migration Strategy](#13-migration-strategy)

---

## 1. Architectural Philosophy

### 1.1 The Manus Approach

**Current System (Reactive):**
- Agent receives DOM + instructions
- LLM generates next action reactively
- Client executes action
- Cycle repeats without validation

**Manus-Style System (Proactive):**
- Agent receives DOM + instructions
- **Plans** high-level strategy before acting
- **Executes** one step at a time
- **Verifies** each step's outcome explicitly
- **Self-corrects** when verification fails
- **Proceeds** only after successful verification

### 1.2 Why This Architecture is Necessary

**The Problem with Pure LLM Reasoning:**
Even advanced LLMs (o1, Claude 3.5 Sonnet) are probabilistic. When asked to "Apply for a job" in one shot, they might click "Submit" and assume success. If the page lags and the click doesn't register, the agent fails because it **assumed** success without verification.

**The Solution: Architectural Scaffolding**
The Manus architecture introduces **explicit verification** that changes the logic from:
- **Old:** "I think I should click X. Sending action."
- **New:** "I clicked X. Did the 'Success' modal appear? No? Then I must try again."

This "Did it work?" check is the single biggest contributor to reliability and better results.

### 1.3 Why Thin Client is Ideal

The existing **Thin Client architecture** is actually the **best foundation** for Manus because:

1. **Centralized Intelligence**: All complex logic (planning, verification, correction) lives on the server where it has access to LLMs, tools, and compute
2. **Lightweight Client**: Extension remains a simple action runner, executing DOM operations
3. **State Management**: Server already owns task state and action history (see `SERVER_SIDE_AGENT_ARCH.md` §4.4)
4. **Separation of Concerns**: Clear boundary between "brain" (server) and "body" (client) (see `CLIENT_ARCHITECTURE.md` §6)

**The Transformation:**
Upgrade the server from a "Stateless Reactor" (Input → LLM → Output) to a "Stateful Orchestrator" that manages plans, expectations, and verification. The existing `POST /api/agent/interact` endpoint (see `SERVER_SIDE_AGENT_ARCH.md` §4) will be enhanced with orchestrator logic while maintaining backward compatibility.

---

## 2. Gap Analysis: Current vs. Manus

| Feature | Current Spadeworks | Manus-Style | Gap Severity | Architectural Decision |
|---------|---------------------|-------------|--------------|------------------------|
| **Execution Loop** | Reactive: "Here is DOM, what next?" | Proactive: "Here is my plan. Execute Step 1, verify, then proceed." | **Major** | Add persistent `Plan` object in task state |
| **Planning** | Implicit: LLM decides next step from history | Explicit: Generate high-level plan before acting | **Major** | Implement Planning Engine that generates action chain |
| **Verification** | Implicit: LLM sees new DOM and reacts | Explicit: Compare Expected vs Actual state after every step | **Critical** | Implement Verification Engine with DOM + semantic checks |
| **Self-Correction** | None: Agent fails if action doesn't work | Automatic: Try alternative approaches on failure | **Critical** | Implement Self-Correction Engine with retry strategies |
| **Tools** | DOM-only: Click, Type, Scroll | Hybrid: DOM Tools + Server Tools (Search, Docs) | **Moderate** | Add Tool Registry with DOM and Server tool routing |
| **User UX** | Response-based: Wait for JSON | Streaming: Real-time "Thinking..." updates | **Optional** | Add SSE streaming (Phase 4, not critical for reliability) |

**Key Insight:** Verification and Self-Correction are **essential** for reliability. Planning and Tools are **important** for sophistication. Streaming is **optional** for UX polish.

---

## 3. Core Architectural Decisions

### 3.1 Decision: Verification is Essential (Not Optional)

**Rationale:**
Without explicit verification, the agent operates on assumptions. If a click doesn't register, if a form field isn't filled, if a page doesn't navigate—the agent continues as if it succeeded, leading to cascading failures.

**Architectural Approach:**
- **When:** Verification happens at the **start of each request** (after client sends new DOM)
- **What:** Compare `expectedOutcome` (from previous action) with `actualState` (from current DOM)
- **How:** Hybrid approach—DOM-based checks (fast) + semantic LLM verification (accurate)
- **Result:** Confidence score (0-1) determines if step succeeded

**Why This Matters:**
This is the single most important architectural change. It transforms the system from "hoping it worked" to "knowing it worked."

### 3.2 Decision: Self-Correction is Essential (Not Optional)

**Rationale:**
Verification without correction is just better error reporting. The agent must be able to recover from failures by trying alternative approaches.

**Architectural Approach:**
- **When:** Triggered when verification fails (confidence < threshold)
- **What:** Analyze failure reason, generate alternative strategy, retry step
- **Strategies:** Alternative selector, alternative tool, gather information, update plan
- **Limits:** Max retries per step (e.g., 3) to prevent infinite loops

**Why This Matters:**
Self-correction is what makes the agent **autonomous** rather than just **automated**. It can recover from errors without human intervention.

### 3.3 Decision: Planning Can Be Simple (Linear List)

**Rationale:**
Complex dependency graphs and parallel execution are overkill for initial implementation. A simple linear list of steps is sufficient for most tasks and easier to reason about.

**Architectural Approach:**
- **Structure:** Linear array of steps: `[{description, toolType, expectedOutcome}, ...]`
- **Storage:** Store in `tasks.plan` field (Mongoose schema)
- **Complexity:** No DAGs, no parallel execution initially
- **Evolution:** Can add dependencies and parallelism later if needed

**Why This Matters:**
Start simple. A linear plan is easier to implement, debug, and understand. Complexity can be added incrementally.

### 3.4 Decision: Server Tools Are Optional (Start with DOM Only)

**Rationale:**
Focus on making browser interaction robust first. Server tools (web search, documentation) add complexity and can be added later.

**Architectural Approach:**
- **Phase 1:** DOM tools only (click, setValue, scroll, extractText)
- **Phase 3+:** Add server tools (webSearch, readDocumentation) when DOM interaction is reliable
- **Tool Registry:** Design supports both, but implement DOM first

**Why This Matters:**
Don't solve multiple problems at once. Get DOM interaction reliable, then add server tools.

### 3.5 Decision: Streaming is Optional (Phase 4)

**Rationale:**
Streaming improves UX but doesn't make the agent smarter. For initial implementation focused on reliability, standard request/response is sufficient.

**Architectural Approach:**
- **Phase 1-3:** Standard JSON request/response
- **Phase 4:** Add Server-Sent Events (SSE) for real-time updates
- **Design:** API protocol supports both modes (streaming optional)

**Why This Matters:**
Prioritize reliability over polish. Streaming can be added after the core orchestrator is working.

---

## 4. System Architecture

### 4.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client (Extension)                        │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  DOM Processor                                        │   │
│  │  - Extracts simplified DOM                           │   │
│  │  - Executes DOM actions (click, setValue)           │   │
│  │  - Returns new DOM state after action                │   │
│  └──────────────────────────────────────────────────────┘   │
│                          ↕ HTTP                               │
└─────────────────────────────────────────────────────────────┘
                          ↕
┌─────────────────────────────────────────────────────────────┐
│              Server (AgentOrchestrator)                      │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Request Handler (POST /api/agent/interact)          │   │
│  │  ┌────────────────────────────────────────────────┐ │   │
│  │  │  1. Verify Previous Action (if applicable)     │ │   │
│  │  │  2. Generate Plan (if new task)                │ │   │
│  │  │  3. Select Next Step from Plan                 │ │   │
│  │  │  4. Refine Step to Tool Action                 │ │   │
│  │  │  5. Predict Expected Outcome                   │ │   │
│  │  │  6. Return Action to Client                    │ │   │
│  │  └────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Verification Engine                                 │   │
│  │  - Compares Expected vs Actual state                 │   │
│  │  - DOM-based checks + semantic LLM verification       │   │
│  │  - Returns confidence score                          │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Self-Correction Engine                               │   │
│  │  - Analyzes verification failures                     │   │
│  │  - Generates alternative strategies                  │   │
│  │  - Updates plan and retries                           │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  Planning Engine                                      │   │
│  │  - Generates high-level action plan                   │   │
│  │  - Linear list of steps                              │   │
│  │  - Stores in task.plan                               │   │
│  └──────────────────────────────────────────────────────┘   │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  State Manager                                        │   │
│  │  - Task state (planning, executing, verifying, etc.) │   │
│  │  - Action chain (planned steps)                       │   │
│  │  - Execution history                                 │   │
│  │  - Verification results                              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Execution Flow (Conceptual)

```
Request N arrives with new DOM
  ↓
1. VERIFY: Did previous action (N-1) achieve expected outcome?
   ├─ Yes → Proceed to step 2
   └─ No → Trigger Self-Correction → Retry or return corrected action
  ↓
2. PLAN: Does task have a plan?
   ├─ No → Generate plan → Store in task.plan
   └─ Yes → Use existing plan
  ↓
3. EXECUTE: Get next step from plan
   ├─ No more steps → Return finish()
   └─ Has step → Refine to tool action
  ↓
4. PREDICT: What should happen after this action?
   └─ Generate expectedOutcome
  ↓
5. RESPONSE: Return action + expectedOutcome to client
   └─ Client executes → Returns new DOM in Request N+1
```

**Key Architectural Principle:**
Each request is **stateful**—it knows where it is in the plan, what was expected from the previous action, and what to do next.

**Reference:** This transforms the existing stateless flow in `SERVER_SIDE_AGENT_ARCH.md` §4.3 into a stateful orchestrator. The request handler structure remains the same, but adds planning, verification, and self-correction logic before the LLM call.

---

## 5. Component Responsibilities

### 5.1 Request Handler (POST /api/agent/interact)

**Responsibility:**
Orchestrate the entire Reason-Act-Verify loop for a single request.

**Reference:** Current implementation in `SERVER_SIDE_AGENT_ARCH.md` §4.2, §4.3. This orchestrator architecture **extends** the existing endpoint with planning, verification, and self-correction logic.

**Key Decisions:**
- **Stateful:** Loads task state, plan, and previous action (extends existing task resolution in `SERVER_SIDE_AGENT_ARCH.md` §4.3)
- **Verification First:** Checks previous action before planning new one (new orchestrator logic)
- **Plan Persistence:** Stores plan in database, reuses across requests (extends `tasks` schema per `THIN_SERVER_ROADMAP.md` §4.1)
- **Outcome Prediction:** Generates expectedOutcome for next verification (new orchestrator logic)

**Why This Design:**
Centralizes orchestration logic in one place, making the flow easy to reason about and debug. Builds on existing endpoint structure for backward compatibility.

### 5.2 Verification Engine

**Responsibility:**
Determine if an action achieved its expected outcome by comparing expected vs actual state.

**Key Decisions:**
- **Hybrid Approach:** DOM-based checks (fast) + semantic LLM verification (accurate)
- **Confidence Scoring:** Returns 0-1 confidence score, not just pass/fail
- **Threshold-Based:** Success determined by confidence threshold (e.g., 0.7)
- **Detailed Reporting:** Returns reason for success/failure

**Why This Design:**
DOM checks are fast but brittle (exact matches). Semantic verification is slow but robust (understands intent). Combining both gives speed and accuracy.

### 5.3 Self-Correction Engine

**Responsibility:**
Analyze verification failures and generate alternative approaches to retry the failed step.

**Key Decisions:**
- **Strategy-Based:** Multiple correction strategies (alternative selector, alternative tool, gather info, update plan)
- **LLM-Powered:** Uses LLM to analyze failure and suggest correction
- **Retry Limits:** Max retries per step (e.g., 3) to prevent infinite loops
- **Plan Updates:** Can modify the plan if assumptions were wrong

**Why This Design:**
Different failures require different strategies. LLM analysis ensures intelligent corrections rather than blind retries.

### 5.4 Planning Engine

**Responsibility:**
Generate a high-level action plan from user instructions and current DOM state.

**Reference:** Planning uses same LLM integration patterns as existing system (see `SERVER_SIDE_AGENT_ARCH.md` §4.6 for LLM client patterns). Can leverage RAG context (see `SERVER_SIDE_AGENT_ARCH.md` §4.5) for better planning.

**Key Decisions:**
- **Simple Structure:** Linear list of steps (no complex DAGs initially)
- **LLM-Generated:** Uses LLM to break down task into logical steps (follows existing LLM patterns in `SERVER_SIDE_AGENT_ARCH.md` §4.6)
- **Step Metadata:** Each step has description, toolType, expectedOutcome
- **Plan Storage:** Stored in `tasks.plan` for persistence across requests (extends `THIN_SERVER_ROADMAP.md` §4.1 task model)

**Why This Design:**
Linear plans are easier to implement and debug. Complexity (dependencies, parallelism) can be added later if needed. Reuses existing LLM infrastructure for consistency.

### 5.5 State Manager

**Responsibility:**
Manage task state, plan, execution history, and verification results.

**Reference:** Current state management in `SERVER_SIDE_AGENT_ARCH.md` §4.4 (action history), `THIN_SERVER_ROADMAP.md` §4.1 (Mongoose models for tasks and task_actions). This orchestrator extends existing state with plan and verification data.

**Key Decisions:**
- **Database-Backed:** All state stored in MongoDB (tasks, task_actions, verification_records) — follows `THIN_SERVER_ROADMAP.md` §1.4 (MongoDB/Mongoose stack)
- **Task-Centric:** State organized by taskId (matches existing pattern in `SERVER_SIDE_AGENT_ARCH.md` §4.4)
- **Immutable History:** Execution and verification records are append-only (extends existing action history pattern)
- **Status Tracking:** Explicit status (planning, executing, verifying, correcting, completed, failed) — new orchestrator enhancement

**Why This Design:**
Database persistence ensures state survives server restarts and enables debugging/auditing. Immutable history provides audit trail. Follows existing patterns for consistency.

---

## 6. State Management Architecture

### 6.1 Task State Model

**Core State:**
- `taskId`: Unique identifier (existing — see `SERVER_SIDE_AGENT_ARCH.md` §4.4)
- `status`: Current state (planning, executing, verifying, correcting, completed, failed) — **new orchestrator field**
- `plan`: Action chain (array of steps with metadata) — **new orchestrator field**
- `currentStepIndex`: Where we are in the plan — **new orchestrator field**
- `url`: Current page URL (existing — see `SERVER_SIDE_AGENT_ARCH.md` §4.2)
- `query`: User's original instructions (existing — see `SERVER_SIDE_AGENT_ARCH.md` §4.2)

**Reference:** Current task schema in `THIN_SERVER_ROADMAP.md` §4.1 (Mongoose `tasks` model). This orchestrator adds `plan` and `currentStepIndex` fields to existing schema.

**Why This Structure:**
Explicit status enables clear state transitions. Plan persistence allows resuming tasks. Step index tracks progress. Extends existing task model without breaking changes.

### 6.2 Action Plan Structure

**Plan Format:**
- `steps`: Array of step objects
- Each step: `{index, description, toolType, expectedOutcome, status}`
- `currentStepIndex`: Points to next step to execute

**Why Linear:**
Simple to implement, easy to debug, sufficient for most tasks. Can evolve to DAGs later if needed.

### 6.3 Expected Outcome Model

**Outcome Format:**
- `description`: Natural language description
- `domChanges`: Specific DOM expectations (element exists, text matches, URL changed)
- Used for verification in next request

**Why This Structure:**
Natural language description enables semantic verification. DOM changes enable fast structural checks. Both together provide robust verification.

### 6.4 Verification Result Model

**Result Format:**
- `success`: Boolean (confidence >= threshold)
- `confidence`: 0-1 score
- `expectedState`: What was expected
- `actualState`: What actually happened
- `reason`: Explanation of result

**Why This Structure:**
Confidence score enables nuanced decisions (not just pass/fail). Detailed comparison enables debugging. Reason enables user understanding.

---

## 7. API Protocol Design

### 7.1 Request Format

**Endpoint:** `POST /api/agent/interact`

**Request Body:**
- `url`: Current page URL
- `query`: User task instructions
- `dom`: Simplified DOM (from client)
- `taskId`: Optional (for continuing existing task)

**Why This Format:**
Matches existing API contract for backward compatibility. Minimal changes required.

### 7.2 Response Format

**Reference:** Current response format in `SERVER_SIDE_AGENT_ARCH.md` §4.2 (`NextActionResponse`). This orchestrator extends the response with new optional fields.

**Response Body:**
- `thought`: LLM reasoning (existing — see `SERVER_SIDE_AGENT_ARCH.md` §4.2)
- `action`: Action string (existing — see `SERVER_SIDE_AGENT_ARCH.md` §4.2, `CLIENT_ARCHITECTURE.md` §5 for action definitions)
- `taskId`: Task identifier (existing — see `SERVER_SIDE_AGENT_ARCH.md` §4.2)
- `hasOrgKnowledge`: RAG indicator (existing — see `SERVER_SIDE_AGENT_ARCH.md` §4.2, §4.5 for RAG context)
- **New Fields (Optional):**
  - `status`: Current task status (orchestrator enhancement)
  - `currentStep`: Step number in plan (orchestrator enhancement)
  - `totalSteps`: Total steps in plan (orchestrator enhancement)
  - `expectedOutcome`: What to verify next time (orchestrator enhancement)

**Why This Design:**
Backward compatible—existing fields unchanged. New fields optional, ignored by old clients. Enables progressive enhancement. Follows same pattern as `hasOrgKnowledge` field (optional enhancement).

### 7.3 State Transitions

**Status Flow:**
1. `planning` → Generate plan
2. `executing` → Execute current step
3. `verifying` → (Implicit, happens at start of next request)
4. `correcting` → Self-correction in progress
5. `completed` → All steps done
6. `failed` → Max retries exceeded

**Why Explicit Status:**
Enables client to show appropriate UI. Makes debugging easier. Enables status polling.

---

## 8. Verification Architecture

### 8.1 Verification Strategy

**Reference:** Current DOM processing in `CLIENT_ARCHITECTURE.md` §7 (DOM Processing Pipeline). Verification uses the simplified DOM sent by the client, following the same processing pipeline.

**Hybrid Approach:**
1. **DOM-Based Checks** (Fast, Structural)
   - Element existence checks
   - Text content matching
   - URL change detection
   - Structural comparison
   - Uses simplified DOM from client (see `CLIENT_ARCHITECTURE.md` §7.1)

2. **Semantic Verification** (Slow, Intent-Based)
   - LLM analyzes if page state matches expectation
   - Understands variations in wording
   - Handles ambiguous cases
   - Uses lightweight LLM (e.g., GPT-4o-mini) for cost efficiency

3. **Confidence Calculation**
   - Weighted combination: DOM checks (40%) + Semantic (60%)
   - Threshold: 0.7 = success (configurable)

**Why Hybrid:**
DOM checks are fast but brittle. Semantic verification is slow but robust. Combining both provides speed and accuracy. Leverages existing DOM simplification pipeline for efficiency.

### 8.2 When Verification Happens

**Timing:**
- Verification occurs at the **start of each request** (after client sends new DOM)
- Compares previous action's `expectedOutcome` with current DOM's `actualState`
- Result determines if we proceed or self-correct

**Why This Timing:**
Client has already executed action and returned new DOM. Server can now verify if action succeeded before proceeding.

### 8.3 Verification Failure Handling

**Failure Response:**
- If verification fails → Trigger Self-Correction Engine
- Self-Correction generates alternative approach
- Retry same step (don't advance to next step)
- Max retries (e.g., 3) before marking task as failed

**Why This Design:**
Failures should be corrected, not ignored. Retrying same step ensures we don't skip important actions. Max retries prevent infinite loops.

---

## 9. Self-Correction Architecture

### 9.1 Correction Strategies

**Available Strategies:**
1. **ALTERNATIVE_SELECTOR**: Try different element selector
2. **ALTERNATIVE_TOOL**: Use different tool (e.g., keyboard instead of click)
3. **GATHER_INFORMATION**: Need more info before proceeding (e.g., search for company name)
4. **UPDATE_PLAN**: Plan assumptions were wrong, update plan
5. **RETRY_WITH_DELAY**: Simple retry with delay (timing issue)

**Why Multiple Strategies:**
Different failures require different approaches. Element not found → alternative selector. Action didn't execute → alternative tool. Missing information → gather info.

### 9.2 Correction Selection

**Selection Process:**
- LLM analyzes failure reason
- Generates multiple correction strategies
- Selects best strategy based on failure type
- Creates corrected step with new approach

**Reference:** Uses same LLM integration patterns as existing system (see `SERVER_SIDE_AGENT_ARCH.md` §4.6). Can leverage RAG context (see `SERVER_SIDE_AGENT_ARCH.md` §4.5) for better correction suggestions.

**Why LLM-Powered:**
LLM can understand context and suggest intelligent corrections. Rule-based approaches are too brittle for diverse failure scenarios. Reuses existing LLM infrastructure for consistency.

### 9.3 Retry Limits

**Limits:**
- Max retries per step: 3 (configurable)
- Max consecutive failures: 3 (configurable)
- After max retries: Mark step as failed, task as failed

**Why Limits:**
Prevents infinite retry loops. Ensures task fails gracefully rather than hanging indefinitely.

---

## 10. Tool System Architecture

### 10.1 Tool Types

**DOM Tools (Client-Side):**
- Executed by Chrome Extension
- Return new DOM state after execution
- Examples: `click`, `setValue`, `scroll`, `extractText`
- **Reference:** Current action definitions in `CLIENT_ARCHITECTURE.md` §5.1, `SERVER_SIDE_AGENT_ARCH.md` §4.6. These tools are already implemented and used by the existing system.

**Server Tools (Server-Side):**
- Executed by backend server
- Don't require DOM state
- Examples: `webSearch`, `readDocumentation`, `calculate`
- **Phase 3+**: Implement after DOM tools are reliable
- **Reference:** Tool integration follows same patterns as RAG integration (see `SERVER_SIDE_AGENT_ARCH.md` §4.5 for server-side tool execution patterns)

**Why This Separation:**
Clear boundary between client and server responsibilities. DOM tools require page access (client). Server tools require external APIs (server). Matches existing Thin Client architecture separation (see `CLIENT_ARCHITECTURE.md` §6).

### 10.2 Tool Selection

**Selection Logic:**
- Planning Engine determines `toolType` for each step (DOM vs SERVER)
- Execution Engine routes to appropriate handler
- DOM tools → Send to client for execution
- Server tools → Execute on server directly

**Why This Design:**
Planning decides what type of tool is needed. Execution routes to appropriate handler. Clear separation of concerns.

### 10.3 Tool Registry (Future)

**Registry Design:**
- Central registry of available tools
- Tool metadata: name, type, parameters, description
- Enables dynamic tool discovery
- **Phase 3+**: Implement when adding server tools

**Why Registry:**
Enables extensibility. New tools can be added without code changes. LLM can discover available tools dynamically.

---

## 11. Data Model Design

### 11.1 Task Schema Updates

**Reference:** Current task schema in `THIN_SERVER_ROADMAP.md` §4.1 (Mongoose `tasks` model), `SERVER_SIDE_AGENT_ARCH.md` §4.4 (task structure). This orchestrator extends the existing schema.

**New Fields:**
- `plan`: Action chain (array of steps) — **new orchestrator field**
- `currentStepIndex`: Current position in plan — **new orchestrator field**
- `status`: Explicit status (planning, executing, etc.) — **new orchestrator field** (extends existing `status` enum)

**Existing Fields (Unchanged):**
- `taskId`, `tenantId`, `userId`, `url`, `query` (see `THIN_SERVER_ROADMAP.md` §4.1)
- Action history continues to use `task_actions` collection (see `SERVER_SIDE_AGENT_ARCH.md` §4.4)

**Why These Fields:**
Plan persistence enables resuming tasks. Step index tracks progress. Status enables state machine. Extends existing schema without breaking changes.

### 11.2 TaskAction Schema Updates

**Reference:** Current `task_actions` schema in `THIN_SERVER_ROADMAP.md` §4.1 (Mongoose `task_actions` model), `SERVER_SIDE_AGENT_ARCH.md` §4.4 (action history structure). This orchestrator extends the existing schema.

**New Fields:**
- `expectedOutcome`: What should happen after this action — **new orchestrator field**
- `domSnapshot`: DOM state when action was taken — **new orchestrator field**
- `toolAction`: Tool details (name, type, parameters) — **new orchestrator field**

**Existing Fields (Unchanged):**
- `tenantId`, `taskId`, `stepIndex`, `thought`, `action` (see `THIN_SERVER_ROADMAP.md` §4.1)

**Why These Fields:**
Expected outcome enables verification. DOM snapshot enables comparison. Tool details enable debugging. Extends existing action history without breaking changes.

### 11.3 New VerificationRecord Schema

**Reference:** New Mongoose model following patterns in `THIN_SERVER_ROADMAP.md` §1.4 (Mongoose for app data), §4.1 (model structure). Similar to `task_actions` model but for verification results.

**Fields:**
- `tenantId`, `taskId`, `stepIndex`: References (follows tenant isolation pattern — see `THIN_SERVER_ROADMAP.md` §1.1)
- `success`: Boolean result
- `confidence`: 0-1 score
- `expectedState`, `actualState`: Comparison data
- `reason`: Explanation
- `createdAt`: Timestamp (standard Mongoose pattern)

**Why This Schema:**
Enables audit trail of all verifications. Confidence scores enable analysis. Detailed comparison enables debugging. Follows existing Mongoose model patterns for consistency.

### 11.4 Data Isolation

**Tenant Isolation:**
- All schemas include `tenantId`
- All queries scoped by `tenantId`
- No cross-tenant data access

**Reference:** Tenant isolation patterns in `THIN_SERVER_ROADMAP.md` §1.1 (Tenant + domain isolation), `SERVER_SIDE_AGENT_ARCH.md` §3.2 (Tenant ID resolution), `ENTERPRISE_PLATFORM_SPECIFICATION.md` §1 (Multi-Tenant Architecture & Security).

**Why This Design:**
Matches existing architecture. Ensures multi-tenant security. Consistent with current patterns. All orchestrator data (plans, verifications, corrections) must follow same tenant isolation rules.

---

## 12. Implementation Prioritization

### 12.1 Phase 1: Core Orchestrator (Essential)

**Components:**
- Planning Engine (simple linear plans)
- Basic Verification Engine (DOM checks only)
- State Management (plan storage)
- Request Handler updates

**Reference:** Implementation patterns in `THIN_SERVER_ROADMAP.md` §4.2 (API endpoint structure), §4.3 (handler logic patterns). Follows same Mongoose model patterns as existing `tasks` and `task_actions` (see `THIN_SERVER_ROADMAP.md` §4.1).

**Why First:**
Foundation for everything else. Enables basic Reason-Act-Verify loop. Can test with simple tasks. Builds on existing `POST /api/agent/interact` endpoint (see `SERVER_SIDE_AGENT_ARCH.md` §4).

**Success Criteria:**
- Agent generates plan before acting
- Agent verifies actions (DOM checks)
- Agent tracks progress through plan
- Backward compatibility maintained (existing clients continue working)

### 12.2 Phase 2: Verification & Self-Correction (Essential)

**Components:**
- Enhanced Verification Engine (semantic verification)
- Self-Correction Engine
- Retry logic
- Failure analysis

**Why Second:**
Verification without correction is incomplete. Self-correction is what makes agent autonomous. Critical for reliability.

**Success Criteria:**
- Agent detects when actions fail
- Agent tries alternative approaches
- Agent recovers from common failures

### 12.3 Phase 3: Tool System (Important)

**Components:**
- Tool Registry
- Server Tools (webSearch, etc.)
- Tool routing logic
- Interleaved tool usage

**Why Third:**
Enables more sophisticated tasks. Not critical for basic reliability. Can be added incrementally.

**Success Criteria:**
- Agent can use server tools
- Agent can interleave DOM and server tools
- Tool execution is reliable

### 12.4 Phase 4: Streaming (Optional)

**Components:**
- Server-Sent Events (SSE)
- Streaming client handler
- Real-time status updates

**Why Last:**
Improves UX but doesn't affect reliability. Can be added after core functionality is stable.

**Success Criteria:**
- Real-time updates to client
- Smooth user experience
- No performance degradation

---

## 13. Migration Strategy

### 13.1 Backward Compatibility

**Approach:**
- Keep existing `POST /api/agent/interact` endpoint (see `SERVER_SIDE_AGENT_ARCH.md` §4.2)
- Add new fields to response (optional, ignored by old clients)
- Old clients continue working unchanged
- New clients can use new features

**Reference:** Current API contract in `SERVER_SIDE_AGENT_ARCH.md` §4.2. Response format follows same pattern as `hasOrgKnowledge` field (optional enhancement). Client-side integration in `THIN_CLIENT_ROADMAP.md` §4.1 (Task 3: Server-Side Action Loop).

**Why This Approach:**
Zero-downtime migration. Gradual rollout possible. No breaking changes. Matches existing enhancement pattern (e.g., `hasOrgKnowledge` field).

### 13.2 Feature Flag

**Option 1: Query Parameter**
- `?orchestrator=true` enables new flow
- `?orchestrator=false` uses legacy flow
- Default: legacy (for safety)
- **Reference:** Follows same pattern as existing endpoint enhancements (see `SERVER_SIDE_AGENT_ARCH.md` §4.2 for current endpoint structure)

**Option 2: Parallel Endpoints**
- Keep `/api/agent/interact` (legacy — see `SERVER_SIDE_AGENT_ARCH.md` §4)
- Add `/api/agent/orchestrate` (new)
- Clients choose which to use

**Recommendation:**
Option 1 (query parameter) for simpler migration. Can switch to Option 2 later if needed. Matches existing API enhancement patterns.

### 13.3 Gradual Rollout

**Phases:**
1. **Internal Testing:** Test with development team
2. **Beta Users:** Enable for subset of users
3. **Gradual Migration:** Migrate users incrementally
4. **Full Migration:** All users on orchestrator
5. **Deprecation:** Remove legacy endpoint

**Why Gradual:**
Reduces risk. Enables feedback. Allows rollback if issues found.

---

## 14. Architectural Principles

### 14.1 Essential vs. Optional

**Essential (Phase 1-2):**
- ✅ Verification Engine
- ✅ Self-Correction Engine
- ✅ Planning Engine (simple)
- ✅ State Management

**Important (Phase 3):**
- ⚠️ Server Tools
- ⚠️ Tool Registry
- ⚠️ Advanced Planning

**Optional (Phase 4):**
- ⚪ Streaming (SSE)
- ⚪ Parallel Execution
- ⚪ Complex DAGs

**Why This Prioritization:**
Focus on reliability first (verification + correction). Add sophistication later (tools, streaming). Don't solve everything at once.

### 14.2 Design Principles

**1. Stateful Orchestration**
- Server maintains plan and state
- Each request is part of a larger workflow
- Not just "next action" but "next step in plan"

**2. Explicit Verification**
- Every action has expected outcome
- Every outcome is verified
- No assumptions, only evidence

**3. Autonomous Recovery**
- Agent corrects its own mistakes
- Multiple retry strategies
- Graceful failure handling

**4. Progressive Enhancement**
- Backward compatible API
- New features optional
- Gradual migration path

**5. Simplicity First**
- Linear plans before DAGs
- DOM tools before server tools
- Request/response before streaming

---

## 15. Key Architectural Decisions Summary

| Decision | Rationale | Impact |
|----------|-----------|--------|
| **Verification is Essential** | Without verification, agent operates on assumptions. Explicit checks ensure reliability. | **Critical** - Single biggest contributor to better results |
| **Self-Correction is Essential** | Verification without correction is incomplete. Agent must recover from failures autonomously. | **Critical** - Makes agent autonomous, not just automated |
| **Planning Can Be Simple** | Linear plans are sufficient for most tasks. Complexity (DAGs, parallelism) can be added later. | **Moderate** - Enables faster implementation, easier debugging |
| **Server Tools Optional** | Focus on DOM interaction reliability first. Server tools add complexity and can wait. | **Low** - Doesn't affect core reliability |
| **Streaming Optional** | Improves UX but doesn't make agent smarter. Can be added after core functionality is stable. | **Low** - Nice to have, not essential |
| **Hybrid Verification** | DOM checks (fast) + semantic LLM (accurate) provides best of both worlds. | **High** - Balances speed and accuracy |
| **Stateful Requests** | Each request knows where it is in the plan and what was expected. Enables orchestration. | **Critical** - Foundation for all orchestration logic |
| **Backward Compatible API** | New fields optional, old clients continue working. Enables gradual migration. | **High** - Reduces risk, enables rollout |

---

## 16. Conclusion

This architecture transforms Spadeworks Copilot AI from a **reactive system** to a **proactive orchestrator** that:

1. **Plans** before acting (explicit strategy)
2. **Verifies** after acting (explicit validation)
3. **Self-corrects** when things go wrong (autonomous recovery)
4. **Tracks** progress through plans (stateful execution)

**Key Insight:**
The existing Thin Client architecture is **90% ready** for Manus. The transformation primarily requires:
- Adding verification logic (essential)
- Adding self-correction logic (essential)
- Adding planning logic (important)
- Adding state management for plans (important)

**Implementation Priority:**
1. **Phase 1:** Core Orchestrator (Planning + Basic Verification)
2. **Phase 2:** Self-Correction (Essential for reliability)
3. **Phase 3:** Server Tools (Important for sophistication)
4. **Phase 4:** Streaming (Optional for UX)

**Next Steps:**
1. Review and approve this architecture
2. Begin Phase 1 implementation (Core Orchestrator)
3. Test with simple tasks
4. Iterate based on results
5. Proceed to Phase 2 (Self-Correction)

---

## 17. References

### 17.1 Internal Documentation

| Document | Purpose | Key Sections |
|----------|---------|--------------|
| **`SERVER_SIDE_AGENT_ARCH.md`** | Current server-side agent architecture specification | §4 (`POST /api/agent/interact`), §4.4 (action history), §4.5 (RAG pipeline) |
| **`THIN_SERVER_ROADMAP.md`** | Server implementation roadmap and patterns | §1.4 (Database Stack), §2.4 (Better Auth & Next.js), §4.1 (Task models), §4.2 (API patterns) |
| **`CLIENT_ARCHITECTURE.md`** | Client-side architecture | §6 (Thin Client Implementation), §5 (Action System), §7 (DOM Processing Pipeline) |
| **`ENTERPRISE_PLATFORM_SPECIFICATION.md`** | Enterprise platform context | §1 (Multi-Tenant Architecture), §2 (RAG Pipeline), §3 (Contextual Overlay) |
| **`THIN_CLIENT_ROADMAP.md`** | Client-side implementation roadmap | §4.1 (Task 3: Server-Side Action Loop) for client integration patterns |

### 17.2 Implementation Patterns to Follow

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

**RAG Integration:**
- Reuse existing `getRAGChunks` helper (see `SERVER_SIDE_AGENT_ARCH.md` §4.5)
- Follow tenant + domain filtering (see `SERVER_SIDE_AGENT_ARCH.md` §1.4)

---

**Document Status:** Architecture Specification - Ready for Review  
**Focus:** Architectural decisions and rationale, not implementation details  
**Sync:** Keep in sync with `SERVER_SIDE_AGENT_ARCH.md` (current implementation) and `THIN_SERVER_ROADMAP.md` (implementation patterns)  
**Maintainer:** Principal AI Architect
