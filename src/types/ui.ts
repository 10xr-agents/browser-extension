/**
 * UI Component Types
 * 
 * TypeScript interfaces for UI components and user preferences.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export interface UserPreferences {
  theme: ThemePreference;
}

export interface SettingsSectionProps {
  title: string;
  children: React.ReactNode;
}

export interface ThemeToggleProps {
  value: ThemePreference;
  onChange: (theme: ThemePreference) => void;
  isDisabled?: boolean;
}
