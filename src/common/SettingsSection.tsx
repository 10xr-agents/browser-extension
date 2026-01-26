/**
 * Settings Section Component
 * 
 * Reusable wrapper for settings sections with consistent styling.
 */

import { Box, Text, useColorModeValue } from '@chakra-ui/react';
import React from 'react';
import type { SettingsSectionProps } from '../types/ui';

export const SettingsSection: React.FC<SettingsSectionProps> = ({ title, children }) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');

  return (
    <Box
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="xl"
      p={4}
      shadow="sm"
    >
      <Text
        fontSize="sm"
        fontWeight="semibold"
        mb={3}
        color={textColor}
      >
        {title}
      </Text>
      {children}
    </Box>
  );
};
