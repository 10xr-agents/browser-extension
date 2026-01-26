# Debug View Improvements: Implementation Roadmap

**Document Version:** 2.0  
**Last Updated:** January 26, 2026  
**Date:** January 26, 2026  
**Status:** Requirements Defined - Ready for Implementation  
**Source:** Issue 2 - Debug UI Redesign + Gap Analysis (Thin Client → Manus Orchestration)

**Sync:** This document is the **implementation roadmap** for Debug View improvements. The requirements bridge the current "Thin Client" architecture and the upcoming "Manus-Style" orchestration, ensuring debug tools remain useful as the system evolves. Keep in sync with `THIN_CLIENT_ROADMAP.md`, `SERVER_SIDE_AGENT_ARCH.md`, `COMPREHENSIVE_ARCHITECTURE.md`, and `MANUS_ORCHESTRATOR_ARCHITECTURE.md`.

**Counterpart:** Server-side debug requirements are covered in `SERVER_SIDE_AGENT_ARCH.md` §4.2 (Interact Contract) and `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §18.2 (Logging). This document focuses on **client-side** debug UI implementation.

---

## 1. Overview

This document outlines the requirements and implementation roadmap for improving the Debug View in the Spadeworks Copilot AI browser extension. The primary goal is to separate user-facing content from technical debug information, improve screen real estate utilization, and provide a cleaner, more intuitive interface for both technical and non-technical users.

### 1.1 Principles

- **Vertical slices:** Each phase delivers complete, usable functionality. No standalone "UI-only" or "state-only" phases.
- **Strict separation:** User-facing content and debug information must be completely isolated. No debug information leaks into the main user interface.
- **Future-proofing:** Debug tools must support both current "Thin Client" architecture and upcoming "Manus-Style" orchestration patterns.
- **Runtime control:** All debug features must be controllable at runtime via Settings, not build-time environment variables.

### 1.2 Prerequisites

- Chrome Extension (Manifest V3) with React 18 + TypeScript
- Zustand state management with `persist` middleware configured
- Chakra UI v2.8.2 for all UI components
- Existing debug components: `AccessibilityTreeView`, `CoverageMetricsView`, `HybridElementView`, `TaskStatus`, `TaskHistory`
- Thin Client API integration (`POST /api/agent/interact`, `GET /api/knowledge/resolve`)

### 1.3 Architecture Context

**Current State:**
- All components (user-facing and debug) are displayed together in the main UI
- Debug mode controlled by build-time `process.env.DEBUG_MODE`
- No clear distinction between what users need to see vs. what developers need to debug
- Debug components always visible when data exists, cluttering the UI

**Target State:**
- **User Stream:** Only high-level, natural language summaries of actions
- **System Stream:** All technical information in dedicated Debug Panel
- **Runtime Toggle:** Developer mode controlled via Settings (no rebuild required)
- **Future-Ready:** Debug Panel supports both reactive (Thin Client) and proactive (Manus) execution patterns

**Reference Architecture:**
- **Thin Client:** `THIN_CLIENT_ROADMAP.md` §2.1 (API Client) - Debug view must verify token states and headers
- **Server-Side:** `SERVER_SIDE_AGENT_ARCH.md` §4.2 (Interact Contract) - Debug view must verify `taskId` continuity and `hasOrgKnowledge` flags
- **Manus Orchestration:** `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §4 (Reason-Act-Verify Loop) & §18.2 (Logging) - Debug view is primary interface for observability

---

## 2. Task 1: Architectural Separation (User vs. Debug)

**Objective:** Strictly separate the "Action Stream" (User-facing actions) from the "System Stream" (Debug logs, DOM trees, metrics). Create dedicated Debug Panel container.

**Deliverable:** All debug components moved to `DebugPanel.tsx`. User-facing interface shows only high-level summaries. No debug information visible in main UI when developer mode is off.

---

### 2.1 Segregate Streams

**Requirement:** Strictly separate the "Action Stream" (User-facing actions) from the "System Stream" (Debug logs, DOM trees, metrics).

**Current State:**
- All components (user-facing and debug) are displayed together in the main UI
- No clear distinction between what users need to see vs. what developers need to debug

**Target State:**
- **User Stream:** Only displays high-level, natural language summaries of actions
- **System Stream:** All technical information moved to dedicated Debug Panel

