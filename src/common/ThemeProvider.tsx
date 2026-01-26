/**
 * Theme Provider Wrapper
 * 
 * Wraps ChakraProvider and handles theme/color mode synchronization
 * with Zustand store preferences.
 */

import { ChakraProvider, useColorMode } from '@chakra-ui/react';
import React, { useEffect } from 'react';
import { useAppState } from '../state/store';
import theme from '../theme';

interface ThemeProviderProps {
  children: React.ReactNode;
}

const ColorModeSync: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const themePreference = useAppState((state) => state.settings.theme);
  const { setColorMode } = useColorMode();

  // Set color mode immediately on mount and when preference changes
  // Use useLayoutEffect to set color mode synchronously before paint
  React.useLayoutEffect(() => {
    let mediaQuery: MediaQueryList | null = null;
    let handleChange: ((e: MediaQueryListEvent) => void) | null = null;

    if (themePreference === 'system') {
      // Detect system preference
      mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const getSystemMode = () => mediaQuery!.matches ? 'dark' : 'light';
      const systemMode = getSystemMode();
      
      // Apply system mode immediately
      setColorMode(systemMode);

      // Listen for system preference changes
      handleChange = (e: MediaQueryListEvent) => {
        setColorMode(e.matches ? 'dark' : 'light');
      };

      mediaQuery.addEventListener('change', handleChange);
    } else {
      // Apply explicit theme preference (light or dark) immediately
      setColorMode(themePreference);
    }

    return () => {
      if (mediaQuery && handleChange) {
        mediaQuery.removeEventListener('change', handleChange);
      }
    };
  }, [themePreference, setColorMode]);

  return <>{children}</>;
};

export const ThemeProvider: React.FC<ThemeProviderProps> = ({ children }) => {
  return (
    <ChakraProvider theme={theme}>
      <ColorModeSync>{children}</ColorModeSync>
    </ChakraProvider>
  );
};
