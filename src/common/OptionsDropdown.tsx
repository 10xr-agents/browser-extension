/**
 * Settings Navigation Button
 * 
 * Navigates to settings page when clicked.
 * Replaces dropdown menu with navigation to /settings route.
 * 
 * Reference: EXTENSION_SETTINGS_ROADMAP.md
 */

import { SettingsIcon } from '@chakra-ui/icons';
import { IconButton, useColorModeValue } from '@chakra-ui/react';
import React from 'react';
import { useAppState } from '../state/store';

interface OptionsDropdownProps {
  onNavigate: (route: '/' | '/settings') => void;
}

const OptionsDropdown: React.FC<OptionsDropdownProps> = ({ onNavigate }) => {
  const user = useAppState((state) => state.settings.user);

  // Dark mode colors - defined at component top level
  // NOTE: All hooks MUST be called before any early returns to comply with Rules of Hooks
  const borderColor = useColorModeValue('gray.300', 'gray.600');
  const bgColor = useColorModeValue('white', 'gray.800');
  const hoverBg = useColorModeValue('gray.100', 'gray.700');
  const iconColor = useColorModeValue('gray.700', 'gray.300');
  const hoverBorderColor = useColorModeValue('gray.400', 'gray.500');

  if (!user) return null;

  const handleClick = () => {
    onNavigate('/settings');
  };

  return (
    <IconButton
      aria-label="Settings"
      icon={<SettingsIcon />}
      size="sm"
      variant="outline"
      onClick={handleClick}
      bg={bgColor}
      borderColor={borderColor}
      color={iconColor}
      _hover={{
        bg: hoverBg,
        borderColor: hoverBorderColor,
      }}
      _focusVisible={{
        boxShadow: 'outline',
      }}
    />
  );
};

export default OptionsDropdown;