**Implementation Notes:**
- Create clear boundaries between user-facing components and debug components
- Ensure no debug information leaks into the main user interface

**Reference:** `COMPREHENSIVE_ARCHITECTURE.md` §4.1 (State Management Flow) - Validates that the "Single Source of Truth" principle is being upheld.

---

### 2.2 Dedicated Debug Container

**Requirement:** Create a dedicated **Debug Panel** or **Developer Drawer** component that houses all technical components.

**Components to Move:**
- `AccessibilityTreeView` - DOM accessibility tree visualization
- `CoverageMetricsView` - Accessibility coverage metrics
- `HybridElementView` - Hybrid element sources and mappings
- `TaskStatus` - Current task execution status (technical details)

**Current Location:** These components are currently displayed inline with user content in `TaskUI.tsx` and related components.

**Target Location:** All moved to a new `DebugPanel.tsx` component.

**Implementation:**
- Create `src/common/DebugPanel.tsx` component
- Move all debug components into Debug Panel
- Remove debug components from main `TaskUI.tsx`
- Conditionally render Debug Panel based on `developerMode` setting

---

### 2.3 Task History Refactor

**Requirement:** Split Task History into two distinct views.

#### User View (Main Interface)
- **Display:** Only high-level natural language summaries
- **Example:** *"Clicked 'Sign Up' button"* or *"Entered email address"*
- **Purpose:** Provide clear, actionable feedback to users about what the extension is doing

#### Debug View (Debug Panel)
- **Display:** Technical details including:
  - Token counts
  - Parsed Action JSON
  - Raw LLM thoughts/reasoning
  - Execution timestamps
  - Error stack traces (if any)
- **Purpose:** Provide developers with detailed technical information for debugging

**Implementation Notes:**
- Modify `TaskHistory.tsx` to support two rendering modes
- Create a simplified user-facing version
- Keep full technical version in Debug Panel

**Reference:** `ENTERPRISE_PLATFORM_SPECIFICATION.md` §5.7.3.7 (State Management Updates) - Verifying the new `displayHistory` and `taskId` fields.

---

### 2.4 Definition of Done / QA Verification (Task 1)

- [ ] `DebugPanel.tsx` component created
- [ ] All debug components (`AccessibilityTreeView`, `CoverageMetricsView`, `HybridElementView`, `TaskStatus`) moved to Debug Panel
- [ ] Debug components removed from main `TaskUI.tsx`
- [ ] Task History split into user-facing and debug views
- [ ] No debug information visible in main UI when developer mode is off
- [ ] User-facing interface shows only high-level summaries

**Exit criterion:** Task 1 complete when all debug components are isolated in Debug Panel and user interface is clean. Proceed to Task 2 only after sign-off.

---

## 3. Task 2: Space Utilization & Layout

**Objective:** Implement collapsible Debug Panel with accordion/tab organization. Add compact header with health signals for collapsed state.

**Deliverable:** Debug Panel is collapsible (collapsed by default), organized into accordions/tabs, with health signals visible when collapsed.

---

### 3.1 Collapsible Interface

**Requirement:** The Debug Panel must be **collapsible by default**.

**Behavior:**
- **Default State:** Collapsed (hidden) to maximize space for user interface
- **Location Options:**
  - **Option A:** Bottom of UI (like a terminal window) - slides up/down
  - **Option B:** Side drawer (slides in from right/left)
  - **Option C:** Separate tab within the main interface
- **Toggle Mechanism:** Clear button/icon to expand/collapse

**User Experience:**
- When collapsed, main interface remains clean and uncluttered
- When expanded, debug information is easily accessible
- Smooth animation for expand/collapse transitions

**Implementation:**
- Use Chakra UI `Collapse` or `Drawer` component
- Store `debugPanelExpanded` state in Zustand UI slice (persisted)
- Default to `false` (collapsed)

---

### 3.2 Accordion/Tab Organization

**Requirement:** Within the Debug Panel, organize data into tabs or accordions rather than stacking vertically.

**Current Problem:**
- All debug components are stacked vertically
- Forces excessive scrolling to see all information
- Difficult to find specific debug information

**Proposed Organization:**

