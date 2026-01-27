/**
 * ExecutionDetails Component
 * 
 * Collapsible accordion that shows technical execution logs (action steps).
 * Nested inside assistant messages to keep the main chat view clean.
 * 
 * Reference: Client-side fixes for UI refactor - separating chat from logs
 */

import React, { useState } from 'react';
import {
  Box,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Text,
  VStack,
  HStack,
  Badge,
  useColorModeValue,
} from '@chakra-ui/react';
import type { ActionStep } from '../types/chatMessage';

interface ExecutionDetailsProps {
  steps: ActionStep[];
  messageId: string;
}

const ExecutionDetails: React.FC<ExecutionDetailsProps> = ({ steps, messageId }) => {
  const [isOpen, setIsOpen] = useState(false);
  
  // Color definitions - ALL at component top level
  const accordionBg = useColorModeValue('gray.50', 'gray.800');
  const accordionBorder = useColorModeValue('gray.200', 'gray.700');
  const accordionHoverBg = useColorModeValue('gray.100', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const successColor = useColorModeValue('green.600', 'green.400');
  const errorColor = useColorModeValue('red.600', 'red.400');
  const codeBg = useColorModeValue('gray.100', 'gray.700');

  if (steps.length === 0) {
    return null;
  }

  const successCount = steps.filter(s => s.status === 'success').length;
  const failureCount = steps.filter(s => s.status === 'failure').length;

  return (
    <Box w="100%" mt={2}>
      <Accordion allowToggle onChange={(index) => setIsOpen(index === 0)}>
        <AccordionItem
          borderWidth="1px"
          borderColor={accordionBorder}
          borderRadius="md"
          bg={accordionBg}
        >
          <AccordionButton
            px={3}
            py={2}
            _hover={{ bg: accordionHoverBg }}
            fontSize="xs"
          >
            <HStack spacing={2} flex="1" textAlign="left">
              <Text fontSize="xs" color={textColor} fontWeight="medium">
                Execution Details
              </Text>
              <Badge
                fontSize="xs"
                colorScheme={failureCount > 0 ? 'red' : 'green'}
              >
                {successCount} success{failureCount > 0 ? `, ${failureCount} failed` : ''}
              </Badge>
            </HStack>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel pb={4} px={3}>
            <VStack align="stretch" spacing={2}>
              {steps.map((step) => (
                <Box
                  key={step.id}
                  p={2}
                  bg={codeBg}
                  borderRadius="sm"
                  borderLeftWidth="3px"
                  borderLeftColor={step.status === 'success' ? successColor : errorColor}
                >
                  <HStack spacing={2} mb={1}>
                    <Text
                      fontSize="xs"
                      fontWeight="semibold"
                      color={step.status === 'success' ? successColor : errorColor}
                    >
                      {step.action}
                    </Text>
                    <Badge
                      fontSize="xs"
                      colorScheme={step.status === 'success' ? 'green' : 'red'}
                    >
                      {step.status}
                    </Badge>
                    {step.duration && (
                      <Text fontSize="xs" color={descColor}>
                        ({step.duration}ms)
                      </Text>
                    )}
                  </HStack>
                  {step.error && (
                    <Text fontSize="xs" color={errorColor} mt={1}>
                      Error: {step.error.message} ({step.error.code})
                    </Text>
                  )}
                  {step.executionResult?.actualState && (
                    <Text fontSize="xs" color={descColor} mt={1}>
                      Result: {step.executionResult.actualState}
                    </Text>
                  )}
                </Box>
              ))}
            </VStack>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>
    </Box>
  );
};

export default ExecutionDetails;
