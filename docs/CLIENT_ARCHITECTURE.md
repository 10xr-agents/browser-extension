# Spadeworks Copilot AI - Client-Side Architecture

**Document Version:** 1.0  
**Last Updated:** January 28, 2026  
**Status:** Complete Client-Side Architecture Documentation  
**Purpose:** Comprehensive client-side architecture documentation consolidating all implementation details, patterns, and specifications

**This document consolidates all client-side information from:**
- `ROADMAP.md` - Implementation details and completed tasks (Tasks 1-10)
- `REASONING_LAYER_IMPROVEMENTS.md` - Reasoning Layer client-side support (popup handling, NEEDS_USER_INPUT)
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` - Manus Orchestrator client-side display (plan, verification, correction)
- `ENTERPRISE_PLATFORM_SPECIFICATION.md` - Client-side migration details (Thin Client migration)
- Legacy architecture documents (ARCHITECTURE.md, COMPONENT_ARCHITECTURE.md, DATA_FLOW.md, ACTION_SYSTEM.md) - All client-side architecture patterns

**Focus:** This document focuses exclusively on **client-side (extension) implementation**. Server-side architecture is documented in `SERVER_SIDE_AGENT_ARCH.md` and `THIN_SERVER_ROADMAP.md`.

---

## Table of Contents

1. [Overview & Implementation Status](#1-overview--implementation-status)
2. [System Architecture](#2-system-architecture)
3. [Component Architecture](#3-component-architecture)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [Action System Architecture](#5-action-system-architecture)
6. [Thin Client Implementation](#6-thin-client-implementation)
7. [DOM Processing Pipeline](#7-dom-processing-pipeline)
8. [Reasoning Layer Client Support](#8-reasoning-layer-client-support)
9. [Debug View Architecture](#9-debug-view-architecture)
10. [Manus Orchestrator Client Support](#10-manus-orchestrator-client-support)
11. [Quick Reference](#11-quick-reference)

---

## 1. Overview & Implementation Status

### 1.1 What Is Implemented

**✅ All Core Features Complete (Tasks 1-10):**

1. **Task 1: Authentication & API Client** ✅ **COMPLETE**
   - Login UI with email/password
   - Bearer token authentication
   - Session check on startup
   - Logout functionality
   - API client with error handling

2. **Task 2: Runtime Knowledge Resolution** ✅ **COMPLETE**
   - Knowledge resolve API integration
   - Knowledge overlay component
   - Automatic trigger on tab changes
   - Manual resolve button
   - Error handling for all states

3. **Task 3: Server-Side Action Loop** ✅ **COMPLETE**
   - Action runner refactored to use backend API
   - Display-only history (server owns canonical history)
   - Task ID management
   - Error reporting to server
   - Chat persistence with messages array

4. **Task 4: Basic Accessibility Tree Extraction** ✅ **COMPLETE**
   - Chrome DevTools Protocol integration
   - Accessibility tree extraction
   - Fallback to DOM approach
   - UI display component

5. **Task 5: Accessibility Node Filtering** ✅ **COMPLETE**
   - Interactive element filtering
   - Integration into DOM pipeline
   - Filtered node display

6. **Task 6: Accessibility-DOM Element Mapping** ✅ **COMPLETE**
   - Bidirectional mapping
   - Action targeting via accessibility
   - Fallback to DOM targeting

7. **Task 7: Hybrid Element Representation** ✅ **COMPLETE**
   - Unified element type
   - Merging logic (accessibility + DOM)
   - UI display component

8. **Task 8: Accessibility-First Element Selection** ✅ **COMPLETE**
   - Accessibility-first selection strategy
   - Coverage metrics calculation
   - 25-35% token reduction achieved
   - UI metrics display

9. **Task 9: Documentation Consolidation** ✅ **COMPLETE**
   - All architecture docs consolidated
   - Legacy docs removed
   - References updated

10. **Task 10: Reasoning Layer Client-Side Improvements** ✅ **COMPLETE**
    - Popup/dropdown handling (`hasPopup` extraction)
    - NEEDS_USER_INPUT response handling
    - User input prompt component
    - Task pause/resume on user input

### 1.2 Architecture Overview

**Thin Client Architecture:**
- **DOM Processing:** Client-side (extension extracts, simplifies, templatizes DOM)
- **LLM Inference:** Server-side (backend handles all LLM calls)
- **Action Execution:** Client-side (extension executes browser actions)
- **State Management:** Hybrid (client manages UI state, server owns task history)

**Key Principles:**
- **Safety-First:** Multiple safety mechanisms prevent unwanted actions
- **Token Efficiency:** Accessibility-first selection reduces tokens by 25-35%
- **Error Recovery:** Action failures don't stop execution; server handles corrections
- **User Experience:** Clean chat interface with technical logs hidden by default

### 1.3 Technology Stack

**Frontend:**
- React 18 with TypeScript
- Chakra UI v2.8.2 (MANDATORY for all UI)
- Zustand with Immer middleware (state management)
- React Icons (icon library)

**Browser APIs:**
- Chrome Extension Manifest V3
- Chrome Debugger API (browser automation)
- Chrome DevTools Protocol (accessibility tree extraction)
- Chrome Storage API (persistence)
- Chrome Tabs API (tab management)

**Build System:**
- Webpack 5
- Babel (TypeScript/JavaScript transpilation)
- Multiple entry points (Popup, Panel, Options, Newtab)

---

## 2. System Architecture

### 2.1 Extension Contexts

The extension operates in multiple isolated contexts:

**1. UI Contexts (Popup, Panel, Options, Newtab)**
- React application with Chakra UI
- Zustand state management
- API client for backend communication
- No direct DOM access

**2. Background Service Worker**
- Extension lifecycle management
- Message routing (currently minimal)
- Extension-wide coordination

**3. Content Script Context**
- Runs in isolated world on every page
- DOM extraction and annotation
- Element identification
- Visual feedback (ripple effects)
- RPC method execution

**4. Page Context**
- Actual web page being automated
- Accessed via Chrome Debugger API
- No direct extension access

### 2.2 Communication Patterns

**UI → Content Script:**
```typescript
// Explicit tab targeting (prevents connection to wrong tabs)
const result = await callRPC('getAnnotatedDOM', {}, tabId);
```

**Content Script → Page:**
- Chrome Debugger API for page access
- Runtime evaluation for DOM queries
- Accessibility tree extraction

**Extension → Backend API:**
```typescript
// Bearer token authentication
const response = await apiClient.agentInteract(url, query, dom, taskId);
```

### 2.3 State Management Architecture

**Zustand Store Structure:**
```typescript
{
  currentTask: {
    // Task execution state
    taskId: string | null;
    sessionId: string | null;
    messages: ChatMessage[]; // New chat structure
    displayHistory: DisplayHistoryEntry[]; // Legacy, backward compatible
    status: 'idle' | 'running' | 'success' | 'error';
    // DOM processing state
    accessibilityTree: AccessibilityTree | null;
    hybridElements: HybridElement[];
    coverageMetrics: CoverageMetrics | null;
    // Error tracking
    lastActionResult: ActionExecutionResult | null;
  },
  settings: {
    // Authentication (Thin Client)
    user: User | null;
    tenantId: string | null;
    tenantName: string | null;
    developerMode: boolean; // Debug panel toggle
  },
  ui: {
    instructions: string;
    debugPanelExpanded: boolean;
  },
  debug: {
    networkLogs: NetworkLogEntry[];
    ragContext: RAGContext | null;
  }
}
```

**Persistence:**
- Authentication tokens: `chrome.storage.local`
- User preferences: Zustand persist middleware
- Chat messages: `chrome.storage.local` (key: `session_messages_${sessionId}`)

---

## 3. Component Architecture

### 3.1 Component Hierarchy

**Root:**
- `App.tsx` - Root component with Chakra provider, session check, conditional rendering

**Page-Level:**
- `Popup.tsx` - Main popup interface
- `Panel.tsx` - Devtools panel interface
- `Options.tsx` - Settings page (legacy, mostly replaced by Login)

**Task Management:**
- `TaskUI.tsx` - Main task interface with input, history, controls
- `ChatStream.tsx` - User-facing chat interface (message bubbles)
- `ChatTurn.tsx` - Individual chat turn (user + assistant messages)
- `ExecutionDetails.tsx` - Technical execution logs (collapsible)
- `TaskHistory.tsx` - Legacy history view (backward compatible)
- `TaskHistoryUser.tsx` - User-facing simplified history
- `TaskHistoryDebug.tsx` - Technical debug history

**Authentication (Thin Client):**
- `Login.tsx` - Login form with email/password
- `OptionsDropdown.tsx` - Logout and settings menu

**Knowledge (Thin Client):**
- `KnowledgeOverlay.tsx` - Knowledge context and citations display

**Reasoning Layer:**
- `ReasoningBadge.tsx` - Reasoning source and confidence display
- `EvidenceIndicator.tsx` - Evidence quality and sources
- `UserInputPrompt.tsx` - User input request display

**Accessibility (Tasks 4-8):**
- `AccessibilityTreeView.tsx` - Accessibility tree visualization
- `HybridElementView.tsx` - Hybrid element composition
- `CoverageMetricsView.tsx` - Coverage metrics display

**Debug Panel (Part 2 - Future):**
- `DebugPanel.tsx` - Main debug panel container
- `DebugPanelHeader.tsx` - Compact header with health signals
- `NetworkTraceView.tsx` - API call logs
- `RAGContextView.tsx` - RAG context debugger
- `StateInspectorView.tsx` - Zustand store inspector

**Manus Orchestrator (Part 2 - Future):**
- `PlanView.tsx` - User-facing plan display
- `PlanViewDebug.tsx` - Debug plan visualization
- `VerificationView.tsx` - User-facing verification display
- `VerificationViewDebug.tsx` - Debug verification details
- `CorrectionView.tsx` - User-facing correction display
- `CorrectionViewDebug.tsx` - Debug correction details

### 3.2 Component Patterns

**State Access Pattern:**
```typescript
// ✅ CORRECT - Split selectors to prevent infinite loops
const value = useAppState((state) => state.settings.value);
const action = useAppState((state) => state.settings.actions.setValue);

