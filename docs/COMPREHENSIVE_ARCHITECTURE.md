# Spadeworks Copilot AI - Comprehensive Architecture & Specification

**Document Version:** 1.2  
**Last Updated:** January 27, 2026  
**Status:** Comprehensive Documentation  
**Changelog (1.2):** Added Reasoning Layer v2.0 architecture with confidence scoring, evidence tracking, iterative search visualization, and enhanced missing information classification. See §6.6 for details.  
**Changelog (1.1):** Added chat persistence architecture, error propagation flow, UI refactor (ChatStream/ExecutionDetails), connection handling improvements, and updated task execution flow with error tracking. See implementation details in codebase.  
**Purpose:** Consolidated architecture, component, data flow, action system, and enterprise specification documentation

**Note:** This document consolidates information from previously separate architecture documents:
- High-level architecture (previously `ARCHITECTURE.md`)
- Component structure (previously `COMPONENT_ARCHITECTURE.md`)
- Data flow patterns (previously `DATA_FLOW.md`)
- Action execution system (previously `ACTION_SYSTEM.md`)
- Documentation index and quick reference (`INDEX.md`)
- Enterprise platform specification (`ENTERPRISE_PLATFORM_SPECIFICATION.md`)

All architecture documentation has been consolidated into this single comprehensive document for easier navigation and maintenance.

**Related Documents:**
- `THIN_CLIENT_ROADMAP.md` - Client-side implementation roadmap (Tasks 1-9 complete)
- `THIN_SERVER_ROADMAP.md` - Server-side implementation roadmap
- `SERVER_SIDE_AGENT_ARCH.md` - Server-side agent architecture specification
- `REASONING_LAYER_IMPROVEMENTS.md` - Reasoning layer v2.0 specification with confidence scoring and dual-model routing

---

## Table of Contents

