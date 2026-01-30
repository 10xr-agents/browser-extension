/**
 * ChatTurn Component - Message bubble architecture
 *
 * - User messages: Right-aligned, blue/primary bubble.
 * - Agent messages: Left-aligned, gray/muted with structured sections:
 *   Thought (collapsible/italic), Action (code-like/badge), Observation (success/fail).
 */

import React, { useState } from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  useColorModeValue,
  Icon,
  Collapse,
  Badge,
} from '@chakra-ui/react';
import { FiLoader, FiChevronDown, FiChevronRight } from 'react-icons/fi';
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
  const userBubbleBg = useColorModeValue('blue.500', 'blue.600');
  const userBubbleText = useColorModeValue('white', 'white');
  const agentBubbleBg = useColorModeValue('gray.100', 'gray.700');
  const agentBubbleBorder = useColorModeValue('gray.200', 'gray.600');
  const aiTextColor = useColorModeValue('gray.700', 'gray.300');
  const thoughtLabelColor = useColorModeValue('gray.500', 'gray.400');
  const mutedColor = useColorModeValue('gray.500', 'gray.500');
  const errorTextColor = useColorModeValue('red.600', 'red.400');
  const successTextColor = useColorModeValue('green.600', 'green.400');
  const activeBorderColor = useColorModeValue('blue.400', 'blue.500');
  const processingColor = useColorModeValue('blue.500', 'blue.400');
  const actionBadgeBg = useColorModeValue('gray.200', 'gray.600');
  const actionBadgeText = useColorModeValue('gray.800', 'gray.100');
  const errorBorderColor = useColorModeValue('red.400', 'red.500');

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

      <VStack align="stretch" spacing={3}>
        {/* User message: right-aligned, blue/primary bubble */}
        <Box display="flex" justifyContent="flex-end" w="100%">
          <Box
            maxW="85%"
            px={4}
            py={2}
            borderRadius="lg"
            bg={userBubbleBg}
            color={userBubbleText}
          >
            <Text fontSize="sm" lineHeight="1.5">
              {userContent}
            </Text>
          </Box>
        </Box>

        {/* Agent messages: left-aligned, gray bubble with Thought / Action / Observation */}
        {aiMessages.length > 0 && (
          <VStack align="stretch" spacing={3}>
            {aiMessages.map((aiMessage, aiIndex) => {
              if (!aiMessage || typeof aiMessage !== 'object') return null;
              if (!aiMessage.id) return null;

              const aiMessageKey =
                typeof aiMessage.id === 'string'
                  ? aiMessage.id
                  : `ai-message-${aiIndex}-${Date.now()}`;

              const displayEntry = convertToDisplayEntry(aiMessage);
              const isError = aiMessage.status === 'failure' || aiMessage.status === 'error';
              const isSuccess = aiMessage.status === 'success';
              const isUserInputRequest =
                aiMessage.userQuestion &&
                (aiMessage.status === 'pending' || aiMessage.meta?.reasoning?.source === 'ASK_USER');

              return (
                <Box key={aiMessageKey} w="100%">
                  <Box
                    bg={agentBubbleBg}
                    borderWidth="1px"
                    borderColor={isError ? errorBorderColor : agentBubbleBorder}
                    borderRadius="lg"
                    px={3}
                    py={3}
                    w="100%"
                  >
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

                    {aiMessage.meta?.reasoning?.evidence && (
                      <Box mb={2}>
                        <EvidenceIndicator
                          evidence={aiMessage.meta.reasoning.evidence}
                          compact={true}
                        />
                      </Box>
                    )}

                    {isUserInputRequest && aiMessage.userQuestion && (
                      <Box mb={3}>
                        <UserInputPrompt
                          question={
                            typeof aiMessage.userQuestion === 'string'
                              ? aiMessage.userQuestion
                              : String(aiMessage.userQuestion || '')
                          }
                          missingInformation={
                            Array.isArray(aiMessage.missingInformation)
                              ? aiMessage.missingInformation
                              : []
                          }
                          reasoning={aiMessage.meta?.reasoning?.reasoning}
                        />
                      </Box>
                    )}

                    {/* Thought: collapsible, default collapsed; whitespace-preserving */}
                    {aiMessage.content && !isUserInputRequest && (
                      <AgentThoughtSection
                        content={
                          typeof aiMessage.content === 'string'
                            ? aiMessage.content
                            : String(aiMessage.content || '')
                        }
                        color={isError ? errorTextColor : isSuccess ? successTextColor : aiTextColor}
                        labelColor={thoughtLabelColor}
                      />
                    )}

                    {/* Action: code-like / badge */}
                    {displayEntry && (
                      <Box mt={2}>
                        <Text fontSize="xs" color={thoughtLabelColor} mb={1}>
                          Action
                        </Text>
                        <Badge
                          bg={actionBadgeBg}
                          color={actionBadgeText}
                          fontFamily="mono"
                          fontSize="xs"
                          px={2}
                          py={1}
                          borderRadius="md"
                        >
                          {typeof displayEntry.action === 'string'
                            ? displayEntry.action
                            : String(displayEntry.action || '')}
                        </Badge>
                        <Box mt={2}>
                          <ActionCard entry={displayEntry} compact />
                        </Box>
                      </Box>
                    )}

                    {/* Observation / Result */}
                    {(isSuccess || isError) && (
                      <Box mt={2}>
                        <Text
                          fontSize="xs"
                          color={isError ? errorTextColor : successTextColor}
                          fontWeight="medium"
                        >
                          {isSuccess ? '✅ Success' : '❌ Failed'}
                        </Text>
                      </Box>
                    )}
                  </Box>

                  {aiMessage.meta?.steps && aiMessage.meta.steps.length > 0 && (
                    <Box mt={2} pl={2}>
                      <ExecutionDetails
                        steps={aiMessage.meta.steps}
                        messageId={
                          typeof aiMessage.id === 'string'
                            ? aiMessage.id
                            : String(aiMessage.id || aiMessageKey)
                        }
                      />
                    </Box>
                  )}
                </Box>
              );
            })}
          </VStack>
        )}

        {/* Processing indicator (aria-busy for screen readers per Chrome a11y) */}
        {isActive && isProcessing && aiMessages.length === 0 && (
          <Box
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Agent is thinking"
            display="flex"
            justifyContent="flex-start"
            bg={agentBubbleBg}
            borderWidth="1px"
            borderColor={agentBubbleBorder}
            borderRadius="lg"
            px={3}
            py={2}
          >
            <HStack spacing={2}>
              <Icon
                as={FiLoader}
                boxSize={3.5}
                color={processingColor}
                aria-hidden
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
          </Box>
        )}
      </VStack>
    </Box>
  );
};

