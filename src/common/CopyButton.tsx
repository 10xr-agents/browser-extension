import React from 'react';
import { CopyIcon } from '@chakra-ui/icons';
import { useColorModeValue } from '@chakra-ui/react';

export default function CopyButton(props: { text: string }) {
  const iconColor = useColorModeValue('gray.500', 'gray.400');
  const hoverColor = useColorModeValue('gray.700', 'gray.300');

  return (
    <CopyIcon
      cursor="pointer"
      color={iconColor}
      _hover={{ color: hoverColor }}
      onClick={async (event) => {
        try {
          event.preventDefault();
          // Use native clipboard API directly (works in side panel context)
          await navigator.clipboard.writeText(props.text);
        } catch (e) {
          console.error('Failed to copy to clipboard:', e);
        }
      }}
    />
  );
}
