# Spadeworks Copilot AI — Documentation Index

**Last Updated:** January 28, 2026  

This index points to the main docs. **BUSINESS_ONEPAGER**, **CHROME_TAB_ACTIONS**, and **REALTIME_MESSAGE_SYNC_ROADMAP** are kept as-is per project convention.

---

## Primary documentation

| Doc | Purpose |
|-----|--------|
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | Single architecture reference: **Part I** Client-Side (extension), **Part II** Enterprise & Platform, **Part III** Manus Orchestrator, **Part IV** Reasoning Layer. |
| [**ROADMAP.md**](./ROADMAP.md) | Implementation roadmap: **Part 1–2** Thin Client (Tasks 1–10 + future enhancements), **Part 3** Production Readiness (summary; full guide linked). |
| [**SPECS_AND_CONTRACTS.md**](./SPECS_AND_CONTRACTS.md) | API/contract specs: Verification Contract (extension → backend), Domain-Aware Sessions (frontend + backend). |

---

## Kept as-is

| Doc | Purpose |
|-----|--------|
| [**BUSINESS_ONEPAGER.md**](./BUSINESS_ONEPAGER.md) | Business one-pager (unchanged). |
| [**CHROME_TAB_ACTIONS.md**](./CHROME_TAB_ACTIONS.md) | Chrome tab actions (unchanged). |
| [**REALTIME_MESSAGE_SYNC_ROADMAP.md**](./REALTIME_MESSAGE_SYNC_ROADMAP.md) | Real-time message sync (Pusher/Sockudo) — documentation with implementation feedback (unchanged filename). |

---

## Detailed references

For full section-by-section detail, these docs are still in the repo:

| Doc | Content |
|-----|--------|
| [CLIENT_ARCHITECTURE.md](./CLIENT_ARCHITECTURE.md) | Full client-side architecture (extension contexts, components, data flow, Thin Client, DOM pipeline, Reasoning/Manus client support). |
| [ENTERPRISE_PLATFORM_SPECIFICATION.md](./ENTERPRISE_PLATFORM_SPECIFICATION.md) | Full enterprise spec (multi-tenant, RAG, security, DOM processing, Extension Thin Client migration §5.7, implementation roadmap). |
| [MANUS_ORCHESTRATOR_ARCHITECTURE.md](./MANUS_ORCHESTRATOR_ARCHITECTURE.md) | Full Manus orchestrator (Reason–Act–Verify, planning, verification, self-correction, tool system, data model). |
| [REASONING_LAYER_IMPROVEMENTS.md](./REASONING_LAYER_IMPROVEMENTS.md) | Full Reasoning Layer (4-step pipeline, context analysis, confidence, dual-model routing, popup/verification backend logic). |
| [PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md) | Full Production Readiness guide (virtual elements, 6 failure modes, 4 layers, 5 edge cases, 5 blind spots, DOM processing, checklist, testing). |

---

## Quick reference

**Architecture:** Extension = Thin Client (DOM + action execution client-side; LLM server-side). State = Zustand (client) + server task history.  
**Key files:** `src/state/store.ts`, `currentTask.ts`, `src/api/client.ts`, `src/helpers/simplifyDom.ts`, `parseAction.ts`, `domActions.ts`; `TaskUI.tsx`, `Login.tsx`, `KnowledgeOverlay.tsx`, `DebugPanel.tsx`.  
**Development:** Start with [ARCHITECTURE.md](./ARCHITECTURE.md) Part I for client; [ROADMAP.md](./ROADMAP.md) for tasks; [SPECS_AND_CONTRACTS.md](./SPECS_AND_CONTRACTS.md) for verification and domain-aware behavior.
