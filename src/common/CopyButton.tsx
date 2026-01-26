import React from 'react';
import { CopyIcon } from '@chakra-ui/icons';
import { useToast, useColorModeValue } from '@chakra-ui/react';
import { callRPC } from '../helpers/pageRPC';

export default function CopyButton(props: { text: string }) {
  const toast = useToast();
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
          toast({
            title: 'Copied to clipboard',
            status: 'success',
            duration: 3000,
            isClosable: true,
          });
        } catch (e) {
          console.error(e);
          toast({
            title: 'Error',
            description: 'Could not copy to clipboard',
            status: 'error',
            duration: 5000,
            isClosable: true,
          });
        }
      }}
    />
  );
}
