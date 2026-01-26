# CLAUDE.md - Project Context for Claude

This document provides project-specific context for Claude AI when working on the Spadeworks Copilot AI browser extension.

## Project: Spadeworks Copilot AI Browser Extension

Spadeworks Copilot AI is a Chrome browser extension that uses large language models (GPT-4, GPT-3.5, o1, etc.) to automate browser interactions. Users provide natural language instructions, and the extension uses an LLM to determine and execute browser actions to complete tasks.

## Core Functionality

The extension operates through an iterative action cycle:

1. **DOM Extraction**: Content script extracts the current page's DOM
2. **DOM Simplification**: HTML is simplified to only interactive/semantically important elements, assigned unique IDs, and templatized to reduce token usage
3. **LLM Decision**: Simplified DOM + user instructions + action history sent to LLM
4. **Action Parsing**: LLM response parsed for action (click/setValue) or completion signal
5. **Action Execution**: Action executed via Chrome Debugger API
6. **Cycle Repeat**: Process repeats until task complete, user stops, error occurs, or max actions (50) reached

## Technical Stack

- **Framework**: React 18 with TypeScript (MUST stay on React 18 - Chakra UI v2.8.2 only supports React 18)
- **UI Library**: Chakra UI v2.8.2
- **State Management**: Zustand
- **Build Tool**: Webpack 5
- **Extension Format**: Chrome Extension Manifest V3
- **LLM Integration**: OpenAI SDK (with OpenPipe support)

## Project Structure

```
src/
├── pages/              # Extension pages (Popup, Panel, Devtools, etc.)
├── common/             # Shared React components
├── helpers/            # Core logic (LLM, DOM, actions)
├── state/              # Zustand store and state management
├── assets/             # Images and static assets
└── manifest.json       # Extension manifest

utils/                  # Build and development utilities
```

## Key Implementation Details

### LLM Interaction Pattern

The LLM receives:
- System message defining available actions
- User task instructions
- Previous action history
- Current simplified DOM
- Current timestamp

The LLM must respond with:
```xml
<Thought>Reasoning about what to do next</Thought>
<Action>click(123)</Action>
```

Or indicate completion:
```xml
<Thought>Task is complete</Thought>
<Action>DONE</Action>
```

### Available Actions

Currently supported actions:
- `click(id)`: Click an element by its assigned ID
- `setValue(id, text)`: Set value of input/textarea by ID

Actions are defined in `src/helpers/availableActions.ts` and executed via Chrome Debugger API.

### DOM Simplification Strategy

1. Extract only interactive elements (buttons, inputs, links, etc.)
2. Include semantically important text
3. Assign unique numeric IDs to each element
4. Templatize HTML to reduce token count (see `src/helpers/shrinkHTML/`)
5. Remove unnecessary attributes and nested structure

This is critical because the full DOM would exceed token limits.

### State Management

Zustand store (`src/state/store.ts`) manages:
- Settings: API keys, selected model, preferences
- Current task: Instructions, action history, status
- UI state: Modal visibility, notifications, etc.

### Error Handling

- Safety-first: Halt on unexpected LLM responses
- Retry logic: Up to 3 attempts for API errors
- User control: Can stop execution at any time
- Maximum actions: 50 per task to prevent infinite loops

## Development Workflow

### Building
- `yarn start`: Development build with hot reload
- `yarn build`: Production build
- Load unpacked extension from `build/` folder in Chrome

### Testing
- Jest for unit tests
- Test files use `.test.ts` or `.test.tsx` suffix
- Run with `yarn test`

### Code Style
- TypeScript strict mode
- ESLint + Prettier configured
- Functional React components with hooks
- Chakra UI for all UI components

## Common Development Tasks

### Adding a New Browser Action

1. Define action signature in `src/helpers/availableActions.ts`:
   ```typescript
   {
     name: 'scroll',
     args: [{ name: 'id', type: 'number' }],
     description: 'Scroll element into view'
   }
   ```

2. Implement execution in `src/helpers/chromeDebugger.ts` or `domActions.ts`

3. Update system message in `determineNextAction.ts` (auto-formatted from availableActions)

### Modifying LLM Behavior

- Edit system message in `src/helpers/determineNextAction.ts`
- Adjust prompt format in `formatPrompt()` function
- Update response parsing in `src/helpers/parseResponse.ts` if response format changes

### Adding UI Components

- Use Chakra UI components (`@chakra-ui/react`)
- Place shared components in `src/common/`
- Page-specific components in respective `src/pages/[Page]/` folder
- Connect to Zustand store for state if needed

## Important Considerations

### Privacy & Security
- No data sent to external servers except LLM API
- API keys stored in browser local storage
- All processing happens client-side

### Performance
- DOM simplification is critical for token efficiency
- Action history grows with each step (sent to LLM each time)
- Maximum 50 actions prevents runaway processes

### Limitations
- Extension is in research preview
- Many workflows may fail or confuse the agent
- Works best on standard web pages with clear interactive elements
- Iframe content not accessible
- Some dynamic sites may require additional handling

## Key Files Reference

- `src/helpers/determineNextAction.ts`: Core LLM interaction logic
- `src/helpers/simplifyDom.ts`: DOM simplification algorithm
- `src/helpers/parseResponse.ts`: LLM response parsing
- `src/helpers/chromeDebugger.ts`: Browser automation execution
- `src/state/store.ts`: Global state management
- `src/common/TaskUI.tsx`: Main task interface component
- `src/manifest.json`: Extension configuration

## When Making Changes

1. **Follow existing patterns**: The codebase has established patterns for LLM interaction, DOM handling, and state management
2. **Maintain type safety**: Use TypeScript types consistently
3. **Test thoroughly**: Browser automation is complex - test on various sites
4. **Consider token usage**: DOM simplification and templatization are critical
5. **Handle errors gracefully**: Safety-first approach prevents unwanted actions

## Questions to Consider

When working on this codebase, consider:
- How will this change affect token usage?
- Does this maintain the safety-first approach?
- Will this work across different websites?
- Is the error handling sufficient?
- Does this follow existing code patterns?
