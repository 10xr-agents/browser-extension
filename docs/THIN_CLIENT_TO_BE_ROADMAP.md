# Thin Client Implementation: Client-Side Roadmap (Debug & Manus Orchestrator)

**Document Version:** 1.0  
**Date:** January 26, 2026  
**Status:** Implementation Plan  
**Source:** `DEBUG_VIEW_IMPROVEMENTS.md` (Debug View requirements), `MANUS_ORCHESTRATOR_ARCHITECTURE.md` (Manus orchestrator architecture)

**Sync:** This document is the **client-side (extension) implementation roadmap** for Debug View enhancements and Manus-style orchestrator support. The **specifications** are:
- `DEBUG_VIEW_IMPROVEMENTS.md` — Debug View requirements (client-focused)
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` — Manus orchestrator architecture (server-focused, but client displays orchestrator state)
- `THIN_CLIENT_ROADMAP.md` — Current client-side implementation (to be enhanced)

Keep all documents in sync; on conflict, prefer this roadmap for implementation details, architecture docs for design decisions.

**Counterpart:** Server-side work (DB, API) is in `THIN_SERVER_TO_BE_ROADMAP.md`. Debug and Manus tasks are **sequential**; client and server work for a given task ship together for end-to-end verification.

**Task Alignment:**
- **Part A (Debug):** Client Tasks 1-5 correspond to Server Tasks 1-5
- **Part B (Manus):** Client Tasks 6-10 correspond to Server Tasks 6-10
- Server and client tasks should be implemented together for each task number

---

## 1. Overview

This document is the **client-side (extension)** implementation roadmap for:
1. **Debug View Enhancements** (Tasks 1-5): Client-side Debug Panel UI and debug data display
2. **Manus-Style Orchestrator Support** (Tasks 6-10): Client-side support for orchestrator state display and interaction

Each task covers **extension integration** only: UI components, state management, API client usage, and debug data display. Backend (DB, API) for the same features is in `THIN_SERVER_TO_BE_ROADMAP.md`.

### 1.1 Principles

- **Vertical slices:** Each task delivers the extension work for one feature. No standalone "UI-only" or "state-only" phases.
- **Strict sequencing:** Debug tasks (1-5) can be implemented independently. Manus tasks (6-10) are sequential: Task 7 depends on Task 6, Task 8 depends on Task 7, etc.
- **Runtime control:** All debug features controlled via Settings (`developerMode` toggle), not build-time environment variables.

### 1.2 Prerequisites

- Browser extension codebase (Spadeworks Copilot AI) with build pipeline.
- React 18 + TypeScript + Chakra UI v2.8.2
- Zustand state management with `persist` middleware configured
- Existing API client (`src/api/client.ts`) with `POST /api/agent/interact` and `GET /api/knowledge/resolve` integration
- Server-side Tasks 1-5 complete (Debug View) before starting client Tasks 1-5
- Server-side Tasks 6-10 complete (Manus Orchestrator) before starting client Tasks 6-10

**Backend Tech Stack (for reference):**
- **Next.js** (App Router) API server
- **MongoDB** (Mongoose ODM) for all persistence except Better Auth
- **Better Auth** (Prisma) for users, sessions, accounts only
- See `THIN_SERVER_TO_BE_ROADMAP.md` for backend details

---

## Part A: Debug View Enhancements (Tasks 1-5)

**Objective:** Implement client-side Debug Panel UI that displays debug information from server. Separate user-facing content from technical debug information.

**Reference:** `DEBUG_VIEW_IMPROVEMENTS.md` — Complete Debug View requirements and implementation guide.

---

## Task 1: Architectural Separation (Client)

**Objective:** Strictly separate the "Action Stream" (User-facing actions) from the "System Stream" (Debug logs, DOM trees, metrics). Create dedicated Debug Panel container.

**Deliverable:** All debug components moved to `DebugPanel.tsx`. User-facing interface shows only high-level summaries. No debug information visible in main UI when developer mode is off.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:**
- `DEBUG_VIEW_IMPROVEMENTS.md` §2 (Task 1: Architectural Separation)
- `THIN_SERVER_TO_BE_ROADMAP.md` §1 (Task 1: Debug Logging Infrastructure) — Server provides debug data for client display

---

### 1.1 Component Migration (Task 1)

**Components to Move:**
- `AccessibilityTreeView` — Move to Debug Panel
- `CoverageMetricsView` — Move to Debug Panel
- `HybridElementView` — Move to Debug Panel
- `TaskStatus` — Move to Debug Panel (technical details only)

**Current Location:** These components are currently displayed inline with user content in `TaskUI.tsx` and related components.

**Target Location:** All moved to new `DebugPanel.tsx` component.

**Implementation:**
- Create `src/common/DebugPanel.tsx` component
- Move all debug components into Debug Panel
- Remove debug components from main `TaskUI.tsx`
- Conditionally render Debug Panel based on `developerMode` setting (from Zustand store)

**Why This Design:**
Separates user-facing content from debug information. Debug Panel only visible when developer mode is enabled. Clean user interface when debug mode is off.

---

### 1.2 Task History Refactor (Task 1)

**Requirement:** Split Task History into two distinct views.

#### User View (Main Interface)
- **Display:** Only high-level natural language summaries
- **Example:** *"Clicked 'Sign Up' button"* or *"Entered email address"*
- **Purpose:** Provide clear, actionable feedback to users

#### Debug View (Debug Panel)
- **Display:** Technical details including:
  - Token counts
  - Parsed Action JSON
  - Raw LLM thoughts/reasoning
  - Execution timestamps
  - Error stack traces (if any)
- **Purpose:** Provide developers with detailed technical information

**Implementation:**
- Modify `TaskHistory.tsx` to support two rendering modes
- Create simplified user-facing version (`TaskHistoryUser.tsx`)
- Keep full technical version in Debug Panel (`TaskHistoryDebug.tsx`)
- Use `developerMode` setting to determine which view to show

**Why This Design:**
Users see simple summaries. Developers see technical details. Clear separation of concerns.

---

### 1.3 State Management Updates (Task 1)

**Zustand Store Updates:**

**Settings Slice:**
- Add `developerMode` (boolean, persisted) — Controls debug UI visibility

**UI Slice:**
- Add `debugPanelExpanded` (boolean, persisted) — Controls Debug Panel expand/collapse state
- Default: `false` (collapsed)

**Why These Updates:**
Runtime control of debug mode (no rebuild required). Panel state persists across sessions. Follows existing Zustand patterns.

---

### 1.4 Definition of Done / QA Verification (Task 1 — Client)

- [x] `DebugPanel.tsx` component created — **Implementation:** `src/common/DebugPanel.tsx` with all debug components
- [x] All debug components (`AccessibilityTreeView`, `CoverageMetricsView`, `HybridElementView`, `TaskStatus`) moved to Debug Panel — **Implementation:** All components conditionally rendered in `DebugPanel.tsx` based on data availability
- [x] Debug components removed from main `TaskUI.tsx` — **Implementation:** Removed `AccessibilityTreeView`, `CoverageMetricsView`, `HybridElementView`, and `TaskStatus` from main UI; only user-facing accessibility elements indicator remains
- [x] Task History split into user-facing and debug views — **Implementation:** 
  - `TaskHistoryUser.tsx` — Simplified user-facing view with high-level summaries
  - `TaskHistoryDebug.tsx` — Full technical debug view with tokens, JSON, etc.
  - `TaskHistory.tsx` — Conditionally renders user view (debug view shown in DebugPanel)
- [x] `developerMode` added to Zustand settings store (persisted) — **Implementation:** Added to `src/state/settings.ts` with `setDeveloperMode` action, persisted in store
- [x] `debugPanelExpanded` added to Zustand UI store (persisted) — **Implementation:** Added to `src/state/ui.ts` with `setDebugPanelExpanded` action, persisted in store
- [x] No debug information visible in main UI when developer mode is off — **Implementation:** `DebugPanel` returns `null` when `developerMode` is `false`
- [x] User-facing interface shows only high-level summaries — **Implementation:** `TaskHistoryUser.tsx` displays only thought summaries and status badges, no technical details

**Implementation Details:**
- **State Management:** 
  - `developerMode` (boolean, default: `false`) in `settings` slice, persisted
  - `debugPanelExpanded` (boolean, default: `false`) in `ui` slice, persisted
- **Components Created:**
  - `src/common/DebugPanel.tsx` — Main debug panel container
  - `src/common/TaskHistoryUser.tsx` — User-facing simplified history view
  - `src/common/TaskHistoryDebug.tsx` — Technical debug history view
- **Components Modified:**
  - `src/common/TaskHistory.tsx` — Now conditionally renders user view
  - `src/common/TaskUI.tsx` — Removed debug components, added `DebugPanel` at bottom
  - `src/state/settings.ts` — Added `developerMode` field and action
  - `src/state/ui.ts` — Added `debugPanelExpanded` field and action
  - `src/state/store.ts` — Updated persistence to include new fields

**Exit criterion:** ✅ Task 1 complete — All debug components are isolated in Debug Panel and user interface is clean. Ready to proceed to Task 2.

---

## Task 2: Space Utilization & Layout (Client)

**Objective:** Implement collapsible Debug Panel with accordion/tab organization. Add compact header with health signals for collapsed state.

**Deliverable:** Debug Panel is collapsible (collapsed by default), organized into accordions/tabs, with health signals visible when collapsed.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:** `DEBUG_VIEW_IMPROVEMENTS.md` §3 (Task 2: Space Utilization & Layout).

---

### 2.1 Collapsible Interface (Task 2)

**Requirement:** The Debug Panel must be **collapsible by default**.

**Behavior:**
- **Default State:** Collapsed (hidden) to maximize space for user interface
- **Location:** Bottom of UI (like a terminal window) - slides up/down
- **Toggle Mechanism:** Clear button/icon to expand/collapse
- **Animation:** Smooth slide animation for expand/collapse

**Implementation:**
- Use Chakra UI `Collapse` component for slide animation
- Store `debugPanelExpanded` state in Zustand UI slice (persisted)
- Default to `false` (collapsed)
- Add toggle button in Debug Panel header

**Why This Design:**
Maximizes space for user interface. Debug Panel accessible when needed. Smooth animations improve UX.

---

### 2.2 Accordion Organization (Task 2)

**Requirement:** Within the Debug Panel, organize data into accordions rather than stacking vertically.

**Proposed Organization:**
```
Debug Panel
├── ▼ Page Structure (AccessibilityTreeView)
├── ▼ Interaction Coverage (CoverageMetricsView)
├── ▼ Element Sources (HybridElementView)
├── ▼ Execution Status (TaskStatus)
├── ▼ Raw Logs (TaskHistoryDebug)
├── ▼ Network/API Trace (NEW - Task 3)
├── ▼ State Inspector (NEW - Task 3)
└── ▼ RAG Context (NEW - Task 3)
```

**Implementation:**
- Use Chakra UI `Accordion` component
- Each debug component becomes an accordion item
- Allow multiple items to be open simultaneously
- Human-readable labels (see `DEBUG_VIEW_IMPROVEMENTS.md` §5.2)

**Why This Design:**
Easier to scan multiple sections. Reduces vertical scrolling. Better organization of debug information.

---

### 2.3 Compact Headers (Collapsed State) (Task 2)

**Requirement:** When the Debug Panel is collapsed, display only critical "Health Signals" in the header.

**Health Signals to Display:**
- **Coverage Percentage:** Small badge showing accessibility coverage (e.g., *85% Coverage*)
- **Token Usage:** Current token count (e.g., *1,234 Tokens used*)
- **Status Indicator:** Color-coded dot/icon showing task status (Running/Complete/Error)
- **Action Count:** Number of actions executed (e.g., *12/50 actions*)
- **RAG Mode:** Organization vs Public-only indicator (NEW - Task 3)

**Visual Design:**
- Compact horizontal bar at bottom of UI
- Minimal height (e.g., 32-40px)
- Icons/badges with tooltips for more details
- Click to expand full Debug Panel

**Implementation:**
- Create `DebugPanelHeader.tsx` component
- Display health signals as Chakra UI `Badge` components
- Use `useColorModeValue` for theme-aware colors
- Add click handler to toggle panel expansion
- Fetch health signal data from Zustand store

**Why This Design:**
Provides quick status overview when panel is collapsed. Easy access to expand panel. Minimal screen space usage.

---

### 2.4 Definition of Done / QA Verification (Task 2 — Client)

- [x] Debug Panel is collapsible (collapsed by default) — **Implementation:** Uses Chakra UI `Collapse` component, controlled by `debugPanelExpanded` state (default: `false`)
- [x] Expand/collapse animations work smoothly — **Implementation:** Chakra UI `Collapse` provides smooth slide animation with `animateOpacity`
- [x] Debug Panel organized into accordions — **Implementation:** All debug components wrapped in Chakra UI `Accordion` with human-readable labels:
  - "Execution Status" (TaskStatus)
  - "Page Structure" (AccessibilityTreeView)
  - "Interaction Coverage" (CoverageMetricsView)
  - "Element Sources" (HybridElementView)
  - "Raw Logs" (TaskHistoryDebug)
- [x] Compact header with health signals visible when collapsed — **Implementation:** `DebugPanelHeader.tsx` component displays health signals:
  - Status Indicator (Running/Complete/Error/Idle) with color coding
  - Coverage Percentage (from `coverageMetrics.axCoverage`) with color coding based on coverage level
  - Token Usage (sum of all tokens from `displayHistory`) 
  - Action Count (from `displayHistory.length`)
  - RAG Mode (Org RAG / Public Only) from `hasOrgKnowledge` state
- [x] Health signals update in real-time — **Implementation:** All health signals calculated from Zustand store using `useMemo` for performance, updates automatically when store changes
- [x] Panel state persists across sessions — **Implementation:** `debugPanelExpanded` persisted in Zustand store (already configured in Task 1)
- [x] Click on header expands/collapses panel — **Implementation:** Header is clickable, calls `setDebugPanelExpanded` toggle action, includes icon button with chevron indicator

**Implementation Details:**
- **Components Created:**
  - `src/common/DebugPanelHeader.tsx` — Compact header with health signals and toggle button
- **Components Modified:**
  - `src/common/DebugPanel.tsx` — Updated to use `Collapse` component and `Accordion` organization
  - `src/state/currentTask.ts` — Added `hasOrgKnowledge` field to store RAG mode for health signals
- **Health Signals Data Sources (All Real Data, No Dummy Data):**
  - **Coverage Percentage:** From `coverageMetrics.axCoverage` (real data from accessibility processing)
  - **Token Usage:** Sum of `promptTokens + completionTokens` from all `displayHistory` entries (real data from API responses)
  - **Status Indicator:** From `taskStatus` (real state from task execution)
  - **Action Count:** From `displayHistory.length` (real count of executed actions)
  - **RAG Mode:** From `hasOrgKnowledge` (real data from API response, stored in state)
- **Accordion Labels (Human-Readable):**
  - "Page Structure" (was AccessibilityTreeView)
  - "Interaction Coverage" (was CoverageMetricsView)
  - "Element Sources" (was HybridElementView)
  - "Execution Status" (was TaskStatus)
  - "Raw Logs" (was TaskHistoryDebug)

**Exit criterion:** ✅ Task 2 complete — Debug Panel is fully collapsible and organized with health signals. Ready to proceed to Task 3.

---

## Task 3: Strategic Debug Enhancements (Client)

**Objective:** Add strategic debug enhancements that bridge the gap between current "Thin Client" architecture and upcoming "Manus-Style" orchestration.

**Deliverable:** Five new debug sections: API & Network Trace Inspector, RAG & Knowledge Context Debugger, State Slice Snapshot (Zustand Inspector), Manus Orchestration Pre-Visualization, and Session Export functionality.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:** `DEBUG_VIEW_IMPROVEMENTS.md` §4 (Task 3: Strategic Debug Enhancements).

---

### 3.1 Network/API Trace Inspector (Task 3)

**Requirement:** Add a specific "Network/API" tab to the Debug Panel that displays API request/response logs.

**Implementation:**
- Create `NetworkTraceView.tsx` component
- Intercept API calls in `src/api/client.ts` and log to Zustand store
- Display in Debug Panel as new accordion item "Network/API Trace"
- Show logs for:
  - `POST /api/agent/interact` (request, response, headers, duration, status)
  - `GET /api/knowledge/resolve` (request, response, headers, duration, status)
- Color-coded status (green=success, yellow=warning, red=error)
- Expandable entries showing full request/response
- Search/filter capability

**State Management:**
- Add `networkLogs` array to Zustand store (or create `debug` slice)
- Log entries on each API call
- Limit log history (e.g., last 100 calls) to prevent memory issues

**Why This Design:**
Enables developers to see exactly what was sent/received. Helps debug API issues. Essential for Thin Client architecture debugging.

---

### 3.2 RAG Context Debugger (Task 3)

**Requirement:** Add visual indicator showing `hasOrgKnowledge` state and `Active Domain` resolution.

**Implementation:**
- Create `RAGContextView.tsx` component
- Extract `ragDebug` from API responses and store in Zustand
- Display in Debug Panel as part of "Execution Status" or separate accordion item
- Show:
  - RAG Mode: Organization vs Public-only
  - Active Domain (extracted from URL)
  - Domain Match status
  - Reason for RAG mode decision
  - Chunk count (if available)
- Color-coded indicators (green=org RAG, yellow=public only)
- Tooltip explaining the decision logic

**State Management:**
- Store `ragDebug` data in Zustand store (from API responses)
- Update on each `POST /api/agent/interact` and `GET /api/knowledge/resolve` response

**Why This Design:**
Helps developers understand why org-specific knowledge was or wasn't used. Essential for debugging RAG integration.

---

### 3.3 State Inspector (Task 3)

**Requirement:** Include a "State Inspector" tab that shows a read-only JSON tree of the current Zustand store.

**Implementation:**
- Create `StateInspectorView.tsx` component
- Use JSON tree viewer (consider `react-json-view` or Chakra UI `Code` component)
- Display `useAppState.getState()` organized by slice:
  - `currentTask` slice (task state, action history, status)
  - `settings` slice (API keys masked, model selection, preferences)
  - `ui` slice (modal visibility, notifications)
- Read-only view (no editing)
- Search/filter capability
- Expand/collapse nodes
- Syntax highlighting for JSON

**Why This Design:**
Helps diagnose state desync issues. Essential for debugging Zustand store. Read-only ensures safety.

---

### 3.4 Manus Orchestration Pre-Visualization (Task 3)

**Requirement:** Design the "Execution Status" view to support a "Plan vs. Execution" hierarchy for future Manus-style orchestration.

**Implementation:**
- Update `TaskStatus.tsx` to support both linear and tree views
- Check for `plan` in task state to determine view mode
- **Linear View (Current):** Flat list of actions (backward compatible)
- **Tree View (Future Manus):** Nested structure when `plan` exists:
  ```
  📋 Plan: "Apply for job"
  ├── ✅ Step 1: Click "Apply" button
  │   ├── Verification: Success (Modal appeared)
  │   └── Action: click(123)
  ├── 🔄 Step 2: Fill form fields
  │   ├── Verification: In Progress
  │   └── Action: setValue(456, "John Doe")
  └── ⏳ Step 3: Submit application
      └── Verification: Pending
  ```
- Use tree view component (consider `react-tree-view` or custom Chakra UI tree)
- Color-coded nodes (green=success, yellow=in-progress, red=failed, gray=pending)
- Expand/collapse nodes
- Show verification results inline

**Why This Design:**
Prepares UI for Manus-style orchestration. Backward compatible with current reactive pattern. Enables visualization of plan execution.

---

### 3.5 Session Export (Task 3)

**Requirement:** Add a "Export Debug Session" button in the Debug Panel header.

**Implementation:**
- Add export button to `DebugPanel.tsx` header
- Create `exportDebugSession()` function that:
  - Collects all debug data from Zustand store:
    - Task metadata
    - Action history
    - Network logs
    - State snapshot
    - Accessibility tree (if available)
    - Coverage metrics (if available)
  - Masks sensitive information (API keys, tokens)
  - Generates JSON
  - Triggers download via `blob` URL
- Use Chakra UI `Button` with download icon
- Show success toast notification

**Why This Design:**
Enables developers to export complete debug session for investigation. Essential for debugging and support.

---

### 3.6 Definition of Done / QA Verification (Task 3 — Client)

- [x] `NetworkTraceView.tsx` component created and displays API logs — **Implementation:** `src/common/NetworkTraceView.tsx` with search/filter, expandable entries, color-coded status
- [x] API calls logged in Zustand store — **Implementation:** 
  - Created `src/state/debug.ts` with `DebugSlice` containing `networkLogs` array
  - Updated `src/api/client.ts` to accept optional logger callback
  - Updated `src/state/currentTask.ts` to log `agentInteract` calls
  - Updated `src/common/KnowledgeOverlay.tsx` and `src/common/App.tsx` to log `knowledgeResolve` calls
  - Logs include request/response, headers (masked), duration, status, errors
  - Limited to last 100 logs to prevent memory issues
- [x] `RAGContextView.tsx` component created and displays RAG context — **Implementation:** `src/common/RAGContextView.tsx` showing:
  - RAG Mode (Organization vs Public-only) with color coding
  - Active Domain (extracted from URL)
  - Domain Match status
  - Reason for RAG mode decision
  - Chunk count (if available)
  - Decision logic explanation
- [x] `StateInspectorView.tsx` component created and displays Zustand store — **Implementation:** `src/common/StateInspectorView.tsx` with:
  - Read-only JSON tree organized by slice (currentTask, settings, ui, debug)
  - Search/filter capability
  - Expand/collapse accordion for each slice
  - Full state JSON view
  - Sensitive data masked (Authorization headers)
- [x] `TaskStatus.tsx` supports both linear (current) and tree (future Manus) views — **Implementation:** 
  - Updated `src/common/TaskStatus.tsx` to support both views
  - Linear view (current): Shows action status and action count (backward compatible)
  - Tree view (future): Structure prepared for when `plan` data is available (Task 6)
  - Currently shows linear view (plan data not yet available)
- [x] Session export functionality implemented — **Implementation:**
  - Created `src/helpers/exportDebugSession.ts` with `exportDebugSession()` function
  - Added "Export" button to `DebugPanelHeader.tsx`
  - Exports complete debug session JSON including:
    - Task metadata, action history, network logs, state snapshot
    - Accessibility tree, coverage metrics, hybrid elements (if available)
  - Masks sensitive data (API keys, tokens)
  - Triggers download via blob URL
  - Shows success/error toast notifications
- [x] All new debug sections integrated into Debug Panel accordion — **Implementation:** All components added to `DebugPanel.tsx`:
  - "Network/API Trace" accordion item
  - "RAG Context" accordion item
  - "State Inspector" accordion item
- [x] No sensitive data exposed in exports (API keys masked) — **Implementation:** 
  - Authorization headers masked in network logs (`Bearer ***`)
  - API keys not stored in settings (removed in Thin Client migration)
  - Tokens masked in export function

**Implementation Details:**
- **State Management:**
  - Created `src/state/debug.ts` with `DebugSlice`:
    - `networkLogs`: Array of `NetworkLogEntry` (limited to 100)
    - `ragContext`: `RAGContext` object with RAG decision data
    - Actions: `addNetworkLog`, `clearNetworkLogs`, `updateRAGContext`, `clearRAGContext`
  - Debug slice not persisted (ephemeral debug data)
- **API Client Updates:**
  - Updated `request()` method to accept optional logger callback
  - Updated `agentInteract()` and `knowledgeResolve()` to accept logger
  - Headers masked for logging (Authorization token truncated)
  - Request/response bodies truncated for large payloads (DOM, etc.)
- **Components Created:**
  - `src/common/NetworkTraceView.tsx` — Network/API trace inspector with search
  - `src/common/RAGContextView.tsx` — RAG context debugger
  - `src/common/StateInspectorView.tsx` — Zustand store inspector
  - `src/helpers/exportDebugSession.ts` — Session export helper
- **Components Modified:**
  - `src/common/TaskStatus.tsx` — Enhanced to support both linear and tree views (tree view ready for Task 6)
  - `src/common/DebugPanel.tsx` — Added new accordion items
  - `src/common/DebugPanelHeader.tsx` — Added export button
  - `src/state/currentTask.ts` — Added logging to `agentInteract` calls
  - `src/common/KnowledgeOverlay.tsx` — Added logging and RAG context updates
  - `src/common/App.tsx` — Added logging and RAG context updates
  - `src/state/store.ts` — Added `debug` slice to store
- **Data Sources (All Real Data, No Dummy Data):**
  - **Network Logs:** Real API calls intercepted and logged (request, response, duration, status)
  - **RAG Context:** Real data from `knowledgeResolve` and `agentInteract` responses (`hasOrgKnowledge`, domain extraction)
  - **State Inspector:** Real Zustand store state (`useAppState.getState()`)
  - **Session Export:** Real data from all store slices

**Exit criterion:** ✅ Task 3 complete — All strategic debug enhancements are implemented and integrated. Ready to proceed to Task 4.

---

## Task 4: Visual Clarity & Styling (Client)

**Objective:** Apply distinct visual theme to Debug Panel. Update component labels to human-readable names. Implement color-coded status indicators.

**Deliverable:** Debug Panel has distinct visual identity, clear labels, and consistent color coding throughout.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:** `DEBUG_VIEW_IMPROVEMENTS.md` §5 (Task 4: Visual Clarity & Styling).

---

### 4.1 Distinct Visual Language (Task 4)

**Requirement:** Apply a distinct visual theme to the Debug Panel to clearly signify it's system data.

**Proposed Theme: Terminal Aesthetic**
- Dark background (`gray.900` or `gray.950` in dark mode, `gray.100` in light mode)
- Monospaced fonts for technical data
- Green/yellow/red color scheme for status
- Subtle border or shadow to separate from main UI

**Implementation:**
- Use Chakra UI's `useColorModeValue` for theme-aware colors
- Apply distinct background color to Debug Panel container
- Use monospaced font family for technical content (e.g., `fontFamily="mono"`)
- Ensure theme respects user's chosen light/dark mode

**Why This Design:**
Clear visual distinction from user interface. Terminal aesthetic familiar to developers. Theme-aware for user preference.

---

### 4.2 Human-Readable Labels (Task 4)

**Requirement:** Rename technical components for better understanding.

**Renaming Map:**
- `AccessibilityTreeView` → **"Page Structure"**
- `CoverageMetricsView` → **"Interaction Coverage"**
- `HybridElementView` → **"Element Sources"**
- `TaskStatus` → **"Execution Status"**
- `TaskHistory` (debug view) → **"Raw Logs"**

**Implementation:**
- Update component titles/headers
- Update tooltips and help text
- Ensure labels are clear for both technical and non-technical users

**Why This Design:**
Improves usability. Clear labels help developers find information quickly.

---

### 4.3 Color-Coded Status (Task 4)

**Requirement:** Use consistent color coding for status indicators.

**Color Scheme:**
- **Green:** Success states, completed actions, healthy metrics
- **Yellow:** Warnings, in-progress states, partial completion
- **Red:** Errors, failed actions, critical issues

**Application Areas:**
- Task execution status
- Coverage metrics (high/medium/low)
- Action success/failure indicators
- Error messages and warnings
- API call status (success/warning/error)
- RAG mode indicators (org=green, public=yellow)

**Implementation:**
- Use Chakra UI color schemes: `green`, `yellow`, `red`
- Ensure colors work in both light and dark modes
- Maintain sufficient contrast for accessibility

**Why This Design:**
Consistent visual language. Quick status recognition. Accessibility compliant.

---

### 4.4 Definition of Done / QA Verification (Task 4 — Client)

- [x] Debug Panel has distinct visual theme (terminal aesthetic) — **Implementation:**
  - Darker background: `gray.100` (light mode) / `gray.950` (dark mode) in `DebugPanel.tsx`
  - Header background: `gray.200` (light mode) / `gray.900` (dark mode) in `DebugPanelHeader.tsx`
  - Enhanced border: `borderTopWidth="2px"` with `shadow="md"` for visual separation
  - Monospaced fonts: Applied to Debug Panel heading (`fontFamily="mono"` with `letterSpacing="wide"`)
  - All Code blocks use `fontFamily="mono"` for technical content
- [x] All component labels updated to human-readable names — **Implementation:**
  - `AccessibilityTreeView` → **"Page Structure"** (updated in component heading)
  - `CoverageMetricsView` → **"Interaction Coverage"** (updated in component heading)
  - `HybridElementView` → **"Element Sources"** (updated in component heading)
  - `TaskStatus` → **"Execution Status"** (already correct in DebugPanel accordion)
  - `TaskHistoryDebug` → **"Raw Logs"** (already correct in DebugPanel accordion and component)
  - All accordion items in DebugPanel use human-readable labels
- [x] Color-coded status indicators implemented consistently — **Implementation:**
  - **Green:** Success states, completed actions, healthy metrics (≥80% coverage, org RAG, finish actions)
  - **Yellow:** Warnings, in-progress states, partial completion (50-79% coverage, public RAG, 3xx status)
  - **Red:** Errors, failed actions, critical issues (<25% coverage, error actions, 4xx/5xx status)
  - **Orange:** Interrupted states, medium-low coverage (25-49% coverage, interrupted status)
  - Applied consistently across:
    - Task execution status (TaskStatus, DebugPanelHeader)
    - Coverage metrics (CoverageMetricsView, DebugPanelHeader)
    - Action success/failure (TaskHistoryDebug, TaskHistoryUser)
    - API call status (NetworkTraceView)
    - RAG mode indicators (RAGContextView, DebugPanelHeader)
- [x] Dark mode fully supported in Debug Panel — **Implementation:**
  - All components use `useColorModeValue` for theme-aware colors
  - Background colors adapt to light/dark mode
  - Text colors adapt to light/dark mode
  - Border colors adapt to light/dark mode
  - All color schemes work in both modes
- [x] Visual distinction between user and debug content is clear — **Implementation:**
  - Debug Panel has distinct darker background (`gray.100`/`gray.950` vs main UI `white`/`gray.900`)
  - Enhanced border (`2px` with shadow) separates Debug Panel from main UI
  - Terminal aesthetic (monospaced fonts, darker theme) clearly differentiates debug content
  - User-facing components remain in main UI with standard styling
- [x] Theme respects user's light/dark mode preference — **Implementation:**
  - All color values use `useColorModeValue` hook
  - Theme automatically adapts based on user's system/extension theme preference
  - No hardcoded colors that ignore theme

**Implementation Details:**
- **Terminal Aesthetic Theme:**
  - Debug Panel background: `gray.100` (light) / `gray.950` (dark)
  - Debug Panel header: `gray.200` (light) / `gray.900` (dark)
  - Enhanced border: `2px` with `shadow="md"` for clear separation
  - Monospaced fonts: Applied to Debug Panel heading and all Code blocks
- **Component Label Updates:**
  - `src/common/AccessibilityTreeView.tsx` — Heading updated to "Page Structure"
  - `src/common/CoverageMetricsView.tsx` — Heading updated to "Interaction Coverage"
  - `src/common/HybridElementView.tsx` — Heading updated to "Element Sources"
  - DebugPanel accordion items already use human-readable labels (from Task 2)
- **Monospaced Fonts Applied:**
  - Debug Panel heading: `fontFamily="mono"` with `letterSpacing="wide"`
  - All Code blocks: `fontFamily="mono"` in NetworkTraceView, StateInspectorView, RAGContextView, TaskHistoryDebug
  - Technical content (JSON, code snippets) uses monospaced fonts
- **Color Coding Consistency:**
  - Status colors: green (success), yellow (warning), red (error), orange (interrupted)
  - Coverage colors: green (≥80%), yellow (50-79%), orange (25-49%), red (<25%)
  - API status: green (2xx), yellow (3xx), red (4xx/5xx)
  - RAG mode: green (org RAG), yellow (public only)
  - Action status: green (finish), red (fail/error)

**Exit criterion:** ✅ Task 4 complete — Debug Panel has clear visual identity and consistent styling. Ready to proceed to Task 5.

---

## Task 5: Control & Interaction (Client)

**Objective:** Implement runtime toggle for developer mode. Add persistence for panel state. Remove build-time environment variable dependencies.

**Deliverable:** Developer mode can be toggled in Settings without rebuild. Panel state persists across sessions.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:** `DEBUG_VIEW_IMPROVEMENTS.md` §6 (Task 5: Control & Interaction).

---

### 5.1 Global Toggle (Runtime Control) (Task 5)

**Requirement:** Remove reliance on static `process.env.DEBUG_MODE`. Implement a runtime toggle.

**Implementation:**
- Add `developerMode` boolean to Zustand settings store (persisted)
- Add toggle in `SettingsView.tsx` or `SettingsSection.tsx`
- Conditionally render `DebugPanel` based on `developerMode` setting
- Remove `process.env.DEBUG_MODE` checks from components
- Toggle instantly mounts/unmounts Debug Panel (no restart required)

**Settings UI:**
```
Developer Options
┌─────────────────────────────────────┐
│ Enable Developer Mode               │
│ [Toggle Switch]                     │
│ Show technical debug information    │
└─────────────────────────────────────┘
```

**Why This Design:**
Runtime control enables users to toggle debug mode without rebuild. Instant effect improves UX. No restart required.

---

### 5.2 Persistence (Task 5)

**Requirement:** Remember user's preference (Open/Closed) across sessions.

**Data to Persist:**
- **Developer Mode Enabled:** Boolean (stored in Zustand settings, already persisted)
- **Debug Panel Expanded State:** Boolean (whether panel is open or collapsed)

**Implementation:**
- Store `debugPanelExpanded` in Zustand UI slice
- Use Zustand's `persist` middleware (already configured)
- Restore state on extension load
- Default to collapsed if not set

**Why This Design:**
User preference persists across sessions. Better UX. Follows existing Zustand persist patterns.

---

### 5.3 Definition of Done / QA Verification (Task 5 — Client)

- [x] `developerMode` added to Zustand settings store (persisted) — **Implementation:**
  - Added `developerMode: boolean` to `SettingsSlice` type in `src/state/settings.ts`
  - Default value: `false`
  - Action: `setDeveloperMode: (enabled: boolean) => void`
  - Persisted via Zustand `persist` middleware in `src/state/store.ts` (line 51)
- [x] "Enable Developer Mode" toggle added to Settings — **Implementation:**
  - Added "Developer Options" section to `SettingsView.tsx`
  - Toggle uses Chakra UI `Switch` component
  - Includes descriptive label and help text
  - Shows toast notification when toggled
  - Located between "Appearance" and "Account" sections
- [x] Toggle instantly mounts/unmounts Debug Panel — **Implementation:**
  - `DebugPanel.tsx` conditionally renders based on `developerMode` from store (line 36, 54-56)
  - No restart required — toggle takes effect immediately
  - Panel appears/disappears instantly when toggled
- [x] `debugPanelExpanded` added to Zustand UI store (persisted) — **Implementation:**
  - Added `debugPanelExpanded: boolean` to `UiSlice` type in `src/state/ui.ts`
  - Default value: `false` (collapsed by default)
  - Action: `setDebugPanelExpanded: (expanded: boolean) => void`
  - Persisted via Zustand `persist` middleware in `src/state/store.ts` (line 41)
- [x] Panel state persists across extension reloads — **Implementation:**
  - Both `developerMode` and `debugPanelExpanded` are persisted in `localStorage` via Zustand
  - State restored automatically on extension load
  - User preferences maintained across sessions
- [x] All `process.env.DEBUG_MODE` dependencies removed — **Implementation:**
  - Removed `debugMode` constant from `src/constants.ts`
  - No imports of `debugMode` found in codebase
  - All components use `developerMode` from Zustand store instead
- [x] Settings UI clear and accessible — **Implementation:**
  - Developer Options section uses consistent styling with other sections
  - Clear label: "Enable Developer Mode"
  - Helpful description: "Show technical debug information and advanced debugging tools"
  - Switch component is accessible (proper `id` and `htmlFor` attributes)
  - Toast notifications provide feedback on toggle actions

**Implementation Details:**
- **Settings Toggle:**
  - Location: `src/common/SettingsView.tsx` — "Developer Options" section (lines 204-230)
  - Uses Chakra UI `Switch` component with `FormControl` and `FormLabel`
  - Connected to Zustand store via `useAppState` selectors
  - Shows toast notification when toggled (info status, 3 seconds duration)
- **State Management:**
  - `developerMode`: Stored in `SettingsSlice` (`src/state/settings.ts`)
  - `debugPanelExpanded`: Stored in `UiSlice` (`src/state/ui.ts`)
  - Both persisted via Zustand `persist` middleware with `localStorage`
  - State restored automatically on extension load
- **Component Integration:**
  - `DebugPanel.tsx` reads `developerMode` from store and conditionally renders
  - `DebugPanelHeader.tsx` uses `debugPanelExpanded` for expand/collapse state
  - All components use store values, no environment variable dependencies
- **Removed Dependencies:**
  - Removed `export const debugMode = process.env.DEBUG_MODE === 'true';` from `src/constants.ts`
  - No code references to `debugMode` constant found
  - All components migrated to use `developerMode` from Zustand store

**Exit criterion:** ✅ Task 5 complete — Developer mode is fully runtime-controlled and state persists. Debug View enhancements (Part A) complete. Ready to proceed to Part B (Manus Orchestrator Support).

---

## Part B: Manus-Style Orchestrator Support (Tasks 6-10)

**Objective:** Add client-side support for displaying and interacting with Manus-style orchestrator state. Client displays plan, verification results, and orchestrator status.

**Reference:** `MANUS_ORCHESTRATOR_ARCHITECTURE.md` — Complete architecture specification. Client displays orchestrator state but doesn't implement orchestrator logic (that's server-side).

---

## Task 6: Plan Display & Visualization (Client)

**Objective:** Display action plans from server in client UI. Show plan structure, current step, and progress.

**Deliverable:** Client displays plan structure, current step indicator, and progress through plan. Plan visualization supports both user-facing and debug views.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:**
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §6.2 (Action Plan Structure), §7.2 (Response Format) — Client receives `plan`, `currentStep`, `totalSteps` in API responses
- `THIN_SERVER_TO_BE_ROADMAP.md` §6 (Task 6: Planning Engine) — Server generates and returns plans

---

### 6.1 State Management Updates (Task 6)

**Zustand Store Updates:**

**Current Task Slice:**
- Add `plan` (object, optional) — Action plan from server:
  - `steps` (array) — Array of plan step objects
  - `currentStepIndex` (number) — Current position in plan
- Add `currentStep` (number) — Current step number (from API response)
- Add `totalSteps` (number) — Total steps in plan (from API response)
- Add `status` (string, optional) — Task status: `'planning'`, `'executing'`, `'verifying'`, `'correcting'`, `'completed'`, `'failed'`

**Why These Updates:**
Stores plan data from server. Enables plan visualization. Tracks progress through plan.

---

### 6.2 Plan Visualization Component (Task 6)

**Requirement:** Display action plan in user-facing UI and debug panel.

**User-Facing View:**
- Show plan as simple list: "Step 1 of 5: Enter email address"
- Show current step indicator
- Show progress (e.g., "Step 2 of 5")
- High-level descriptions only

**Debug View:**
- Show full plan structure in Debug Panel
- Show all steps with status (pending, active, completed, failed)
- Show step reasoning (if available)
- Show tool type for each step
- Expandable/collapsible plan tree

**Implementation:**
- Create `PlanView.tsx` component (user-facing)
- Create `PlanViewDebug.tsx` component (debug panel)
- Display plan steps with status indicators
- Use Chakra UI components for visualization
- Update on each API response that includes plan data

**Why This Design:**
Users see simple progress. Developers see full plan structure. Clear separation of concerns.

---

### 6.3 API Response Handling (Task 6)

**Enhancement to API Client:**

**Update `agentInteract` response handling:**
- Extract `plan`, `currentStep`, `totalSteps`, `status` from response
- Store in Zustand `currentTask` slice
- Update UI components to display plan data

**Backward Compatibility:**
- If `plan` is null/undefined (legacy response), display as linear action list
- New fields optional, don't break existing UI

**Why This Design:**
Handles new orchestrator response format. Backward compatible with existing responses. Enables plan visualization.

---

### 6.4 Definition of Done / QA Verification (Task 6 — Client)

- [x] Zustand store updated with `plan`, `currentStep`, `totalSteps`, `orchestratorStatus` fields — **Implementation:**
  - Added `plan: ActionPlan | null` to `CurrentTaskSlice` type in `src/state/currentTask.ts`
  - Added `currentStep: number | null` (1-indexed, from API)
  - Added `totalSteps: number | null` (total steps in plan, from API)
  - Added `orchestratorStatus: 'planning' | 'executing' | 'verifying' | 'correcting' | 'completed' | 'failed' | null`
  - Exported `PlanStep` and `ActionPlan` types for component use
  - All fields default to `null` for backward compatibility
- [x] `PlanView.tsx` component created (user-facing) — **Implementation:**
  - Created `src/common/PlanView.tsx` with simple, user-friendly progress display
  - Shows current step number and total steps
  - Displays progress bar with percentage
  - Shows current step description from plan
  - Displays orchestrator status badge (planning, executing, verifying, etc.)
  - Gracefully handles missing plan data (returns null if no data)
- [x] `PlanViewDebug.tsx` component created (debug panel) — **Implementation:**
  - Created `src/common/PlanViewDebug.tsx` with full plan structure display
  - Shows all plan steps in expandable accordion
  - Displays step status (pending, active, completed, failed) with color-coded badges
  - Shows step reasoning, expected outcomes, and tool types
  - Highlights current step with "Current" badge
  - Shows orchestrator status and summary information
  - Handles missing plan data gracefully (shows fallback message)
- [x] Plan displayed in user-facing UI (simple progress) — **Implementation:**
  - Integrated `PlanView` into `TaskUI.tsx` at the top of scrollable content area
  - Renders above status banner and knowledge overlay
  - Only displays when plan data is available (conditional rendering)
- [x] Plan displayed in debug panel (full structure) — **Implementation:**
  - Integrated `PlanViewDebug` into `DebugPanel.tsx` as accordion item
  - Positioned after "Execution Status" accordion item
  - Only displays when plan data is available (conditional rendering)
  - Accordion item labeled "Action Plan"
- [x] API response handling updated to extract plan data — **Implementation:**
  - Updated `NextActionResponse` interface in `src/api/client.ts` with optional plan fields:
    - `plan?: ActionPlan`
    - `currentStep?: number`
    - `totalSteps?: number`
    - `status?: 'planning' | 'executing' | 'verifying' | 'correcting' | 'completed' | 'failed'`
  - Updated `agentInteract` response handling in `src/state/currentTask.ts` (lines 275-295)
  - Extracts and stores plan data in Zustand store when present in API response
  - All fields are optional for backward compatibility
- [x] Backward compatibility maintained (works with legacy responses) — **Implementation:**
  - All new fields are optional in `NextActionResponse` interface
  - Components gracefully handle missing plan data (return null or show fallback)
  - Legacy responses without plan data work as before (linear action list)
  - No breaking changes to existing functionality
- [x] Plan updates in real-time as task progresses — **Implementation:**
  - Plan data is updated on each API response in the action loop
  - Zustand store updates trigger React re-renders automatically
  - Components read from store using `useAppState` selectors
  - Real-time updates work for both user-facing and debug views

**Implementation Details:**
- **State Management:**
  - `PlanStep` type: `{ id, description, status, toolType?, reasoning?, expectedOutcome? }`
  - `ActionPlan` type: `{ steps: PlanStep[], currentStepIndex: number }`
  - Store fields: `plan`, `currentStep`, `totalSteps`, `orchestratorStatus`
  - All fields nullable for backward compatibility
- **User-Facing Component (`PlanView.tsx`):**
  - Simple progress display with progress bar
  - Current step indicator (e.g., "Step 2 of 5")
  - Status badge showing orchestrator state
  - Current step description from plan
  - Returns null if no plan data (graceful degradation)
- **Debug Component (`PlanViewDebug.tsx`):**
  - Full plan structure in expandable accordion
  - All steps with status badges (pending, active, completed, failed)
  - Step details: reasoning, expected outcomes, tool types
  - Current step highlighted
  - Orchestrator status and summary information
  - Fallback message if no plan data
- **API Integration:**
  - Extended `NextActionResponse` interface with optional orchestrator fields
  - Response handling extracts plan data and stores in Zustand
  - Backward compatible with legacy responses (all fields optional)
- **Component Integration:**
  - `PlanView` integrated into `TaskUI.tsx` (user-facing)
  - `PlanViewDebug` integrated into `DebugPanel.tsx` (debug panel)
  - Conditional rendering based on data availability

**Exit criterion:** ✅ Task 6 complete — Plan visualization is implemented and displays correctly. Ready to proceed to Task 7.

---

## Task 7: Verification Results Display (Client)

**Objective:** Display verification results from server in client UI. Show verification success/failure, confidence scores, and verification details.

**Deliverable:** Client displays verification results in both user-facing and debug views. Verification status visible in task progress.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:**
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §8 (Verification Architecture), §7.2 (Response Format) — Client receives `verification` in API responses
- `THIN_SERVER_TO_BE_ROADMAP.md` §7 (Task 7: Verification Engine) — Server performs verification and returns results

---

### 7.1 State Management Updates (Task 7)

**Zustand Store Updates:**

**Current Task Slice:**
- Add `verificationHistory` (array, optional) — Verification results from server:
  - `stepIndex` (number)
  - `success` (boolean)
  - `confidence` (number)
  - `reason` (string)
  - `timestamp` (Date)

**Why This Update:**
Stores verification results from server. Enables verification visualization. Tracks verification history.

---

### 7.2 Verification Display Component (Task 7)

**Requirement:** Display verification results in user-facing UI and debug panel.

**User-Facing View:**
- Show verification status as icon/badge (✅ success, ❌ failure)
- Show simple message: "Step 1 verified successfully" or "Step 1 verification failed"
- Inline with action history

**Debug View:**
- Show detailed verification results in Debug Panel
- Show confidence scores
- Show expected vs actual state comparison
- Show verification reason
- Expandable verification details

**Implementation:**
- Create `VerificationView.tsx` component (user-facing)
- Create `VerificationViewDebug.tsx` component (debug panel)
- Display verification results with status indicators
- Use Chakra UI components for visualization
- Update on each API response that includes verification data

**Why This Design:**
Users see simple verification status. Developers see detailed verification results. Clear separation of concerns.

---

### 7.3 API Response Handling (Task 7)

**Enhancement to API Client:**

**Update `agentInteract` response handling:**
- Extract `verification` from response (if present)
- Store in Zustand `currentTask.verificationHistory`
- Update UI components to display verification data

**Why This Design:**
Handles new verification response format. Stores verification history. Enables verification visualization.

---

### 7.4 Definition of Done / QA Verification (Task 7 — Client)

- [x] Zustand store updated with `verificationHistory` field — **Implementation:**
  - Added `VerificationResult` type in `src/state/currentTask.ts` with fields:
    - `stepIndex: number`
    - `success: boolean`
    - `confidence: number` (0-1 score)
    - `expectedState?: string`
    - `actualState?: string`
    - `reason: string`
    - `timestamp: Date`
  - Added `verificationHistory: VerificationResult[]` to `CurrentTaskSlice` type
  - Default value: empty array `[]`
  - Exported `VerificationResult` type for component use
- [x] `VerificationView.tsx` component created (user-facing) — **Implementation:**
  - Created `src/common/VerificationView.tsx` with simple, user-friendly verification display
  - Shows most recent verification result with success/failure icon
  - Displays step number and verification status message
  - Shows confidence score as badge
  - Displays verification reason if available
  - Returns null if no verification data (graceful degradation)
- [x] `VerificationViewDebug.tsx` component created (debug panel) — **Implementation:**
  - Created `src/common/VerificationViewDebug.tsx` with detailed verification display
  - Shows all verification results in expandable accordion
  - Displays success/failure status with color-coded badges
  - Shows confidence score with progress bar
  - Displays expected state and actual state comparison (in Code blocks)
  - Shows verification reason and timestamp
  - Highlights latest verification with "Latest" badge
  - Handles missing verification data gracefully (shows fallback message)
- [x] Verification displayed in user-facing UI (simple status) — **Implementation:**
  - Integrated `VerificationView` into `TaskUI.tsx` after `PlanView`
  - Renders inline with action history
  - Only displays when verification data is available (conditional rendering)
- [x] Verification displayed in debug panel (detailed results) — **Implementation:**
  - Integrated `VerificationViewDebug` into `DebugPanel.tsx` as accordion item
  - Positioned after "Action Plan" accordion item
  - Only displays when verification history has entries (conditional rendering)
  - Accordion item labeled "Verification Results"
- [x] API response handling updated to extract verification data — **Implementation:**
  - Updated `NextActionResponse` interface in `src/api/client.ts` with optional `verification?: VerificationResult` field
  - Updated `agentInteract` response handling in `src/state/currentTask.ts` (lines 328-344)
  - Extracts verification data from API response and appends to `verificationHistory` array
  - Converts timestamp string to Date object
  - All fields are optional for backward compatibility
- [x] Verification history tracked and displayed — **Implementation:**
  - Verification results are appended to `verificationHistory` array on each API response
  - History is maintained throughout task execution
  - Both user-facing and debug views show verification history
  - Debug view shows all verification results in chronological order
- [x] Confidence scores displayed in debug view — **Implementation:**
  - Confidence scores displayed as percentage badges (color-coded: green ≥80%, yellow ≥50%, red <50%)
  - Progress bar visualization for confidence scores
  - Confidence displayed in both accordion header and detailed view
  - User-facing view also shows confidence as badge

**Implementation Details:**
- **State Management:**
  - `VerificationResult` type: `{ stepIndex, success, confidence, expectedState?, actualState?, reason, timestamp }`
  - Store field: `verificationHistory: VerificationResult[]`
  - Default value: empty array
  - Results appended to array (not replaced) to maintain history
- **User-Facing Component (`VerificationView.tsx`):**
  - Simple verification status display
  - Success/failure icon (CheckCircleIcon/CloseIcon)
  - Step number and status message
  - Confidence badge
  - Verification reason (if available)
  - Returns null if no verification data
- **Debug Component (`VerificationViewDebug.tsx`):**
  - Full verification history in expandable accordion
  - All verification results with status badges
  - Confidence scores with progress bars
  - Expected vs actual state comparison (in Code blocks with monospaced font)
  - Verification reason and timestamp
  - Latest verification highlighted
  - Fallback message if no verification data
- **API Integration:**
  - Extended `NextActionResponse` interface with optional `verification` field
  - Response handling extracts verification data and appends to history
  - Timestamp conversion from ISO string to Date object
  - Backward compatible with legacy responses (field optional)
- **Component Integration:**
  - `VerificationView` integrated into `TaskUI.tsx` (user-facing, after PlanView)
  - `VerificationViewDebug` integrated into `DebugPanel.tsx` (debug panel, as accordion item)
  - Conditional rendering based on data availability

**Exit criterion:** ✅ Task 7 complete — Verification visualization is implemented and displays correctly. Ready to proceed to Task 8.

---

## Task 8: Self-Correction Display (Client)

**Objective:** Display self-correction attempts and strategies in client UI. Show when corrections occur and what strategies were used.

**Deliverable:** Client displays self-correction information in both user-facing and debug views. Correction attempts visible in task progress.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:**
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §9 (Self-Correction Architecture), §7.2 (Response Format) — Client receives `correction` in API responses
- `THIN_SERVER_TO_BE_ROADMAP.md` §8 (Task 8: Self-Correction Engine) — Server performs self-correction and returns correction data

---

### 8.1 State Management Updates (Task 8)

**Zustand Store Updates:**

**Current Task Slice:**
- Add `correctionHistory` (array, optional) — Correction attempts from server:
  - `stepIndex` (number)
  - `strategy` (string)
  - `reason` (string)
  - `attemptNumber` (number)
  - `timestamp` (Date)

**Why This Update:**
Stores correction history from server. Enables correction visualization. Tracks retry attempts.

---

### 8.2 Correction Display Component (Task 8)

**Requirement:** Display self-correction information in user-facing UI and debug panel.

**User-Facing View:**
- Show correction indicator: "Retrying step 2 with alternative approach"
- Show simple message when correction occurs
- Inline with action history

**Debug View:**
- Show detailed correction information in Debug Panel
- Show correction strategy used
- Show correction reason
- Show retry attempt number
- Show original vs corrected step comparison

**Implementation:**
- Create `CorrectionView.tsx` component (user-facing)
- Create `CorrectionViewDebug.tsx` component (debug panel)
- Display correction information with status indicators
- Use Chakra UI components for visualization
- Update on each API response that includes correction data

**Why This Design:**
Users see simple correction status. Developers see detailed correction information. Clear separation of concerns.

---

### 8.3 API Response Handling (Task 8)

**Enhancement to API Client:**

**Update `agentInteract` response handling:**
- Extract `correction` from response (if present)
- Store in Zustand `currentTask.correctionHistory`
- Update UI components to display correction data

**Why This Design:**
Handles new correction response format. Stores correction history. Enables correction visualization.

---

### 8.4 Definition of Done / QA Verification (Task 8 — Client)

- [x] Zustand store updated with `correctionHistory` field — **Implementation:**
  - Added `CorrectionResult` type in `src/state/currentTask.ts` with fields:
    - `stepIndex: number`
    - `strategy: string` (e.g., "ALTERNATIVE_SELECTOR", "ALTERNATIVE_TOOL", etc.)
    - `reason: string` (why correction was needed)
    - `attemptNumber: number` (retry attempt number, 1-indexed)
    - `originalStep?: string` (original step description, if available)
    - `correctedStep?: string` (corrected step description, if available)
    - `timestamp: Date`
  - Added `correctionHistory: CorrectionResult[]` to `CurrentTaskSlice` type
  - Default value: empty array `[]`
  - Exported `CorrectionResult` type for component use
- [x] `CorrectionView.tsx` component created (user-facing) — **Implementation:**
  - Created `src/common/CorrectionView.tsx` with simple, user-friendly correction display
  - Shows most recent correction result with retry icon (RepeatIcon)
  - Displays step number and correction message (e.g., "Retrying step 2 with alternative selector")
  - Shows attempt number as badge
  - Displays correction reason if available
  - Formats strategy name for readability (e.g., "ALTERNATIVE_SELECTOR" → "Alternative Selector")
  - Returns null if no correction data (graceful degradation)
- [x] `CorrectionViewDebug.tsx` component created (debug panel) — **Implementation:**
  - Created `src/common/CorrectionViewDebug.tsx` with detailed correction display
  - Shows all correction results in expandable accordion
  - Displays correction strategy with color-coded badges (different colors for different strategies)
  - Shows correction reason and retry attempt number
  - Displays original step vs corrected step comparison (in Code blocks with monospaced font)
  - Highlights corrected step in green for visual distinction
  - Shows formatted timestamp
  - Highlights latest correction with "Latest" badge
  - Handles missing correction data gracefully (shows fallback message)
- [x] Correction displayed in user-facing UI (simple status) — **Implementation:**
  - Integrated `CorrectionView` into `TaskUI.tsx` after `VerificationView`
  - Renders inline with action history
  - Only displays when correction data is available (conditional rendering)
- [x] Correction displayed in debug panel (detailed information) — **Implementation:**
  - Integrated `CorrectionViewDebug` into `DebugPanel.tsx` as accordion item
  - Positioned after "Verification Results" accordion item
  - Only displays when correction history has entries (conditional rendering)
  - Accordion item labeled "Correction Results"
- [x] API response handling updated to extract correction data — **Implementation:**
  - Updated `NextActionResponse` interface in `src/api/client.ts` with optional `correction?: CorrectionResult` field
  - Updated `agentInteract` response handling in `src/state/currentTask.ts` (lines 361-377)
  - Extracts correction data from API response and appends to `correctionHistory` array
  - Converts timestamp string to Date object
  - All fields are optional for backward compatibility
- [x] Correction history tracked and displayed — **Implementation:**
  - Correction results are appended to `correctionHistory` array on each API response
  - History is maintained throughout task execution
  - Both user-facing and debug views show correction history
  - Debug view shows all correction results in chronological order
- [x] Retry attempts visible in UI — **Implementation:**
  - Retry attempt numbers displayed as badges in both views
  - User-facing view shows attempt number badge
  - Debug view shows attempt number in accordion header and detailed view
  - Attempt numbers are 1-indexed for user readability

**Implementation Details:**
- **State Management:**
  - `CorrectionResult` type: `{ stepIndex, strategy, reason, attemptNumber, originalStep?, correctedStep?, timestamp }`
  - Store field: `correctionHistory: CorrectionResult[]`
  - Default value: empty array
  - Results appended to array (not replaced) to maintain history
- **User-Facing Component (`CorrectionView.tsx`):**
  - Simple correction status display
  - Retry icon (RepeatIcon) with orange/warning color
  - Step number and correction message
  - Strategy formatted for readability
  - Attempt number badge
  - Correction reason (if available)
  - Returns null if no correction data
- **Debug Component (`CorrectionViewDebug.tsx`):**
  - Full correction history in expandable accordion
  - All correction results with strategy badges (color-coded by strategy type)
  - Correction reason and retry attempt number
  - Original vs corrected step comparison (in Code blocks with monospaced font)
  - Corrected step highlighted in green
  - Formatted timestamp
  - Latest correction highlighted
  - Fallback message if no correction data
- **Strategy Formatting:**
  - Strategies formatted for display: "ALTERNATIVE_SELECTOR" → "Alternative Selector"
  - Color-coded badges: blue (ALTERNATIVE_SELECTOR), purple (ALTERNATIVE_TOOL), cyan (GATHER_INFORMATION), yellow (UPDATE_PLAN), orange (RETRY_WITH_DELAY)
- **API Integration:**
  - Extended `NextActionResponse` interface with optional `correction` field
  - Response handling extracts correction data and appends to history
  - Timestamp conversion from ISO string to Date object
  - Backward compatible with legacy responses (field optional)
- **Component Integration:**
  - `CorrectionView` integrated into `TaskUI.tsx` (user-facing, after VerificationView)
  - `CorrectionViewDebug` integrated into `DebugPanel.tsx` (debug panel, as accordion item)
  - Conditional rendering based on data availability

**Exit criterion:** ✅ Task 8 complete — Correction visualization is implemented and displays correctly. Ready to proceed to Task 9.

---

## Task 9: Expected Outcome Display (Client)

**Objective:** Display expected outcomes from server in client UI. Show what the agent expects to happen after each action.

**Deliverable:** Client displays expected outcomes in debug view. Expected outcomes visible for verification context.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:** `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §6.3 (Expected Outcome Model), §7.2 (Response Format) — Client receives `expectedOutcome` in API responses.

