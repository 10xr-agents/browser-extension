/**
 * Options Dropdown for Thin Client Architecture
 * 
 * Shows logout option when authenticated.
 * Replaces "Reset API Key" with "Logout" functionality.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §2.1 (Task 1: Authentication & API Client)
 */

import { SettingsIcon } from '@chakra-ui/icons';
import {
  IconButton,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  useToast,
} from '@chakra-ui/react';
import React from 'react';
import { apiClient } from '../api/client';
import { useAppState } from '../state/store';

const OptionsDropdown = () => {
  const user = useAppState((state) => state.settings.user);
  const clearAuth = useAppState((state) => state.settings.actions.clearAuth);
  const toast = useToast();

  if (!user) return null;

  const handleLogout = async () => {
    try {
      await apiClient.logout();
      clearAuth();
      
      toast({
        title: 'Logged out',
        description: 'You have been successfully logged out.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      
      // Reload the page to show login UI
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout failed';
      toast({
        title: 'Logout error',
        description: message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  return (
    <Menu>
      <MenuButton
        as={IconButton}
        aria-label="Options"
        icon={<SettingsIcon />}
        variant="outline"
      />
      <MenuList>
        <MenuItem onClick={handleLogout}>
          Logout
        </MenuItem>
      </MenuList>
    </Menu>
  );
};

export default OptionsDropdown;
