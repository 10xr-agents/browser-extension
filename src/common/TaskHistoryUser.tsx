/**
 * Task History User View Component for Thin Client Architecture
 * 
 * Simplified user-facing view showing only high-level natural language summaries.
 * No technical details (tokens, JSON, etc.) - just clear, actionable feedback.
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §1.2 (Task 1: Task History Refactor)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §2.3 (Task History Refactor - User View)
 */

import React from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  Heading,
  Spacer,
  useColorModeValue,
  Badge,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import { DisplayHistoryEntry } from '../state/currentTask';

const TaskHistoryUser: React.FC = () => {
  const taskHistory = useAppState((state) => state.currentTask.displayHistory);
  const taskStatus = useAppState((state) => state.currentTask.status);

  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const successColor = useColorModeValue('green.600', 'green.400');
  const errorColor = useColorModeValue('red.600', 'red.400');

  if (taskHistory.length === 0 && taskStatus !== 'running') {
    return null;
  }

  // Extract simple user-friendly summaries from history entries
  const getSummary = (entry: DisplayHistoryEntry): string => {
    // Use thought as primary summary (it's usually user-friendly)
    if (entry.thought) {
      return entry.thought;
    }

    // Fallback: try to extract action description from parsed action
    if ('parsedAction' in entry.parsedAction) {
      const action = entry.parsedAction.parsedAction;
      if (action.name === 'click') {
        return `Clicked on element`;
      } else if (action.name === 'setValue') {
        return `Entered text`;
      } else if (action.name === 'finish') {
        return `Task completed`;
      } else if (action.name === 'fail') {
        return `Task failed`;
      }
    }

    // Last resort: use action string (may be technical)
    return entry.action;
  };

  const getStatusBadge = (entry: DisplayHistoryEntry) => {
    if ('error' in entry.parsedAction) {
      return <Badge colorScheme="red" fontSize="xs">Error</Badge>;
    }
    if ('parsedAction' in entry.parsedAction) {
      const action = entry.parsedAction.parsedAction;
      if (action.name === 'finish') {
        return <Badge colorScheme="green" fontSize="xs">Complete</Badge>;
      }
      if (action.name === 'fail') {
        return <Badge colorScheme="red" fontSize="xs">Failed</Badge>;
      }
    }
    return null;
  };

  return (
    <VStack mt={4} align="stretch" spacing={3}>
      <HStack>
        <Heading as="h3" size="md" color={headingColor}>
          Action History
        </Heading>
        <Spacer />
      </HStack>
      <VStack align="stretch" spacing={2}>
        {taskHistory.map((entry, index) => {
          const summary = getSummary(entry);
          const statusBadge = getStatusBadge(entry);
          const isError = 'error' in entry.parsedAction;
          const isComplete = 'parsedAction' in entry.parsedAction && 
            entry.parsedAction.parsedAction.name === 'finish';

          return (
            <Box
              key={index}
              p={3}
              borderWidth="1px"
              borderRadius="md"
              bg={useColorModeValue('white', 'gray.800')}
              borderColor={useColorModeValue('gray.200', 'gray.700')}
            >
              <HStack align="start" spacing={2}>
                <Text fontSize="sm" fontWeight="bold" color={headingColor}>
                  {index + 1}.
                </Text>
                <Text
                  fontSize="sm"
                  color={isError ? errorColor : isComplete ? successColor : textColor}
                  flex="1"
                >
                  {summary}
                </Text>
                {statusBadge}
              </HStack>
            </Box>
          );
        })}
      </VStack>
    </VStack>
  );
};

export default TaskHistoryUser;
