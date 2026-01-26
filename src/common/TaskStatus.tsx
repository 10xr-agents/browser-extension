import React, { useMemo } from 'react';
import { Box, useColorModeValue } from '@chakra-ui/react';
import { CurrentTaskSlice } from '../state/currentTask';
import { useAppState } from '../state/store';

export default function TaskStatus() {
  // Split selectors to avoid creating new objects on every render (prevents infinite loops)
  const taskStatus = useAppState((state) => state.currentTask.status);
  const actionStatus = useAppState((state) => state.currentTask.actionStatus);
  
  // Memoize combined state to prevent re-renders
  const state = useMemo(
    () => ({
      taskStatus,
      actionStatus,
    }),
    [taskStatus, actionStatus]
  );

  const textColor = useColorModeValue('gray.500', 'gray.400');

  if (state.taskStatus !== 'running') {
    return null;
  }

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
    <Box textColor={textColor} textAlign="center" mb={8} fontSize="sm">
      {displayedStatus[state.actionStatus]}
    </Box>
  );
}
