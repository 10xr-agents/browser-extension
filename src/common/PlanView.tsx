/**
 * Plan View Component (User-Facing)
 * 
 * Displays action plan progress in a simple, user-friendly format.
 * Shows current step, total steps, and high-level descriptions.
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §6.2 (Task 6: Plan Visualization Component)
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §6.2 (Action Plan Structure)
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Progress,
  Badge,
  useColorModeValue,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';

const PlanView: React.FC = () => {
  const plan = useAppState((state) => state.currentTask.plan);
  const currentStep = useAppState((state) => state.currentTask.currentStep);
  const totalSteps = useAppState((state) => state.currentTask.totalSteps);
  const orchestratorStatus = useAppState((state) => state.currentTask.orchestratorStatus);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const progressColor = useColorModeValue('blue.500', 'blue.400');

  // Don't render if no plan data available
  if (!plan && !currentStep && !totalSteps) {
    return null;
  }

  // Calculate progress percentage
  const progress = currentStep && totalSteps ? (currentStep / totalSteps) * 100 : 0;

  // Get current step description
  const getCurrentStepDescription = (): string => {
    if (plan && plan.steps && plan.currentStepIndex >= 0 && plan.currentStepIndex < plan.steps.length) {
      return plan.steps[plan.currentStepIndex].description;
    }
    if (currentStep && totalSteps) {
      return `Step ${currentStep} of ${totalSteps}`;
    }
    return 'Processing...';
  };

  // Get status badge color
  const getStatusColor = (): string => {
    switch (orchestratorStatus) {
      case 'planning':
        return 'blue';
      case 'executing':
        return 'blue';
      case 'verifying':
        return 'yellow';
      case 'correcting':
        return 'orange';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  // Get status label
  const getStatusLabel = (): string => {
    switch (orchestratorStatus) {
      case 'planning':
        return 'Planning';
      case 'executing':
        return 'Executing';
      case 'verifying':
        return 'Verifying';
      case 'correcting':
        return 'Correcting';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Running';
    }
  };

  return (
    <Box
      p={4}
      borderWidth="1px"
      borderRadius="md"
      bg={bgColor}
      borderColor={borderColor}
    >
      <VStack align="stretch" spacing={3}>
        {/* Header */}
        <HStack justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="semibold" color={headingColor}>
            Task Progress
          </Text>
          {orchestratorStatus && (
            <Badge colorScheme={getStatusColor()} fontSize="xs">
              {getStatusLabel()}
            </Badge>
          )}
        </HStack>

        {/* Progress Bar */}
        {totalSteps && totalSteps > 0 && (
          <Box>
            <HStack mb={1} justify="space-between">
              <Text fontSize="xs" color={textColor}>
                {currentStep ? `Step ${currentStep} of ${totalSteps}` : `0 of ${totalSteps}`}
              </Text>
              <Text fontSize="xs" color={textColor}>
                {progress.toFixed(0)}%
              </Text>
            </HStack>
            <Progress
              value={progress}
              colorScheme="blue"
              size="sm"
              borderRadius="full"
              bg={useColorModeValue('gray.200', 'gray.700')}
            />
          </Box>
        )}

        {/* Current Step Description */}
        <Text fontSize="sm" color={textColor}>
          {getCurrentStepDescription()}
        </Text>
      </VStack>
    </Box>
  );
};

export default PlanView;
