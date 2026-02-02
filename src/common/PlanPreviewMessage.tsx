/**
 * PlanPreviewMessage Component
 *
 * Renders plan preview and plan update system messages in the chat.
 * Shows the agent's planned steps before execution begins.
 *
 * Reference: SPECS_AND_CONTRACTS.md §3.5 (Plan Preview Messages)
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { CheckCircleIcon, RepeatIcon, ViewIcon } from '@chakra-ui/icons';
import type { ChatMessage } from '../types/chatMessage';

interface PlanPreviewMessageProps {
  message: ChatMessage;
}

const PlanPreviewMessage: React.FC<PlanPreviewMessageProps> = ({ message }) => {
  // Color definitions at component top level
  const bgColor = useColorModeValue('gray.50', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.600');
  const headerTextColor = useColorModeValue('gray.700', 'gray.300');
  const stepTextColor = useColorModeValue('gray.800', 'gray.200');
  const mutedTextColor = useColorModeValue('gray.500', 'gray.400');
  const iconColor = useColorModeValue('blue.500', 'blue.400');
  const completedColor = useColorModeValue('green.500', 'green.400');
  const activeColor = useColorModeValue('blue.600', 'blue.400');

  // Get message type from metadata
  const messageType = message.metadata?.messageType || message.meta?.messageType;
  const isUpdate = messageType === 'plan_update';

  // Get plan from metadata
  const plan = message.metadata?.plan;

  // If no plan data, just show the content
  if (!plan?.steps || plan.steps.length === 0) {
    return (
      <Box w="100%" px={2}>
        <Box
          bg={bgColor}
          borderRadius="lg"
          border="1px solid"
          borderColor={borderColor}
          p={4}
        >
          <HStack spacing={2} mb={2}>
            {isUpdate ? (
              <RepeatIcon boxSize={4} color={iconColor} />
            ) : (
              <ViewIcon boxSize={4} color={iconColor} />
            )}
            <Text fontSize="sm" fontWeight="semibold" color={headerTextColor}>
              {isUpdate ? 'Updated Plan' : 'Plan'}
            </Text>
          </HStack>
          <Text fontSize="sm" color={stepTextColor} whiteSpace="pre-wrap">
            {typeof message.content === 'string'
              ? message.content
              : String(message.content || '')}
          </Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box w="100%" px={2}>
      <Box
        bg={bgColor}
        borderRadius="lg"
        border="1px solid"
        borderColor={borderColor}
        p={4}
      >
        {/* Header */}
        <HStack spacing={2} mb={3}>
          {isUpdate ? (
            <RepeatIcon boxSize={4} color={iconColor} />
          ) : (
            <ViewIcon boxSize={4} color={iconColor} />
          )}
          <Text fontSize="sm" fontWeight="semibold" color={headerTextColor}>
            {isUpdate ? 'Updated Plan' : 'Plan'}
          </Text>
          <Text fontSize="xs" color={mutedTextColor}>
            {plan.steps.length} step{plan.steps.length !== 1 ? 's' : ''}
          </Text>
        </HStack>

        {/* Plan steps */}
        <VStack align="stretch" spacing={2}>
          {plan.steps.map((step, index) => {
            const isCompleted = step.status === 'completed';
            const isActive = step.status === 'active';
            const isFailed = step.status === 'failed';

            return (
              <HStack key={index} spacing={3} align="flex-start">
                {/* Step indicator */}
                <Box pt={0.5}>
                  {isCompleted ? (
                    <CheckCircleIcon boxSize={4} color={completedColor} />
                  ) : (
                    <Box
                      w={4}
                      h={4}
                      borderRadius="full"
                      border="2px solid"
                      borderColor={isActive ? activeColor : isFailed ? 'red.500' : mutedTextColor}
                      bg={isActive ? activeColor : 'transparent'}
                    />
                  )}
                </Box>

                {/* Step content */}
                <HStack spacing={2} flex={1}>
                  <Text
                    fontSize="sm"
                    color={mutedTextColor}
                    fontWeight="medium"
                    minW="20px"
                  >
                    {index + 1}.
                  </Text>
                  <Text
                    fontSize="sm"
                    color={
                      isCompleted
                        ? mutedTextColor
                        : isActive
                        ? activeColor
                        : isFailed
                        ? 'red.500'
                        : stepTextColor
                    }
                    textDecoration={isCompleted ? 'line-through' : 'none'}
                    opacity={isCompleted ? 0.7 : 1}
                  >
                    {step.description}
                  </Text>
                </HStack>
              </HStack>
            );
          })}
        </VStack>
      </Box>
    </Box>
  );
};

export default PlanPreviewMessage;