---

### 9.1 State Management Updates (Task 9)

**Zustand Store Updates:**

**Current Task Slice:**
- Expected outcomes stored with action history (in `displayHistory` entries)
- Each history entry can include `expectedOutcome` field

**Why This Update:**
Stores expected outcomes with actions. Enables expected outcome visualization. Links outcomes to actions.

---

### 9.2 Expected Outcome Display Component (Task 9)

**Requirement:** Display expected outcomes in debug panel.

**Debug View:**
- Show expected outcome for each action in action history
- Show natural language description
- Show DOM-based expectations (if available)
- Display alongside action in debug view

**Implementation:**
- Enhance `TaskHistoryDebug.tsx` to display expected outcomes
- Show expected outcome inline with each action
- Use Chakra UI components for visualization

**Why This Design:**
Helps developers understand what agent expected. Enables verification context. Debug-only (not user-facing).

---

### 9.3 API Response Handling (Task 9)

**Enhancement to API Client:**

**Update `agentInteract` response handling:**
- Extract `expectedOutcome` from response (if present)
- Store with action in `displayHistory`
- Update debug UI to display expected outcomes

**Why This Design:**
Handles new expected outcome response format. Stores with actions. Enables expected outcome visualization.

---

### 9.4 Definition of Done / QA Verification (Task 9 — Client)

