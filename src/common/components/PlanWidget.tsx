/**
 * PlanWidget - Compact live plan stepper for the chat view
 *
 * Shows past steps (dimmed/strikethrough), current step (highlighted/pulsing),
 * future steps (grayed). Renders "Planning..." skeleton when plan data is missing.
 */

import React from 'react';
import {
  Box,
  VStack,
  Text,
  HStack,
  Icon,
  useColorModeValue,
  Skeleton,
} from '@chakra-ui/react';
import { FiCheck } from 'react-icons/fi';
import { useAppState } from '../../state/store';
import type { PlanStep as PlanStepType } from '../../state/currentTask';

const STEP_MAX_VISIBLE = 6;

export default function PlanWidget() {
  const plan = useAppState((state) => state.currentTask.plan);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const orchestratorStatus = useAppState((state) => state.currentTask.orchestratorStatus);

  const bgColor = useColorModeValue('gray.50', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const pastColor = useColorModeValue('gray.500', 'gray.500');
  const currentBg = useColorModeValue('blue.50', 'blue.900/30');
  const currentBorder = useColorModeValue('blue.300', 'blue.600');
  const currentText = useColorModeValue('gray.900', 'gray.100');
  const futureColor = useColorModeValue('gray.400', 'gray.500');
  const headingColor = useColorModeValue('gray.700', 'gray.300');
  const completedCheckColor = useColorModeValue('green.500', 'green.400');

  const isRunning = taskStatus === 'running';
  const isPlanning = orchestratorStatus === 'planning' || (isRunning && !plan?.steps?.length);

  if (!isRunning && taskStatus === 'idle') return null;

  if (isPlanning || !plan?.steps?.length) {
    return (
      <Box
        role="region"
        aria-label="Live plan"
        aria-busy="true"
        px={3}
        py={2}
        borderRadius="md"
        bg={bgColor}
        borderWidth="1px"
        borderColor={borderColor}
        mb={3}
      >
        <Text fontSize="xs" fontWeight="semibold" color={headingColor} mb={2}>
          Plan
        </Text>
        <VStack align="stretch" spacing={2}>
          <Skeleton height="3" borderRadius="sm" />
          <Skeleton height="3" borderRadius="sm" width="85%" />
          <Skeleton height="3" borderRadius="sm" width="70%" />
        </VStack>
        <Text fontSize="xs" color={pastColor} mt={2}>
          Planning…
        </Text>
      </Box>
    );
  }

  const steps = plan.steps;
  const currentIndex = Math.min(Math.max(0, plan.currentStepIndex), steps.length - 1);
  const visibleStart = Math.max(0, Math.min(currentIndex - 1, steps.length - STEP_MAX_VISIBLE));
  const visibleSteps = steps.slice(visibleStart, visibleStart + STEP_MAX_VISIBLE);

  return (
    <Box
      role="region"
      aria-label="Live plan"
      px={3}
      py={2}
      borderRadius="md"
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
      mb={3}
    >
      <Text fontSize="xs" fontWeight="semibold" color={headingColor} mb={2}>
        Plan
      </Text>
      <VStack align="stretch" spacing={1}>
        {visibleSteps.map((step: PlanStepType, i: number) => {
          const globalIndex = visibleStart + i;
          const isPast = step.status === 'completed' || globalIndex < currentIndex;
          const isCurrent = globalIndex === currentIndex;
          const isFuture = globalIndex > currentIndex;

          const desc =
            typeof step.description === 'string'
              ? step.description
              : String(step.description ?? '');

          return (
            <HStack
              key={step.id || `step-${globalIndex}`}
              fontSize="xs"
              py={1}
              px={2}
              borderRadius="sm"
              bg={isCurrent ? currentBg : 'transparent'}
              borderLeftWidth={isCurrent ? '3px' : 0}
              borderLeftColor={currentBorder}
              spacing={2}
              align="flex-start"
              sx={
                isCurrent
                  ? {
                      animation: 'pulse 1.5s ease-in-out infinite',
                      '@keyframes pulse': {
                        '0%, 100%': { opacity: 1 },
                        '50%': { opacity: 0.85 },
                      },
                    }
                  : undefined
              }
              color={isPast ? pastColor : isCurrent ? currentText : futureColor}
              textDecoration={isPast ? 'line-through' : undefined}
            >
              {isPast ? (
                <Icon as={FiCheck} boxSize={3.5} color={completedCheckColor} mt={0.5} flexShrink={0} aria-hidden />
              ) : (
                <Box w="14px" flexShrink={0} as="span" aria-hidden>
                  {globalIndex + 1}.
                </Box>
              )}
              <Text as="span" whiteSpace="normal">
                {desc || '—'}
              </Text>
            </HStack>
          );
        })}
      </VStack>
    </Box>
  );
}
