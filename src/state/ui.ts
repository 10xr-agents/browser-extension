import { MyStateCreator } from './store';

export type UiSlice = {
  instructions: string | null;
  debugPanelExpanded: boolean;
  actions: {
    setInstructions: (instructions: string) => void;
    setDebugPanelExpanded: (expanded: boolean) => void;
  };
};
export const createUiSlice: MyStateCreator<UiSlice> = (set) => ({
  instructions: null,
  debugPanelExpanded: false,
  actions: {
    setInstructions: (instructions) => {
      set((state) => {
        state.ui.instructions = instructions;
      });
    },
    setDebugPanelExpanded: (expanded) => {
      set((state) => {
        state.ui.debugPanelExpanded = expanded;
      });
    },
  },
});
