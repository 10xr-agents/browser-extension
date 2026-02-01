import { merge } from 'lodash';
import { create, StateCreator } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { createCurrentTaskSlice, CurrentTaskSlice, initializeNewTabListeners } from './currentTask';
import { createUiSlice, UiSlice } from './ui';
import { createSettingsSlice, SettingsSlice } from './settings';
import { createDebugSlice, DebugSlice } from './debug';
import { createConversationHistorySlice, ConversationHistorySlice } from './conversationHistory';
import { createSessionsSlice, SessionsSlice } from './sessions';
// FIX: Static import to prevent ChunkLoadError in Chrome extension popup/panel
// Dynamic imports create separate webpack chunks that fail to load in extension context
import { messageSyncManager } from '../services/messageSyncService';

export type StoreType = {
  currentTask: CurrentTaskSlice;
  ui: UiSlice;
  settings: SettingsSlice;
  debug: DebugSlice;
  conversationHistory: ConversationHistorySlice;
  sessions: SessionsSlice;
};

export type MyStateCreator<T> = StateCreator<
  StoreType,
  [['zustand/immer', never]],
  [],
  T
>;

export const useAppState = create<StoreType>()(
  persist(
    immer(
      devtools((...a) => ({
        currentTask: createCurrentTaskSlice(...a),
        ui: createUiSlice(...a),
        settings: createSettingsSlice(...a),
        debug: createDebugSlice(...a),
        conversationHistory: createConversationHistorySlice(...a),
        sessions: createSessionsSlice(...a),
      }))
    ),
    {
      name: 'app-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Stuff we want to persist
        ui: {
          instructions: state.ui.instructions,
          debugPanelExpanded: state.ui.debugPanelExpanded,
        },
        settings: {
          // Auth state for UI display (tokens stored in chrome.storage.local)
          user: state.settings.user,
          tenantId: state.settings.tenantId,
          tenantName: state.settings.tenantName,
          // Theme preference
          theme: state.settings.theme,
          // Developer mode (runtime control)
          developerMode: state.settings.developerMode,
        },
        conversationHistory: {
          conversations: state.conversationHistory.conversations.map((conv) => ({
            ...conv,
            createdAt: conv.createdAt.toISOString(),
            completedAt: conv.completedAt.toISOString(),
          })),
        },
        sessions: {
          sessions: state.sessions.sessions, // Sessions use timestamps (numbers), no conversion needed
          currentSessionId: state.sessions.currentSessionId,
          currentDomain: state.sessions.currentDomain, // Domain metadata (awareness)
          tabSessionMap: state.sessions.tabSessionMap, // Tab-scoped session tracking
          isHistoryOpen: state.sessions.isHistoryOpen,
        },
      }),
      merge: (persistedState, currentState) => {
        const merged = merge(currentState, persistedState);
        // Convert ISO strings back to Date objects for conversation history
        if (merged.conversationHistory?.conversations) {
          merged.conversationHistory.conversations = merged.conversationHistory.conversations.map((conv: any) => {
            const createdAt = conv.createdAt instanceof Date 
              ? conv.createdAt 
              : typeof conv.createdAt === 'string' 
              ? new Date(conv.createdAt) 
              : new Date();
            const completedAt = conv.completedAt instanceof Date 
              ? conv.completedAt 
              : typeof conv.completedAt === 'string' 
              ? new Date(conv.completedAt) 
              : new Date();
            return {
              ...conv,
              createdAt,
              completedAt,
            };
          });
        }
        // CRITICAL FIX: Ensure sessions.sessions is a fresh array, not a frozen reference
        // lodash merge can preserve the original array reference from persistedState,
        // which may be frozen. Create a new array so Immer can create drafts properly.
        if (merged.sessions) {
          merged.sessions.isHistoryOpen = Boolean(merged.sessions.isHistoryOpen);
          // Deep clone sessions array to prevent "Cannot assign to read only property" errors
          if (Array.isArray(merged.sessions.sessions)) {
            merged.sessions.sessions = merged.sessions.sessions.map((session: any) => ({ ...session }));
          }
          // Deep clone tabSessionMap to avoid frozen references from persisted state
          if (merged.sessions.tabSessionMap && typeof merged.sessions.tabSessionMap === 'object') {
            merged.sessions.tabSessionMap = { ...(merged.sessions.tabSessionMap as Record<string, string>) };
          }
        }
        // CRITICAL FIX: Also deep clone conversationHistory.conversations
        // Same issue as sessions - persisted array may be frozen
        if (merged.conversationHistory?.conversations && Array.isArray(merged.conversationHistory.conversations)) {
          merged.conversationHistory.conversations = merged.conversationHistory.conversations.map((conv: any) => ({
            ...conv,
            // Ensure displayHistory array is also cloned (it's nested)
            displayHistory: Array.isArray(conv.displayHistory) 
              ? conv.displayHistory.map((entry: any) => ({ ...entry }))
              : [],
          }));
        }
        return merged;
      },
    }
  )
);

/**
 * ⚠️ CRITICAL: Zustand Selector Pattern
 * 
 * NEVER return objects/arrays from useAppState selectors - this causes infinite re-render loops!
 * 
 * ❌ WRONG (causes infinite loops):
 *   const state = useAppState((state) => ({ value: state.settings.value }));
 * 
 * ✅ CORRECT (split selectors):
 *   const value = useAppState((state) => state.settings.value);
 * 
 * ✅ CORRECT (combine with useMemo if needed):
 *   const value = useAppState((state) => state.settings.value);
 *   const other = useAppState((state) => state.ui.other);
 *   const combined = useMemo(() => ({ value, other }), [value, other]);
 * 
 * Why? Returning new objects/arrays creates new references on every render,
 * causing Zustand to think state changed, triggering infinite re-renders.
 * 
 * See .cursorrules §4 (Zustand Store Pattern) for more details.
 */

// @ts-expect-error used for debugging
window.getState = useAppState.getState;

// Initialize services after store is created
// The setTimeout(0) ensures the store is fully initialized before initialization runs
// This breaks any potential circular dependency issues at runtime

// Initialize message sync manager for real-time message sync (WebSocket + polling fallback)
// FIX: Uses static import to prevent ChunkLoadError in Chrome extension
// Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §7 (Task 4)
setTimeout(() => {
  try {
    messageSyncManager.initialize(
      useAppState.getState,
      useAppState.setState as (fn: (state: unknown) => void) => void
    );
  } catch (err) {
    console.error('[Store] Failed to initialize message sync manager:', err);
  }
}, 0);

// Initialize new tab listeners
// FIX: Uses static import to prevent ChunkLoadError
setTimeout(() => {
  try {
    initializeNewTabListeners();
  } catch (err) {
    console.error('[Store] Failed to initialize new tab listeners:', err);
  }
}, 0);
