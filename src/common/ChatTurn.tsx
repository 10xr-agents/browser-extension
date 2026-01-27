/**
 * ChatTurn Component (Cursor/Manus Style)
 * 
 * Minimal turn-based layout - no bubbles, no heavy borders.
 * Clean document stream with typography hierarchy.
 * 
 * Structure:
 * - User message: Large, semi-bold text (the "header")
 * - AI response: Clean readable text with timeline for execution
 * - Separated by subtle hairline dividers
 * 
 * Reference: Cursor/Manus minimalist design aesthetic
 */

import React from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  useColorModeValue,
  Icon,
} from '@chakra-ui/react';
import { FiUser, FiCpu, FiLoader } from 'react-icons/fi';
// Import type with alias to avoid naming conflict with component
import type { ChatTurn as ChatTurnType } from '../helpers/groupHistoryIntoTurns';
import ActionCard from './ActionCard';
import ExecutionDetails from './ExecutionDetails';
import ReasoningBadge from './ReasoningBadge';
import UserInputPrompt from './UserInputPrompt';
import EvidenceIndicator from './EvidenceIndicator';
import type { ChatMessage } from '../types/chatMessage';
import type { DisplayHistoryEntry } from '../state/currentTask';

interface ChatTurnProps {
  turn: ChatTurnType | null | undefined;
  isActive?: boolean;
  isProcessing?: boolean;
}