#### Option A: Tabs
```
Debug Panel
├── [DOM Tree] [Metrics] [Elements] [Logs] [Status] [Network] [State] [RAG]
└── Content area (shows selected tab content)
```

#### Option B: Accordion
```
Debug Panel
├── ▼ Page Structure (AccessibilityTreeView)
├── ▼ Interaction Coverage (CoverageMetricsView)
├── ▼ Element Sources (HybridElementView)
├── ▼ Execution Status (TaskStatus)
├── ▼ Raw Logs (TaskHistory - technical view)
├── ▼ Network/API Trace (NEW - Task 3)
├── ▼ State Inspector (NEW - Task 3)
└── ▼ RAG Context (NEW - Task 3)
```

**Recommendation:** Start with Accordion (easier to scan multiple sections), consider Tabs for future if needed.

**Implementation:**
- Use Chakra UI `Accordion` component
- Each debug component becomes an accordion item
- Allow multiple items to be open simultaneously

---

### 3.3 Compact Headers (Collapsed State)

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

**Example:**
```
[🟢 Running] [85% Coverage] [1,234 Tokens] [12/50 Actions] [Org RAG] [▼ Debug]
```

**Implementation:**
- Create `DebugPanelHeader.tsx` component
- Display health signals as Chakra UI `Badge` components
- Use `useColorModeValue` for theme-aware colors
- Add click handler to toggle panel expansion

---

### 3.4 Definition of Done / QA Verification (Task 2)

- [ ] Debug Panel is collapsible (collapsed by default)
- [ ] Expand/collapse animations work smoothly
- [ ] Debug Panel organized into accordions or tabs
- [ ] Compact header with health signals visible when collapsed
- [ ] Health signals update in real-time
- [ ] Panel state persists across sessions

**Exit criterion:** Task 2 complete when Debug Panel is fully collapsible and organized. Proceed to Task 3 only after sign-off.

---

## 4. Task 3: Strategic Debug Enhancements (Thin Client → Manus Bridge)

**Objective:** Add strategic debug enhancements that bridge the gap between current "Thin Client" architecture and upcoming "Manus-Style" orchestration. These additions ensure debug tools remain useful as the system evolves.

**Deliverable:** Five new debug sections: API & Network Trace Inspector, RAG & Knowledge Context Debugger, State Slice Snapshot (Zustand Inspector), Manus Orchestration Pre-Visualization, and Session Export functionality.

---

### 4.1 API & Network Trace Inspector

**Requirement:** Add a specific "Network/API" tab to the Debug Panel that logs the raw request/response payloads for the Thin Client API calls.

**Why:** The current design focuses on DOM and accessibility. However, in the Thin Client architecture (`THIN_CLIENT_ROADMAP.md`), the most critical failure points are often 401 Auth errors, 403 Domain restrictions, or malformed RAG responses. A dedicated view to see "What exactly did we send to the LLM?" is essential.

**Implementation Detail:**
- Log entries for `POST /api/agent/interact` showing:
  - Request: `url`, `query`, `dom` (truncated), `taskId`
  - Response: `thought`, `action`, `usage`, `taskId`, `hasOrgKnowledge`
  - Headers: `Authorization` (masked), `Content-Type`
  - Timestamp, duration, status code
- Log entries for `GET /api/knowledge/resolve` showing:
  - Request: `url`, `query`
  - Response: `hasOrgKnowledge`, `context` (truncated), `citations`
  - Headers, timestamp, duration, status code
- Visual diff of the `action` received vs the `dom` sent (if applicable)

**Display:**
- Real-time log of API calls
- Expandable entries showing full request/response
- Color-coded status (green=success, yellow=warning, red=error)
- Search/filter capability for finding specific calls

**Documentation Reference:**
- **Architecture:** `SERVER_SIDE_AGENT_ARCH.md` §4.2 (Interact Contract) – The debug view must verify the `taskId` continuity and `hasOrgKnowledge` flags returned here.
- **Roadmap:** `THIN_CLIENT_ROADMAP.md` §2.1 (API Client) – Debugging token states and headers.

**Implementation:**
- Create `NetworkTraceView.tsx` component
- Intercept API calls in `src/api/client.ts` and log to Zustand store
- Display in Debug Panel as new accordion item "Network/API Trace"

---

### 4.2 RAG & Knowledge Context Debugger

