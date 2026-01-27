/**
 * Correction View Component (User-Facing)
 * 
 * Displays self-correction information in a simple, user-friendly format.
 * Shows when corrections occur and what strategies were used.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md Part 2 §8.2 (Task 8: Correction Display Component)
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §9 (Self-Correction Architecture)
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
import { RepeatIcon } from '@chakra-ui/icons';
import { useAppState } from '../state/store';

const CorrectionView: React.FC = () => {
  const correctionHistory = useAppState((state) => state.currentTask.correctionHistory);

  // Dark mode colors - ALL defined at component top level (before any conditional returns)
  const warningColor = useColorModeValue('orange.600', 'orange.400');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const descColor = useColorModeValue('gray.600', 'gray.400');

  // Get the most recent correction result
  const latestCorrection = correctionHistory.length > 0
    ? correctionHistory[correctionHistory.length - 1]
    : null;

  // Don't render if no correction data
  if (!latestCorrection) {
    return null;
  }

  // Get current step from state as fallback if stepIndex is invalid
  const currentStep = useAppState((state) => state.currentTask.currentStep);
  
  // Use stepIndex if valid, otherwise fall back to currentStep, otherwise show "current"
  const stepIndex = typeof latestCorrection.stepIndex === 'number' && !isNaN(latestCorrection.stepIndex)
    ? latestCorrection.stepIndex
    : (typeof currentStep === 'number' ? currentStep : null);
  
  const stepNumber = stepIndex !== null ? stepIndex + 1 : 'current'; // Convert 0-indexed to 1-indexed for display

  // Format strategy name for display
  const formatStrategy = (strategy: string): string => {
    return strategy
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

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
        <Icon as={RepeatIcon} color={warningColor} boxSize={4} />
        <Text fontSize="sm" color={textColor} flex="1">
          Retrying step {stepNumber} with {formatStrategy(latestCorrection.strategy).toLowerCase()}
        </Text>
        <Badge colorScheme="orange" fontSize="xs">
          Attempt {latestCorrection.attemptNumber}
        </Badge>
      </HStack>
      {latestCorrection.reason && (
        <Text fontSize="xs" color={descColor} mt={1} pl={6}>
          {latestCorrection.reason}
        </Text>
      )}
    </Box>
  );
};

export default CorrectionView;