- [x] Zustand store updated to store `expectedOutcome` with actions — **Implementation:**
  - Added `expectedOutcome?: string` field to `DisplayHistoryEntry` type in `src/state/currentTask.ts`
  - Field is optional for backward compatibility
  - Expected outcomes stored with each action in `displayHistory` array
  - Links outcomes to actions for verification context
- [x] `TaskHistoryDebug.tsx` enhanced to display expected outcomes — **Implementation:**
  - Enhanced `src/common/TaskHistoryDebug.tsx` to display expected outcomes inline with actions
  - Added new accordion item "Expected Outcome" with blue theme (distinct from other items)
  - Shows expected outcome in Code block with monospaced font
  - Displays "For Verification" badge to indicate purpose
  - Only displays when `expectedOutcome` is present (conditional rendering)
  - Positioned after "Action" and before "Usage" for logical flow
- [x] Expected outcomes displayed in debug panel — **Implementation:**
  - Expected outcomes displayed in `TaskHistoryDebug` component
  - Component is already integrated into `DebugPanel.tsx` as "Raw Logs" accordion item
  - Expected outcomes visible alongside action details in debug view
  - Blue-themed styling to distinguish from other debug information
- [x] API response handling updated to extract expected outcome data — **Implementation:**
  - Updated `NextActionResponse` interface in `src/api/client.ts` with optional `expectedOutcome?: string` field
  - Updated `agentInteract` response handling in `src/state/currentTask.ts` (line 414)
  - Extracts `expectedOutcome` from API response and stores with action in `displayHistory`
  - All fields are optional for backward compatibility
