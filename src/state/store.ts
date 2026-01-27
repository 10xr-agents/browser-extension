import { merge } from 'lodash';
import { create, StateCreator } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { createCurrentTaskSlice, CurrentTaskSlice } from './currentTask';
import { createUiSlice, UiSlice } from './ui';
import { createSettingsSlice, SettingsSlice } from './settings';
import { createDebugSlice, DebugSlice } from './debug';
import { createConversationHistorySlice, ConversationHistorySlice } from './conversationHistory';

export type StoreType = {
  currentTask: CurrentTaskSlice;
  ui: UiSlice;
  settings: SettingsSlice;
  debug: DebugSlice;
  conversationHistory: ConversationHistorySlice;
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
