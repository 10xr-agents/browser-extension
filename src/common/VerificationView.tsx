/**
 * Verification View Component (User-Facing)
 * 
 * Displays verification results in a simple, user-friendly format.
 * Shows verification status inline with action history.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md Part 2 §7.2 (Task 7: Verification Display Component)
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §6.4 (Verification Result Model)
 */

import React from 'react';
import {
  Box,
  HStack,
  Text,
  Badge,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { CheckCircleIcon, CloseIcon } from '@chakra-ui/icons';
import { useAppState } from '../state/store';

const VerificationView: React.FC = () => {
  const verificationHistory = useAppState((state) => state.currentTask.verificationHistory);
  const currentStep = useAppState((state) => state.currentTask.currentStep);

  const successColor = useColorModeValue('green.600', 'green.400');
  const failureColor = useColorModeValue('red.600', 'red.400');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  // Get the most recent verification result
  const latestVerification = verificationHistory.length > 0
    ? verificationHistory[verificationHistory.length - 1]
    : null;

  // Don't render if no verification data
  if (!latestVerification) {
    return null;
  }

  const stepNumber = latestVerification.stepIndex + 1; // Convert 0-indexed to 1-indexed for display

  return (
    <Box
      p={3}
      borderWidth="1px"
      borderRadius="md"
      bg={bgColor}
      borderColor={borderColor}
      mb={2}
    >
      <HStack spacing={2} align="center">
        {latestVerification.success ? (
          <>
            <Icon as={CheckCircleIcon} color={successColor} boxSize={4} />
            <Text fontSize="sm" color={textColor} flex="1">
              Step {stepNumber} verified successfully
            </Text>
            <Badge colorScheme="green" fontSize="xs">
              {(latestVerification.confidence * 100).toFixed(0)}% confidence
            </Badge>
          </>
        ) : (
          <>
            <Icon as={CloseIcon} color={failureColor} boxSize={4} />
            <Text fontSize="sm" color={textColor} flex="1">
              Step {stepNumber} verification failed
            </Text>
            <Badge colorScheme="red" fontSize="xs">
              {(latestVerification.confidence * 100).toFixed(0)}% confidence
            </Badge>
          </>
        )}
      </HStack>
      {latestVerification.reason && (
        <Text fontSize="xs" color={useColorModeValue('gray.600', 'gray.400')} mt={1} pl={6}>
          {latestVerification.reason}
        </Text>
      )}
    </Box>
  );
};

export default VerificationView;
