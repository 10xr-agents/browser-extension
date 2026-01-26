# AGENTS.md - AI Assistant Guidelines

This document provides context and guidelines for AI assistants working on the Spadeworks Copilot AI browser extension codebase.

## Project Overview

**Spadeworks Copilot AI** is a Chrome browser extension that uses GPT-4 (and other LLMs) to automate browser interactions. It allows users to perform repetitive web tasks through natural language instructions.

### Key Features
- Browser automation via LLM-powered decision making
- DOM simplification and templatization for efficient token usage
- Action cycle: DOM analysis → LLM decision → Action execution → Repeat
- Support for multiple LLM models (GPT-3.5, GPT-4, o1, etc.)
- Chrome Extension Manifest V3 architecture

## Architecture

### Core Components

1. **Content Script** (`src/pages/Content/`)
   - Runs on web pages
   - Extracts and simplifies DOM
   - Executes actions via Chrome Debugger API

2. **Background Service Worker** (`src/pages/Background/`)
   - Manages extension lifecycle
   - Coordinates between components

3. **UI Components** (`src/pages/Popup/`, `src/pages/Panel/`, `src/pages/Devtools/`)
   - Popup: Main user interface (Cmd+Shift+Y / Ctrl+Shift+Y)
   - Devtools Panel: Alternative UI in browser devtools
   - Options: Settings page

4. **State Management** (`src/state/`)
   - Zustand store for global state
   - Settings, current task, UI state

5. **Helpers** (`src/helpers/`)
   - `determineNextAction.ts`: LLM interaction logic
   - `simplifyDom.ts`: DOM simplification
   - `parseResponse.ts`: Parse LLM responses
   - `chromeDebugger.ts`: Browser automation
   - `domActions.ts`: DOM manipulation utilities

### Action Cycle Flow

```
1. User provides task instructions
2. Content script extracts simplified DOM
3. DOM + instructions sent to LLM
4. LLM returns action (click/setValue) or completion
5. Action executed via Chrome Debugger API
6. Action added to history
7. Cycle repeats until task complete or max actions reached (50)
```

## Code Standards

### TypeScript
- Use TypeScript for all new code
- Type all function parameters and return values
- Use interfaces/types for complex data structures
- Follow existing patterns in the codebase

### React Patterns
- Functional components with hooks
- Use Chakra UI for styling (`@chakra-ui/react`)
- State management via Zustand (`src/state/store.ts`)
- Keep components focused and reusable

### File Organization
- Components in `src/common/` for shared UI
- Page-specific code in `src/pages/[PageName]/`
- Helper functions in `src/helpers/`
- State management in `src/state/`

### Naming Conventions
- Components: PascalCase (e.g., `TaskUI.tsx`)
- Utilities: camelCase (e.g., `determineNextAction.ts`)
- Constants: UPPER_SNAKE_CASE (in `src/constants.ts`)

## Key Patterns

### LLM Interaction
- Actions are formatted as: `<Thought>...</Thought><Action>...</Action>`
- System message defines available actions
- Responses must include both tags or are invalid
- Max 50 actions per task

### DOM Simplification
- Only interactive/semantically important elements
- Elements assigned unique IDs
- HTML templatized to reduce token count
- See `src/helpers/simplifyDom.ts` and `src/helpers/shrinkHTML/`

### Error Handling
- Safety-first: halt on unexpected responses
- Retry logic for API errors (max 3 attempts)
- User can stop execution at any time

## Development Guidelines

### Adding New Actions
1. Define action in `src/helpers/availableActions.ts`
2. Implement execution in `src/helpers/domActions.ts` or `src/helpers/chromeDebugger.ts`
3. Update system message in `determineNextAction.ts`

### Testing
- Jest for unit tests
- Test files: `*.test.ts` or `*.test.tsx`
- Run with `yarn test`

### Building
- `yarn start`: Development build with hot reload
- `yarn build`: Production build
- Output in `build/` directory

### Chrome Extension Development
- Manifest V3 format
- Load unpacked extension from `build/` folder
- Debug via Chrome DevTools
- Content scripts run on all HTTP/HTTPS pages

## Important Files

- `src/manifest.json`: Extension configuration
- `src/helpers/determineNextAction.ts`: Core LLM interaction
- `src/state/store.ts`: Global state management
- `src/common/TaskUI.tsx`: Main task interface
- `webpack.config.js`: Build configuration

## Common Tasks

### Adding a New UI Component
1. Create component in `src/common/` or appropriate page folder
2. Use Chakra UI components
3. Connect to Zustand store if needed
4. Import and use in parent component

### Modifying LLM Behavior
1. Edit system message in `determineNextAction.ts`
2. Adjust prompt formatting in `formatPrompt()`
3. Update action parsing in `parseResponse.ts` if needed

### Debugging
- Use Chrome DevTools for extension debugging
- Check background service worker console
- Inspect content script execution
- Monitor LLM API calls and responses

## Dependencies

- React 18
- TypeScript
- Chakra UI (component library)
- Zustand (state management)
- OpenAI SDK (LLM integration)
- Webpack 5 (bundling)

## Notes

- Extension is in research preview - many workflows may fail
- Privacy-first: no data sent to external servers (except LLM API)
- Maximum 50 actions per task to prevent infinite loops
- DOM simplification is critical for token efficiency
