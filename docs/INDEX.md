# Spadeworks Copilot AI — Documentation Index

**Last Updated:** January 31, 2026  

This index points to the main docs. **BUSINESS_ONEPAGER**, **CHROME_TAB_ACTIONS**, and **REALTIME_MESSAGE_SYNC_ROADMAP** are kept as-is per project convention.

---

## Primary documentation

| Doc | Purpose |
|-----|--------|
| [**ARCHITECTURE.md**](./ARCHITECTURE.md) | Single architecture reference: **Part I** Client-Side (extension), **Part II** Enterprise & Platform, **Part III** Manus Orchestrator, **Part IV** Reasoning Layer. |
| [**ROADMAP.md**](./ROADMAP.md) | Implementation roadmap: **Part 1–2** Thin Client (Tasks 1–10 + future enhancements), **Part 3** Production Readiness (summary; full guide linked). |
| [**SPECS_AND_CONTRACTS.md**](./SPECS_AND_CONTRACTS.md) | API/contract specs: Verification Contract (extension → backend), Tab-Scoped Sessions (domain metadata). |
| [**HYBRID_VISION_SKELETON_EXTENSION_SPEC.md**](./HYBRID_VISION_SKELETON_EXTENSION_SPEC.md) | **NEW (2026-01-31)** Hybrid Vision + Skeleton spec: Screenshot capture, skeleton DOM extraction, ~80% token reduction. Phase 2 ✅ implemented. Includes DOM extraction reliability fixes. |

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

## Recent Fixes (2026-01-31)

### DOM Extraction Reliability
Critical fixes for DOM extraction failures after page navigation:

| File | Fix |
|------|-----|
| `src/pages/Content/getAnnotatedDOM.ts` | Added null guards in `traverseDOM`, `traverseWithShadowDOM`, `stripHeavyElements`; Fixed iframe `documentElement` check; Added try-catch for `getComputedStyle` on detached elements |
| `src/helpers/pageRPC.ts` | Increased tab load wait (500ms → 10s), more ping retries (3 → 5), longer initial wait after injection |

### State Mutation Fixes
Fixed "Cannot assign to read only property" errors when updating Zustand state:

| File | Fix |
|------|-----|
| `src/services/pollingFallbackService.ts` | Changed `.sort()` to `[...array].sort()` to avoid mutating frozen arrays |
| `src/services/messageSyncService.ts` | Same array mutation fix + sync deduplication |
| `src/state/store.ts` | Deep clone sessions array in `merge` function to prevent frozen state from localStorage |

### API Call Deduplication
Fixed excessive API calls causing 429 rate limits:

| File | Fix |
|------|-----|
| `src/services/messageSyncService.ts` | Track current sync session, prevent duplicate `startSync` calls, debounce `handleInteractResponse` |
| `src/services/pusherTransport.ts` | Auth failure cooldown mechanism, graceful fallback to polling |
| `src/services/sessionService.ts` | Cache and request deduplication for `listSessions` |

---

## Quick reference

**Architecture:** Extension = Thin Client (DOM + action execution client-side; LLM server-side). State = Zustand (client) + server task history.  
**Key files:** `src/state/store.ts`, `currentTask.ts`, `src/api/client.ts`, `src/helpers/simplifyDom.ts`, `parseAction.ts`, `domActions.ts`; `TaskUI.tsx`, `Login.tsx`, `KnowledgeOverlay.tsx`, `DebugPanel.tsx`.  
**Hybrid Vision (NEW):** `src/helpers/screenshotCapture.ts`, `skeletonDom.ts`, `hybridCapture.ts` — Captures screenshot + skeleton DOM for ~80% token reduction.  
**Real-time Sync:** `src/services/messageSyncService.ts`, `pusherTransport.ts`, `pollingFallbackService.ts` — WebSocket sync with polling fallback.  
**Development:** Start with [ARCHITECTURE.md](./ARCHITECTURE.md) Part I for client; [ROADMAP.md](./ROADMAP.md) for tasks; [SPECS_AND_CONTRACTS.md](./SPECS_AND_CONTRACTS.md) for verification and session behavior.
