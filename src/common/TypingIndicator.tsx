/**
 * Typing Indicator
 *
 * Shows when server is processing (thinking, executing, etc.)
 *
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §9 (Task 6)
 */

import React from 'react';
import { HStack, Text, useColorModeValue } from '@chakra-ui/react';
import { keyframes } from '@emotion/react';
import { useAppState } from '../state/store';

const bounce = keyframes`
  0%, 60%, 100% { transform: translateY(0); }
  30% { transform: translateY(-4px); }
`;

export const TypingIndicator: React.FC = () => {
  const isServerTyping = useAppState((state) => state.currentTask.isServerTyping);
  const serverTypingContext = useAppState((state) => state.currentTask.serverTypingContext);

  const textColor = useColorModeValue('gray.500', 'gray.400');
  const dotColor = useColorModeValue('blue.500', 'blue.300');

  if (!isServerTyping) return null;

  const contextLabel =
    serverTypingContext === 'thinking'
      ? 'Thinking'
      : serverTypingContext === 'executing'
        ? 'Executing'
        : serverTypingContext === 'verifying'
          ? 'Verifying'
          : 'Processing';

  return (
    <HStack spacing={2} py={2} px={4}>
      <HStack spacing={1}>
        {[0, 1, 2].map((i) => (
          <Text
            key={i}
            as="span"
            color={dotColor}
            fontSize="lg"
            sx={{
              animation: `${bounce} 1.4s ease-in-out ${i * 0.2}s infinite`,
            }}
          >
            •
          </Text>
        ))}
      </HStack>
      <Text fontSize="sm" color={textColor}>
        {contextLabel}...
      </Text>
    </HStack>
  );
};
