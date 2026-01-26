/**
 * Task Status Component for Thin Client Architecture
 * 
 * Displays current task execution status.
 * Supports both linear (current) and tree (future Manus) views.
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §3.4 (Task 3: Manus Orchestration Pre-Visualization)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §4.4 (Manus Orchestration Pre-Visualization)
 */

import React, { useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  useColorModeValue,
} from '@chakra-ui/react';
import { CurrentTaskSlice } from '../state/currentTask';
import { useAppState } from '../state/store';

export default function TaskStatus() {
  // Split selectors to avoid creating new objects on every render (prevents infinite loops)
  const taskStatus = useAppState((state) => state.currentTask.status);
  const actionStatus = useAppState((state) => state.currentTask.actionStatus);
  const orchestratorStatus = useAppState((state) => state.currentTask.orchestratorStatus);
  const currentStep = useAppState((state) => state.currentTask.currentStep);
  const totalSteps = useAppState((state) => state.currentTask.totalSteps);
  const displayHistory = useAppState((state) => state.currentTask.displayHistory);
  
  // Memoize combined state to prevent re-renders
  const state = useMemo(
    () => ({
      taskStatus,
      actionStatus,
      orchestratorStatus,
      currentStep,
      totalSteps,
      displayHistory,
    }),
    [taskStatus, actionStatus, orchestratorStatus, currentStep, totalSteps, displayHistory]
  );

  const textColor = useColorModeValue('gray.500', 'gray.400');
  const headingColor = useColorModeValue('gray.900', 'gray.100');

  // Get orchestrator status display info
  const getOrchestratorStatusInfo = () => {
    if (!state.orchestratorStatus) return null;

    const statusLabels: Record<NonNullable<typeof state.orchestratorStatus>, string> = {
      planning: 'Planning...',
      executing: state.currentStep && state.totalSteps
        ? `Executing step ${state.currentStep} of ${state.totalSteps}...`
        : 'Executing...',
      verifying: 'Verifying...',
      correcting: 'Correcting...',
      completed: 'Completed',
      failed: 'Failed',
    };

    const statusColors: Record<NonNullable<typeof state.orchestratorStatus>, string> = {
      planning: 'blue',
      executing: 'blue',
      verifying: 'yellow',
      correcting: 'orange',
      completed: 'green',
      failed: 'red',
    };

    return {
      label: statusLabels[state.orchestratorStatus],
      color: statusColors[state.orchestratorStatus],
    };
  };

  const orchestratorInfo = getOrchestratorStatusInfo();

  // Orchestrator View (Manus-Style) - Priority if orchestrator status exists
  if (orchestratorInfo) {
    return (
      <VStack align="stretch" spacing={2}>
        <HStack>
          <Text fontSize="sm" color={headingColor} fontWeight="medium">
            Status:
          </Text>
          <Badge colorScheme={orchestratorInfo.color} fontSize="sm">
            {orchestratorInfo.label}
          </Badge>
        </HStack>
        {state.currentStep && state.totalSteps && (
          <Text fontSize="xs" color={textColor}>
            Progress: Step {state.currentStep} of {state.totalSteps}
          </Text>
        )}
        {state.displayHistory.length > 0 && (
          <Text fontSize="xs" color={textColor}>
            Actions executed: {state.displayHistory.length}
          </Text>
        )}
      </VStack>
    );
  }

  // Linear View (Current - Backward Compatible)
  // This is the default view when no orchestrator status exists
  if (state.taskStatus === 'running' || state.actionStatus !== 'idle') {
    const displayedStatus: Record<CurrentTaskSlice['actionStatus'], string> = {
      idle: 'Idle',
      'attaching-debugger': 'Attaching Debugger',
      'pulling-dom': 'Reading Page',
      'transforming-dom': 'Reading Page',
      'performing-query': 'Running GPT',
      'performing-action': 'Performing Action',
      waiting: 'Waiting',
    };

    return (
      <VStack align="stretch" spacing={2}>
        <Box textColor={textColor} textAlign="center" fontSize="sm">
          {displayedStatus[state.actionStatus]}
        </Box>
        {state.displayHistory.length > 0 && (
          <Box>
            <Text fontSize="xs" color={textColor} mb={2}>
              Actions executed: {state.displayHistory.length}
            </Text>
          </Box>
        )}
      </VStack>
    );
  }

  // Show status when not running
  if (state.taskStatus !== 'idle') {
    const statusColors: Record<CurrentTaskSlice['status'], string> = {
      idle: 'gray',
      running: 'blue',
      success: 'green',
      error: 'red',
      interrupted: 'orange',
    };

    return (
      <VStack align="stretch" spacing={2}>
        <HStack>
          <Text fontSize="sm" color={headingColor} fontWeight="medium">
            Status:
          </Text>
          <Badge colorScheme={statusColors[state.taskStatus]} fontSize="sm">
            {state.taskStatus}
          </Badge>
        </HStack>
        {state.displayHistory.length > 0 && (
          <Text fontSize="xs" color={textColor}>
            Total actions: {state.displayHistory.length}
          </Text>
        )}
      </VStack>
    );
  }

  return null;
}
