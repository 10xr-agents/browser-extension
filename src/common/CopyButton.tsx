import React from 'react';
import { CopyIcon } from '@chakra-ui/icons';
import { useColorModeValue } from '@chakra-ui/react';
import { callRPC } from '../helpers/pageRPC';

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
          await callRPC('copyToClipboard', [props.text]);
        } catch (e) {
          console.error('Failed to copy to clipboard:', e);
        }
      }}
    />
  );
}
