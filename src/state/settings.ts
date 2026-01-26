import { MyStateCreator } from './store';

/**
 * Settings Slice for Thin Client Architecture
 * 
 * Removed: openAIKey, openPipeKey, selectedModel (no longer needed)
 * Added: Auth-related UI state (user, tenantId, tenantName) for display purposes.
 * Note: Access tokens are stored in chrome.storage.local, not in Zustand state.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §2.1 (Task 1: Authentication & API Client)
 */

export type SettingsSlice = {
  // Auth-related UI state (for display only; tokens stored in chrome.storage.local)
  user: { id: string; email: string; name: string | null } | null;
  tenantId: string | null;
  tenantName: string | null;
  
  // Theme preference
  theme: 'light' | 'dark' | 'system';
  
  // Debug mode (runtime control, not build-time)
  developerMode: boolean;
  
  actions: {
    update: (values: Partial<SettingsSlice>) => void;
    setUser: (user: SettingsSlice['user']) => void;
    setTenant: (tenantId: string, tenantName: string) => void;
    clearAuth: () => void;
    setTheme: (theme: 'light' | 'dark' | 'system') => void;
    setDeveloperMode: (enabled: boolean) => void;
  };
};

export const createSettingsSlice: MyStateCreator<SettingsSlice> = (set) => ({
  user: null,
  tenantId: null,
  tenantName: null,
  theme: 'system',
  developerMode: false,
  
  actions: {
    update: (values) => {
      set((state) => {
        state.settings = { ...state.settings, ...values };
      });
    },
    setUser: (user) => {
      set((state) => {
        state.settings.user = user;
      });
    },
    setTenant: (tenantId, tenantName) => {
      set((state) => {
        state.settings.tenantId = tenantId;
        state.settings.tenantName = tenantName;
      });
    },
    clearAuth: () => {
      set((state) => {
        state.settings.user = null;
        state.settings.tenantId = null;
        state.settings.tenantName = null;
      });
    },
    setTheme: (theme) => {
      set((state) => {
        state.settings.theme = theme;
      });
    },
    setDeveloperMode: (enabled) => {
      set((state) => {
        state.settings.developerMode = enabled;
      });
    },
  },
});
