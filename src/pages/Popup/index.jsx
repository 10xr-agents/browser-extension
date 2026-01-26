import React from 'react';
import { createRoot } from 'react-dom/client';
import { ColorModeScript } from '@chakra-ui/react';

import Popup from './Popup';
import theme from '../../theme';
import './index.css';

// Get initial color mode from localStorage (where Zustand stores theme preference)
// Zustand persist stores data under the storage key with the state nested
const getInitialColorMode = () => {
  try {
    const stored = localStorage.getItem('app-state');
    if (stored) {
      const parsed = JSON.parse(stored);
      // Zustand persist structure: partialized state is stored directly
      // { settings: { theme: ... } } (not nested under 'state')
      const themePreference = parsed?.settings?.theme;
      if (themePreference === 'dark') {
        return 'dark';
      } else if (themePreference === 'system') {
        // Check system preference
        const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
        return mediaQuery.matches ? 'dark' : 'light';
      } else if (themePreference === 'light') {
        return 'light';
      }
    }
  } catch (e) {
    // Fallback to theme default
    console.debug('Could not read theme from localStorage:', e);
  }
  return theme.config.initialColorMode;
};

// Store root reference on window to persist across HMR reloads
// This prevents "createRoot() on container that already has a root" warning
const ROOT_KEY = '__spadeworks_react_root__';

const container = window.document.querySelector('#app-container');

// Get existing root or create new one
let root;
if (window[ROOT_KEY]) {
  // Root already exists (HMR reload) - reuse it
  root = window[ROOT_KEY];
} else {
  // First load - create new root
  root = createRoot(container);
  window[ROOT_KEY] = root;
}

// Always use render() to update (works for both initial load and HMR)
root.render(
  <>
    <ColorModeScript initialColorMode={getInitialColorMode()} />
    <Popup />
  </>
);

if (module.hot) {
  module.hot.accept();
  // On HMR, the module reloads but root persists on window object
  // So we reuse the existing root instead of creating a new one
}
