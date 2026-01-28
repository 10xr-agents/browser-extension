# Spadeworks Copilot AI - Documentation Index

## Overview

This documentation provides a comprehensive understanding of the Spadeworks Copilot AI browser extension architecture. The documentation has been reorganized with clear separation between client-side and server-side architecture.

**Architecture Note:** The extension has migrated to a **Thin Client** architecture where DOM processing remains client-side, but LLM inference moves to the server.

## Primary Documentation

### [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) ⭐ **START HERE FOR CLIENT-SIDE**
**Complete client-side (extension) architecture documentation:**
- System architecture (extension contexts, communication patterns)
- Component architecture (all UI components, patterns, dark mode)
- Data flow architecture (task execution, chat persistence, error flow)
- Action system architecture (execution, validation, history)
- Thin Client implementation (authentication, API client, action loop)
- DOM Processing Pipeline (accessibility integration, token optimization)
- Reasoning Layer client support (popup handling, NEEDS_USER_INPUT)
- Debug View architecture (Debug Panel, health signals, developer mode)
- Manus Orchestrator client support (plan display, verification, correction)
- Implementation status (Tasks 1-10 complete)
- Quick reference (key files, patterns, common mistakes)

**This document consolidates all client-side information from:**
- `COMPREHENSIVE_ARCHITECTURE.md` (client-side parts)
- `THIN_CLIENT_ROADMAP.md` (implementation details)
- `REASONING_LAYER_IMPROVEMENTS.md` (client-side parts)
- `DEBUG_VIEW_IMPROVEMENTS.md` (client-side implementation)
- `MANUS_ORCHESTRATOR_ARCHITECTURE.md` (client-side display)
- `ENTERPRISE_PLATFORM_SPECIFICATION.md` (client-side migration)

**Note:** For detailed task-based implementation reference, see [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md). For server-side architecture, see [Server-Side Agent Architecture](./SERVER_SIDE_AGENT_ARCH.md).

## Implementation Roadmaps

### [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md)
**Detailed task-based implementation roadmap** with comprehensive verification checklists:
- **Part 1: Current Implementation (Tasks 1-10)** — All complete
  - Tasks 1-3: Core Thin Client migration (Authentication, Knowledge Resolution, Action Loop)
  - Tasks 4-8: DOM processing improvements (Accessibility Tree integration)
  - Task 9: Documentation Consolidation
  - Task 10: Reasoning Layer Client-Side Improvements
- **Part 2: Future Enhancements** — Debug View & Manus Orchestrator (all complete)
  - Part A (Tasks 1-5): Debug View Enhancements
  - Part B (Tasks 6-10): Manus Orchestrator Support
- Detailed verification and implementation status for each task
- File-by-file implementation details

**Note:** For architecture overview, see [Client-Side Architecture](./CLIENT_ARCHITECTURE.md). This roadmap provides detailed task-based implementation guidance.

### [Real-Time Message Sync Roadmap](./REALTIME_MESSAGE_SYNC_ROADMAP.md) ⭐ **NEW**
**WebSocket-based push message retrieval roadmap:**
- Current poll-based architecture analysis
- WebSocket implementation (Tasks 1-7)
- Connection management with reconnection logic
- Zustand store integration for real-time updates
- Polling fallback for resilience
- UI status indicators (connection state, typing)
- Backend WebSocket endpoint requirements

**Status:** ⏳ **PLANNING** — Ready for implementation

### [Thin Server Roadmap](./THIN_SERVER_ROADMAP.md)
Server-side implementation roadmap:
- Backend API implementation
- Database schema and models
- RAG pipeline implementation
- Authentication and authorization

## Detailed Specifications

### [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) ⭐ **PRIMARY CLIENT-SIDE DOC**
**Complete client-side architecture** - See Primary Documentation above.

### [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md)
**Detailed task-based implementation roadmap** - See Implementation Roadmaps above.

### [Server-Side Agent Architecture](./SERVER_SIDE_AGENT_ARCH.md)
**Server-side agent architecture specification:**
- API endpoints (`POST /api/agent/interact`, `GET /api/knowledge/resolve`)
- Task and action history management
- RAG integration
- Authentication and authorization
- Session management
- Error handling
- Manus-style orchestrator features (planning, verification, self-correction)

### [Manus Orchestrator Architecture](./MANUS_ORCHESTRATOR_ARCHITECTURE.md)
**Server-side Manus Orchestrator architecture specification:**
- Architectural decisions and design rationale
- Reason-Act-Verify loop architecture
- Planning engine design
- Verification architecture
- Self-correction architecture
- Tool system architecture