// ❌ WRONG - Returning object causes infinite loops
const state = useAppState((state) => ({ value: state.settings.value }));
```

**Dark Mode Pattern:**
```typescript
// ✅ CORRECT - Define colors at component top level
const bgColor = useColorModeValue('white', 'gray.900');
const textColor = useColorModeValue('gray.900', 'gray.100');

// ❌ WRONG - Don't use useColorModeValue inside render loops
{items.map(item => <Box bg={useColorModeValue('white', 'gray.800')}>)}
```

**Type Safety Pattern:**
```typescript
// ✅ CORRECT - Always validate before rendering
<Text>
  {typeof message.content === 'string' 
    ? message.content 
    : String(message.content || '')}
</Text>
```

---

## 4. Data Flow Architecture

### 4.1 Task Execution Flow

**Complete Flow (Thin Client with Error Reporting):**

1. **User Initiates Task:**
   - User enters instructions in `TaskUI`
   - Clicks "Start Task" button
   - `runTask` action triggered

2. **DOM Extraction:**
   - Content script extracts annotated DOM
   - Accessibility tree extracted (Task 4+)
   - DOM simplified and templatized

3. **Backend API Call:**
   - `POST /api/agent/interact` with:
     - `url`, `query`, `dom`
     - `taskId` (if continuing task)
     - `sessionId` (for chat persistence)
     - **Error reporting fields** (if previous action failed):
       - `lastActionStatus`
       - `lastActionError`
       - `lastActionResult`

4. **Server Processing:**
   - Web search (for new tasks)
   - Session resolution
   - History loading from database
   - Error detection and correction strategy
   - RAG context injection
   - LLM inference
   - User-friendly message generation

5. **Response Handling:**
   - Response parsed and stored
   - Message added to chat
   - Action extracted from response

6. **Action Execution:**
   - Action parsed and validated
   - Element located (accessibility mapping if available)
   - Action executed via Chrome Debugger API
   - **Execution result captured** (success/failure)
   - Action step added to message's technical logs

7. **Error Propagation:**
   - If action failed, error details stored
   - Error sent to server in next API call
   - Server generates correction strategy
   - **Task continues** (doesn't stop on errors)

8. **Cycle Repeats:**
   - Wait 2 seconds for page to settle
   - Extract new DOM
   - Send to backend with error context
   - Repeat until `finish()` or `fail()`

### 4.2 Chat Persistence Flow

**Message Structure:**
```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string; // User-friendly text
  status: 'sending' | 'sent' | 'error' | 'success' | 'failure' | 'pending';
  timestamp: Date;
  actionPayload?: ActionPayload; // For assistant messages
  meta?: {
    steps: ActionStep[]; // Technical execution logs
    reasoning?: ReasoningData; // Reasoning layer data
  };
  userQuestion?: string; // For needs_user_input
  missingInformation?: MissingInfoField[];
  error?: ErrorInfo;
}
```

**Persistence:**
- Messages saved to `chrome.storage.local` periodically
- Key: `session_messages_${sessionId}`
- Loaded on component mount if `sessionId` exists
- Falls back to API call if not in storage

### 4.3 Error Flow

**Action Execution Errors:**
1. Action wrapped in try/catch
2. Error captured with code (`ELEMENT_NOT_FOUND`, `TIMEOUT`, etc.)
3. Execution result stored in state
4. Error sent to server in next API call
5. Server generates correction
6. **Task continues** (doesn't stop)

**Other Errors:**
1. Error caught and logged
2. User notified via toast
3. Task status updated
4. Cleanup executed

---

## 5. Action System Architecture

### 5.1 Available Actions

**Current Actions:**
- `click(elementId)` - Click element by ID
- `setValue(elementId, text)` - Set input/textarea value
- `finish()` - Task completed successfully
- `fail()` - Task failed
- `ask_user()` - Request user input (Reasoning Layer)

### 5.2 Action Execution

**Execution Flow:**
1. Action string parsed (`parseAction()`)
2. Action validated against `availableActions`
3. Element located:
   - Uses accessibility mapping if available (Task 6)
   - Falls back to DOM-based targeting
4. Chrome Debugger API attached
5. Action executed:
   - Click: Scroll into view, calculate center, dispatch mouse events
   - SetValue: Select text, type character by character, blur
6. Visual feedback (ripple effect)
7. Execution result captured
8. Debugger detached

### 5.3 Action History

**Display-Only History (Client):**
- `thought` - User-friendly reasoning
- `action` - Action string
- `usage` - Token usage
- `parsedAction` - Parsed action object

**Canonical History (Server):**
- Server owns complete action history
- Used for LLM context
- Client doesn't send history (server loads from DB)

---

## 6. Thin Client Implementation

### 6.1 Authentication Flow

**Login:**
1. User enters email/password
2. `apiClient.login()` called
3. Bearer token stored in `chrome.storage.local`
4. User/tenant info stored in Zustand state
5. Session checked on app mount

**Session Check:**
- `GET /api/v1/auth/session` on component mount
- 401 → Show login UI
- 200 → Show task UI with tenant name

**Logout:**
- `POST /api/v1/auth/logout` called
- Token cleared from storage
- State cleared
- Login UI shown

### 6.2 API Client

**Location:** `src/api/client.ts`

**Methods:**
- `login(email, password)` - Authentication
- `getSession()` - Session check
- `logout()` - Logout
- `knowledgeResolve(url, query?)` - Knowledge resolution
- `agentInteract(url, query, dom, taskId?, sessionId?)` - Action loop
- `getSessionMessages(sessionId)` - Get conversation history
- `getLatestSession()` - Get latest active session

**Error Handling:**
- 401 → Clear token, show login
- 403 → Domain not allowed message
- 404 → Task not found
- 409 → Task conflict
- 5xx → Server error message

### 6.3 Action Loop (Task 3)

**Refactored Flow:**
1. DOM extracted and simplified
2. `agentInteract()` called with DOM, URL, query
3. Server returns `NextActionResponse`
4. Action parsed and executed
5. Execution result tracked
6. Error reported to server in next call
7. Cycle repeats

**Key Changes:**
- No local LLM inference
- No API keys in extension
- Server owns action history
- Client tracks execution results for error reporting

---

## 7. DOM Processing Pipeline

### 7.1 Processing Stages

**Stage 1: DOM Extraction**
- Content script extracts full DOM
- Elements annotated with visibility/interactivity flags
- Unique IDs assigned

**Stage 2: Accessibility Tree Extraction (Task 4)**
- Chrome DevTools Protocol `Accessibility.getFullAXTree`
- Accessibility tree stored in state
- Fallback to DOM if extraction fails

**Stage 3: Accessibility Node Filtering (Task 5)**
- Filter to interactive elements only
- Convert to simplified element representation

**Stage 4: Accessibility-DOM Mapping (Task 6)**
- Bidirectional mapping created
- `backendDOMNodeId` used for targeting
- Fallback to DOM when mapping unavailable

**Stage 5: Hybrid Element Creation (Task 7)**
- Combine accessibility and DOM data
- Prefer accessibility when available
- Supplement with DOM when needed

**Stage 6: Accessibility-First Selection (Task 8)**
- Start with all accessibility elements
- Match with DOM elements
- Add DOM-only elements when not in accessibility tree
- Calculate coverage metrics

**Stage 7: DOM Simplification**
- Filter to visible, interactive elements
- Preserve essential attributes
- Remove unnecessary nesting

**Stage 8: HTML Templatization**
- Identify repeated patterns
- Create templates
- Reduce token count significantly

### 7.2 Token Optimization

**Accessibility-First Strategy:**
- Prioritizes semantic accessibility data
- Supplements with minimal DOM data
- **Result:** 25-35% token reduction vs. baseline

**Coverage Metrics:**
- Tracks accessibility coverage percentage
- Identifies sites with good accessibility
- Higher coverage = better token reduction

---

## 8. Reasoning Layer Client Support

**Status:** ✅ **COMPLETE** (Task 10) — January 28, 2026

The Reasoning Layer client support provides visualization and handling for the backend's enhanced reasoning pipeline. The backend performs a 4-step reasoning process (Context & Gap Analysis, Execution, Evaluation & Iteration, Final Verification) that determines the best source for information (MEMORY, PAGE, WEB_SEARCH, or ASK_USER) with confidence scoring and evidence tracking.

**Reference:** `REASONING_LAYER_IMPROVEMENTS.md` — Complete backend specification.

### 8.1 Enhanced Data Structures

**ReasoningData Interface:**
```typescript
interface ReasoningData {
  source: 'MEMORY' | 'PAGE' | 'WEB_SEARCH' | 'ASK_USER';
  confidence: number; // 0.0 to 1.0 (REQUIRED) - Model's certainty based on evidence
  reasoning: string; // User-friendly explanation
  missingInfo?: MissingInfoField[]; // Enhanced structure with type classification
  evidence?: ReasoningEvidence; // Evidence supporting the decision
  searchIteration?: {
    attempt: number; // Current search attempt (1-indexed)
    maxAttempts: number; // Maximum attempts allowed
    refinedQuery?: string; // Refined query for this iteration
    evaluationResult?: {
      solved: boolean;
      shouldRetry: boolean;
      shouldAskUser: boolean;
      confidence: number;
    };
  };
}
```

**MissingInfoField Interface:**
```typescript
interface MissingInfoField {
  field: string; // e.g., "patient_dob"
  type: 'EXTERNAL_KNOWLEDGE' | 'PRIVATE_DATA'; // Can be found via search vs must ask user
  description: string; // Human-readable description
}
```

**ReasoningEvidence Interface:**
```typescript
interface ReasoningEvidence {
  sources: string[]; // e.g., ["chat_history", "page_dom", "rag_knowledge"]
  quality: 'high' | 'medium' | 'low'; // Quality of evidence
  gaps: string[]; // Missing information or uncertainties
}
```

### 8.2 UI Components

**ReasoningBadge Component (`src/common/ReasoningBadge.tsx`):**
- Displays reasoning source with icon:
  - MEMORY = Purple
  - PAGE = Blue
  - WEB_SEARCH = Orange
  - ASK_USER = Yellow
- Shows confidence percentage with color coding:
  - Green (≥90%): High confidence
  - Yellow (≥70%): Medium confidence
  - Red (<70%): Low confidence
- Displays search iteration progress (e.g., "Attempt 2/3")
- Enhanced tooltip shows reasoning explanation, evidence quality, search evaluation results, refined query

**EvidenceIndicator Component (`src/common/EvidenceIndicator.tsx`):**
- Displays evidence sources, quality, and gaps
- Compact and full display modes
- Color-coded quality indicators (High=Green, Medium=Yellow, Low=Red)
- Shows evidence sources as badges
- Lists gaps/uncertainties

**UserInputPrompt Component (`src/common/UserInputPrompt.tsx`):**
- Enhanced to handle `MissingInfoField[]` structure
- Shows type classification badges:
  - "Can Search" for EXTERNAL_KNOWLEDGE
  - "Need Your Input" for PRIVATE_DATA
- Displays field descriptions
- Backward compatible with old string[] format
- Minimal inline prompt (Cursor/Manus style)

### 8.3 Popup/Dropdown Handling (Task 10)

**Problem:** Agent failing verification on dropdown buttons because URL didn't change.

**Root Cause:** Elements with `aria-haspopup` attribute don't navigate to new pages. They open popups, dropdowns, or menus.

**Solution:**
- Extract `hasPopup` from accessibility tree
- Include `aria-haspopup` and `aria-expanded` in simplified DOM
- Backend uses this to generate correct expected outcomes

**Implementation:**
- `src/helpers/accessibilityFilter.ts` - Extract `hasPopup` from accessibility tree nodes
- `src/helpers/simplifyDom.ts` - Include `aria-haspopup` and `aria-expanded` in allowed attributes
- `src/helpers/hybridElement.ts` - Merge `hasPopup` from both accessibility and DOM

**Why This Design:**
Backend needs to know when an element opens a popup vs navigates to a new page. This prevents false verification failures and improves agent accuracy on dropdown/menu interactions.

### 8.4 NEEDS_USER_INPUT Response Handling (Task 10)

**Response Type:**
```typescript
{
  status: 'needs_user_input';
  thought: string;
  userQuestion: string;
  missingInformation: MissingInfoField[];
  context?: {
    searchPerformed: boolean;
    searchSummary?: string;
    reasoning: string;
  };
}
```

**Client Handling Flow:**
1. Response detected in `currentTask.ts` (`status === 'needs_user_input'`)
2. `userQuestion` and `missingInformation` stored in message
3. Message status set to 'pending'
4. Task execution paused (status: 'idle')
5. `UserInputPrompt` displayed in chat
6. Input field enabled with updated placeholder
7. User provides input
8. Task resumes with user's response
9. New user message added to chat
10. Backend receives additional context
11. Task continues with new information

**State Management:**
- `currentTask.ts` detects `needs_user_input` status
- Stores `userQuestion` and `missingInformation` in message
- Sets task status to 'idle' (pauses execution)
- Detects waiting state for resume logic
- Preserves message history when resuming

**Components:**
- `UserInputPrompt.tsx` - Displays question and missing info with type classification
- `ChatTurn.tsx` - Shows prompt inline with messages
- `TaskUI.tsx` - Handles waiting state and resume

### 8.5 Integration with Backend API

**Response Handling:**
1. Backend returns `NextActionResponse` with enhanced reasoning data
2. Client validates and stores reasoning metadata in `message.meta.reasoning`
3. Client displays reasoning information in UI components
4. If `status === 'needs_user_input'`:
   - Task pauses (status: 'idle')
   - User input prompt displayed
   - Input field remains enabled
5. When user responds:
   - Task resumes (status: 'running')
   - New user message added
   - Backend receives additional context

**Backward Compatibility:**
- Handles old string[] format for `missingInfo`
- Gracefully degrades when new fields are missing
- Type-safe conversions throughout
- Works with existing backend responses

---

## 9. Debug View Architecture

**Status:** ✅ **COMPLETE** (Part 2, Tasks 1-5) — January 26, 2026

### 9.1 Architectural Separation (Task 1)

**Objective:** Separate user-facing content from technical debug information.

**Implementation:**
- All debug components moved to `DebugPanel.tsx`
- Task History split into:
  - `TaskHistoryUser.tsx` - User-facing simplified view
  - `TaskHistoryDebug.tsx` - Technical debug view
- `developerMode` setting controls visibility
- No debug info visible when developer mode is off

**Components Moved:**
- `AccessibilityTreeView` → Debug Panel
- `CoverageMetricsView` → Debug Panel
- `HybridElementView` → Debug Panel
- `TaskStatus` (technical details) → Debug Panel

### 9.2 Space Utilization & Layout (Task 2)

**Collapsible Panel:**
- Collapsed by default (maximizes user interface space)
- Located at bottom of UI (terminal window style)
- Smooth slide animation (Chakra UI `Collapse`)
- State persists across sessions

**Accordion Organization:**
- All debug sections in Chakra UI `Accordion`
- Human-readable labels:
  - "Execution Status" (TaskStatus)
  - "Page Structure" (AccessibilityTreeView)
  - "Interaction Coverage" (CoverageMetricsView)
  - "Element Sources" (HybridElementView)
  - "Raw Logs" (TaskHistoryDebug)
  - "Network/API Trace" (NetworkTraceView)
  - "RAG Context" (RAGContextView)
  - "State Inspector" (StateInspectorView)
  - "Action Plan" (PlanViewDebug)
  - "Verification Results" (VerificationViewDebug)
  - "Correction Results" (CorrectionViewDebug)

**Compact Header:**
- `DebugPanelHeader.tsx` displays health signals when collapsed
- Health signals:
  - Status Indicator (color-coded: Running/Complete/Error/Idle)
  - Coverage Percentage (from `coverageMetrics.axCoverage`)
  - Token Usage (sum from `displayHistory`)
  - Action Count (from `displayHistory.length`)
  - RAG Mode (Org RAG / Public Only from `hasOrgKnowledge`)
- Click header to expand/collapse panel

### 9.3 Strategic Debug Enhancements (Task 3)

**Network/API Trace Inspector:**
- `NetworkTraceView.tsx` component
- Logs all API calls (`POST /api/agent/interact`, `GET /api/knowledge/resolve`)
- Displays request/response, headers (masked), duration, status
- Color-coded status (green=success, yellow=warning, red=error)
- Expandable entries with full request/response
- Search/filter capability
- Limited to last 100 logs

**RAG Context Debugger:**
- `RAGContextView.tsx` component
- Shows RAG mode (Organization vs Public-only)
- Displays active domain, domain match status
- Shows reason for RAG mode decision
- Chunk count (if available)
- Color-coded indicators (green=org RAG, yellow=public only)

**State Inspector:**
- `StateInspectorView.tsx` component
- Read-only JSON tree of Zustand store
- Organized by slice (currentTask, settings, ui, debug)
- Search/filter capability
- Expand/collapse nodes
- Syntax highlighting

**Manus Orchestration Pre-Visualization:**
- `TaskStatus.tsx` supports both linear and tree views
- Linear view: Current reactive pattern (backward compatible)
- Tree view: Future Manus-style plan execution (when `plan` data available)
- Color-coded nodes (green=success, yellow=in-progress, red=failed, gray=pending)

**Session Export:**
- Export button in `DebugPanelHeader.tsx`
- `exportDebugSession()` function collects all debug data
- Masks sensitive information (API keys, tokens)
- Generates JSON and triggers download
- Includes: task metadata, action history, network logs, state snapshot, accessibility tree, coverage metrics

### 9.4 Visual Clarity & Styling (Task 4)

**Terminal Aesthetic Theme:**
- Darker background (`gray.100` light / `gray.950` dark)
- Monospaced fonts for technical content
- Enhanced border with shadow for separation
- Distinct visual identity from main UI

**Human-Readable Labels:**
- All component labels updated to user-friendly names
- Clear, non-technical language
- Consistent naming throughout

**Color-Coded Status:**
- Green: Success, completed actions, healthy metrics (≥80% coverage)
- Yellow: Warnings, in-progress, partial completion (50-79% coverage)
- Orange: Interrupted, medium-low coverage (25-49% coverage)
- Red: Errors, failed actions, critical issues (<25% coverage)

### 9.5 Control & Interaction (Task 5)

**Developer Mode Toggle:**
- `developerMode` boolean in settings store (persisted)
- Toggle in Settings UI ("Developer Options" section)
- Runtime control (no rebuild required)
- Instant mount/unmount of Debug Panel

**Persistence:**
- `developerMode` persisted in Zustand store
- `debugPanelExpanded` persisted in Zustand store
- State restored on extension load
- No `process.env.DEBUG_MODE` dependencies (all removed)

---

## 10. Manus Orchestrator Client Support

**Status:** ✅ **COMPLETE** (Part 2, Tasks 6-10) — January 26, 2026

### 10.1 Plan Display & Visualization (Task 6)

**State Management:**
- `plan: ActionPlan | null` - Action plan from server
- `currentStep: number | null` - Current step number (1-indexed)
- `totalSteps: number | null` - Total steps in plan
- `orchestratorStatus: 'planning' | 'executing' | 'verifying' | 'correcting' | 'completed' | 'failed' | null`

**User-Facing View (`PlanView.tsx`):**
- Simple progress display with progress bar
- Current step indicator (e.g., "Step 2 of 5")
- Progress percentage
- Current step description from plan
- Orchestrator status badge
- Returns null if no plan data (graceful degradation)

**Debug View (`PlanViewDebug.tsx`):**
- Full plan structure in expandable accordion
- All plan steps with status badges (pending, active, completed, failed)
- Step details: reasoning, expected outcomes, tool types
- Current step highlighted with "Current" badge
- Orchestrator status and summary information
- Fallback message if no plan data

**API Integration:**
- `NextActionResponse` extended with optional `plan`, `currentStep`, `totalSteps`, `status` fields
- Response handling extracts plan data and stores in Zustand
- Backward compatible (all fields optional)

### 10.2 Verification Results Display (Task 7)

**State Management:**
- `verificationHistory: VerificationResult[]` - Array of verification results
- Each result includes: `stepIndex`, `success`, `confidence`, `expectedState`, `actualState`, `reason`, `timestamp`

**User-Facing View (`VerificationView.tsx`):**
- Most recent verification result with success/failure icon
- Step number and verification status message
- Confidence score as badge
- Verification reason (if available)
- Returns null if no verification data

**Debug View (`VerificationViewDebug.tsx`):**
- All verification results in expandable accordion
- Success/failure status with color-coded badges
- Confidence scores with progress bars
- Expected vs actual state comparison (in Code blocks)
- Verification reason and timestamp
- Latest verification highlighted with "Latest" badge

**API Integration:**
- `NextActionResponse` extended with optional `verification` field
- Response handling extracts verification and appends to history
- Timestamp conversion from ISO string to Date object

### 10.3 Self-Correction Display (Task 8)

**State Management:**
- `correctionHistory: CorrectionResult[]` - Array of correction attempts
- Each result includes: `stepIndex`, `strategy`, `reason`, `attemptNumber`, `originalStep`, `correctedStep`, `timestamp`

**User-Facing View (`CorrectionView.tsx`):**
- Most recent correction with retry icon
- Step number and correction message
- Attempt number as badge
- Correction reason (if available)
- Strategy formatted for readability

**Debug View (`CorrectionViewDebug.tsx`):**
- All correction results in expandable accordion
- Correction strategy with color-coded badges
- Correction reason and retry attempt number
- Original vs corrected step comparison (in Code blocks)
- Corrected step highlighted in green
- Latest correction highlighted with "Latest" badge

**API Integration:**
- `NextActionResponse` extended with optional `correction` field
- Response handling extracts correction and appends to history
- Timestamp conversion from ISO string to Date object

### 10.4 Expected Outcome Display (Task 9)

**Implementation:**
- Expected outcomes stored with actions in `displayHistory`
- `expectedOutcome?: string` field in `DisplayHistoryEntry`
- Displayed in `TaskHistoryDebug.tsx` as accordion item
- Blue-themed styling to distinguish from other debug info
- "For Verification" badge indicates purpose
- Only displays when `expectedOutcome` is present

**API Integration:**
- `NextActionResponse` extended with optional `expectedOutcome` field
- Response handling extracts expectedOutcome and stores with action
- Backward compatible (field optional)

### 10.5 Orchestrator Status & Progress (Task 10)

**Status Display:**
- `TaskStatus.tsx` prioritizes orchestrator status when available
- Status labels: "Planning...", "Executing step X of Y...", "Verifying...", "Correcting...", "Completed", "Failed"
- Color-coded badges: blue (planning/executing), yellow (verifying), orange (correcting), green (completed), red (failed)
- Falls back to linear view when orchestrator status not available

**Progress Indicators:**
- `PlanView.tsx` provides comprehensive progress display
- Progress bar with percentage
- Step indicator ("Step X of Y")
- Current step description
- Orchestrator status badge

**Real-Time Updates:**
- Status data updated on each API response
- Zustand store updates trigger React re-renders
- Components read from store using `useAppState` selectors

---

## 11. Quick Reference

### 11.1 Key Files

**State Management:**
- `src/state/store.ts` - Main Zustand store
- `src/state/currentTask.ts` - Task execution state
- `src/state/settings.ts` - User settings and auth
- `src/state/ui.ts` - UI state
- `src/state/debug.ts` - Debug state

**API Client:**
- `src/api/client.ts` - API client with all backend methods

**Core Logic:**
- `src/helpers/simplifyDom.ts` - DOM simplification
- `src/helpers/parseAction.ts` - Action parser
- `src/helpers/domActions.ts` - Action execution
- `src/helpers/chromeDebugger.ts` - Debugger API
- `src/helpers/accessibilityTree.ts` - Accessibility extraction
- `src/helpers/accessibilityFilter.ts` - Node filtering
- `src/helpers/accessibilityMapping.ts` - Element mapping
- `src/helpers/hybridElement.ts` - Hybrid element creation
- `src/helpers/accessibilityFirst.ts` - Accessibility-first selection

**Components:**
- `src/common/TaskUI.tsx` - Main task interface
- `src/common/ChatStream.tsx` - Chat interface
- `src/common/Login.tsx` - Login UI
- `src/common/KnowledgeOverlay.tsx` - Knowledge display
- `src/common/DebugPanel.tsx` - Debug panel

### 11.2 Implementation Checklist

**✅ Completed (Tasks 1-10):**
- [x] Authentication and API client
- [x] Knowledge resolution
- [x] Server-side action loop
- [x] Accessibility tree extraction
- [x] Accessibility node filtering
- [x] Accessibility-DOM mapping
- [x] Hybrid element representation
- [x] Accessibility-first selection
- [x] Documentation consolidation
- [x] Reasoning Layer client support
- [x] Debug View (Tasks 1-5)
- [x] Manus Orchestrator display (Tasks 6-10)

### 11.3 Common Patterns

**State Access:**
```typescript
// ✅ Split selectors
const value = useAppState((state) => state.settings.value);

// ❌ Don't return objects
const state = useAppState((state) => ({ value: state.settings.value }));
```

**Dark Mode:**
```typescript
// ✅ Define at component top level
const bg = useColorModeValue('white', 'gray.900');

// ❌ Not in render loops
{items.map(item => <Box bg={useColorModeValue('white', 'gray.800')}>)}
```

**Type Safety:**
```typescript
// ✅ Always validate before rendering
{typeof value === 'string' ? value : String(value || '')}
```

**useEffect Dependencies:**
```typescript
// ✅ Don't include Zustand actions
useEffect(() => { loadMessages(id); }, [id]);

// ❌ Actions cause infinite loops
useEffect(() => { loadMessages(id); }, [id, loadMessages]);
```

---

**Document Status:** Complete - All client-side implementation documented  
**Last Updated:** January 28, 2026
