/**
 * Plan View Debug Component
 * 
 * Displays full action plan structure in debug panel.
 * Shows all steps with status, reasoning, tool types, and expected outcomes.
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
  Badge,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  useColorModeValue,
  Code,
  Divider,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import type { PlanStep } from '../state/currentTask';

const PlanViewDebug: React.FC = () => {
  const plan = useAppState((state) => state.currentTask.plan);
  const currentStep = useAppState((state) => state.currentTask.currentStep);
  const totalSteps = useAppState((state) => state.currentTask.totalSteps);
  const orchestratorStatus = useAppState((state) => state.currentTask.orchestratorStatus);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const codeBg = useColorModeValue('gray.100', 'gray.700');

  // Don't render if no plan data
  if (!plan && !currentStep && !totalSteps && !orchestratorStatus) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
        <Text fontSize="sm" color={textColor}>
          No plan data available. Task may be using legacy mode (linear actions).
        </Text>
      </Box>
    );
  }

  // Get status badge color for step
  const getStepStatusColor = (status: PlanStep['status']): string => {
    switch (status) {
      case 'pending':
        return 'gray';
      case 'active':
        return 'blue';
      case 'completed':
        return 'green';
      case 'failed':
        return 'red';
      default:
        return 'gray';
    }
  };

  // Get orchestrator status color
  const getOrchestratorStatusColor = (): string => {
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

  // Get orchestrator status label
  const getOrchestratorStatusLabel = (): string => {
    switch (orchestratorStatus) {
      case 'planning':
        return 'Planning';
      case 'executing':
        return 'Executing';
      case 'verifying':
        return 'Verifying';
      case 'correcting':
        return 'Self-Correcting';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return 'Unknown';
    }
  };

  return (
    <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor} maxH="600px" overflowY="auto">
      <VStack align="stretch" spacing={4}>
        {/* Header */}
        <HStack justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="semibold" color={headingColor}>
            Action Plan
          </Text>
          {orchestratorStatus && (
            <Badge colorScheme={getOrchestratorStatusColor()} fontSize="xs">
              {getOrchestratorStatusLabel()}
            </Badge>
          )}
        </HStack>

        {/* Summary */}
        <HStack spacing={4} fontSize="xs" color={textColor}>
          {currentStep && totalSteps && (
            <Text>
              Step: <strong>{currentStep}</strong> / <strong>{totalSteps}</strong>
            </Text>
          )}
          {plan && plan.steps && (
            <Text>
              Total Steps: <strong>{plan.steps.length}</strong>
            </Text>
          )}
          {plan && (
            <Text>
              Current Index: <strong>{plan.currentStepIndex}</strong>
            </Text>
          )}
        </HStack>

        <Divider />

        {/* Plan Steps */}
        {plan && plan.steps && plan.steps.length > 0 ? (
          <Accordion allowMultiple allowToggle defaultIndex={[]}>
            {plan.steps.map((step, index) => (
              <AccordionItem key={step.id}>
                <AccordionButton>
                  <HStack flex="1" textAlign="left" spacing={3}>
                    <Badge
                      colorScheme={getStepStatusColor(step.status)}
                      fontSize="xs"
                      minW="60px"
                      textAlign="center"
                    >
                      {step.status}
                    </Badge>
                    <Text fontSize="xs" fontWeight="medium" color={headingColor} flex="1">
                      Step {index + 1}: {step.description}
                    </Text>
                    {step.toolType && (
                      <Badge colorScheme="purple" fontSize="xs">
                        {step.toolType}
                      </Badge>
                    )}
                    {index === plan.currentStepIndex && (
                      <Badge colorScheme="blue" fontSize="xs">
                        Current
                      </Badge>
                    )}
                  </HStack>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <VStack align="stretch" spacing={2} fontSize="xs">
                    {step.reasoning && (
                      <Box>
                        <Text fontWeight="semibold" color={headingColor} mb={1}>
                          Reasoning:
                        </Text>
                        <Text color={textColor} whiteSpace="pre-wrap">
                          {step.reasoning}
                        </Text>
                      </Box>
                    )}
                    {step.expectedOutcome && (
                      <Box>
                        <Text fontWeight="semibold" color={headingColor} mb={1}>
                          Expected Outcome:
                        </Text>
                        <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={codeBg} fontFamily="mono">
                          {step.expectedOutcome}
                        </Code>
                      </Box>
                    )}
                    {step.toolType && (
                      <Box>
                        <Text fontWeight="semibold" color={headingColor} mb={1}>
                          Tool Type:
                        </Text>
                        <Badge colorScheme="purple" fontSize="xs">
                          {step.toolType}
                        </Badge>
                      </Box>
                    )}
                  </VStack>
                </AccordionPanel>
              </AccordionItem>
            ))}
          </Accordion>
        ) : (
          <Box>
            <Text fontSize="xs" color={descColor}>
              No plan steps available. Plan may still be being generated.
            </Text>
          </Box>
        )}

        {/* Fallback: Show current step info if plan structure not available */}
        {(!plan || !plan.steps || plan.steps.length === 0) && currentStep && totalSteps && (
          <Box p={3} bg={useColorModeValue('gray.50', 'gray.700')} borderRadius="md">
            <Text fontSize="xs" color={textColor}>
              <strong>Current Step:</strong> {currentStep} of {totalSteps}
            </Text>
            <Text fontSize="xs" color={descColor} mt={1}>
              Full plan structure not yet available from server.
            </Text>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

export default PlanViewDebug;
