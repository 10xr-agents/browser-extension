# Spadeworks Copilot AI - Documentation Index

## Overview

This documentation provides a comprehensive understanding of the Spadeworks Copilot AI browser extension architecture. The documentation has been consolidated into a single comprehensive document for easier navigation and maintenance.

**Architecture Note:** The extension has migrated to a **Thin Client** architecture where DOM processing remains client-side, but LLM inference moves to the server. See [Comprehensive Architecture](./COMPREHENSIVE_ARCHITECTURE.md) and [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md) for details.

## Primary Documentation

### [Comprehensive Architecture & Specification](./COMPREHENSIVE_ARCHITECTURE.md) ⭐ **START HERE**
**Consolidated documentation** covering all aspects of the system:
- System architecture overview
- Component architecture
- Data flow architecture
- Action system architecture
- Thin Client architecture
- Enterprise platform specification
- DOM processing pipeline
- Quick reference and implementation status

**Note:** This document consolidates information from the individual architecture documents below. For the most up-to-date information, refer to this comprehensive document.

## Implementation Roadmaps

### [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md)
Client-side implementation roadmap with task-based approach:
- Tasks 1-3: Core Thin Client migration (COMPLETE)
- Tasks 4-8: DOM processing improvements (COMPLETE)
- Detailed verification and implementation status for each task

### [Thin Server Roadmap](./THIN_SERVER_ROADMAP.md)
Server-side implementation roadmap:
- Backend API implementation
- Database schema and models
- RAG pipeline implementation
- Authentication and authorization

## Detailed Specifications

### [Enterprise Platform Specification](./ENTERPRISE_PLATFORM_SPECIFICATION.md)
Complete enterprise platform specification covering:
- Multi-tenant architecture & security
- Private knowledge injection (RAG pipeline)
- Contextual overlay mechanics
- **DOM Processing Pipeline** (§3.5) - Processing stages, element identification, token optimization
- **DOM Processing Improvements** (§3.6) - Alternative solutions, accessibility tree approach, implementation plan
- Extension Thin Client Migration (§5.7) - Complete migration guide from client-side to server-side inference
- Infrastructure requirements
- Migration path and implementation roadmap

### [Server-Side Agent Architecture](./SERVER_SIDE_AGENT_ARCH.md)
Server-side agent architecture specification:
- API endpoints (`POST /api/agent/interact`, `GET /api/knowledge/resolve`)
- Task and action history management
- RAG integration
- Authentication and authorization


## Quick Reference

### Key Concepts

**Action Cycle (Thin Client)**
The iterative process of: DOM extraction → Backend API call → Action execution → Repeat. DOM processing remains client-side; LLM inference happens server-side.

**DOM Simplification**
The process of reducing complex DOM structures to token-efficient representations

**Templatization**
The optimization technique of identifying and reusing repeated HTML patterns

**RPC Methods**
Remote procedure calls between extension contexts and content scripts

**State Slices**
Organized state management units (currentTask, settings, ui)

### Important Files

**State Management**
- `src/state/store.ts` - Main Zustand store
- `src/state/currentTask.ts` - Task execution state
- `src/state/settings.ts` - User settings
- `src/state/ui.ts` - UI state

**Core Logic**
- `src/api/client.ts` - API client (auth, agentInteract, knowledgeResolve) **[Thin Client]**
- `src/helpers/simplifyDom.ts` - DOM simplification with accessibility integration (Tasks 4-8)
- `src/helpers/parseAction.ts` - Action string parser **[Thin Client]**
- `src/helpers/domActions.ts` - Action execution with accessibility mapping (Task 6)
- `src/helpers/chromeDebugger.ts` - Debugger API integration
- `src/helpers/accessibilityTree.ts` - Accessibility tree extraction (Task 4)
- `src/helpers/accessibilityFilter.ts` - Accessibility node filtering (Task 5)
- `src/helpers/accessibilityMapping.ts` - Accessibility-DOM mapping (Task 6)
- `src/helpers/hybridElement.ts` - Hybrid element creation (Task 7)
- `src/helpers/accessibilityFirst.ts` - Accessibility-first selection (Task 8)

