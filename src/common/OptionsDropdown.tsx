/**
 * Settings Navigation Button
 * 
 * Navigates to settings page when clicked.
 * Replaces dropdown menu with navigation to /settings route.
 * 
 * Reference: EXTENSION_SETTINGS_ROADMAP.md
 */

import { SettingsIcon } from '@chakra-ui/icons';
import { IconButton } from '@chakra-ui/react';
import React from 'react';
import { useAppState } from '../state/store';

interface OptionsDropdownProps {
  onNavigate: (route: '/' | '/settings') => void;
}

const OptionsDropdown: React.FC<OptionsDropdownProps> = ({ onNavigate }) => {
  const user = useAppState((state) => state.settings.user);

  if (!user) return null;

  const handleClick = () => {
    onNavigate('/settings');
  };

  return (
    <IconButton
      aria-label="Settings"
      icon={<SettingsIcon />}
      variant="outline"
      onClick={handleClick}
    />
  );
};

export default OptionsDropdown;