const ChatTurnComponent: React.FC<ChatTurnProps> = ({ turn, isActive = false, isProcessing = false }) => {
  // Color definitions - ALL at component top level (before any conditional returns)
  const dividerColor = useColorModeValue('gray.100', 'gray.800');
  const userTextColor = useColorModeValue('gray.900', 'gray.100');
  const aiTextColor = useColorModeValue('gray.700', 'gray.300');
  const mutedColor = useColorModeValue('gray.500', 'gray.500');
  const iconColor = useColorModeValue('gray.400', 'gray.600');
  const errorTextColor = useColorModeValue('red.600', 'red.400');
  const successTextColor = useColorModeValue('green.600', 'green.400');
  const activeBorderColor = useColorModeValue('blue.400', 'blue.500');
  const processingColor = useColorModeValue('blue.500', 'blue.400');

  // CRITICAL SAFETY CHECKS
  if (!turn) {
    return null;
  }
  
  if (!turn.userMessage) {
    return null;
  }
  
  if (typeof turn.userMessage.id !== 'string' || !turn.userMessage.id) {
    return null;
  }
  
  // Ensure content is always a string
  const userContent = typeof turn.userMessage.content === 'string' 
    ? turn.userMessage.content 
    : String(turn.userMessage.content || '');
  
  // Ensure aiMessages is always an array
  const aiMessages = Array.isArray(turn.aiMessages) ? turn.aiMessages : [];

  // Convert ChatMessage to DisplayHistoryEntry for ActionCard compatibility
  const convertToDisplayEntry = (message: ChatMessage): DisplayHistoryEntry | null => {
    if (!message) return null;
    if (!message.actionPayload) return null;
    if (!message.actionPayload.parsedAction) return null;
    if ('error' in message.actionPayload.parsedAction) return null;

    const nestedParsedAction = message.actionPayload.parsedAction.parsedAction;
    if (!nestedParsedAction || typeof nestedParsedAction !== 'object') return null;
    if (!('name' in nestedParsedAction) || typeof nestedParsedAction.name !== 'string') return null;

    const safeContent = typeof message.content === 'string' ? message.content : String(message.content || '');
    const safeAction = typeof message.actionPayload.action === 'string' 
      ? message.actionPayload.action 
      : String(message.actionPayload.action || '');
    
    return {
      thought: safeContent,
      action: safeAction,
      parsedAction: {
        thought: safeContent,
        action: safeAction,
        parsedAction: nestedParsedAction,
      },
      usage: message.meta?.usage,
    };
  };

  return (
    <Box
      py={4}
      borderBottomWidth="1px"
      borderBottomColor={dividerColor}
      position="relative"
    >
      {/* Active indicator - subtle left border */}
      {isActive && (
        <Box
          position="absolute"
          left={-4}
          top={0}
          bottom={0}
          width="2px"
          bg={activeBorderColor}
          borderRadius="full"
        />
      )}

      <VStack align="stretch" spacing={4}>
        {/* User Message (The Header) */}
        <HStack align="flex-start" spacing={3}>
          {/* User Icon */}
          <Box pt={0.5}>
            <Icon as={FiUser} boxSize={4} color={iconColor} />
          </Box>
          
          {/* User Text - Large, Semi-bold */}
          <Text
            fontSize="md"
            fontWeight="600"
            color={userTextColor}
            lineHeight="1.5"
            flex="1"
          >
            {userContent}
          </Text>
        </HStack>

        {/* AI Response Section */}
        {aiMessages.length > 0 && (
          <VStack align="stretch" spacing={3} pl={7}>
            {aiMessages.map((aiMessage, aiIndex) => {
              if (!aiMessage || typeof aiMessage !== 'object') return null;
              if (!aiMessage.id) return null;
              
              const aiMessageKey = typeof aiMessage.id === 'string' 
                ? aiMessage.id 
                : `ai-message-${aiIndex}-${Date.now()}`;
              
              const displayEntry = convertToDisplayEntry(aiMessage);
              const isError = aiMessage.status === 'failure' || aiMessage.status === 'error';
              const isSuccess = aiMessage.status === 'success';
              const isUserInputRequest = aiMessage.userQuestion && 
                (aiMessage.status === 'pending' || aiMessage.meta?.reasoning?.source === 'ASK_USER');

              return (
                <Box key={aiMessageKey}>
                  {/* Reasoning Badge (minimal, inline) */}
                  {aiMessage.meta?.reasoning && (
                    <Box mb={2}>
                      <ReasoningBadge
                        source={aiMessage.meta.reasoning.source}
                        confidence={aiMessage.meta.reasoning.confidence}
                        reasoning={aiMessage.meta.reasoning.reasoning}
                        evidence={aiMessage.meta.reasoning.evidence}
                        searchIteration={aiMessage.meta.reasoning.searchIteration}
                      />
                    </Box>
                  )}

                  {/* Evidence Indicator */}
                  {aiMessage.meta?.reasoning?.evidence && (
                    <Box mb={2}>
                      <EvidenceIndicator 
                        evidence={aiMessage.meta.reasoning.evidence} 
                        compact={true}
                      />
                    </Box>
                  )}

                  {/* User Input Prompt */}
                  {isUserInputRequest && aiMessage.userQuestion && (
                    <Box mb={3}>
                      <UserInputPrompt
                        question={typeof aiMessage.userQuestion === 'string' 
                          ? aiMessage.userQuestion 
                          : String(aiMessage.userQuestion || '')}
                        missingInformation={Array.isArray(aiMessage.missingInformation) 
                          ? aiMessage.missingInformation 
                          : []}
                        reasoning={aiMessage.meta?.reasoning?.reasoning}
                      />
                    </Box>
                  )}

                  {/* AI Thought/Content - Clean typography */}
                  {aiMessage.content && !isUserInputRequest && (
                    <Text
                      fontSize="sm"
                      lineHeight="1.7"
                      color={isError ? errorTextColor : isSuccess ? successTextColor : aiTextColor}
                      mb={displayEntry || (aiMessage.meta?.steps && aiMessage.meta.steps.length > 0) ? 3 : 0}
                    >
                      {typeof aiMessage.content === 'string' 
                        ? aiMessage.content 
                        : String(aiMessage.content || '')}
                    </Text>
                  )}

                  {/* Action Card (inline, minimal) */}
                  {displayEntry && (
                    <Box mb={(aiMessage.meta?.steps && aiMessage.meta.steps.length > 0) ? 3 : 0}>
                      <ActionCard entry={displayEntry} compact />
                    </Box>
                  )}

                  {/* Execution Details (timeline style) */}
                  {aiMessage.meta?.steps && aiMessage.meta.steps.length > 0 && (
                    <ExecutionDetails
                      steps={aiMessage.meta.steps}
                      messageId={typeof aiMessage.id === 'string' ? aiMessage.id : String(aiMessage.id || aiMessageKey)}
                    />
                  )}
                </Box>
              );
            })}
          </VStack>
        )}

        {/* Processing indicator */}
        {isActive && isProcessing && aiMessages.length === 0 && (
          <HStack spacing={2} pl={7}>
            <Icon
              as={FiLoader}
              boxSize={3.5}
              color={processingColor}
              sx={{
                animation: 'spin 1s linear infinite',
                '@keyframes spin': {
                  '0%': { transform: 'rotate(0deg)' },
                  '100%': { transform: 'rotate(360deg)' },
                },
              }}
            />
            <Text fontSize="sm" color={mutedColor}>
              Thinking...
            </Text>
          </HStack>
        )}
      </VStack>
    </Box>
  );
};

export default ChatTurnComponent;
