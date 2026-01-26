/**
 * Chakra UI Theme Configuration
 * 
 * Custom theme for Spadeworks Copilot AI extension.
 * Provides modern SaaS aesthetic with proper color mode support.
 * 
 * Reference: https://v2.chakra-ui.com/docs/styled-system/customize-theme
 */

import { extendTheme, type ThemeConfig } from '@chakra-ui/react';
import type { StyleFunctionProps } from '@chakra-ui/styled-system';

const config: ThemeConfig = {
  initialColorMode: 'light', // Default, will be overridden by ThemeProvider
  useSystemColorMode: false, // We handle system mode manually in ThemeProvider
};

const theme = extendTheme({
  config,
  fonts: {
    heading: 'system-ui, -apple-system, "Inter", sans-serif',
    body: 'system-ui, -apple-system, "Inter", sans-serif',
  },
  styles: {
    global: (props: StyleFunctionProps) => ({
      body: {
        bg: props.colorMode === 'dark' ? 'gray.900' : 'white',
        color: props.colorMode === 'dark' ? 'gray.100' : 'gray.900',
      },
    }),
  },
  components: {
    Button: {
      defaultProps: {
        colorScheme: 'blue',
      },
    },
  },
});

export default theme;