**Components**
- `src/common/App.tsx` - Root component (updated for session check/login)
- `src/common/Login.tsx` - Login UI **[Thin Client]**
- `src/common/TaskUI.tsx` - Main task interface (updated for Thin Client + Tasks 4-8)
- `src/common/TaskHistory.tsx` - Action history display (display-only history)
- `src/common/KnowledgeOverlay.tsx` - Knowledge context overlay **[Thin Client]**
- `src/common/AccessibilityTreeView.tsx` - Accessibility tree display (Task 4)
- `src/common/HybridElementView.tsx` - Hybrid elements display (Task 7)
- `src/common/CoverageMetricsView.tsx` - Coverage metrics display (Task 8)

**Configuration**
- `src/manifest.json` - Extension manifest
- `src/helpers/availableActions.ts` - Action definitions
- `webpack.config.js` - Build configuration

## Architecture Patterns

### Unidirectional Data Flow
State flows in one direction: User Action → State Update → UI Re-render

### Isolated Contexts
Extension contexts (UI, background, content script) operate in isolation with message passing

### Safety-First Design
Multiple safety mechanisms prevent unwanted actions and protect users

### Token Efficiency
Every design decision considers token usage and API cost optimization

## Development Workflow

### Understanding the Codebase

1. Start with [Comprehensive Architecture](./COMPREHENSIVE_ARCHITECTURE.md) for complete understanding
2. Review [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md) for implementation details
3. Study [Server-Side Agent Architecture](./SERVER_SIDE_AGENT_ARCH.md) for backend specification
4. Deep dive into specific areas as needed

### Making Changes

1. Understand the relevant architecture document
2. Identify affected components
3. Follow established patterns
4. Consider token efficiency
5. Maintain safety mechanisms
6. Test thoroughly

### Debugging

1. Review [Comprehensive Architecture](./COMPREHENSIVE_ARCHITECTURE.md) §4 (Data Flow) for execution path
2. Check [Comprehensive Architecture](./COMPREHENSIVE_ARCHITECTURE.md) §5 (Action System) for execution issues
3. Review [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md) for implementation details
4. Use task history for context

## Extension Points

### Adding New Actions
See [Comprehensive Architecture](./COMPREHENSIVE_ARCHITECTURE.md) §5 (Action System) for details on extending actions

### Adding UI Components
See [Comprehensive Architecture](./COMPREHENSIVE_ARCHITECTURE.md) §3 (Component Architecture) for component patterns

### Modifying DOM Processing
See [Comprehensive Architecture](./COMPREHENSIVE_ARCHITECTURE.md) §8 (DOM Processing Pipeline) for processing architecture and enhancement strategies

### Thin Client Implementation
See [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md) for task-based implementation guide and detailed code examples

## Best Practices

### Code Organization
- Follow existing file structure
- Use TypeScript for type safety
- Organize by functionality
- Keep components focused

### State Management
- Use Zustand selectors efficiently
- Update state immutably
- Persist only necessary state
- Keep slices focused

### Error Handling
- Handle errors at every level
- Provide user feedback
- Log errors appropriately
- Clean up on errors

### Performance
- Optimize token usage
- Minimize DOM queries
- Cache where appropriate
- Use efficient algorithms

## Future Documentation

Additional documentation may cover:
- Testing strategies
- Deployment processes
- Troubleshooting guides
- API reference
- Contributing guidelines

## Getting Help

For questions or issues:
1. Review relevant architecture document
2. Check code comments
3. Examine similar implementations
4. Review task history for patterns

## Document Maintenance

These documents should be updated when:
- Architecture changes significantly
- New major features added
- Patterns evolve
- Best practices change

Maintain consistency with codebase and keep documents accurate and up-to-date.