**Requirement:** Add a visual indicator or section within the "Execution Status" accordion that explicitly shows the `hasOrgKnowledge` state and the `Active Domain` resolution.

**Why:** Users/Devs need to know *why* the agent isn't using internal knowledge. Is it because the domain isn't in `allowed_domains`, or because the vector search returned nothing? The current `KnowledgeOverlay` is user-facing; the debug view needs to show the *decision logic*.

**Implementation Detail:**
- Status line: *RAG Mode: Organization (Domain Match)* vs *RAG Mode: Public Only (No Match)*
- Display `hasOrgKnowledge` flag from API responses
- Show `Active Domain` (extracted from `url`)
- Show `allowed_domains` patterns for current tenant (if available)
- Indicate why org-specific RAG was or wasn't used:
  - Domain matches `allowed_domains` pattern → "Org RAG Enabled"
  - Domain doesn't match → "Public Only (Domain Not in Allowlist)"
  - Domain matches but no org knowledge found → "Public Only (No Org Knowledge for Domain)"

**Display:**
- Add to "Execution Status" accordion or create separate "RAG Context" accordion
- Color-coded indicators (green=org RAG, yellow=public only)
- Tooltip explaining the decision logic

**Documentation Reference:**
- **Architecture:** `SERVER_SIDE_AGENT_ARCH.md` §1.4 (Knowledge Types & allowed_domains as Filter) – The debug view verifies if the "Filter" logic is working correctly.
- **Specification:** `ENTERPRISE_PLATFORM_SPECIFICATION.md` §2.6 (RAG Integration) – Verifying client-side RAG states.

**Implementation:**
- Create `RAGContextView.tsx` component
- Extract `hasOrgKnowledge` from API responses and store in Zustand
- Display in Debug Panel as part of "Execution Status" or separate accordion item

---

### 4.3 State Slice Snapshot (Zustand Inspector)

**Requirement:** Include a "State Inspector" tab that shows a read-only JSON tree of the current Zustand store, specifically the `currentTask` and `settings` slices.

**Why:** The UI often desyncs from the internal logic. Seeing the raw state helps diagnose issues like "Why is the task running but the button says stopped?" or "Why is the `taskId` null?"

**Implementation Detail:**
- Use a JSON tree viewer to render `useStore.getState()`
- Display `currentTask` slice (task state, action history, status)
- Display `settings` slice (API keys, model selection, preferences)
- Optionally display `ui` slice (modal visibility, notifications)
- Read-only view (no editing)
- Search/filter capability
- Expand/collapse nodes

**Display:**
- JSON tree viewer component (consider `react-json-view` or Chakra UI `Code` component)
- Organized by slice: `currentTask`, `settings`, `ui`
- Syntax highlighting for JSON

**Documentation Reference:**
- **Architecture:** `COMPREHENSIVE_ARCHITECTURE.md` §2.2 (State Management) & §4.1 (State Flow) – Validates that the "Single Source of Truth" principle is being upheld.
- **Specification:** `ENTERPRISE_PLATFORM_SPECIFICATION.md` §5.7.3.7 (State Management Updates) – Verifying the new `displayHistory` and `taskId` fields.

**Implementation:**
- Create `StateInspectorView.tsx` component
- Use `useAppState` to access store state
- Display in Debug Panel as new accordion item "State Inspector"
- Use JSON tree viewer library or custom component

---

### 4.4 "Manus" Orchestration Pre-Visualization

**Requirement:** Design the "Execution Status" view to support a "Plan vs. Execution" hierarchy.

**Why:** You are moving toward a "Manus-style" orchestrator where the agent *plans* a chain of steps before *executing*. The current debug view assumes a linear loop. Preparing the UI to visualize a "Tree of Steps" (Plan -> Step 1 -> Verification -> Correction) now will save a full rewrite later.

**Implementation Detail:**
- Instead of a flat list of logs, use a nested structure:
  - `Plan Node` > `Execution Logs` > `Verification Result`
- Support both current reactive pattern (linear list) and future proactive pattern (tree structure)
- When `plan` exists in task state, display as tree:
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
- When no `plan` exists (current reactive mode), display as linear list (backward compatible)

**Display:**
- Tree view component (consider `react-tree-view` or custom Chakra UI tree)
- Color-coded nodes (green=success, yellow=in-progress, red=failed, gray=pending)
- Expand/collapse nodes
- Show verification results inline