1. [Overview](#1-overview)
2. [System Architecture](#2-system-architecture)
3. [Component Architecture](#3-component-architecture)
4. [Data Flow Architecture](#4-data-flow-architecture)
5. [Action System Architecture](#5-action-system-architecture)
6. [Thin Client Architecture](#6-thin-client-architecture)
7. [Enterprise Platform Specification](#7-enterprise-platform-specification)
8. [DOM Processing Pipeline](#8-dom-processing-pipeline)
9. [Reasoning Layer Architecture](#9-reasoning-layer-architecture)
10. [Quick Reference](#10-quick-reference)
11. [Implementation Status](#11-implementation-status)

---

## 1. Overview

### 1.1 Introduction

Spadeworks Copilot AI is a Chrome browser extension that uses Large Language Models (LLMs) to automate browser interactions through natural language instructions. The extension operates as a Chrome Extension Manifest V3 application, leveraging React 18, TypeScript, and a sophisticated action cycle to enable AI-powered browser automation.

**Architecture Note:** The extension has migrated to a **Thin Client** architecture where DOM processing remains client-side, but LLM inference moves to the server. See [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md) for implementation details.

### 1.2 Core Value Propositions

1. **Zero-Disruption Deployment**: Works with existing applications without code changes
2. **Enterprise-Grade Security**: Multi-tenant isolation, SSO/SAML, and role-based access control (Enterprise)
3. **Contextual Intelligence**: Private knowledge injection via RAG for company-specific guidance (Enterprise)
4. **Workflow Integration**: Seamless overlay on protected corporate environments (Enterprise)

### 1.3 Key Concepts

**Action Cycle (Thin Client)**
The iterative process of: DOM extraction → Backend API call → Action execution → Repeat. DOM processing remains client-side; LLM inference happens server-side.

**DOM Simplification**
The process of reducing complex DOM structures to token-efficient representations using accessibility tree extraction, filtering, and templatization.

**Accessibility-First Selection**
Prioritizes accessibility tree as primary source for element identification, supplements with DOM when needed. Reduces token count by 25-35% vs. baseline.

**RPC Methods**
Remote procedure calls between extension contexts and content scripts for DOM extraction and page interaction.

**State Slices**
Organized state management units (currentTask, settings, ui) using Zustand with Immer middleware.

---

## 2. System Architecture

### 2.1 High-Level Architecture

The extension follows a multi-context architecture typical of Chrome Extensions, with distinct execution contexts that communicate through Chrome's messaging APIs:

1. **UI Contexts** - User interface pages (Popup, Devtools Panel, Options)
2. **Background Service Worker** - Extension lifecycle and coordination
3. **Content Script Context** - Page interaction and DOM access
4. **Page Context** - The actual web page being automated

### 2.2 Core Components

#### Extension Pages

The extension provides multiple entry points for user interaction:

- **Popup** - Primary user interface accessible via keyboard shortcut (Cmd+Shift+Y / Ctrl+Shift+Y) or extension icon click
- **Devtools Panel** - Alternative interface accessible through Chrome DevTools
- **Options Page** - Settings and configuration interface
- **Newtab Page** - Standalone page interface (legacy support)

#### Background Service Worker

The background service worker manages the extension lifecycle and coordinates communication between different contexts. While currently minimal, it serves as the central hub for extension-wide operations.

#### Content Script

The content script runs in an isolated world on every web page, providing the bridge between the extension and the page's DOM. It handles:

- DOM extraction and annotation
- Element identification and tracking
- Visual feedback (ripple effects)
- Clipboard operations
- RPC method execution

#### State Management

Global state is managed through Zustand with Immer middleware, organized into slices:

- **Current Task Slice** - Manages task execution state, action history, accessibility tree, hybrid elements, coverage metrics, and task lifecycle
- **Settings Slice** - Stores user authentication (user, tenantId, tenantName), preferences
- **UI Slice** - Manages UI-specific state like user instructions

### 2.3 Technology Stack

#### Frontend Framework
- React 18 with TypeScript (MUST stay on React 18 - Chakra UI v2.8.2 only supports React 18)
- Functional components with hooks
- Chakra UI v2 for all UI components (MANDATORY)

#### State Management
- Zustand with Immer middleware for immutable updates
- Chrome Storage API for persistence (tokens, settings)

#### Build System
- Webpack 5 for bundling
- Babel for JavaScript/TypeScript transpilation
- Multiple entry points for different extension pages

#### Browser APIs
- Chrome Extension Manifest V3
- Chrome Debugger API for browser automation
- Chrome Tabs API for tab management
- Chrome Storage API for persistence
- Chrome Management API for extension control

#### LLM Integration (Thin Client)
- Backend API client (`src/api/client.ts`) for server communication
- Bearer token authentication
- Support for `POST /api/agent/interact` (action loop)
- Support for `GET /api/knowledge/resolve` (knowledge resolution)

### 2.4 Architecture Principles

#### Isolation and Security

The extension maintains strict isolation between contexts:
- Content scripts run in isolated worlds, unable to access page JavaScript
- Background service worker operates independently
- UI pages are separate from page content

#### Safety-First Design

The extension implements multiple safety mechanisms:
- Automatic halt on unexpected LLM responses
- Maximum action limit (50 actions per task)
- User interrupt capability at any time
- Error handling and validation at every step

#### Token Efficiency

Given the token-based pricing of LLMs, the extension prioritizes efficiency:
- Accessibility tree extraction for semantic information
- DOM simplification to include only interactive elements
- HTML templatization to reduce repetitive content
- Selective attribute preservation
- Accessibility-first selection strategy (25-35% token reduction)

#### Extensibility

The architecture supports easy extension:
- Action system allows adding new browser actions
- Modular helper functions
- Clear separation of concerns
- Type-safe interfaces throughout

### 2.5 Communication Flow

#### UI to Background

UI pages communicate with the background service worker through Chrome's messaging API, though currently most communication is direct to content scripts.

#### UI to Content Script

The extension uses `chrome.tabs.sendMessage` to send messages from UI contexts to content scripts. The content script listens for these messages and executes RPC methods.

#### Content Script to Page

The content script can access the page's DOM directly but cannot execute page JavaScript. For page context operations, the extension uses Chrome Debugger API.

#### Debugger API Communication

The Chrome Debugger API provides the primary mechanism for browser automation:
- DOM queries and manipulation
- Runtime evaluation
- Input simulation (clicks, typing)
- Event dispatching
- Accessibility tree extraction (Task 4+)

---

## 3. Component Architecture

### 3.1 Component Hierarchy

#### Root Components

**App Component**
The main application component that serves as the root for all UI pages. It provides:
- Chakra UI provider setup
- Layout structure with header and content areas
- Conditional rendering based on authentication status (Thin Client)
- Integration with global state management

#### Page-Level Components

**Popup Component**
- Entry point for the popup interface
- Minimal wrapper that renders the App component
- Handles popup-specific initialization

**Panel Component**
- Devtools panel interface
- Similar structure to Popup but in DevTools context
- Provides alternative access to extension functionality

**Options Component**
- Settings and configuration interface (legacy, replaced by Login in Thin Client)
- Allows users to manage preferences

**Newtab Component**
- Standalone page interface
- Legacy support for new tab page access
- Similar functionality to Popup

### 3.2 Shared Components

#### Task Management Components

**TaskUI Component**
- Primary interface for task execution
- Contains textarea for user instructions
- Integrates task execution controls
- Displays task history
- Shows accessibility tree view (Task 4)
- Shows hybrid elements view (Task 7)
- Shows coverage metrics (Task 8)
- Manages keyboard shortcuts (Enter to run)

**RunTaskButton Component**
- Start/Stop task button
- Changes appearance based on task state
- Disabled when no instructions provided
- Visual feedback for running state

**TaskHistory Component**
- Displays chronological action history (display-only, server owns canonical history)
- Collapsible accordion interface
- Shows thought, action, usage statistics, and parsed action
- Token usage display
- Copy functionality for debugging
- **Updated:** Uses `ChatStream` component for new message-based structure
- **Updated:** Falls back to legacy `displayHistory` for backward compatibility

**ChatStream Component (New)**
- User-facing chat interface with message bubbles
- Separates user messages (right-aligned) from assistant messages (left-aligned)
- Clean, conversational UI similar to ChatGPT/Claude
- Integrates with `ExecutionDetails` for technical logs
- Status-based coloring (error = red, success = green)
- Processing indicator when task is running

**ExecutionDetails Component (New)**
- Collapsible accordion for technical execution logs
- Nested inside assistant messages in `ChatStream`
- Shows action steps with status badges
- Displays error information when actions fail
- Shows execution duration
- Color-coded by status (success = green, failure = red)
- Hidden by default (collapsed) to keep main view clean

**TaskStatus Component**
- Debug mode status indicator
- Shows current action status
- Displays task execution state

#### Authentication Components (Thin Client)

**Login Component**
- Login UI with email/password
- Handles authentication flow
- Session check on mount
- Error handling for 401/403

**OptionsDropdown Component**
- Additional settings and options
- Logout functionality (replaces API key reset)

#### Knowledge Components (Thin Client)

**KnowledgeOverlay Component**
- Displays knowledge resolution results
- Shows context chunks and citations
- Triggered by tab changes or manual button
- Handles empty context and error states

#### Accessibility Components (Tasks 4-8)

**AccessibilityTreeView Component**
- Displays accessibility tree structure
- Expandable tree view for validation
- Shows node roles, names, descriptions

**HybridElementView Component**
- Displays hybrid element composition
- Shows source indicators (hybrid/accessibility/dom)
- Displays combined properties and attributes
- Summary statistics

**CoverageMetricsView Component**
- Displays accessibility coverage metrics
- Shows coverage percentage with color-coded badge
- Progress bar for visual representation
- Statistics breakdown (overlap, DOM-only, accessibility-only)

#### Utility Components

**CopyButton Component**
- Reusable copy-to-clipboard functionality
- Used throughout UI for copying data
- Visual feedback on copy action

**AutosizeTextarea Component**
- Auto-resizing textarea for instructions
- Better UX for multi-line input

### 3.3 Component Communication Patterns

#### State Access Pattern

Components access global state through Zustand selectors:
- Components select only needed state slices
- Prevents unnecessary re-renders
- Type-safe state access

#### Action Pattern

Components trigger actions through store actions:
- Actions defined in state slices
- Components call actions directly
- Actions update state immutably via Immer

#### Event Handling

Components handle user interactions:
- Form inputs update state directly
- Button clicks trigger actions
- Keyboard shortcuts handled at component level

### 3.4 Component Responsibilities

#### Presentation Components

These components focus solely on rendering:
- Receive props for data
- Handle user interactions
- Trigger callbacks for state changes
- Minimal business logic

#### Container Components

These components manage state and logic:
- Connect to global state
- Handle complex interactions
- Coordinate between child components
- Manage side effects

#### Utility Components

Reusable components with specific functionality:
- Copy operations
- Token counting
- Auto-sizing inputs
- Status indicators

### 3.5 Styling Architecture

#### Chakra UI Integration

All components use Chakra UI for styling (MANDATORY):
- Consistent design system
- Responsive layouts
- Accessible components
- Theme support

#### Component Styling Patterns

- Inline props for Chakra components
- Spacing system (multiples of 4px)
- Color scheme consistency
- Size standardization

---

## 4. Data Flow Architecture

### 4.1 State Management Flow

#### State Initialization

When the extension loads:
1. Zustand store initializes with default values
2. Persisted state loaded from `chrome.storage.local`
3. State merged with defaults
4. Components subscribe to state changes
5. UI renders based on initial state

#### State Updates

State updates follow this pattern:
1. User interaction or system event occurs
2. Component calls action from state slice
3. Action updates state through Immer
4. Zustand notifies subscribers
5. Components re-render with new state
6. Critical state persisted to `chrome.storage.local`

#### State Persistence

Only specific state is persisted:
- User authentication (token, user, tenantId, tenantName) - Settings slice
- User instructions (UI slice)
- Conversation history (previous completed tasks) - ConversationHistory slice
- Chat messages (per session) - Saved to `chrome.storage.local` with key `session_messages_${sessionId}`

**Chat Persistence:**
- Messages are saved to `chrome.storage.local` periodically during task execution
- Messages are loaded on component mount if `sessionId` exists
- Falls back to API call (`GET /api/session/:sessionId/messages`) if not in storage
- Enables chat history restoration across extension reloads

**Legacy:** `displayHistory` is maintained for backward compatibility but is being replaced by the `messages` array structure.

### 4.2 Task Execution Flow (Thin Client)

#### Task Initiation

1. User enters instructions in TaskUI component
2. Instructions stored in UI slice state
3. User clicks "Start Task" button
4. RunTaskButton triggers `runTask` action
5. Current task slice updates status to "running"
6. Active tab ID captured and stored

#### DOM Extraction Phase

1. Action status set to "pulling-dom"
2. Content script receives request via RPC
3. Content script calls `getAnnotatedDOM` function
4. DOM traversed and annotated with:
   - Visibility flags
   - Interactivity flags
   - Unique element IDs
5. Annotated DOM returned to extension context

#### DOM Simplification Phase (Tasks 4-8)

1. Action status set to "transforming-dom"
2. **Accessibility Tree Extraction** (Task 4): Chrome DevTools Protocol `Accessibility.getFullAXTree` called
3. **Accessibility Node Filtering** (Task 5): Filter to interactive elements only
4. **Accessibility-DOM Mapping** (Task 6): Create bidirectional mapping for action targeting
5. **Hybrid Element Creation** (Task 7): Combine accessibility and DOM data
6. **Accessibility-First Selection** (Task 8): Prioritize accessibility, supplement with DOM
7. Simplified DOM generated by filtering:
   - Only visible elements
   - Only interactive or semantically important elements
   - Preserved essential attributes
8. Simplified DOM templatized:
   - Repeated patterns identified
   - Templates created for repeated structures
   - Token count reduced significantly
9. Final DOM string prepared for backend API

#### Backend API Query Phase (Thin Client)

1. Action status set to "performing-query"
2. Request constructed with:
   - User instructions (`query`)
   - Current simplified DOM (`dom`)
   - Current URL (`url`)
   - Optional task ID (`taskId`) for history continuity (legacy)
   - Optional session ID (`sessionId`) for new chat persistence structure
   - **Error reporting fields** (if previous action failed):
     - `lastActionStatus` - 'success' | 'failure' | 'pending'
     - `lastActionError` - Error details (message, code, action, elementId)
     - `lastActionResult` - Execution result (success, actualState)
3. Request sent to `POST /api/agent/interact`
4. Backend handles:
   - **Web search** (for new tasks) - Searches web to understand how to complete task
   - **Session resolution** - Creates or loads session from database
   - **History loading** - Loads conversation history from database (not client-provided)
   - **Error detection** - Detects client-reported failures and injects into LLM context
   - RAG context injection (tenant-scoped, domain-filtered)
   - Action history context (server-owned)
   - LLM inference with user-friendly message generation
   - Token usage tracking
5. Response received with:
   - `thought` - LLM reasoning (user-friendly, non-technical language)
   - `action` - Action string (e.g., "click(123)", "finish()")
   - `usage` - Token usage statistics
   - `taskId` - Server-assigned task ID (legacy)
   - `sessionId` - Session ID for chat persistence
   - `hasOrgKnowledge` - Whether org-specific RAG was used
6. Response stored in:
   - Display-only history (backward compatibility)
   - Messages array (new chat structure)
   - Assistant message added to chat with action payload

#### Action Parsing Phase

1. Action status set to "performing-action"
2. Action string parsed using `parseAction()` helper
3. Action validated:
   - Action name checked against available actions
   - Arguments validated for type and count
   - Error returned if validation fails
4. Parsed action stored in display-only history

#### Action Execution Phase

1. Action type determined (click, setValue, finish, fail)
2. **Action execution wrapped in try/catch for error tracking**
3. For click actions:
   - Element ID resolved (uses accessibility mapping if available, Task 6)
   - Element located via Chrome Debugger API
   - Element scrolled into view
   - Center coordinates calculated
   - Mouse events dispatched
   - Visual ripple effect triggered
   - **Execution result captured** (success/failure with error details)
4. For setValue actions:
   - Element located and scrolled into view
   - Text selected (triple-click)
   - New text typed character by character
   - Element blurred after typing
   - **Execution result captured** (success/failure with error details)
5. **Action execution result stored:**
   - Result stored in `lastActionResult` state field
   - Action step added to assistant message's `meta.steps` array
   - Message status updated based on execution result
   - **If action failed:** Error details stored for next API call
6. **Error propagation:**
   - Failed actions do NOT stop task execution
   - Error information sent to server in next API call
   - Server receives failure context and generates correction strategy

#### Action Cycle Completion

1. Action status set to "waiting"
2. **Messages saved to chrome.storage.local** (periodic persistence)
3. System waits 2 seconds for page to settle
4. Check if task should continue:
   - Task not stopped by user
   - Action limit not reached (50 max)
   - Action not "finish" or "fail"
   - **Note:** Errors do NOT stop execution - server handles corrections
5. If continuing, cycle repeats from DOM extraction
6. If stopping, status updated to "success" or "error"
7. **Final message save** before task completion

#### Task Completion

1. Debugger detached from tab
2. Disabled extensions re-enabled
3. Task status set to final state
4. UI updated to show results
5. Display-only history available for review (server owns canonical history)

### 4.3 Communication Flow

#### UI to Content Script

1. UI component needs page data
2. `callRPC` function called with method name, payload, and **explicit tabId**
3. **Tab ID resolved:**
   - Uses explicit `tabId` parameter if provided (from task state)
   - Falls back to querying active tab if not provided (legacy behavior)
4. Message sent via `chrome.tabs.sendMessage` to specific tab
5. Content script receives message
6. RPC method executed in content script context
7. Response sent back via `sendResponse`
8. Promise resolved with response data
9. **Error handling:**
   - "Extension context invalidated" errors trigger popup auto-reload
   - Content script injection retry logic (up to maxTries)
   - Improved error messages guide user to solution

#### Content Script to Page Context

1. Content script needs page context data
2. Chrome Debugger API used for page access
3. Runtime evaluation executed
4. DOM queries performed
5. Accessibility tree extraction (Task 4+)
6. Results returned to extension context

#### Extension to Backend API (Thin Client)

1. API client (`src/api/client.ts`) initialized with base URL
2. Bearer token retrieved from `chrome.storage.local`
3. Request constructed with headers:
   - `Authorization: Bearer <token>`
   - `Content-Type: application/json`
4. Request sent to backend API endpoints:
   - `POST /api/v1/auth/login` - Authentication
   - `GET /api/v1/auth/session` - Session check
   - `POST /api/v1/auth/logout` - Logout
   - `GET /api/knowledge/resolve` - Knowledge resolution
   - `POST /api/agent/interact` - Action loop (with error reporting)
   - `GET /api/session/:sessionId/messages` - Get conversation history
   - `GET /api/session/latest` - Get latest active session
5. **Error reporting in POST /api/agent/interact:**
   - Includes `lastActionStatus` if previous action executed
   - Includes `lastActionError` if action failed
   - Includes `lastActionResult` with execution details
   - Server uses this to detect failures and generate corrections
6. Response processed with error handling:
   - 401 UNAUTHORIZED - Token invalid/expired
   - 403 DOMAIN_NOT_ALLOWED - Domain not in allowlist
   - 404 NOT_FOUND - Task not found
   - 409 CONFLICT - Task conflict
   - 5xx - Server errors
7. Usage statistics and response content processed
8. **Session ID stored** if returned in response

### 4.4 Error Flow

#### Error Detection

Errors can occur at multiple points:
- Backend API failures
- Invalid action responses
- **Action execution failures** (element not found, timeout, etc.)
- DOM extraction failures
- Chrome API errors
- Accessibility extraction failures (Task 4+)
- Content script connection failures

#### Error Handling

**Action Execution Errors (New):**
1. **DOM actions wrapped in try/catch:**
   - `callDOMAction` returns `ActionExecutionResult` with success/failure status
   - Errors captured with error codes (`ELEMENT_NOT_FOUND`, `TIMEOUT`, `NETWORK_ERROR`, etc.)
   - Error details include: message, code, action string, elementId
2. **Error propagation to server:**
   - Execution result stored in `lastActionResult` state field
   - Error information sent to server in next `POST /api/agent/interact` call
   - Server receives failure context and generates correction strategy
   - **Task continues** - server decides next action based on error
3. **Action steps tracked:**
   - Each action execution creates an `ActionStep` in message's `meta.steps`
   - Steps include execution result, duration, error details
   - Technical logs nested in collapsible accordion (ExecutionDetails component)

**Other Errors:**
1. Error caught in try-catch block
2. Error message extracted
3. Error callback invoked (toast notification)
4. Task status set to "error" (for non-action errors)
5. Cleanup operations executed
6. Error logged in display-only history and messages array

#### Error Recovery

- **Action failures:** Do NOT stop task - server handles corrections
- Retry logic for transient failures (up to 3 attempts)
- User notification for all errors
- Graceful degradation where possible
- State cleanup on error
- Fallback to DOM-only approach when accessibility fails (Task 4+)
- **Auto-recovery:** Extension context invalidated errors trigger popup auto-reload

### 4.5 Data Transformation Pipeline

#### DOM to Simplified DOM (Tasks 4-8)

1. Full DOM extracted from page
2. **Accessibility tree extracted** (Task 4) via Chrome DevTools Protocol
3. **Accessibility nodes filtered** (Task 5) to interactive elements only
4. **Accessibility-DOM mapping created** (Task 6) for action targeting
5. **Hybrid elements created** (Task 7) combining accessibility and DOM data
6. **Accessibility-first selection** (Task 8) prioritizes accessibility, supplements with DOM
7. Elements annotated with metadata
8. Non-visible elements filtered
9. Non-interactive elements filtered (except semantic)
10. Attributes filtered to essential set
11. Text nodes preserved where meaningful
12. Structure simplified

#### Simplified DOM to Templatized DOM

1. DOM parsed into tree structure
2. Repeated patterns identified
3. Templates created for patterns used 3+ times
4. Template values extracted
5. Static values inlined
6. Dynamic values parameterized
7. Final templatized string generated

#### Templatized DOM to Backend API Request

1. Request body prepared:
   - `url` - Current page URL
   - `query` - User instructions
   - `dom` - Templatized simplified DOM
   - `taskId` - Optional task ID for history continuity
2. Headers added:
   - `Authorization: Bearer <token>`
   - `Content-Type: application/json`
3. Request sent to `POST /api/agent/interact`

#### Backend Response to Action

1. Response received with `NextActionResponse`:
   - `thought` - LLM reasoning
   - `action` - Action string
   - `usage` - Token usage
   - `taskId` - Server-assigned task ID
   - `hasOrgKnowledge` - RAG usage indicator
2. Action string parsed using `parseAction()`
3. Action name extracted
4. Arguments parsed and validated
5. Action object constructed
6. Type-safe action returned

### 4.6 State Synchronization

#### Cross-Context State

State must be synchronized across:
- UI contexts (popup, panel, options)
- Background service worker
- Content script (limited)

#### Synchronization Mechanisms

- Zustand store provides single source of truth
- `chrome.storage.local` persistence for critical state
- Chrome Storage API for extension-wide state
- Message passing for cross-context updates

#### State Consistency

- Immutable updates via Immer
- Atomic state changes
- No direct state mutation
- Predictable state transitions

---

## 5. Action System Architecture

### 5.1 Overview

The action system is the execution layer of Spadeworks Copilot AI, responsible for translating LLM decisions into actual browser interactions. It provides a bridge between the LLM's abstract action decisions and the concrete browser automation required to execute them.

**Thin Client Note:** Actions are received from the backend API (`POST /api/agent/interact`) as action strings (e.g., "click(123)", "setValue(123, \"text\")", "finish()"). The client parses and executes these actions.

### 5.2 Action Definition

#### Action Configuration

Actions are centrally defined in `src/helpers/availableActions.ts`:
- Action names (unique identifiers)
- Argument specifications (names and types)
- Descriptions (for LLM understanding)
- Type-safe definitions

#### Action Types

**Click Action**
- Clicks on an interactive element
- Takes element ID as argument
- Most common action type
- Uses accessibility mapping when available (Task 6)

**SetValue Action**
- Sets value of input/textarea elements
- Takes element ID and text value
- Handles text input automation
- Uses accessibility mapping when available (Task 6)

**Finish Action**
- Indicates task completion
- No arguments required
- Signals successful completion

**Fail Action**
- Indicates task failure
- No arguments required
- Signals inability to complete

### 5.3 Action Execution Flow

#### Action Receipt (Thin Client)

1. Backend API response received with `NextActionResponse`
2. Action string extracted (e.g., "click(123)")
3. Action parsed using `parseAction()` helper
4. Action validated against configuration
5. Arguments validated for type and count
6. Action object constructed

#### Action Routing

Actions are routed to appropriate execution handlers:
- Click actions → click handler
- SetValue actions → setValue handler
- Finish/Fail actions → task completion handler

#### Element Resolution

**ID to Element Resolution (Thin Client with Accessibility Mapping)**

1. Element ID received (numeric index)
2. **Accessibility mapping checked** (Task 6):
   - If `accessibilityMapping` available, get `axNodeId` from element index
   - Get `backendDOMNodeId` from mapping
   - Use `DOM.resolveNode` with `backendNodeId` for direct element access
3. **Fallback to DOM-based approach**:
   - Numeric ID converted to unique selector
   - Selector stored as data attribute on element
   - Selector persists across DOM updates
4. Chrome Debugger API used for location
5. DOM queries executed in page context
6. Object IDs obtained for manipulation

#### Action Execution

**Click Execution**
1. Element located via Debugger API (with accessibility mapping if available)
2. Element scrolled into view
3. Center coordinates calculated
4. Visual ripple effect triggered
5. Mouse press event dispatched
6. Mouse release event dispatched
7. Delay for page response

**SetValue Execution**
1. Element located and scrolled into view
2. Element focused
3. Existing text selected (triple-click)
4. New text typed character by character
5. Element blurred after typing
6. Delay for page response

### 5.4 Chrome Debugger API Integration

#### Debugger Attachment

**Process**
1. Debugger attached to active tab
2. DOM domain enabled
3. Runtime domain enabled
4. Accessibility domain enabled (Task 4+)
5. Ready for automation

#### DOM Queries

**Element Location**
- DOM.getDocument for root
- DOM.querySelector for element finding
- DOM.resolveNode for object ID (with `backendNodeId` support, Task 6)
- DOM.getBoxModel for coordinates

#### Accessibility Queries (Tasks 4-8)

**Accessibility Tree Extraction**
- Accessibility.enable for domain activation
- Accessibility.getFullAXTree for full tree
- Returns structured AXNode objects with roles, names, descriptions

#### Input Simulation

**Mouse Events**
- Input.dispatchMouseEvent for clicks
- Coordinate-based positioning
- Button specification
- Click count support

**Keyboard Events**
- Input.dispatchKeyEvent for typing
- Character-by-character input
- Key down and up events
- Text-based input

#### Runtime Evaluation

**Script Execution**
- Runtime.evaluate for page scripts
- Function execution in page context
- Result retrieval
- Error handling

### 5.5 Visual Feedback

#### Ripple Effect

**Purpose**
- Visual confirmation of clicks
- User feedback during automation
- Debugging aid
- User experience enhancement

**Implementation**
- Ripple effect triggered on click
- Visual animation at click location
- Temporary overlay element
- Automatic cleanup

### 5.6 Action Validation

#### Pre-Execution Validation

**Checks**
- Action name exists in configuration
- Argument count matches specification
- Argument types are correct
- Element ID is valid

#### Execution Validation

**Checks**
- Element exists in DOM
- Element is visible
- Element is interactive
- Element is accessible
- Accessibility mapping available (if applicable, Task 6)

#### Post-Execution Validation

**Checks**
- Action completed successfully
- No errors occurred
- Page state updated
- Ready for next action

### 5.7 Error Handling

#### Element Not Found

**Handling**
- Error message generated
- Task halted
- User notified
- Error logged
- Fallback to DOM-based approach if accessibility mapping fails (Task 6)

#### Execution Failures

**Handling**
- Try-catch around execution
- Error messages captured
- Task status updated
- Cleanup performed

#### Timeout Handling

**Handling**
- Timeouts for long operations
- Retry logic where appropriate
- User notification
- Graceful degradation

### 5.8 Action History

#### History Recording (Thin Client)

**Information Stored (Display-Only)**
- Thought from LLM response
- Action string from LLM response
- Usage statistics (prompt tokens, completion tokens)
- Parsed action object
- Execution status

**Note:** Server owns canonical action history. Client maintains display-only history for UI.

#### History Usage

**Purposes**
- User review and debugging
- Error investigation
- Display in UI

#### History Format

**Structure**
- Chronological entries
- Complete action information
- Token usage data
- Error information

### 5.9 Performance Considerations

#### Execution Delays

**Timing**
- 1 second delay between clicks
- 100ms delay between keystrokes
- 2 second wait after each action cycle
- Configurable delays

#### Optimization

**Strategies**
- Batch operations where possible
- Efficient element location (accessibility mapping, Task 6)
- Minimal DOM queries
- Caching strategies

### 5.10 Safety Mechanisms

#### Action Limits

**Constraints**
- Maximum 50 actions per task
- Prevents infinite loops
- Resource protection
- User safety

#### Interrupt Capability

**Features**
- User can stop at any time
- Immediate task termination
- Cleanup on interrupt
- State preservation

#### Error Recovery

**Mechanisms**
- Automatic error detection
- Task halting on errors
- Cleanup operations
- State restoration

### 5.11 Extension Points

#### Adding New Actions

**Process**
1. Define action in `src/helpers/availableActions.ts`
2. Implement execution handler in `src/helpers/domActions.ts` or `src/helpers/chromeDebugger.ts`
3. Update action execution in `src/state/currentTask.ts`
4. System message auto-updates (server-side)

#### Action Customization

**Options**
- Custom argument types
- Specialized execution logic
- Enhanced validation
- Extended error handling

---

## 6. Thin Client Architecture

### 6.1 Overview

The Thin Client architecture migrates LLM inference from the client to the server, while keeping DOM processing, UI, and action execution on the client. This enables enterprise features like multi-tenant isolation, RAG-based knowledge injection, and centralized action history.

### 6.2 Architecture Changes

#### Before (Client-Side LLM)

```typescript
// Client-side LLM inference
const completion = await openai.chat.completions.create({
  // Model selection now handled server-side
  messages: [
    { role: 'system', content: systemMessage },
    { role: 'user', content: prompt },
  ],
});
```

#### After (Thin Client)

```typescript
// Server-side LLM inference via API
const response = await apiClient.agentInteract(
  url,
  instructions,
  simplifiedDom,
  taskId
);
// Response: { thought, action, usage, taskId, hasOrgKnowledge }
```

### 6.3 Key Components

#### API Client (`src/api/client.ts`)

Centralized API client for all backend communication:
- `login(email, password)` - Authentication
- `getSession()` - Session check
- `logout()` - Logout
- `knowledgeResolve(url, query?)` - Knowledge resolution
- `agentInteract(url, query, dom, taskId?)` - Action loop

#### Authentication Flow

1. User enters email/password in Login component
2. `apiClient.login()` called
3. Bearer token stored in `chrome.storage.local`
4. User info and tenant info stored in Zustand state
5. Session checked on app mount
6. Logout clears token and state

#### Action Loop Flow

1. Client captures simplified DOM (with accessibility tree if available)
2. Client sends `POST /api/agent/interact` with:
   - `url` - Current page URL
   - `query` - User instructions
   - `dom` - Simplified DOM
   - `taskId` - Optional task ID for history continuity (legacy)
   - `sessionId` - Optional session ID for chat persistence (new)
   - **Error reporting fields** (if previous action executed):
     - `lastActionStatus` - 'success' | 'failure' | 'pending'
     - `lastActionError` - Error details if action failed
     - `lastActionResult` - Execution result
3. Server handles:
   - **Web search** (for new tasks) - Searches web to understand task
   - **Session resolution** - Creates or loads session from database
   - **History loading** - Loads conversation history from database (not client-provided)
   - **Error detection** - Detects client-reported failures and injects into LLM context
   - RAG context injection (tenant-scoped, domain-filtered)
   - Action history context (server-owned)
   - LLM inference with **user-friendly message generation**
   - Token usage tracking
   - **Finish() validation** - Prevents premature completion after errors
4. Server returns `NextActionResponse`:
   - `thought` - LLM reasoning (**user-friendly, non-technical language**)
   - `action` - Action string
   - `usage` - Token usage
   - `taskId` - Server-assigned task ID (legacy)
   - `sessionId` - Server-assigned session ID (new)
   - `hasOrgKnowledge` - RAG usage indicator
5. Client:
   - Parses action and executes
   - **Tracks execution result** (success/failure with error details)
   - **Adds message to chat** (user message on start, assistant message on response)
   - **Adds action step** to assistant message's technical logs
   - **Saves messages** to chrome.storage.local periodically
6. Process repeats until `finish()` or `fail()`
7. **On reload:** Messages loaded from chrome.storage.local or API, chat history restored

### 6.4 Chat Persistence & Error Propagation

#### Chat Message Structure

**ChatMessage Type:**
- `id` - Unique message identifier
- `role` - 'user' | 'assistant' | 'system'
- `content` - Main text/thought (user instruction or assistant thought)
- `status` - 'sending' | 'sent' | 'error' | 'success' | 'failure' | 'pending'
- `timestamp` - When message was created
- `actionPayload` - Structured action data (for assistant messages)
- `meta.steps` - Technical execution logs (ActionStep array)
- `error` - Error information if message represents a failure

**ActionStep Type:**
- `id` - Unique step identifier
- `action` - Action string (e.g., "click(123)")
- `parsedAction` - Parsed action object
- `status` - 'success' | 'failure' | 'pending'
- `error` - Error details if step failed
- `executionResult` - ActionExecutionResult with success/failure
- `timestamp` - When step was executed
- `duration` - Execution duration in milliseconds

#### Message Persistence

**Storage:**
- Messages saved to `chrome.storage.local` with key `session_messages_${sessionId}`
- Saved periodically during task execution
- Saved on task completion
- Date serialization/deserialization handled automatically

**Loading:**
- Messages loaded on component mount if `sessionId` exists
- First attempts to load from `chrome.storage.local`
- Falls back to API call (`GET /api/session/:sessionId/messages`) if not in storage
- Enables chat history restoration across extension reloads

#### Error Propagation Architecture

**Action Execution Error Tracking:**
1. DOM actions wrapped in try/catch
2. `callDOMAction` returns `ActionExecutionResult` with success/failure status
3. Errors captured with error codes (`ELEMENT_NOT_FOUND`, `TIMEOUT`, `NETWORK_ERROR`, etc.)
4. Execution result stored in `lastActionResult` state field
5. Error information sent to server in next `POST /api/agent/interact` call:
   - `lastActionStatus` - 'success' | 'failure' | 'pending'
   - `lastActionError` - Error details (message, code, action, elementId)
   - `lastActionResult` - Execution result (success, actualState)
6. Server receives failure context and generates correction strategy
7. **Task continues** - server decides next action based on error (prevents "lying agent")

**Action Step Tracking:**
- Each action execution creates an `ActionStep` in message's `meta.steps` array
- Steps include execution result, duration, error details
- Technical logs nested in collapsible accordion (ExecutionDetails component)
- User-facing messages remain clean in main chat view

#### Connection Handling Improvements

**Explicit Tab Targeting:**
- `callRPC` accepts explicit `tabId` parameter
- Prevents connection to wrong tabs (like DevTools)
- Uses tabId from task state for reliable targeting
- Falls back to querying active tab if tabId not provided (legacy behavior)

**Auto-Recovery:**
- "Extension context invalidated" errors trigger popup auto-reload
- Content script injection retry logic (up to maxTries)
- Improved error messages guide user to solution
- Prevents "Content script not ready" errors from breaking task execution

### 6.5 DOM Processing Enhancements (Tasks 4-8)

#### Task 4: Basic Accessibility Tree Extraction

- Chrome DevTools Protocol `Accessibility.getFullAXTree` integration
- Accessibility tree stored in state for UI display
- Fallback to DOM approach if extraction fails

#### Task 5: Accessibility Node Filtering

- Filter accessibility tree to interactive elements only
- Convert filtered nodes to simplified element representation
- Integrate into DOM processing pipeline

#### Task 6: Accessibility-DOM Element Mapping

- Bidirectional mapping between accessibility nodes and DOM elements
- Use `backendDOMNodeId` for reliable element targeting
- Fallback to DOM-based targeting when mapping unavailable

#### Task 7: Hybrid Element Representation

- Unified element representation combining accessibility and DOM data
- Prefers accessibility data when available
- Supplements with DOM when needed

#### Task 8: Accessibility-First Element Selection

- Prioritizes accessibility tree as primary source
- Supplements with DOM-only elements when needed
- Coverage metrics for visibility
- Expected 25-35% token reduction vs. baseline

### 6.5 State Management Updates

### 6.6 Reasoning Layer Architecture (v2.0)

#### 6.6.1 Overview

The Reasoning Layer is a client-side visualization and handling system for the backend's enhanced reasoning pipeline. The backend performs a 4-step reasoning process (Context & Gap Analysis, Execution, Evaluation & Iteration, Final Verification) that determines the best source for information (MEMORY, PAGE, WEB_SEARCH, or ASK_USER) with confidence scoring and evidence tracking.

**Reference:** See `REASONING_LAYER_IMPROVEMENTS.md` for complete backend specification.

**Key Features:**
- **Confidence Scoring:** All reasoning outputs include confidence scores (0.0 - 1.0) based on evidence quality
- **Evidence Tracking:** Evidence sources, quality (high/medium/low), and gaps are tracked and displayed
- **Iterative Search Visualization:** Search attempts, refined queries, and evaluation results are shown
- **Enhanced Missing Information:** Missing fields classified as EXTERNAL_KNOWLEDGE (searchable) vs PRIVATE_DATA (user input required)
- **User Input Handling:** Seamless pause/resume when agent needs user information

#### 6.6.2 Enhanced Data Structures

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
      solved: boolean; // Whether results solved the problem
      shouldRetry: boolean; // Whether to retry with refined query
      shouldAskUser: boolean; // Whether to ask user instead
      confidence: number; // Confidence in evaluation
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

**NextActionResponse Enhancement:**
The `NextActionResponse` interface includes:
- `reasoning?: ReasoningData` - Enhanced reasoning metadata
- `userQuestion?: string` - Question to ask user (when status is 'needs_user_input')
- `missingInformation?: MissingInfoField[]` - Enhanced missing information fields
- `reasoningContext?: { searchPerformed, searchSummary, searchIterations, finalQuery }` - Search context

#### 6.6.3 UI Components

**ReasoningBadge Component (`src/common/ReasoningBadge.tsx`):**
- Displays reasoning source with icon (MEMORY=purple, PAGE=blue, WEB_SEARCH=orange, ASK_USER=yellow)
- Shows confidence percentage with color coding:
  - Green (≥90%): High confidence
  - Yellow (≥70%): Medium confidence
  - Red (<70%): Low confidence
- Displays search iteration progress (e.g., "Attempt 2/3")
- Enhanced tooltip shows:
  - Reasoning explanation
  - Evidence quality indicator
  - Search evaluation results (if available)
  - Refined query information

**EvidenceIndicator Component (`src/common/EvidenceIndicator.tsx`):**
- Displays evidence sources, quality, and gaps
- Compact and full display modes
- Color-coded quality indicators:
  - High = Green
  - Medium = Yellow
  - Low = Red
- Shows evidence sources as badges
- Lists gaps/uncertainties

**UserInputPrompt Component (`src/common/UserInputPrompt.tsx`):**
- Enhanced to handle `MissingInfoField[]` structure
- Shows type classification badges:
  - "Can Search" for EXTERNAL_KNOWLEDGE
  - "Need Your Input" for PRIVATE_DATA
- Displays field descriptions
- Backward compatible with old string[] format

**ChatTurn Component Integration:**
- Displays `ReasoningBadge` when reasoning data exists
- Shows `EvidenceIndicator` when evidence is available
- Displays `UserInputPrompt` for ASK_USER messages
- Passes enhanced reasoning data to child components

**TaskHistoryUser Component Integration:**
- Enhanced technical details to show:
  - Evidence quality and sources
  - Evidence gaps
  - Search iteration information
  - Refined queries
  - Evaluation results
  - Enhanced missing info with type classification

#### 6.6.4 State Management

**Reasoning Data Storage (`src/state/currentTask.ts`):**

When a `NextActionResponse` with reasoning data is received:
1. **Reasoning Metadata Storage:**
   - Validates and stores `evidence` object
   - Handles `MissingInfoField[]` structure (backward compatible with string[])
   - Stores `searchIteration` data
   - Clamps confidence scores to 0-1 range
   - Stores in `message.meta.reasoning`

2. **Missing Information Handling:**
   - Converts old string[] format to new `MissingInfoField[]` structure
   - Defaults to `PRIVATE_DATA` type for backward compatibility
   - Stores in `message.missingInformation`

3. **Reasoning Context Storage:**
   - Stores `searchIterations` count
   - Stores `finalQuery` information
   - Stores in `message.meta.reasoningContext`

4. **User Input State:**
   - When `status === 'needs_user_input'`:
     - Sets message status to 'pending'
     - Stores `userQuestion` in message
     - Stores `missingInformation` array
     - Sets task status to 'idle' (pauses execution)

**Resume Logic:**
- Detects when waiting for user input (`status === 'idle'` and last message has `userQuestion`)
- Allows resuming from 'idle' state when user provides input
- Preserves message history when resuming
- Adds user's response as a new message
- Continues task execution with new context

#### 6.6.5 Integration with Backend API

**Response Handling:**
1. Backend returns `NextActionResponse` with enhanced reasoning data
2. Client validates and stores reasoning metadata
3. Client displays reasoning information in UI components
4. If `status === 'needs_user_input'`:
   - Task pauses (status: 'idle')
   - User input prompt displayed
   - Input field remains enabled with updated placeholder
   - User can provide additional information
5. When user responds:
   - Task resumes (status: 'running')
   - New user message added
   - Backend receives additional context
   - Task continues with new information

**Backward Compatibility:**
- Handles old string[] format for `missingInfo`
- Gracefully degrades when new fields are missing
- Type-safe conversions throughout
- Works with existing backend responses

#### 6.6.6 User Experience Flow

**Normal Flow:**
1. User submits task
2. Backend performs reasoning analysis
3. Client receives response with reasoning data
4. Reasoning badge displayed with source and confidence
5. Evidence indicator shown (if available)
6. Task continues based on reasoning source

**ASK_USER Flow:**
1. Backend determines user input needed
2. Client receives `NEEDS_USER_INPUT` response
3. Task pauses (status: 'idle')
4. User input prompt displayed with:
   - Question from backend
   - Missing information fields with type classification
   - Reasoning explanation
5. User provides input
6. User clicks Send
7. Task resumes with new context
8. Backend continues with additional information

**Iterative Search Flow:**
1. Backend performs search (WEB_SEARCH source)
2. Client receives reasoning data with `searchIteration` info
3. Reasoning badge shows search attempt (e.g., "Attempt 2/3")
4. Tooltip shows refined query and evaluation results
5. Technical details show search iteration progress
6. User can see search refinement process

#### 6.6.7 Key Files

**Type Definitions:**
- `src/api/client.ts` - `ReasoningData`, `MissingInfoField`, `ReasoningEvidence` interfaces
- `src/types/chatMessage.ts` - Enhanced `ChatMessage` type with reasoning metadata

**Components:**
- `src/common/ReasoningBadge.tsx` - Reasoning source and confidence display
- `src/common/EvidenceIndicator.tsx` - Evidence quality and sources display
- `src/common/UserInputPrompt.tsx` - User input request display
- `src/common/ChatTurn.tsx` - Integration of reasoning components
- `src/common/TaskHistoryUser.tsx` - Technical details with reasoning information

**State Management:**
- `src/state/currentTask.ts` - Reasoning data storage and user input handling

#### Settings Slice Changes

**Removed:**
- `openAIKey` - API key management (now server-side)
- `openPipeKey` - OpenPipe integration (now server-side)
- `selectedModel` - Model selection (now server-side)

**Added:**
- `user` - User information from authentication
- `tenantId` - Tenant ID from authentication
- `tenantName` - Tenant name from authentication

#### Current Task Slice Changes

**Added:**
- `taskId` - Server-assigned task ID for history continuity
- `displayHistory` - Display-only history (replaces `history`)
- `accessibilityTree` - Accessibility tree for UI display (Task 4)
- `accessibilityElements` - Filtered accessibility elements (Task 5)
- `accessibilityMapping` - Bidirectional mapping (Task 6)
- `hybridElements` - Hybrid elements (Task 7)
- `coverageMetrics` - Coverage metrics (Task 8)

**Removed:**
- `history` - Replaced by `displayHistory` (server owns canonical history)

---

## 7. Enterprise Platform Specification

### 7.1 Executive Summary

This specification defines the evolution of Spadeworks Copilot AI from a consumer browser extension into a commercial B2B enterprise platform. The platform enables organizations to overlay AI-powered assistance onto their existing workflows, including internal intranets, password-protected portals, and third-party SaaS applications that lack native AI capabilities.

### 7.2 Core Value Propositions

1. **Zero-Disruption Deployment**: Works with existing applications without code changes
2. **Enterprise-Grade Security**: Multi-tenant isolation, SSO/SAML, and role-based access control
3. **Contextual Intelligence**: Private knowledge injection via RAG for company-specific guidance
4. **Workflow Integration**: Seamless overlay on protected corporate environments

### 7.3 Infrastructure Requirements

#### Backend Components

- **API Server:** Node.js/TypeScript with Next.js (App Router)
- **Database:** MongoDB (Mongoose ODM for all persistence except Better Auth)
- **Auth:** Better Auth (Prisma) — users, sessions, accounts managed by Prisma only
- **Vector DB:** MongoDB Atlas Vector Search (or Pinecone/Weaviate for scale)
- **Cache:** Redis for sessions and caching
- **Queue:** Bull/BullMQ for background jobs (document processing)
- **Storage:** S3/Blob Storage for document files
- **Secrets:** AWS KMS/Azure Key Vault for encryption keys

#### Key Services

```
Authentication Service → SSO/SAML, JWT management
Tenant Service → Multi-tenant context, domain allowlists
RAG Service → Document ingestion, embeddings, vector search
Task Service → Task execution, history, analytics
Audit Service → Compliance logging, audit trails
```

### 7.4 Multi-Tenant Architecture

#### Tenant Isolation Strategy

**Schema-Level Isolation (Recommended)**
- Each tenant receives a dedicated database schema or namespace
- Schema naming convention: `tenant_{tenant_id}`
- Cross-schema queries prevented at database level
- Tenant ID enforced in all queries via middleware

#### Database Schema Design

**Core Tenant Schema (MongoDB + Mongoose)**
- `Tenant` - Tenant information and configuration
- `Role` - Role definitions with permissions
- `UserRole` - User-role assignments
- `AllowedDomain` - Domain allowlists for tenant
- `SSOConfig` - SSO/SAML configuration

**Better Auth (Prisma):** Users, sessions, accounts are managed by Prisma per Better Auth configuration. Users have `tenantId` field linking to Tenant collection.

### 7.5 Security Architecture

#### Authentication & Authorization

- **SSO/SAML Integration**: Enterprise identity providers
- **Bearer Token Authentication**: JWT tokens for API access
- **Role-Based Access Control**: Permissions scoped by role
- **Domain Allowlists**: Domain patterns for tenant isolation

#### Data Security

- **Encryption at Rest**: Sensitive data encrypted
- **Encryption in Transit**: TLS for all communications
- **Key Management**: AWS KMS/Azure Key Vault for encryption keys
- **Audit Logging**: Comprehensive audit trails

### 7.6 Private Knowledge Injection (RAG Pipeline)

#### RAG Architecture

- **Document Ingestion**: Upload and process documents
- **Embedding Generation**: Vector embeddings for semantic search
- **Vector Search**: MongoDB Atlas Vector Search or Pinecone/Weaviate
- **Context Injection**: RAG context injected into LLM prompts server-side

#### Knowledge Resolution API

**Endpoint:** `GET /api/knowledge/resolve`

**Purpose:** Internal use and debugging only — not for extension overlay or end-user display.

**Request:**
- `url` - Current page URL
- `query` - Optional query string

**Response:**
- `hasOrgKnowledge` - Whether org-specific RAG was used
- `chunks` - Knowledge chunks (for debugging)
- `citations` - Citations (for debugging)

**Note:** Knowledge is injected **only into the LLM prompt** server-side. The extension **never** receives raw chunks or citations in the action loop — only `thought` and `action`.

### 7.7 Contextual Overlay Mechanics

#### Knowledge Overlay (Client-Side)

- Triggered by tab changes or manual button
- Calls `GET /api/knowledge/resolve` to get knowledge context
- Displays context and citations in overlay component
- Handles empty context and error states

#### Action Loop Integration

- RAG context injected server-side into LLM prompt
- Extension receives only `thought` and `action`
- `hasOrgKnowledge` flag indicates RAG usage
- No raw knowledge data sent to extension

---

## 9. Reasoning Layer Architecture

### 9.1 Overview

The Reasoning Layer is a client-side visualization and handling system for the backend's enhanced reasoning pipeline. The backend performs a 4-step reasoning process (Context & Gap Analysis, Execution, Evaluation & Iteration, Final Verification) that determines the best source for information (MEMORY, PAGE, WEB_SEARCH, or ASK_USER) with confidence scoring and evidence tracking.

**Reference:** See `REASONING_LAYER_IMPROVEMENTS.md` for complete backend specification.

**Key Features:**
- **Confidence Scoring:** All reasoning outputs include confidence scores (0.0 - 1.0) based on evidence quality
- **Evidence Tracking:** Evidence sources, quality (high/medium/low), and gaps are tracked and displayed
- **Iterative Search Visualization:** Search attempts, refined queries, and evaluation results are shown
- **Enhanced Missing Information:** Missing fields classified as EXTERNAL_KNOWLEDGE (searchable) vs PRIVATE_DATA (user input required)
- **User Input Handling:** Seamless pause/resume when agent needs user information

### 9.2 Enhanced Data Structures

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
      solved: boolean; // Whether results solved the problem
      shouldRetry: boolean; // Whether to retry with refined query
      shouldAskUser: boolean; // Whether to ask user instead
      confidence: number; // Confidence in evaluation
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

**NextActionResponse Enhancement:**
The `NextActionResponse` interface includes:
- `reasoning?: ReasoningData` - Enhanced reasoning metadata
- `userQuestion?: string` - Question to ask user (when status is 'needs_user_input')
- `missingInformation?: MissingInfoField[]` - Enhanced missing information fields
- `reasoningContext?: { searchPerformed, searchSummary, searchIterations, finalQuery }` - Search context

### 9.3 UI Components

**ReasoningBadge Component (`src/common/ReasoningBadge.tsx`):**
- Displays reasoning source with icon (MEMORY=purple, PAGE=blue, WEB_SEARCH=orange, ASK_USER=yellow)
- Shows confidence percentage with color coding:
  - Green (≥90%): High confidence
  - Yellow (≥70%): Medium confidence
  - Red (<70%): Low confidence
- Displays search iteration progress (e.g., "Attempt 2/3")
- Enhanced tooltip shows:
  - Reasoning explanation
  - Evidence quality indicator
  - Search evaluation results (if available)
  - Refined query information

**EvidenceIndicator Component (`src/common/EvidenceIndicator.tsx`):**
- Displays evidence sources, quality, and gaps
- Compact and full display modes
- Color-coded quality indicators:
  - High = Green
  - Medium = Yellow
  - Low = Red
- Shows evidence sources as badges
- Lists gaps/uncertainties

**UserInputPrompt Component (`src/common/UserInputPrompt.tsx`):**
- Enhanced to handle `MissingInfoField[]` structure
- Shows type classification badges:
  - "Can Search" for EXTERNAL_KNOWLEDGE
  - "Need Your Input" for PRIVATE_DATA
- Displays field descriptions
- Backward compatible with old string[] format

**ChatTurn Component Integration:**
- Displays `ReasoningBadge` when reasoning data exists
- Shows `EvidenceIndicator` when evidence is available
- Displays `UserInputPrompt` for ASK_USER messages
- Passes enhanced reasoning data to child components

**TaskHistoryUser Component Integration:**
- Enhanced technical details to show:
  - Evidence quality and sources
  - Evidence gaps
  - Search iteration information
  - Refined queries
  - Evaluation results
  - Enhanced missing info with type classification

### 9.4 State Management

**Reasoning Data Storage (`src/state/currentTask.ts`):**

When a `NextActionResponse` with reasoning data is received:
1. **Reasoning Metadata Storage:**
   - Validates and stores `evidence` object
   - Handles `MissingInfoField[]` structure (backward compatible with string[])
   - Stores `searchIteration` data
   - Clamps confidence scores to 0-1 range
   - Stores in `message.meta.reasoning`

2. **Missing Information Handling:**
   - Converts old string[] format to new `MissingInfoField[]` structure
   - Defaults to `PRIVATE_DATA` type for backward compatibility
   - Stores in `message.missingInformation`

3. **Reasoning Context Storage:**
   - Stores `searchIterations` count
   - Stores `finalQuery` information
   - Stores in `message.meta.reasoningContext`

4. **User Input State:**
   - When `status === 'needs_user_input'`:
     - Sets message status to 'pending'
     - Stores `userQuestion` in message
     - Stores `missingInformation` array
     - Sets task status to 'idle' (pauses execution)

**Resume Logic:**
- Detects when waiting for user input (`status === 'idle'` and last message has `userQuestion`)
- Allows resuming from 'idle' state when user provides input
- Preserves message history when resuming
- Adds user's response as a new message
- Continues task execution with new context

### 9.5 Integration with Backend API

**Response Handling:**
1. Backend returns `NextActionResponse` with enhanced reasoning data
2. Client validates and stores reasoning metadata
3. Client displays reasoning information in UI components
4. If `status === 'needs_user_input'`:
   - Task pauses (status: 'idle')
   - User input prompt displayed
   - Input field remains enabled with updated placeholder
   - User can provide additional information
5. When user responds:
   - Task resumes (status: 'running')
   - New user message added
   - Backend receives additional context
   - Task continues with new information

**Backward Compatibility:**
- Handles old string[] format for `missingInfo`
- Gracefully degrades when new fields are missing
- Type-safe conversions throughout
- Works with existing backend responses

### 9.6 User Experience Flow

**Normal Flow:**
1. User submits task
2. Backend performs reasoning analysis
3. Client receives response with reasoning data
4. Reasoning badge displayed with source and confidence
5. Evidence indicator shown (if available)
6. Task continues based on reasoning source

**ASK_USER Flow:**
1. Backend determines user input needed
2. Client receives `NEEDS_USER_INPUT` response
3. Task pauses (status: 'idle')
4. User input prompt displayed with:
   - Question from backend
   - Missing information fields with type classification
   - Reasoning explanation
5. User provides input
6. User clicks Send
7. Task resumes with new context
8. Backend continues with additional information

**Iterative Search Flow:**
1. Backend performs search (WEB_SEARCH source)
2. Client receives reasoning data with `searchIteration` info
3. Reasoning badge shows search attempt (e.g., "Attempt 2/3")
4. Tooltip shows refined query and evaluation results
5. Technical details show search iteration progress
6. User can see search refinement process

### 9.7 Key Files

**Type Definitions:**
- `src/api/client.ts` - `ReasoningData`, `MissingInfoField`, `ReasoningEvidence` interfaces
- `src/types/chatMessage.ts` - Enhanced `ChatMessage` type with reasoning metadata

**Components:**
- `src/common/ReasoningBadge.tsx` - Reasoning source and confidence display
- `src/common/EvidenceIndicator.tsx` - Evidence quality and sources display
- `src/common/UserInputPrompt.tsx` - User input request display
- `src/common/ChatTurn.tsx` - Integration of reasoning components
- `src/common/TaskHistoryUser.tsx` - Technical details with reasoning information

**State Management:**
- `src/state/currentTask.ts` - Reasoning data storage and user input handling

---

## 8. DOM Processing Pipeline

### 8.1 Overview

The DOM processing pipeline transforms complex web page DOM structures into token-efficient representations for LLM consumption. The pipeline has been enhanced with accessibility tree extraction and filtering (Tasks 4-8) to achieve 25-35% token reduction vs. baseline.

### 8.2 Processing Stages

#### Stage 1: DOM Extraction

1. Content script extracts full DOM from page
2. Elements annotated with:
   - Visibility flags (`data-visible`)
   - Interactivity flags (`data-interactive`)
   - Unique element IDs (`data-id`)

#### Stage 2: Accessibility Tree Extraction (Task 4)

1. Chrome DevTools Protocol `Accessibility.getFullAXTree` called
2. Full accessibility tree extracted
3. Tree stored in state for UI display
4. Fallback to DOM approach if extraction fails

#### Stage 3: Accessibility Node Filtering (Task 5)

1. Filter accessibility tree to interactive elements only
2. Convert filtered nodes to simplified element representation
3. Create mapping from `axNodeId` to element index

#### Stage 4: Accessibility-DOM Mapping (Task 6)

1. Create bidirectional mapping between accessibility nodes and DOM elements
2. Use `backendDOMNodeId` for reliable element targeting
3. Store mapping in state for action execution

#### Stage 5: Hybrid Element Creation (Task 7)

1. Combine accessibility and DOM data into unified representation
2. Prefer accessibility data when available
3. Supplement with DOM when needed
4. Create hybrid elements array

#### Stage 6: Accessibility-First Selection (Task 8)

1. Prioritize accessibility tree as primary source
2. Supplement with DOM-only elements when needed
3. Calculate coverage metrics
4. Create final element selection

#### Stage 7: DOM Simplification

1. Filter to visible elements only
2. Filter to interactive or semantically important elements
3. Preserve essential attributes:
   - `aria-label`, `data-name`, `name`, `type`, `placeholder`, `value`, `role`, `title`
   - `data-ax-node-id`, `data-ax-id`, `data-ax-source`, `data-ax-index` (Tasks 5-8)
   - `data-hybrid`, `data-source` (Task 7)
4. Preserve meaningful text nodes
5. Simplify structure

#### Stage 8: Templatization

1. Parse DOM into tree structure
2. Identify repeated patterns
3. Create templates for patterns used 3+ times
4. Extract template values
5. Inline static values
6. Parameterize dynamic values
7. Generate final templatized string

### 8.3 Token Optimization Strategies

#### Accessibility-First Approach

- **Semantic Information**: Accessibility tree provides semantic roles and relationships
- **Filtered Elements**: Only interactive elements included
- **Reduced Redundancy**: Unified representation reduces duplication
- **Expected Reduction**: 25-35% token reduction vs. baseline

#### Templatization

- **Pattern Recognition**: Identifies repeated HTML structures
- **Template Creation**: Creates reusable templates
- **Value Extraction**: Separates static and dynamic values
- **Token Savings**: Significant reduction for repetitive content

### 8.4 Element Identification

#### Accessibility-Based Identification (Tasks 4-8)

- **Primary Source**: Accessibility tree for semantic information
- **Element Mapping**: `backendDOMNodeId` for reliable targeting
- **Fallback**: DOM-based approach when accessibility unavailable

#### DOM-Based Identification (Fallback)

- **Unique Selectors**: Data attributes for element identification
- **Selector Persistence**: Selectors persist across DOM updates
- **Query-Based Location**: Chrome Debugger API for element location

---

## 10. Quick Reference

### 9.1 Important Files

#### State Management
- `src/state/store.ts` - Main Zustand store
- `src/state/currentTask.ts` - Task execution state
- `src/state/settings.ts` - User settings and authentication
- `src/state/ui.ts` - UI state

#### Core Logic
- `src/api/client.ts` - API client (auth, agentInteract with error reporting, knowledgeResolve, getSessionMessages, getLatestSession) **[Thin Client]** - Includes ReasoningData, MissingInfoField, ReasoningEvidence type definitions (Reasoning Layer v2.0)
- `src/helpers/simplifyDom.ts` - DOM simplification with accessibility integration (Tasks 4-8)
- `src/helpers/parseAction.ts` - Action string parser **[Thin Client]**
- `src/helpers/domActions.ts` - Action execution with error tracking (returns ActionExecutionResult) and accessibility mapping (Task 6)
- `src/helpers/pageRPC.ts` - RPC communication with explicit tabId parameter and auto-recovery on extension reload
- `src/helpers/chromeDebugger.ts` - Debugger API integration
- `src/helpers/availableActions.ts` - Action definitions
- `src/helpers/accessibilityTree.ts` - Accessibility tree extraction (Task 4)

#### Chat & UI Components
- `src/common/ChatStream.tsx` - User-facing chat interface with message bubbles (user/assistant separation)
- `src/common/ExecutionDetails.tsx` - Collapsible technical execution logs (nested in assistant messages)
- `src/common/TaskHistoryUser.tsx` - Task history with chat persistence support (uses ChatStream when messages available)
- `src/types/chatMessage.ts` - ChatMessage and ActionStep type definitions for persistent conversation threads
- `src/common/ReasoningBadge.tsx` - Reasoning source and confidence display (Reasoning Layer v2.0)
- `src/common/EvidenceIndicator.tsx` - Evidence quality and sources display (Reasoning Layer v2.0)
- `src/common/UserInputPrompt.tsx` - User input request display with enhanced missing info classification (Reasoning Layer v2.0)
- `src/helpers/accessibilityFilter.ts` - Accessibility node filtering (Task 5)
- `src/helpers/accessibilityMapping.ts` - Accessibility-DOM mapping (Task 6)
- `src/helpers/hybridElement.ts` - Hybrid element creation (Task 7)
- `src/helpers/accessibilityFirst.ts` - Accessibility-first selection (Task 8)

#### Components
- `src/common/App.tsx` - Root component (updated for session check/login)
- `src/common/Login.tsx` - Login UI **[Thin Client]**
- `src/common/TaskUI.tsx` - Main task interface (updated for Thin Client + Tasks 4-8)
- `src/common/TaskHistory.tsx` - Action history display (display-only history)
- `src/common/KnowledgeOverlay.tsx` - Knowledge context overlay **[Thin Client]**
- `src/common/AccessibilityTreeView.tsx` - Accessibility tree display (Task 4)
- `src/common/HybridElementView.tsx` - Hybrid elements display (Task 7)
- `src/common/CoverageMetricsView.tsx` - Coverage metrics display (Task 8)

#### Configuration
- `src/manifest.json` - Extension manifest
- `webpack.config.js` - Build configuration

### 9.2 Architecture Patterns

#### Unidirectional Data Flow
State flows in one direction: User Action → State Update → UI Re-render

#### Isolated Contexts
Extension contexts (UI, background, content script) operate in isolation with message passing

#### Safety-First Design
Multiple safety mechanisms prevent unwanted actions and protect users

#### Token Efficiency
Every design decision considers token usage and API cost optimization

### 9.3 Development Workflow

#### Understanding the Codebase

1. Start with this document for comprehensive understanding
2. Review [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md) for implementation details
3. Study [Server-Side Agent Architecture](./SERVER_SIDE_AGENT_ARCH.md) for backend specification
4. Deep dive into specific areas as needed

#### Making Changes

1. Understand the relevant architecture section
2. Identify affected components
3. Follow established patterns
4. Consider token efficiency
5. Maintain safety mechanisms
6. Test thoroughly

### 9.4 Extension Points

#### Adding New Actions

1. Define action in `src/helpers/availableActions.ts`
2. Implement execution in `src/helpers/domActions.ts` or `src/helpers/chromeDebugger.ts`
3. Update action execution in `src/state/currentTask.ts`
4. System message auto-updates (server-side)

#### Adding UI Components

1. Create component in `src/common/` for shared components
2. Use Chakra UI for all styling (MANDATORY)
3. Connect to Zustand store if needed
4. Follow component patterns from this document

#### Modifying DOM Processing

1. Review DOM Processing Pipeline section (§8)
2. Understand accessibility integration (Tasks 4-8)
3. Follow established patterns
4. Maintain fallback to DOM-only approach

---

## 11. Implementation Status

### 10.1 Thin Client Migration Status

**Tasks 1-3: Core Thin Client (COMPLETE)**
- ✅ Task 1: Authentication & API Client
- ✅ Task 2: Runtime Knowledge Resolution
- ✅ Task 3: Server-Side Action Loop

**Tasks 4-8: DOM Processing Improvements (COMPLETE)**
- ✅ Task 4: Basic Accessibility Tree Extraction
- ✅ Task 5: Accessibility Node Filtering
- ✅ Task 6: Accessibility-DOM Element Mapping
- ✅ Task 7: Hybrid Element Representation
- ✅ Task 8: Accessibility-First Selection

**Client-Side Improvements (COMPLETE)**
- ✅ Error Propagation: DOM actions return execution results, errors sent to server
- ✅ Chat Persistence: Messages saved to chrome.storage.local, loaded on mount
- ✅ UI Refactor: ChatStream and ExecutionDetails components for clean chat interface
- ✅ Connection Handling: Explicit tabId in callRPC, auto-recovery on extension reload
- ✅ Conversation History: Previous tasks displayed in accordion, persisted across sessions
- ✅ Task 6: Accessibility-DOM Element Mapping
- ✅ Task 7: Hybrid Element Representation
- ✅ Task 8: Accessibility-First Element Selection

**Task 9: Documentation Consolidation (COMPLETE)**
- ✅ Task 9: Documentation Consolidation

### 10.2 Current Implementation

#### Completed Features

- **Authentication**: Login, session check, logout with Bearer tokens
- **Knowledge Resolution**: Client-side trigger, server-side RAG processing
- **Action Loop**: Server-side LLM inference, client-side action execution
- **Accessibility Integration**: Full accessibility tree extraction and filtering
- **Hybrid Elements**: Unified accessibility + DOM representation
- **Coverage Metrics**: Accessibility coverage tracking and display
- **Documentation**: Comprehensive architecture document consolidating all documentation

#### Pending Features

- **End-to-End QA Testing**: Live site testing for all features
- **Token Reduction Measurement**: Verify 25-35% reduction on live sites
- **Coverage Accuracy**: Verify >90% mapping accuracy on live sites

### 10.3 Future Enhancements

**Optional Tasks (Tasks 10-14):**
- Task 10: Task Context Classification
- Task 11: Task-Aware Filtering
- Task 12: Enhanced Templatization
- Task 13: Performance Optimization
- Task 14: Comprehensive Error Handling

See `ENTERPRISE_PLATFORM_SPECIFICATION.md` §3.6.5 for details.

---

## 11. References

### 11.1 Documentation Files

- **This Document**: Comprehensive architecture and specification
- **THIN_CLIENT_ROADMAP.md**: Client-side implementation roadmap (Tasks 1-9 complete)
- **THIN_SERVER_ROADMAP.md**: Server-side implementation roadmap
- **SERVER_SIDE_AGENT_ARCH.md**: Server-side agent architecture specification
- **ENTERPRISE_PLATFORM_SPECIFICATION.md**: Complete enterprise platform specification (detailed)

### 11.2 External References

- **Chrome Extension Manifest V3**: https://developer.chrome.com/docs/extensions/mv3/
- **Chrome DevTools Protocol**: https://chromedevtools.github.io/devtools-protocol/
- **Chakra UI Documentation**: https://chakra-ui.com/
- **Zustand Documentation**: https://zustand-demo.pmnd.rs/
- **React 18 Documentation**: https://react.dev/

---

**Document Maintenance:** This document should be updated when:
- Architecture changes significantly
- New major features added
- Patterns evolve
- Best practices change

Maintain consistency with codebase and keep documents accurate and up-to-date.
