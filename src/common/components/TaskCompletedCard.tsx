/**
 * TaskCompletedCard - Summary card at bottom of chat when task finishes successfully
 *
 * Shown when backend sends finish() / status is success.
 */

import React from 'react';
import { Box, VStack, Text, Icon, useColorModeValue } from '@chakra-ui/react';
import { FiCheckCircle } from 'react-icons/fi';
import { useAppState } from '../../state/store';

export default function TaskCompletedCard() {
  const taskStatus = useAppState((state) => state.currentTask.status);

  const bgColor = useColorModeValue('green.50', 'green.900/20');
  const borderColor = useColorModeValue('green.200', 'green.700');
  const textColor = useColorModeValue('green.800', 'green.200');
  const iconColor = useColorModeValue('green.500', 'green.400');

  if (taskStatus !== 'success') return null;

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label="Task completed successfully"
      mt={4}
      p={4}
      borderRadius="lg"
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
    >
      <VStack spacing={2} align="center">
        <Icon as={FiCheckCircle} boxSize={6} color={iconColor} aria-hidden />
        <Text fontSize="sm" fontWeight="semibold" color={textColor}>
          Task completed
        </Text>
        <Text fontSize="xs" color={textColor} opacity={0.9}>
          The task finished successfully.
        </Text>
      </VStack>
    </Box>
  );
}
