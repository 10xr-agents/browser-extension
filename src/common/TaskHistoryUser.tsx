/**
 * Task History User View Component for Thin Client Architecture
 * 
 * User-centric chat interface with message bubbles, action cards, and collapsible technical details.
 * Similar to ChatGPT/Claude with clean, modern conversation stream.
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §1.2 (Task 1: Task History Refactor)
 * Reference: UX Refactor - User-Centric Chat Design
 */

import React, { useMemo, useState, useEffect } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  useColorModeValue,
  Badge,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Divider,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import { DisplayHistoryEntry } from '../state/currentTask';
import ActionCard from './ActionCard';
import ThoughtChain from './ThoughtChain';
import type { Conversation } from '../state/conversationHistory';
import { transformThought } from '../helpers/userFriendlyMessages';
import ChatStream from './ChatStream';

const TaskHistoryUser: React.FC = () => {
  const taskHistory = useAppState((state) => state.currentTask.displayHistory);
  const messages = useAppState((state) => state.currentTask.messages);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const instructions = useAppState((state) => state.currentTask.instructions);
  const sessionId = useAppState((state) => state.currentTask.sessionId);
  const loadMessages = useAppState((state) => state.currentTask.actions.loadMessages);
  const accessibilityElements = useAppState((state) => state.currentTask.accessibilityElements);
  const correctionHistory = useAppState((state) => state.currentTask.correctionHistory);
  const verificationHistory = useAppState((state) => state.currentTask.verificationHistory);
  const previousConversations = useAppState((state) => state.conversationHistory.conversations);
  
  // Load messages on mount if sessionId exists
  useEffect(() => {
    if (sessionId && messages.length === 0) {
      loadMessages(sessionId);
    }
  }, [sessionId, messages.length, loadMessages]);

  // Color definitions - ALL at component top level
  const userMessageBg = useColorModeValue('blue.50', 'blue.900/20');
  const assistantMessageBg = useColorModeValue('transparent', 'transparent');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const errorBg = useColorModeValue('red.50', 'red.900/20');
  const errorText = useColorModeValue('red.800', 'red.300');
  const warningBg = useColorModeValue('orange.50', 'orange.900/20');
  const warningText = useColorModeValue('orange.800', 'orange.300');
  const successColor = useColorModeValue('green.600', 'green.400');
  const technicalDetailColor = useColorModeValue('gray.600', 'gray.400');
  const warningBorderColor = useColorModeValue('orange.400', 'orange.500');
  const conversationHeaderBg = useColorModeValue('gray.50', 'gray.800');
  const conversationHeaderText = useColorModeValue('gray.700', 'gray.300');
  const conversationBorder = useColorModeValue('gray.200', 'gray.700');
  const dateTextColor = useColorModeValue('gray.500', 'gray.400');
  const conversationHoverBg = useColorModeValue('gray.100', 'gray.700');

  // Group technical details for ThoughtChain
  // NOTE: This hook MUST be called before any early returns to comply with Rules of Hooks
  const technicalDetails = useMemo(() => {
    const details: string[] = [];
    
    // Accessibility elements count
    if (accessibilityElements && accessibilityElements.length > 0) {
      details.push(`Using ${accessibilityElements.length} accessibility-derived interactive elements`);
    }
    
    // Correction details
    if (correctionHistory.length > 0) {
      const latest = correctionHistory[correctionHistory.length - 1];
      const stepIndex = typeof latest.stepIndex === 'number' && !isNaN(latest.stepIndex)
        ? latest.stepIndex + 1
        : 'current';
      details.push(`Retrying step ${stepIndex} with ${latest.strategy.replace(/_/g, ' ').toLowerCase()}`);
      if (latest.reason) {
        details.push(`Reason: ${latest.reason}`);
      }
    }
    
    // Verification details
    if (verificationHistory.length > 0) {
      const latest = verificationHistory[verificationHistory.length - 1];
      const stepIndex = typeof latest.stepIndex === 'number' && !isNaN(latest.stepIndex)
        ? latest.stepIndex + 1
        : 'current';
      details.push(`Step ${stepIndex} verification: ${latest.success ? 'Success' : 'Failed'} (${(latest.confidence * 100).toFixed(0)}% confidence)`);
      if (latest.reason) {
        details.push(`Reason: ${latest.reason}`);
      }
    }
    
    return details;
  }, [accessibilityElements, correctionHistory, verificationHistory]);

  // Show component if there's messages, history, a running task, or instructions (user has started a task)
  const hasContent = messages.length > 0 || taskHistory.length > 0 || taskStatus === 'running' || (instructions && instructions.trim());
  
  if (!hasContent) {
    return null;
  }
  
  // Prefer messages over displayHistory (new structure)
  const useNewStructure = messages.length > 0;

  // Extract user-friendly message from entry
  const getMessage = (entry: DisplayHistoryEntry): string | null => {
    // Use thought as primary message, transformed to user-friendly
    if (entry.thought && entry.thought.trim()) {
      return transformThought(entry.thought);
    }
    
    // For finish/fail actions, return a simple message
    if (entry.parsedAction && 'parsedAction' in entry.parsedAction) {
      const action = entry.parsedAction.parsedAction;
      if (action.name === 'finish') {
        return 'Task completed successfully!';
      }
      if (action.name === 'fail') {
        return 'Task failed.';
      }
    }
    
    return null;
  };

  // Check if entry is an error
  const isError = (entry: DisplayHistoryEntry): boolean => {
    return entry.parsedAction && 'error' in entry.parsedAction;
  };

  // Check if entry is complete
  const isComplete = (entry: DisplayHistoryEntry): boolean => {
    return entry.parsedAction && 'parsedAction' in entry.parsedAction && 
      entry.parsedAction.parsedAction.name === 'finish';
  };

  // Check if entry is a user message
  // Note: User's initial instruction is stored in instructions state, not displayHistory
  // So all entries in displayHistory are assistant responses
  const isUserMessage = (entry: DisplayHistoryEntry, index: number): boolean => {
    // Currently, all entries are assistant responses
    // If we want to show user messages, we'd need to add them to displayHistory
    return false;
  };

  // Format date for display
  const formatDate = (date: Date): string => {
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
  };

  // Render a conversation entry (reusable for both previous and current)
  const renderConversationEntry = (
    entry: DisplayHistoryEntry,
    index: number,
    isPreviousConversation: boolean = false
  ) => {
    if (!entry) return null;

    try {
      const message = getMessage(entry);
      const userMessage = isUserMessage(entry, index);
      const error = isError(entry);
      const complete = isComplete(entry);

      // Skip entries with no message, no action, and no error
      const hasError = error && entry.parsedAction && 'error' in entry.parsedAction;
      if (!message && !entry.parsedAction && !hasError) {
        return null;
      }

      return (
        <Box key={index} w="100%" opacity={isPreviousConversation ? 0.8 : 1}>
          {/* Assistant message (left-aligned) */}
          {!userMessage && message && (
            <Box
              display="flex"
              justifyContent="flex-start"
              mb={2}
            >
              <Box
                bg={assistantMessageBg}
                borderRadius="lg"
                px={0}
                py={1}
                maxW="100%"
              >
                <Text
                  fontSize="sm"
                  lineHeight="1.6"
                  color={error ? errorText : complete ? successColor : textColor}
                >
                  {String(message || '')}
                </Text>
              </Box>
            </Box>
          )}

          {/* Action card */}
          {entry.parsedAction && 'parsedAction' in entry.parsedAction && (
            <Box mb={2}>
              <ActionCard entry={entry} />
            </Box>
          )}

          {/* Error message (subtle warning style) */}
          {error && entry.parsedAction && 'error' in entry.parsedAction && (
            <Box
              bg={warningBg}
              borderLeftWidth="4px"
              borderLeftColor={warningBorderColor}
              px={3}
              py={2}
              borderRadius="sm"
              mb={2}
            >
              <Text fontSize="xs" color={warningText}>
                {String(entry.parsedAction.error || 'Unknown error')}
              </Text>
            </Box>
          )}
        </Box>
      );
    } catch (err) {
      // If rendering fails for this entry, log and skip it
      console.error(`Error rendering history entry ${index}:`, err, entry);
      return (
        <Box key={index} w="100%" p={2} bg={warningBg} borderRadius="sm" mb={2}>
          <Text fontSize="xs" color={warningText}>
            Error displaying entry {index + 1}
          </Text>
        </Box>
      );
    }
  };

  return (
    <VStack align="stretch" spacing={3} w="100%">
      {/* Previous Conversations */}
      {previousConversations.length > 0 && (
        <Box w="100%">
          <Accordion allowMultiple defaultIndex={[]} w="100%">
            {previousConversations.map((conversation: Conversation) => {
              const statusColor = conversation.status === 'success' 
                ? successColor 
                : conversation.status === 'error' 
                ? errorText 
                : warningText;
              
              return (
                <AccordionItem
                  key={conversation.id}
                  borderWidth="1px"
                  borderColor={conversationBorder}
                  borderRadius="md"
                  mb={2}
                  bg={conversationHeaderBg}
                >
                  <AccordionButton
                    px={3}
                    py={2}
                    _hover={{ bg: conversationHoverBg }}
                  >
                    <Box flex="1" textAlign="left">
                      <HStack spacing={2}>
                        <Text fontSize="sm" fontWeight="medium" color={conversationHeaderText} noOfLines={1}>
                          {conversation.instructions}
                        </Text>
                        <Badge
                          fontSize="xs"
                          colorScheme={conversation.status === 'success' ? 'green' : conversation.status === 'error' ? 'red' : 'orange'}
                        >
                          {conversation.status}
                        </Badge>
                      </HStack>
                      <Text fontSize="xs" color={dateTextColor} mt={1}>
                        {formatDate(conversation.completedAt)}
                        {conversation.url && ` • ${new URL(conversation.url).hostname}`}
                      </Text>
                    </Box>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4} px={3}>
                    <VStack align="stretch" spacing={2}>
                      {/* User's instruction */}
                      <Box
                        display="flex"
                        justifyContent="flex-end"
                        mb={2}
                      >
                        <Box
                          bg={userMessageBg}
                          borderRadius="lg"
                          px={4}
                          py={2}
                          maxW="80%"
                        >
                          <Text fontSize="sm" color={textColor}>
                            {conversation.instructions}
                          </Text>
                        </Box>
                      </Box>
                      
                      {/* Conversation history entries */}
                      {conversation.displayHistory.map((entry, index) =>
                        renderConversationEntry(entry, index, true)
                      )}
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>
              );
            })}
          </Accordion>
        </Box>
      )}

      {/* Divider between previous and current conversation */}
      {previousConversations.length > 0 && hasContent && (
        <Divider borderColor={conversationBorder} />
      )}

      {/* Current Task - Use new ChatStream if messages available, otherwise fallback to old structure */}
      {useNewStructure ? (
        <ChatStream
          messages={messages}
          isProcessing={taskStatus === 'running'}
        />
      ) : (
        <>
          {/* Legacy displayHistory structure (backward compatibility) */}
      {/* User's initial instruction as first message bubble */}
      {/* Only show if there's task activity (history or running) to avoid showing empty input */}
      {instructions && instructions.trim() && (taskHistory.length > 0 || taskStatus === 'running') && (
        <Box
          display="flex"
          justifyContent="flex-end"
          mb={2}
        >
          <Box
            bg={userMessageBg}
            borderRadius="lg"
            px={4}
            py={2}
            maxW="80%"
          >
            <Text fontSize="sm" color={textColor}>
              {instructions}
            </Text>
          </Box>
        </Box>
      )}

      {/* Technical details in collapsible ThoughtChain */}
      {technicalDetails.length > 0 && (
        <Box w="100%">
          <ThoughtChain isProcessing={taskStatus === 'running'}>
            {technicalDetails.map((detail, idx) => (
              <Text key={idx} fontSize="xs" color={technicalDetailColor}>
                {detail}
              </Text>
            ))}
          </ThoughtChain>
        </Box>
      )}

          {/* Current Task Message history */}
          {taskHistory.map((entry, index) =>
            renderConversationEntry(entry, index, false)
          )}
        </>
      )}
    </VStack>
  );
};

export default TaskHistoryUser;