**Note:** Client-side display and interaction are in [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §10.

### [Reasoning Layer Improvements](./REASONING_LAYER_IMPROVEMENTS.md)
**Server-side Reasoning Layer architecture specification:**
- 4-step reasoning pipeline (Context & Gap Analysis, Execution, Evaluation & Iteration, Final Verification)
- Dual-model architecture (Smart LLM for thinking, Fast LLM for routine)
- Confidence scoring and evidence tracking
- Iterative search refinement
- Missing information classification

**Note:** Client-side support (popup handling, NEEDS_USER_INPUT) is in [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §8.

### [Enterprise Platform Specification](./ENTERPRISE_PLATFORM_SPECIFICATION.md)
**Enterprise platform specification** (server-focused):
- Multi-tenant architecture & security
- Private knowledge injection (RAG pipeline)
- Contextual overlay mechanics
- **DOM Processing Pipeline** (§3.5) - Processing stages, element identification, token optimization (client-side processing details)
- **DOM Processing Improvements** (§3.6) - Alternative solutions, accessibility tree approach, implementation plan (client-side processing details)
- Infrastructure requirements
- Migration path and implementation roadmap

**Note:** 
- Client-side implementation details are in [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §7 (DOM Processing Pipeline)
- Extension Thin Client Migration details (§5.7) are in [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §6 (Thin Client Implementation)

### [Production Readiness Guide](./PRODUCTION_READINESS.md) ⭐ **PRODUCTION-GRADE IMPROVEMENTS**
**Production-ready improvements and edge case handling:**
- **Virtual Element Handling** - Text node menu items (recent fix for "New/Search" issue)
- **6 Hidden Failure Modes** - React inputs, Shadow DOM, hover-only elements, click interception, iframes, stale elements
- **4 Missing Layers of Robustness** - Synthetic events, visual lies (overlays), dynamic stability, iframe support
- **5 Advanced Edge Cases** - Stale element race conditions, new tab disconnects, native dialogs, hydration gaps, bot detection
- **DOM Processing Implementation Details** - Complete pipeline, interactive detection, snapshot system, hybrid elements
- **Implementation Checklist** - Completed items and TODO list with priorities
- **Testing Recommendations** - Test cases for virtual elements and production fixes

**This document provides:**
- Detailed implementation code for all production fixes
- Edge case handling strategies
- Real-world web application compatibility improvements
- Step-by-step fixes for common failure modes

**Status:** Virtual element handling ✅ **COMPLETE**, Production fixes ⚠️ **TODO**

### [Domain-Aware Sessions](./DOMAIN_AWARE_SESSIONS.md) ⭐ **SESSION MANAGEMENT**
**Domain-aware session management for multi-tab workflows:**
- **Automatic Session Switching** - Sessions auto-switch when domain changes
- **Domain-Prefixed Titles** - Sessions named with domain prefix (e.g., "google.com: Search flights")
- **Session Rename** - Users can rename sessions while preserving domain prefix
- **Backend API** - Full API support for domain-aware operations

**Features:**
- When navigating to a new domain, creates or switches to domain-specific session
- Chat History drawer shows domain badges and rename option
- Migration for existing sessions to add domain field
- Backend endpoints: `PATCH /api/session/[id]`, `GET /api/session/by-domain/[domain]`

**Status:** ✅ **FULLY IMPLEMENTED** (Frontend + Backend)


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

**For Client-Side (Extension) Development:**
1. Start with [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) ⭐ for complete client-side understanding
2. Review [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md) for detailed task-based implementation reference
3. Check [Production Readiness Guide](./PRODUCTION_READINESS.md) for production-grade improvements and edge case handling
4. Deep dive into specific areas as needed

**For Server-Side Development:**
1. Study [Server-Side Agent Architecture](./SERVER_SIDE_AGENT_ARCH.md) for backend specification
2. Review [Thin Server Roadmap](./THIN_SERVER_ROADMAP.md) for server implementation details
3. Check [Backend Missing Items](./BACKEND_MISSING_ITEMS.md) for implementation gaps
4. Review [Manus Orchestrator Architecture](./MANUS_ORCHESTRATOR_ARCHITECTURE.md) for orchestrator design decisions
5. Review [Reasoning Layer Improvements](./REASONING_LAYER_IMPROVEMENTS.md) for reasoning layer server-side architecture

### Making Changes

1. Understand the relevant architecture document
2. Identify affected components
3. Follow established patterns
4. Consider token efficiency
5. Maintain safety mechanisms
6. Test thoroughly

### Debugging

**Client-Side Debugging:**
1. Review [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §4 (Data Flow) for execution path
2. Check [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §5 (Action System) for execution issues
3. Review [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md) for detailed implementation reference
4. Use task history for context
5. Enable Developer Mode in Settings to access Debug Panel

## Extension Points

### Adding New Actions
See [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §5 (Action System Architecture) for details on extending actions

### Adding UI Components
See [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §3 (Component Architecture) for component patterns

### Modifying DOM Processing
See [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §7 (DOM Processing Pipeline) for processing architecture and enhancement strategies

### Production-Grade Improvements
See [Production Readiness Guide](./PRODUCTION_READINESS.md) for edge case handling, production fixes, and robustness improvements

### Thin Client Implementation
See [Client-Side Architecture](./CLIENT_ARCHITECTURE.md) §6 (Thin Client Implementation) for architecture overview, and [Thin Client Roadmap](./THIN_CLIENT_ROADMAP.md) for detailed task-based implementation guide

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
