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
  Code,
  UnorderedList,
  ListItem,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import { DisplayHistoryEntry } from '../state/currentTask';

const TaskHistoryUser: React.FC = () => {
  const taskHistory = useAppState((state) => state.currentTask.displayHistory);
  const taskStatus = useAppState((state) => state.currentTask.status);

  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const successColor = useColorModeValue('green.600', 'green.400');
  const errorColor = useColorModeValue('red.600', 'red.400');
  const codeBg = useColorModeValue('gray.100', 'gray.800');
  const codeText = useColorModeValue('gray.800', 'gray.200');

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

  // Document Stream Style - No bubbles, markdown-first typography
  return (
    <VStack align="stretch" spacing={4} w="100%">
      {taskHistory.map((entry, index) => {
        const summary = getSummary(entry);
        const statusBadge = getStatusBadge(entry);
        const isError = 'error' in entry.parsedAction;
        const isComplete = 'parsedAction' in entry.parsedAction && 
          entry.parsedAction.parsedAction.name === 'finish';

        // Extract action details for inline code display
        const actionDetails = 'parsedAction' in entry.parsedAction 
          ? entry.parsedAction.parsedAction 
          : null;

        return (
          <Box key={index} w="100%" textAlign="left">
            {/* Main text - flows naturally like a document */}
            <Text
              fontSize="sm"
              lineHeight="1.6"
              color={isError ? errorColor : isComplete ? successColor : textColor}
              mb={actionDetails ? 2 : 0}
            >
              {summary}
            </Text>
            
            {/* Inline code for technical terms/actions */}
            {actionDetails && (
              <Box mb={2}>
                <Code
                  fontSize="xs"
                  bg={codeBg}
                  color={codeText}
                  px={2}
                  py={1}
                  borderRadius="sm"
                  fontFamily="mono"
                >
                  {actionDetails.name}
                  {actionDetails.args && Object.keys(actionDetails.args).length > 0 && (
                    <>({Object.entries(actionDetails.args).map(([key, value]) => 
                      `${key}: ${typeof value === 'string' ? `"${value}"` : value}`
                    ).join(', ')})</>
                  )}
                </Code>
              </Box>
            )}
            
            {/* Status badge - inline with text */}
            {statusBadge && (
              <Box display="inline-block" ml={2}>
                {statusBadge}
              </Box>
            )}
          </Box>
        );
      })}
    </VStack>
  );
};

export default TaskHistoryUser;