**Documentation Reference:**
- **Future Arch:** `MANUS_ORCHESTRATOR_ARCHITECTURE.md` §4 (Reason-Act-Verify Loop) & §18.2 (Logging) – The debug view is the primary interface for observability of the "Reasoning" and "Verification" phases.

**Implementation:**
- Update `TaskStatus.tsx` to support both linear and tree views
- Check for `plan` in task state to determine view mode
- Use tree view component when plan exists
- Maintain backward compatibility with linear view

---

### 4.5 Session Export / "Black Box" Recording

**Requirement:** Add a "Export Debug Session" button in the Debug Panel header.

**Why:** "Thin Client" means the logic happens on the server, but the *context* (DOM) comes from the client. When a task fails, developers need the exact DOM snapshot and Action History that caused the failure. Copying text from the UI is insufficient.

**Implementation Detail:**
- Generate a JSON file containing:
  ```json
  {
    "timestamp": "2026-01-26T10:30:00Z",
    "url": "https://example.com",
    "settings": { ... },
    "currentTask": { ... },
    "actionHistory": [ ... ],
    "accessibilityTree": { ... },
    "networkLogs": [ ... ],
    "stateSnapshot": { ... }
  }
  ```
- Include all debug information from current session
- Exclude sensitive data (API keys, tokens) or mask them
- Download as `.json` file with timestamp in filename

**Display:**
- Button in Debug Panel header: "Export Debug Session"
- On click, generate JSON and trigger download
- Show success toast notification

**Documentation Reference:**
- **Specification:** `ENTERPRISE_PLATFORM_SPECIFICATION.md` §3.6.5 (Error Handling) – Supports the "Comprehensive Error Handling" requirement by providing reproducible data.
- **Architecture:** `COMPREHENSIVE_ARCHITECTURE.md` §4.4 (Error Flow) – Facilitates the "Error Recovery" and investigation process.

**Implementation:**
- Add export button to `DebugPanel.tsx` header
- Create `exportDebugSession()` function that:
  - Collects all debug data from Zustand store
  - Masks sensitive information
  - Generates JSON
  - Triggers download via `blob` URL
- Use Chakra UI `Button` with download icon

---

### 4.6 Definition of Done / QA Verification (Task 3)

- [ ] Network/API Trace Inspector displays all API calls with request/response
- [ ] RAG Context Debugger shows `hasOrgKnowledge` and domain resolution
- [ ] State Inspector displays Zustand store slices as JSON tree
- [ ] Execution Status supports both linear (current) and tree (future Manus) views
- [ ] Session Export generates complete debug session JSON file
- [ ] All new debug sections integrated into Debug Panel accordion
- [ ] No sensitive data exposed in exports (API keys masked)

**Exit criterion:** Task 3 complete when all strategic debug enhancements are implemented and integrated. Proceed to Task 4 only after sign-off.

---

## 5. Task 4: Visual Clarity & Styling

**Objective:** Apply distinct visual theme to Debug Panel. Update component labels to human-readable names. Implement color-coded status indicators.

**Deliverable:** Debug Panel has distinct visual identity, clear labels, and consistent color coding throughout.

---

### 5.1 Distinct Visual Language

**Requirement:** Apply a distinct visual theme to the Debug Panel to clearly signify it's system data.

**Proposed Theme Options:**

#### Option A: Terminal Aesthetic
- Dark background (`gray.900` or `gray.950`)
- Monospaced fonts for technical data
- Green/yellow/red color scheme for status
- Subtle border or shadow to separate from main UI

#### Option B: Muted Professional
- Muted gray background (`gray.100` in light mode, `gray.800` in dark mode)
- Slightly different border style (dashed or different color)
- Monospaced fonts for code/logs
- Reduced opacity for less emphasis

**Recommendation:** Terminal aesthetic for clear distinction, but ensure it respects user's chosen theme (light/dark mode).

**Implementation:**
- Use Chakra UI's `useColorModeValue` for theme-aware colors
- Apply distinct background color to Debug Panel container
- Use monospaced font family for technical content (e.g., `fontFamily="mono"`)

---

### 5.2 Human-Readable Labels

**Requirement:** Rename technical components for better understanding.