/** Collapsible "View Reasoning" section; default collapsed to keep chat clean (keyboard + a11y) */
function AgentThoughtSection({
  content,
  color,
  labelColor,
}: {
  content: string;
  color: string;
  labelColor: string;
}) {
  const [open, setOpen] = useState(false);
  const displayContent = content.trim() ? content : '—';
  const toggle = () => setOpen((o) => !o);
  return (
    <Box mb={2}>
      <HStack
        as="button"
        type="button"
        spacing={1}
        cursor="pointer"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        userSelect="none"
        aria-expanded={open}
        aria-label={open ? 'Collapse reasoning' : 'View reasoning'}
        textAlign="left"
        bg="transparent"
        border="none"
        p={0}
        _focusVisible={{ boxShadow: 'outline' }}
      >
        <Icon as={open ? FiChevronDown : FiChevronRight} boxSize={3} color={labelColor} aria-hidden />
        <Text fontSize="xs" color={labelColor} fontStyle="italic">
          {open ? 'Thinking…' : 'View Reasoning'}
        </Text>
      </HStack>
      <Collapse in={open}>
        <Text
          fontSize="sm"
          lineHeight="1.6"
          color={color}
          fontStyle="italic"
          pl={4}
          pt={1}
          whiteSpace="pre-wrap"
        >
          {displayContent}
        </Text>
      </Collapse>
    </Box>
  );
}

export default ChatTurnComponent;
