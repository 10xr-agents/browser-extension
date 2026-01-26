import { merge } from 'lodash';
import { create, StateCreator } from 'zustand';
import { immer } from 'zustand/middleware/immer';
import { createJSONStorage, devtools, persist } from 'zustand/middleware';
import { createCurrentTaskSlice, CurrentTaskSlice } from './currentTask';
import { createUiSlice, UiSlice } from './ui';
import { createSettingsSlice, SettingsSlice } from './settings';

export type StoreType = {
  currentTask: CurrentTaskSlice;
  ui: UiSlice;
  settings: SettingsSlice;
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
      }))
    ),
    {
      name: 'app-state',
      storage: createJSONStorage(() => localStorage),
      partialize: (state) => ({
        // Stuff we want to persist
        ui: {
          instructions: state.ui.instructions,
        },
        settings: {
          // Auth state for UI display (tokens stored in chrome.storage.local)
          user: state.settings.user,
          tenantId: state.settings.tenantId,
          tenantName: state.settings.tenantName,
          // Theme preference
          theme: state.settings.theme,
        },
      }),
      merge: (persistedState, currentState) =>
        merge(currentState, persistedState),
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