**Renaming Map:**
- `AccessibilityTreeView` → **"Page Structure"**
- `CoverageMetricsView` → **"Interaction Coverage"**
- `HybridElementView` → **"Element Sources"**
- `TaskStatus` → **"Execution Status"** (or keep as "Task Status" if clear)
- `TaskHistory` (debug view) → **"Raw Logs"**

**Implementation:**
- Update component titles/headers
- Update tooltips and help text
- Ensure labels are clear for both technical and non-technical users

---

### 5.3 Color-Coded Status

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

---

### 5.4 Definition of Done / QA Verification (Task 4)

- [ ] Debug Panel has distinct visual theme (terminal or muted professional)
- [ ] All component labels updated to human-readable names
- [ ] Color-coded status indicators implemented consistently
- [ ] Dark mode fully supported in Debug Panel
- [ ] Visual distinction between user and debug content is clear

**Exit criterion:** Task 4 complete when Debug Panel has clear visual identity and consistent styling. Proceed to Task 5 only after sign-off.

---

## 6. Task 5: Control & Interaction

**Objective:** Implement runtime toggle for developer mode. Add persistence for panel state. Remove build-time environment variable dependencies.

**Deliverable:** Developer mode can be toggled in Settings without rebuild. Panel state persists across sessions.

---

### 6.1 Global Toggle (Runtime Control)

**Requirement:** Remove reliance on static `process.env.DEBUG_MODE`. Implement a runtime toggle.

**Current State:**
- Debug mode controlled by build-time environment variable
- Requires rebuild to enable/disable
- Not accessible to end users

**Target State:**
- **Settings Toggle:** Add "Enable Developer Mode" option in Settings
- **Instant Effect:** Toggle instantly mounts/unmounts Debug Panel
- **No Restart Required:** Changes apply immediately

**Implementation:**
- Add `developerMode` boolean to Zustand settings store
- Add toggle in `SettingsView.tsx` or `SettingsSection.tsx`
- Conditionally render `DebugPanel` based on `developerMode` setting
- Remove `process.env.DEBUG_MODE` checks from components

**Settings UI:**
```
Developer Options
┌─────────────────────────────────────┐
│ Enable Developer Mode               │
│ [Toggle Switch]                     │
│ Show technical debug information    │
└─────────────────────────────────────┘
```

**Reference:** `COMPREHENSIVE_ARCHITECTURE.md` §2.2 (State Management) - Zustand store patterns.

---

### 6.2 Persistence

**Requirement:** Remember user's preference (Open/Closed) across sessions.

**Data to Persist:**
- **Developer Mode Enabled:** Boolean (stored in Zustand settings, already persisted)
- **Debug Panel Expanded State:** Boolean (whether panel is open or collapsed)

**Implementation:**
- Store `debugPanelExpanded` in Zustand UI slice
- Use Zustand's `persist` middleware (already configured)
- Restore state on extension load
- Default to collapsed if not set

**Storage Structure:**
```typescript
// In Zustand store
settings: {
  developerMode: boolean, // persisted
  // ... other settings
}

ui: {
  debugPanelExpanded: boolean, // persisted
  // ... other UI state
}
```

**Reference:** `COMPREHENSIVE_ARCHITECTURE.md` §2.2 (State Management) - Zustand persist middleware patterns.

---

### 6.3 Definition of Done / QA Verification (Task 5)

- [ ] `developerMode` added to Zustand settings store (persisted)
- [ ] "Enable Developer Mode" toggle added to Settings
- [ ] Toggle instantly mounts/unmounts Debug Panel
- [ ] `debugPanelExpanded` added to Zustand UI store (persisted)
- [ ] Panel state persists across extension reloads
- [ ] All `process.env.DEBUG_MODE` dependencies removed

**Exit criterion:** Task 5 complete when developer mode is fully runtime-controlled and state persists. All tasks complete.

---

## 7. Task Order and Dependencies

| Order | Task | Depends on | Client delivers |
|-------|------|------------|-----------------|
| **1** | Architectural Separation | Prerequisites | Debug Panel component, component migration |
| **2** | Space Utilization & Layout | Task 1 | Collapsible panel, accordion organization, health signals |
| **3** | Strategic Debug Enhancements | Task 1, Task 2 | Network trace, RAG context, state inspector, Manus visualization, export |
| **4** | Visual Clarity & Styling | Task 1, Task 2, Task 3 | Visual theme, labels, color coding |
| **5** | Control & Interaction | All previous | Runtime toggle, persistence |

