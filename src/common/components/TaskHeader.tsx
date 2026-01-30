/**
 * TaskHeader - Sticky header at top of chat: status badge, plan summary, STOP button
 *
 * Left: RUNNING (pulse), COMPLETED (green), FAILED (red), STOPPED (orange).
 * Center: Plan summary "Step X of Y" (when plan available).
 * Right: STOP / ABORT button (red outline) when task is running.
 */

import React from 'react';
import {
  Box,
  HStack,
  Text,
  Badge,
  Button,
  useColorModeValue,
} from '@chakra-ui/react';
import { BsStopFill } from 'react-icons/bs';
import { Icon } from '@chakra-ui/react';
import { useAppState } from '../../state/store';

export default function TaskHeader() {
  const taskStatus = useAppState((state) => state.currentTask.status);
  const plan = useAppState((state) => state.currentTask.plan);
  const currentStep = useAppState((state) => state.currentTask.currentStep);
  const totalSteps = useAppState((state) => state.currentTask.totalSteps);
  const interruptTask = useAppState((state) => state.currentTask.actions.interrupt);

  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const labelColor = useColorModeValue('gray.600', 'gray.400');
  const headerBg = useColorModeValue('white', 'gray.900');

  if (taskStatus === 'idle') return null;

  const statusConfig =
    taskStatus === 'running'
      ? { label: 'RUNNING', colorScheme: 'yellow' as const }
      : taskStatus === 'success'
        ? { label: 'COMPLETED', colorScheme: 'green' as const }
        : taskStatus === 'error'
          ? { label: 'FAILED', colorScheme: 'red' as const }
          : taskStatus === 'interrupted'
            ? { label: 'STOPPED', colorScheme: 'orange' as const }
            : { label: 'IDLE', colorScheme: 'gray' as const };

  const stepNum = plan?.currentStepIndex != null
    ? plan.currentStepIndex + 1
    : typeof currentStep === 'number' ? currentStep : null;
  const total = plan?.steps?.length ?? (typeof totalSteps === 'number' ? totalSteps : null);
  const planSummary =
    stepNum != null && total != null && total > 0
      ? `Step ${stepNum} of ${total}`
      : null;

  return (
    <Box
      role="status"
      aria-live="polite"
      aria-label={`Task status: ${statusConfig.label}`}
      position="sticky"
      top={0}
      zIndex={10}
      bg={headerBg}
      borderBottomWidth="1px"
      borderBottomColor={borderColor}
      py={2}
      px={3}
      mb={2}
    >
      <HStack justify="space-between" align="center" spacing={3}>
        <HStack spacing={2} align="center" flexShrink={0}>
          <Text fontSize="xs" color={labelColor} fontWeight="medium">
            Status
          </Text>
          <Badge
            colorScheme={statusConfig.colorScheme}
            fontSize="xs"
            sx={
              taskStatus === 'running'
                ? {
                    animation: 'pulse 1.5s ease-in-out infinite',
                    '@keyframes pulse': {
                      '0%, 100%': { opacity: 1 },
                      '50%': { opacity: 0.8 },
                    },
                  }
                : undefined
            }
          >
            {statusConfig.label}
          </Badge>
        </HStack>

        {planSummary && (
          <Text
            fontSize="xs"
            color={labelColor}
            fontWeight="medium"
            noOfLines={1}
            flex="1"
            textAlign="center"
            minW={0}
          >
            {planSummary}
          </Text>
        )}

        {taskStatus === 'running' ? (
          <Button
            size="xs"
            variant="outline"
            colorScheme="red"
            leftIcon={<Icon as={BsStopFill} />}
            onClick={interruptTask}
            flexShrink={0}
            aria-label="Stop task"
          >
            STOP
          </Button>
        ) : (
          planSummary ? <Box w="60px" flexShrink={0} /> : null
        )}
      </HStack>
    </Box>
  );
}
