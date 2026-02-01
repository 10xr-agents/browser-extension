# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Spadeworks Copilot AI is a Chrome browser extension (Manifest V3) that automates browser interactions via LLMs. Users provide natural language instructions, and the extension determines and executes browser actions through an iterative action cycle.

**Critical Constraint**: This is a Chrome Extension, NOT a Next.js app. Always consider extension context (content scripts, service workers, side panel).

## Build & Development Commands

```bash
yarn start          # Development build with hot reload
yarn start:clean    # Same as above, but kills port 3001 first if in use
yarn build          # Production build
yarn test           # Run all tests
yarn test <pattern> # Run specific tests (e.g., yarn test parseResponse)
yarn lint           # ESLint check
yarn prettier       # Format code
```

**Load Extension**: Navigate to `chrome://extensions/`, enable Developer mode, click "Load unpacked", select `build/` directory.

## Technical Stack

- **React 18** with TypeScript (MUST stay on React 18 - Chakra UI v2.8.2 doesn't support React 19)
- **Chakra UI v2.8.2** - MANDATORY for all UI components
- **Zustand** with Immer middleware for state management
- **Chrome Extension Manifest V3** - Service workers, not background pages
- **OpenAI SDK** with OpenPipe support for LLM integration

## Architecture Overview

### Extension Contexts (Critical to Understand)

1. **Background Service Worker** (`src/pages/Background/`)
   - TaskOrchestrator: Central task management, state schema
   - TabTaskManager: Multi-tab support, concurrent tasks
   - ErrorRecovery: Error classification, retry logic
   - **No `window` object** - cannot use pusher-js or DOM APIs

2. **Content Script** (`src/pages/Content/`)
   - Runs in page context (isolated from page's JavaScript)
   - DOM extraction and action execution
   - Dies on navigation (must handle reconnection)

3. **UI Pages** (Side Panel, Popup, Devtools Panel)
   - React + Chakra UI components
   - Subscribe to state via storage observers or Zustand

### Storage-First Architecture (Phase 4)

Single source of truth in `chrome.storage.local`:
- `session_{tabId}`: Per-tab task state, messages, history
- `active_tab_id`: Currently viewed tab
- `connection_state`: WebSocket status

**Pattern**: Background writes to storage → UI auto-updates via `storage.onChanged`

```typescript
// UI subscribes
const { session } = useActiveSession();

// Send commands to background
chrome.runtime.sendMessage({ type: 'TASK_COMMAND', command: {...} });
```

## Action Cycle

1. DOM extraction (content script) → DOM simplification → LLM decision
2. Response parsed for `<Thought>` and `<Action>` tags
3. Action executed via Chrome Debugger API
4. Repeat until `finish()` or `fail()` (max 50 actions)

**LLM Response Format**:
```xml
<Thought>Reasoning about what to do</Thought>
<Action>click(123)</Action>
```

**Available Actions**: `click(id)`, `setValue(id, text)`, `finish()`, `fail()`, `ask_user()`

Actions defined in `src/helpers/availableActions.ts`, executed in `src/helpers/chromeDebugger.ts`.

## Critical Patterns

### Zustand Selectors (Prevents Infinite Loops)

```typescript
// ❌ WRONG - Returns object, causes infinite re-renders
const state = useAppState((state) => ({ value: state.settings.value }));

// ✅ CORRECT - Split selectors, return primitives
const value = useAppState((state) => state.settings.value);
const setValue = useAppState((state) => state.settings.actions.setValue);
```

### useEffect Dependencies (Prevents React Error #310)

```typescript
// ❌ WRONG - Zustand actions in deps cause infinite loops
useEffect(() => { loadMessages(id); }, [id, loadMessages]);

// ✅ CORRECT - Zustand actions are stable, don't include them
useEffect(() => { loadMessages(id); }, [id]);
```

### Dark Mode (Required for All Components)

```typescript
// ❌ WRONG - Hardcoded colors
<Box bg="white" color="gray.900">

// ✅ CORRECT - useColorModeValue at component top level
const bg = useColorModeValue('white', 'gray.900');
const text = useColorModeValue('gray.900', 'gray.100');
<Box bg={bg} color={text}>
```

### Type Safety for Rendered Values (Prevents React Error #130)

```typescript
// ❌ WRONG - Could render undefined/object
<Text>{message.content}</Text>

// ✅ CORRECT - Always validate before rendering
<Text>{typeof message.content === 'string' ? message.content : String(message.content || '')}</Text>
```

### Chrome API: Always Pass tabId

```typescript
// ❌ WRONG - Uses "active" tab which may be wrong
await callRPC('getAnnotatedDOM', [], 5);

// ✅ CORRECT - Explicit tabId
await callRPC('getAnnotatedDOM', [], 5, tabId);
```

## Adding a New Action

1. Define in `src/helpers/availableActions.ts`:
   ```typescript
   { name: 'scroll', args: [{ name: 'elementId', type: 'number' }], description: 'Scroll element into view' }
   ```
2. Implement in `src/helpers/chromeDebugger.ts` or `domActions.ts`
3. Handle in `src/state/currentTask.ts` switch statement
4. System message auto-updates from availableActions

## Key Files

**Core Logic**:
- `src/helpers/determineNextAction.ts` - LLM interaction, prompt construction
- `src/helpers/parseResponse.ts` - LLM response parsing
- `src/helpers/availableActions.ts` - Action definitions
- `src/helpers/chromeDebugger.ts` - Browser automation via CDP
- `src/helpers/simplifyDom.ts` - DOM simplification algorithm

**State Management**:
- `src/state/store.ts` - Zustand store with slices
- `src/state/currentTask.ts` - Task execution state
- `src/state/StorageFirstManager.ts` - Storage-as-database layer
- `src/state/useStorageSubscription.ts` - React hooks for storage binding

**Background Services**:
- `src/pages/Background/TaskOrchestrator.ts` - Central task management
- `src/pages/Background/TabTaskManager.ts` - Multi-tab support
- `src/pages/Background/ErrorRecovery.ts` - Error handling

**Content Script**:
- `src/pages/Content/getAnnotatedDOM.ts` - DOM extraction
- `src/pages/Content/index.ts` - RPC handler, action execution

## Service Worker Constraints

The background service worker has NO `window` object:
- Cannot use pusher-js/WebSocket directly (runs in Side Panel instead)
- Cannot use DOM APIs
- Use `chrome.storage` not `localStorage`
- Long operations need keep-alive pattern (30s timeout)

## Documentation

- `docs/ARCHITECTURE.md` - Comprehensive architecture (Phases 1-4, Storage-First)
- `.cursorrules` - Detailed coding patterns and anti-patterns
- `docs/HYBRID_VISION_SKELETON_EXTENSION_SPEC.md` - Hybrid vision system

## Key Considerations

1. **Token Usage**: DOM simplification is critical. Full DOM exceeds limits.
2. **Tab Targeting**: Always pass explicit tabId to prevent wrong-tab bugs.
3. **Content Script Lifecycle**: Dies on navigation, needs reconnection handling.
4. **Service Worker Timeout**: Wrap long operations with keep-alive (30s limit).
5. **Safety-First**: Halt on unexpected LLM responses, max 50 actions per task.