- **Task 2** depends on **Task 1** (Debug Panel must exist before organizing it).
- **Task 3** depends on **Task 1** and **Task 2** (Enhancements need organized panel structure).
- **Task 4** depends on **Task 1-3** (Styling applies to all components).
- **Task 5** depends on **All previous** (Control mechanisms need complete implementation).

---

## 8. Implementation Checklist

### Phase 1: Core Architecture (Task 1)
- [ ] Create `DebugPanel.tsx` component
- [ ] Move `AccessibilityTreeView` to Debug Panel
- [ ] Move `CoverageMetricsView` to Debug Panel
- [ ] Move `HybridElementView` to Debug Panel
- [ ] Move `TaskStatus` to Debug Panel
- [ ] Remove debug components from main `TaskUI.tsx`
- [ ] Split `TaskHistory` into user-facing and debug views

### Phase 2: Layout & Organization (Task 2)
- [ ] Implement collapsible Debug Panel (bottom drawer or side panel)
- [ ] Add accordion/tab organization within Debug Panel
- [ ] Implement compact header with health signals
- [ ] Add expand/collapse animations
- [ ] Test panel state persistence

### Phase 3: Strategic Enhancements (Task 3)
- [ ] Create `NetworkTraceView.tsx` component
- [ ] Implement API call logging in `src/api/client.ts`
- [ ] Create `RAGContextView.tsx` component
- [ ] Create `StateInspectorView.tsx` component
- [ ] Update `TaskStatus.tsx` for Manus tree view support
- [ ] Implement session export functionality
- [ ] Integrate all new sections into Debug Panel

### Phase 4: Visual Design (Task 4)
- [ ] Apply distinct visual theme to Debug Panel
- [ ] Update component labels to human-readable names
- [ ] Implement color-coded status indicators
- [ ] Ensure dark mode compatibility
- [ ] Test visual distinction between user and debug content

### Phase 5: Settings & Control (Task 5)
- [ ] Add `developerMode` to Zustand settings store
- [ ] Add "Enable Developer Mode" toggle in Settings
- [ ] Add `debugPanelExpanded` to Zustand UI store
- [ ] Remove `process.env.DEBUG_MODE` dependencies
- [ ] Test runtime toggle functionality
- [ ] Test persistence across extension reloads

### Phase 6: Testing & Polish
- [ ] Test expand/collapse functionality
- [ ] Test settings toggle (enable/disable developer mode)
- [ ] Test persistence across extension reloads
- [ ] Verify dark mode compatibility
- [ ] Test with various task scenarios
- [ ] Verify no debug info leaks into user view
- [ ] Test session export functionality
- [ ] Verify API trace logging works correctly
- [ ] Test RAG context display
- [ ] Test state inspector with various state configurations
- [ ] Test Manus tree view (when plan exists) and linear view (backward compatibility)

---

## 9. Technical Considerations

### 9.1 Component Structure

**New Component Hierarchy:**
```
App.tsx
└── TaskUI.tsx
    ├── User-Facing Components
    │   ├── TaskHistory (simplified)
    │   ├── Prompt Input
    │   └── Action Feedback
    └── DebugPanel (conditional, based on developerMode)
        ├── DebugPanelHeader (health signals, export button)
        ├── Accordion Container
        │   ├── Page Structure (AccessibilityTreeView)
        │   ├── Interaction Coverage (CoverageMetricsView)
        │   ├── Element Sources (HybridElementView)
        │   ├── Execution Status (TaskStatus - with Manus support)
        │   ├── Raw Logs (TaskHistoryDebug)
        │   ├── Network/API Trace (NetworkTraceView - NEW)
        │   ├── RAG Context (RAGContextView - NEW)
        │   └── State Inspector (StateInspectorView - NEW)
        └── Collapse/Expand Controls
```

### 9.2 State Management

