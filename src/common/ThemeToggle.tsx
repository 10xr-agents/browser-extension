/**
 * Theme Toggle Component
 * 
 * Segmented control for theme selection (Light, Dark, System).
 */

import { Button, ButtonGroup, useColorModeValue } from '@chakra-ui/react';
import React from 'react';
import type { ThemeToggleProps } from '../types/ui';

export const ThemeToggle: React.FC<ThemeToggleProps> = ({
  value,
  onChange,
  isDisabled = false,
}) => {
  const activeBg = useColorModeValue('blue.50', 'blue.900/30');
  const activeColor = useColorModeValue('blue.700', 'blue.300');
  const hoverBg = useColorModeValue('gray.100', 'gray.700');

  return (
    <ButtonGroup isAttached variant="outline" size="md" w="full">
      {(['light', 'dark', 'system'] as const).map((option) => {
        const isSelected = value === option;
        return (
          <Button
            key={option}
            flex={1}
            variant={isSelected ? 'solid' : 'outline'}
            colorScheme={isSelected ? 'blue' : 'gray'}
            onClick={() => !isDisabled && onChange(option)}
            isDisabled={isDisabled}
            fontWeight={isSelected ? 'semibold' : 'normal'}
            bg={isSelected ? activeBg : undefined}
            color={isSelected ? activeColor : undefined}
            _hover={{
              bg: isSelected ? activeBg : hoverBg,
            }}
            _focusVisible={{
              boxShadow: 'outline',
            }}
            textTransform="capitalize"
            minW="0"
          >
            {option}
          </Button>
        );
      })}
    </ButtonGroup>
  );
};
