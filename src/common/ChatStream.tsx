/**
 * ChatStream Component
 * 
 * User-facing chat interface that displays conversation messages.
 * Separates user messages from assistant messages with clean message bubbles.
 * 
 * Reference: Client-side fixes for chat persistence and UI refactor
 */

import React from 'react';
import {
  VStack,
  Box,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import type { ChatMessage } from '../types/chatMessage';
import ExecutionDetails from './ExecutionDetails';

interface ChatStreamProps {
  messages: ChatMessage[];
  isProcessing?: boolean;
}

const ChatStream: React.FC<ChatStreamProps> = ({ messages, isProcessing = false }) => {
  // Color definitions - ALL at component top level
  const userMessageBg = useColorModeValue('blue.50', 'blue.900/20');
  const assistantMessageBg = useColorModeValue('transparent', 'transparent');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const errorText = useColorModeValue('red.800', 'red.300');
  const successColor = useColorModeValue('green.600', 'green.400');

  if (messages.length === 0) {
    return null;
  }

  return (
    <VStack align="stretch" spacing={4} w="100%">
      {messages.map((message) => {
        if (message.role === 'user') {
          // User message bubble (right-aligned)
          return (
            <Box
              key={message.id}
              display="flex"
              justifyContent="flex-end"
              w="100%"
            >
              <Box
                bg={userMessageBg}
                borderRadius="lg"
                px={4}
                py={2}
                maxW="80%"
              >
                <Text fontSize="sm" color={textColor}>
                  {message.content}
                </Text>
              </Box>
            </Box>
          );
        } else if (message.role === 'assistant') {
          // Assistant message (left-aligned)
          const isError = message.status === 'failure' || message.status === 'error';
          const isSuccess = message.status === 'success';
          
          return (
            <Box key={message.id} w="100%">
              <Box
                display="flex"
                justifyContent="flex-start"
                mb={message.meta?.steps && message.meta.steps.length > 0 ? 2 : 0}
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
                    color={isError ? errorText : isSuccess ? successColor : textColor}
                  >
                    {message.content}
                  </Text>
                </Box>
              </Box>
              
              {/* Execution details (technical logs) - collapsible */}
              {message.meta?.steps && message.meta.steps.length > 0 && (
                <ExecutionDetails
                  steps={message.meta.steps}
                  messageId={message.id}
                />
              )}
            </Box>
          );
        }
        
        return null;
      })}
      
      {/* Processing indicator */}
      {isProcessing && (
        <Box
          display="flex"
          justifyContent="flex-start"
          w="100%"
        >
          <Box
            bg={assistantMessageBg}
            borderRadius="lg"
            px={0}
            py={1}
          >
            <Text fontSize="sm" color={textColor} fontStyle="italic">
              Thinking...
            </Text>
          </Box>
        </Box>
      )}
    </VStack>
  );
};

export default ChatStream;