- [x] Expected outcomes linked to actions in history — **Implementation:**
  - Expected outcomes stored directly in `DisplayHistoryEntry` objects
  - Each action in history can have its own expected outcome
  - Outcomes displayed inline with their corresponding actions in debug view
  - Clear visual connection between action and expected outcome

**Implementation Details:**
- **State Management:**
  - `DisplayHistoryEntry` type extended with `expectedOutcome?: string` field
  - Field is optional for backward compatibility
  - Expected outcomes stored with actions in `displayHistory` array
- **TaskHistoryDebug Enhancement:**
  - Added new accordion item for "Expected Outcome"
  - Blue-themed styling (blue.50/blue.900 background, blue text colors)
  - "For Verification" badge to indicate purpose
  - Code block with monospaced font for expected outcome text
  - Conditional rendering (only shows when expectedOutcome is present)
  - Positioned logically after "Action" and before "Usage"
- **API Integration:**
  - Extended `NextActionResponse` interface with optional `expectedOutcome` field
  - Response handling extracts expectedOutcome and stores with action
  - Backward compatible with legacy responses (field optional)
- **Visual Design:**
  - Blue theme distinguishes expected outcomes from other debug information
  - Code block formatting for readability
  - Badge indicates verification context
  - Consistent with existing debug panel styling