**Zustand Store Updates:**
```typescript
// settings slice
settings: {
  developerMode: boolean, // persisted
  // ... other settings
}

// ui slice
ui: {
  debugPanelExpanded: boolean, // persisted
  // ... other UI state
}

// currentTask slice (enhanced for Manus)
currentTask: {
  // ... existing fields
  plan?: PlanNode[], // NEW - for Manus orchestration
  // ... other task state
}

// NEW: Debug-specific state (optional, or use existing slices)
debug: {
  networkLogs: NetworkLog[], // API call logs
  ragContext: RAGContext, // RAG state
  // ... other debug state
}
```

### 9.3 Performance Considerations

- Debug Panel should be lazy-loaded (only mount when `developerMode` is enabled)
- Consider virtualization for large DOM trees in `AccessibilityTreeView`
- Debounce expand/collapse animations if needed
- Limit network log history (e.g., last 100 calls) to prevent memory issues
- State inspector should use `useMemo` for JSON serialization

### 9.4 Accessibility

- Ensure Debug Panel is keyboard accessible
- Add ARIA labels for expand/collapse controls
- Maintain focus management when panel opens/closes
- Ensure color-coded status has text labels for screen readers
- JSON tree viewer should support keyboard navigation

---

## 10. References

### 10.1 Internal Documentation

- **`THIN_CLIENT_ROADMAP.md`** — Client-side implementation roadmap. See §2.1 (API Client) for API debugging requirements.
- **`SERVER_SIDE_AGENT_ARCH.md`** — Server-side agent architecture specification. See §1.4 (Knowledge Types & allowed_domains as Filter) for RAG context, §4.2 (Interact Contract) for API trace requirements.
- **`COMPREHENSIVE_ARCHITECTURE.md`** — Overall system architecture. See §2.2 (State Management) for Zustand patterns, §4.1 (State Flow) for state inspector requirements.
- **`ENTERPRISE_PLATFORM_SPECIFICATION.md`** — Enterprise platform context. See §2.6 (RAG Integration) for RAG debugging, §3.6.5 (Error Handling) for session export, §5.7.3.7 (State Management Updates) for state inspector.
- **`MANUS_ORCHESTRATOR_ARCHITECTURE.md`** — Future Manus-style orchestrator architecture. See §4 (Reason-Act-Verify Loop) & §18.2 (Logging) for execution status visualization requirements.

### 10.2 Current Components

- `src/common/AccessibilityTreeView.tsx` - DOM accessibility tree visualization
- `src/common/CoverageMetricsView.tsx` - Accessibility coverage metrics
- `src/common/HybridElementView.tsx` - Hybrid element sources and mappings
- `src/common/TaskStatus.tsx` - Current task execution status
- `src/common/TaskHistory.tsx` - Task action history
- `src/common/TaskUI.tsx` - Main task interface
- `src/common/KnowledgeOverlay.tsx` - User-facing knowledge overlay (not debug)

### 10.3 State Management

- `src/state/store.ts` - Zustand store configuration
- `src/state/settings.ts` - Settings slice
- `src/state/ui.ts` - UI slice
- `src/state/currentTask.ts` - Current task slice

### 10.4 Settings UI

- `src/common/SettingsView.tsx` - Settings page
- `src/common/SettingsSection.tsx` - Settings section wrapper

### 10.5 API Client

- `src/api/client.ts` - API client (needs enhancement for network trace logging)

---

## 11. Success Criteria

The implementation will be considered successful when:

1. ✅ User-facing interface shows only high-level, natural language summaries
2. ✅ All technical debug information is contained in Debug Panel
3. ✅ Debug Panel is collapsible and collapsed by default
4. ✅ Developer mode can be toggled in Settings without rebuild
5. ✅ Panel state persists across sessions
6. ✅ Visual distinction between user and debug content is clear
7. ✅ No debug information appears in main UI when developer mode is off
8. ✅ Dark mode is fully supported in Debug Panel
9. ✅ Performance is not degraded when Debug Panel is enabled
10. ✅ All existing functionality continues to work
11. ✅ Network/API trace shows all Thin Client API calls
12. ✅ RAG context displays `hasOrgKnowledge` and domain resolution
13. ✅ State inspector shows Zustand store slices
14. ✅ Execution status supports both linear (current) and tree (Manus) views
15. ✅ Session export generates complete debug session JSON

---

**Document Version:** 2.0  
**Last Updated:** January 26, 2026  
**Status:** Requirements Defined - Ready for Implementation
