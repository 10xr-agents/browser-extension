import { Button, HStack, Icon } from '@chakra-ui/react';
import React, { useMemo } from 'react';
import { useAppState } from '../state/store';
import { BsPlayFill, BsStopFill } from 'react-icons/bs';

export default function RunTaskButton(props: { runTask: () => void }) {
  // Split selectors to avoid creating new objects on every render (prevents infinite loops)
  const taskState = useAppState((state) => state.currentTask.status);
  const instructions = useAppState((state) => state.ui.instructions);
  const interruptTask = useAppState((state) => state.currentTask.actions.interrupt);

  // Memoize only state values (not action functions) to prevent re-renders
  // Action functions should be stable and don't need to be in dependencies
  const state = useMemo(
    () => ({
      taskState,
      instructions,
    }),
    [taskState, instructions]
  );

  let button = (
    <Button
      rightIcon={<Icon as={BsPlayFill} boxSize={6} />}
      onClick={props.runTask}
      colorScheme="green"
      disabled={state.taskState === 'running' || !state.instructions}
    >
      Start Task
    </Button>
  );

  if (state.taskState === 'running') {
    button = (
      <Button
        rightIcon={<Icon as={BsStopFill} boxSize={6} />}
        onClick={interruptTask}
        colorScheme="red"
      >
        Stop
      </Button>
    );
  }

  return <HStack alignItems="center">{button}</HStack>;
}