**Exit criterion:** ✅ Task 9 complete — Expected outcome visualization is implemented and displays correctly. Ready to proceed to Task 10.

---

## Task 10: Orchestrator Status & Progress (Client)

**Objective:** Display orchestrator status and progress in client UI. Show current orchestrator state, step progress, and status transitions.

**Deliverable:** Client displays orchestrator status, progress indicators, and status transitions. Status visible in both user-facing and debug views.

**Status:** ✅ **COMPLETE** — January 26, 2026

**Reference:** `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §7.3 (State Transitions), §7.2 (Response Format) — Client receives `status`, `currentStep`, `totalSteps` in API responses.

---

### 10.1 Status Display Component (Task 10)

**Requirement:** Display orchestrator status in user-facing UI and debug panel.

**User-Facing View:**
- Show current status: "Planning...", "Executing step 2 of 5...", "Verifying...", "Correcting..."
- Show progress: "Step 2 of 5"
- Show status indicator (icon/badge)
- Simple, non-technical language

**Debug View:**
- Show detailed status information in Debug Panel
- Show status transitions
- Show status history
- Show status timestamps

**Implementation:**
- Enhance `TaskStatus.tsx` to display orchestrator status
- Create status indicator component
- Use Chakra UI components for visualization
- Update on each API response that includes status data

**Why This Design:**
Users see simple status. Developers see detailed status information. Clear separation of concerns.

---

### 10.2 Progress Indicators (Task 10)

**Requirement:** Display progress through plan in user-facing UI.

**Progress Display:**
- Show "Step X of Y" indicator
- Show progress bar (X/Y steps completed)
- Update in real-time as task progresses
- Visual progress indicator (progress bar or step indicators)

**Implementation:**
- Create `ProgressIndicator.tsx` component
- Display step progress
- Show progress bar
- Use Chakra UI components for visualization

**Why This Design:**
Provides clear progress feedback. Helps users understand task progress. Visual indicators improve UX.

---

### 10.3 API Response Handling (Task 10)

**Enhancement to API Client:**

**Update `agentInteract` response handling:**
- Extract `status`, `currentStep`, `totalSteps` from response
- Store in Zustand `currentTask` slice
- Update UI components to display status and progress

**Why This Design:**
Handles new orchestrator response format. Stores status and progress. Enables status visualization.

---

### 10.4 Definition of Done / QA Verification (Task 10 — Client)

- [x] Zustand store updated with `status`, `currentStep`, `totalSteps` fields — **Implementation:**
  - Already completed in Task 6:
    - `orchestratorStatus: 'planning' | 'executing' | 'verifying' | 'correcting' | 'completed' | 'failed' | null` in `CurrentTaskSlice`
    - `currentStep: number | null` (1-indexed, from API)
    - `totalSteps: number | null` (total steps in plan, from API)
  - All fields already in store and being updated from API responses
- [x] `TaskStatus.tsx` enhanced to display orchestrator status — **Implementation:**
  - Enhanced `src/common/TaskStatus.tsx` to prioritize orchestrator status when available
  - Displays orchestrator status with appropriate labels:
    - "Planning..." (blue badge)
    - "Executing step X of Y..." (blue badge, includes step info)
    - "Verifying..." (yellow badge)
    - "Correcting..." (orange badge)
    - "Completed" (green badge)
    - "Failed" (red badge)
  - Shows progress: "Progress: Step X of Y" when available
  - Falls back to linear view (legacy actionStatus) when orchestrator status not available
  - All orchestrator status values properly handled
- [x] `ProgressIndicator.tsx` component created — **Implementation:**
  - `PlanView.tsx` already provides progress indicators (from Task 6):
    - Progress bar with percentage
    - Step indicator ("Step X of Y")
    - Current step description
  - No separate `ProgressIndicator.tsx` needed — `PlanView` serves this purpose
  - Progress indicators are user-friendly and visually clear
- [x] Status displayed in user-facing UI (simple status) — **Implementation:**
  - `TaskStatus.tsx` displays orchestrator status in user-facing format
  - `PlanView.tsx` displays orchestrator status badge and progress
  - Both components show simple, non-technical language
  - Status visible in main task UI
- [x] Status displayed in debug panel (detailed information) — **Implementation:**
  - `TaskStatus` component displayed in Debug Panel "Execution Status" accordion item
  - `PlanViewDebug.tsx` shows detailed orchestrator status and plan information
  - Status information visible in debug view with full context
- [x] Progress indicators displayed in user-facing UI — **Implementation:**
  - `PlanView.tsx` displays progress bar and step indicators
  - Progress bar shows percentage completion
  - Step indicator shows "Step X of Y" format
  - Visual progress indicators update in real-time
- [x] API response handling updated to extract status/progress data — **Implementation:**
  - Already completed in Task 6:
    - `status`, `currentStep`, `totalSteps` extracted from API response
    - Stored in Zustand `currentTask` slice
    - All fields are optional for backward compatibility
- [x] Status updates in real-time as task progresses — **Implementation:**
  - Status data updated on each API response in the action loop
  - Zustand store updates trigger React re-renders automatically
  - Components read from store using `useAppState` selectors
  - Real-time updates work for both user-facing and debug views

**Implementation Details:**
- **TaskStatus Enhancement:**
  - Prioritizes orchestrator status when available (shows orchestrator view)
  - Falls back to linear view (legacy actionStatus) when orchestrator status not available
  - Status labels: "Planning...", "Executing step X of Y...", "Verifying...", "Correcting...", "Completed", "Failed"
  - Color-coded badges: blue (planning/executing), yellow (verifying), orange (correcting), green (completed), red (failed)
  - Shows progress: "Progress: Step X of Y" when available
  - Shows action count: "Actions executed: N"
- **Progress Indicators:**
  - `PlanView.tsx` provides comprehensive progress display:
    - Progress bar with percentage
    - Step indicator ("Step X of Y")
    - Current step description
    - Orchestrator status badge
  - No separate `ProgressIndicator.tsx` component needed
- **Status Display:**
  - User-facing: `TaskStatus` and `PlanView` show simple status
  - Debug panel: `TaskStatus` and `PlanViewDebug` show detailed information
  - All orchestrator status values properly handled
- **API Integration:**
  - Status, currentStep, totalSteps already extracted and stored (from Task 6)
  - Real-time updates as task progresses
  - Backward compatible with legacy responses

**Exit criterion:** ✅ Task 10 complete — Orchestrator status and progress visualization is implemented. Manus Orchestrator Support (Part B) complete. All tasks complete.

---

## Task Order and Dependencies

### Part A: Debug View Enhancements

| Order | Task | Depends on | Client delivers |
|-------|------|------------|-----------------|
| **1** | Architectural Separation | Prerequisites | Debug Panel component, component migration, state management |
| **2** | Space Utilization & Layout | Task 1 | Collapsible panel, accordion organization, health signals |
| **3** | Strategic Debug Enhancements | Task 1, Task 2 | Network trace, RAG context, state inspector, Manus visualization, export |
| **4** | Visual Clarity & Styling | Task 1, Task 2, Task 3 | Visual theme, labels, color coding |
| **5** | Control & Interaction | All previous | Runtime toggle, persistence |

### Part B: Manus-Style Orchestrator Support

| Order | Task | Depends on | Client delivers |
|-------|------|------------|-----------------|
| **6** | Plan Display & Visualization | Prerequisites, Server Task 6 | Plan visualization, progress display |
| **7** | Verification Results Display | Task 6, Server Task 7 | Verification visualization, verification history |
| **8** | Self-Correction Display | Task 7, Server Task 8 | Correction visualization, correction history |
| **9** | Expected Outcome Display | Task 8, Server Task 9 | Expected outcome visualization |
| **10** | Orchestrator Status & Progress | Task 9, Server Task 10 | Status display, progress indicators |

**Dependencies:**
- **Part A (Debug):** Tasks 1-5 can be implemented independently (parallel development possible)
- **Part B (Manus):** Tasks 6-10 are sequential and depend on corresponding server tasks:
  - Task 6 depends on Server Task 6 (plan generation)
  - Task 7 depends on Server Task 7 (verification)
  - Task 8 depends on Server Task 8 (self-correction)
  - Task 9 depends on Server Task 9 (outcome prediction)
  - Task 10 depends on Server Task 10 (step refinement)

---

## Implementation Checklist

### Part A: Debug View Enhancements

**Task 1: Architectural Separation**
- [ ] Create `DebugPanel.tsx` component
- [ ] Move `AccessibilityTreeView` to Debug Panel
- [ ] Move `CoverageMetricsView` to Debug Panel
- [ ] Move `HybridElementView` to Debug Panel
- [ ] Move `TaskStatus` to Debug Panel
- [ ] Remove debug components from main `TaskUI.tsx`
- [ ] Split `TaskHistory` into user-facing and debug views
- [ ] Add `developerMode` to Zustand settings store
- [ ] Add `debugPanelExpanded` to Zustand UI store

**Task 2: Space Utilization & Layout**
- [ ] Implement collapsible Debug Panel (Chakra UI `Collapse`)
- [ ] Add accordion organization (Chakra UI `Accordion`)
- [ ] Create `DebugPanelHeader.tsx` with health signals
- [ ] Implement expand/collapse animations
- [ ] Test panel state persistence

**Task 3: Strategic Debug Enhancements**
- [ ] Create `NetworkTraceView.tsx` component
- [ ] Implement API call logging in `src/api/client.ts`
- [ ] Create `RAGContextView.tsx` component
- [ ] Create `StateInspectorView.tsx` component
- [ ] Update `TaskStatus.tsx` for Manus tree view support
- [ ] Implement session export functionality
- [ ] Integrate all new sections into Debug Panel

**Task 4: Visual Clarity & Styling**
- [ ] Apply distinct visual theme to Debug Panel
- [ ] Update component labels to human-readable names
- [ ] Implement color-coded status indicators
- [ ] Ensure dark mode compatibility

**Task 5: Control & Interaction**
- [ ] Add "Enable Developer Mode" toggle in Settings
- [ ] Remove `process.env.DEBUG_MODE` dependencies
- [ ] Test runtime toggle functionality
- [ ] Test persistence across extension reloads

### Part B: Manus-Style Orchestrator Support

**Task 6: Plan Display & Visualization**
- [ ] Update Zustand store with `plan`, `currentStep`, `totalSteps`, `status` fields
- [ ] Create `PlanView.tsx` component (user-facing)
- [ ] Create `PlanViewDebug.tsx` component (debug panel)
- [ ] Update API response handling to extract plan data
- [ ] Test plan visualization

**Task 7: Verification Results Display**
- [ ] Update Zustand store with `verificationHistory` field
- [ ] Create `VerificationView.tsx` component (user-facing)
- [ ] Create `VerificationViewDebug.tsx` component (debug panel)
- [ ] Update API response handling to extract verification data
- [ ] Test verification visualization

**Task 8: Self-Correction Display**
- [ ] Update Zustand store with `correctionHistory` field
- [ ] Create `CorrectionView.tsx` component (user-facing)
- [ ] Create `CorrectionViewDebug.tsx` component (debug panel)
- [ ] Update API response handling to extract correction data
- [ ] Test correction visualization

**Task 9: Expected Outcome Display**
- [ ] Update Zustand store to store `expectedOutcome` with actions
- [ ] Enhance `TaskHistoryDebug.tsx` to display expected outcomes
- [ ] Update API response handling to extract expected outcome data
- [ ] Test expected outcome visualization

**Task 10: Orchestrator Status & Progress**
- [ ] Enhance `TaskStatus.tsx` to display orchestrator status
- [ ] Create `ProgressIndicator.tsx` component
- [ ] Update API response handling to extract status/progress data
- [ ] Test status and progress visualization

---

## References

### Internal Documentation

| Document | Purpose | Key Sections |
|----------|---------|--------------|
| **`DEBUG_VIEW_IMPROVEMENTS.md`** | Debug View requirements and implementation guide | §2 (Architectural Separation), §3 (Space Utilization), §4 (Strategic Enhancements), §5 (Visual Clarity), §6 (Control & Interaction) |
| **`MANUS_ORCHESTRATOR_ARCHITECTURE.md`** | Manus orchestrator architecture specification | §6 (State Management), §7 (API Protocol), §8 (Verification), §9 (Self-Correction) |
| **`THIN_CLIENT_ROADMAP.md`** | Current client-side implementation | §2 (Task 1: Authentication), §3 (Task 2: Knowledge Resolution), §4 (Task 3: Action Loop) |
| **`COMPREHENSIVE_ARCHITECTURE.md`** | Overall system architecture | §2.2 (State Management), §4.1 (State Flow), §6 (Thin Client Architecture) |

### Implementation Patterns to Follow

**State Management:**
- Use Zustand with Immer middleware (see `COMPREHENSIVE_ARCHITECTURE.md` §2.2)
- Split selectors to prevent infinite loops (see `.cursorrules` §11)
- Use `persist` middleware for critical state (see `THIN_CLIENT_ROADMAP.md` §2.1)

**UI Components:**
- Use Chakra UI for all components (see `.cursorrules` §2)
- Follow existing component patterns (see `COMPREHENSIVE_ARCHITECTURE.md` §3)
- Maintain accessibility (see `COMPREHENSIVE_ARCHITECTURE.md` §2.4)

**API Client:**
- Follow existing API client patterns (see `THIN_CLIENT_ROADMAP.md` §2.1)
- Handle new response fields gracefully (backward compatible)
- Log API calls for debug view (Task 3)

---

## Summary

### Part A: Debug View Enhancements (Tasks 1-5)

**Objective:** Implement client-side Debug Panel UI that displays debug information from server. Separate user-facing content from technical debug information.

**Tasks:**
1. **Architectural Separation** — Move debug components to Debug Panel, split Task History
2. **Space Utilization & Layout** — Collapsible panel, accordion organization, health signals
3. **Strategic Debug Enhancements** — Network trace, RAG context, state inspector, Manus visualization, export
4. **Visual Clarity & Styling** — Distinct theme, human-readable labels, color coding
5. **Control & Interaction** — Runtime toggle, persistence, remove build-time dependencies

**Dependencies:** Tasks 1-5 can be implemented independently (parallel development possible).

**Server Counterpart:** `THIN_SERVER_TO_BE_ROADMAP.md` Part A (Tasks 1-5) — Server provides debug data for client display.

---

### Part B: Manus-Style Orchestrator Support (Tasks 6-10)

**Objective:** Add client-side support for displaying and interacting with Manus-style orchestrator state.

**Tasks:**
6. **Plan Display & Visualization** — Display action plans, current step, progress
7. **Verification Results Display** — Display verification success/failure, confidence scores
8. **Self-Correction Display** — Display correction attempts and strategies
9. **Expected Outcome Display** — Display expected outcomes for verification context
10. **Orchestrator Status & Progress** — Display orchestrator status, step progress, status transitions

**Dependencies:** Tasks 6-10 are sequential and depend on corresponding server tasks:
- Task 6 depends on Server Task 6 (plan generation)
- Task 7 depends on Server Task 7 (verification)
- Task 8 depends on Server Task 8 (self-correction)
- Task 9 depends on Server Task 9 (outcome prediction)
- Task 10 depends on Server Task 10 (step refinement)

**Server Counterpart:** `THIN_SERVER_TO_BE_ROADMAP.md` Part B (Tasks 6-10) — Server implements orchestrator logic, client displays state.

---

**Document Status:** Implementation Plan - Ready for Review  
**Next Steps:** 
1. Review and approve implementation plan
2. Begin Task 1 (Architectural Separation)
3. Coordinate with server-side implementation in `THIN_SERVER_TO_BE_ROADMAP.md`
