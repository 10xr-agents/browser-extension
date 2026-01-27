/**
 * ExecutionDetails Component (Cursor/Manus Style)
 * 
 * Minimal timeline for execution steps - no heavy borders, no big badges.
 * Collapsed: Small pill "N steps processed"
 * Expanded: Clean vertical timeline with inline step items
 * 
 * Reference: Cursor/Manus minimalist design aesthetic
 */

import React, { useState } from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  Collapse,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { 
  FiChevronDown, 
  FiChevronRight, 
  FiCheck, 
  FiX, 
  FiMousePointer, 
  FiType,
  FiPlay,
} from 'react-icons/fi';
import type { ActionStep } from '../types/chatMessage';

interface ExecutionDetailsProps {
  steps: ActionStep[];
  messageId: string;
}

const ExecutionDetails: React.FC<ExecutionDetailsProps> = ({ steps, messageId }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Color definitions - ALL at component top level
  const textColor = useColorModeValue('gray.500', 'gray.500');
  const textHoverColor = useColorModeValue('gray.700', 'gray.300');
  const pillBg = useColorModeValue('gray.100', 'gray.800');
  const pillHoverBg = useColorModeValue('gray.200', 'gray.700');
  const timelineBorderColor = useColorModeValue('gray.200', 'gray.700');
  const successColor = useColorModeValue('green.500', 'green.400');
  const errorColor = useColorModeValue('red.500', 'red.400');
  const stepTextColor = useColorModeValue('gray.600', 'gray.400');
  const durationColor = useColorModeValue('gray.400', 'gray.600');

  // Safety check
  if (!steps || !Array.isArray(steps) || steps.length === 0) {
    return null;
  }
  
  if (!messageId || typeof messageId !== 'string') {
    return null;
  }

  const successCount = steps.filter(s => s && s.status === 'success').length;
  const failureCount = steps.filter(s => s && s.status === 'failure').length;
  const hasErrors = failureCount > 0;

  // Generate summary text
  const summaryText = hasErrors
    ? `${successCount} done, ${failureCount} failed`
    : `${steps.length} step${steps.length !== 1 ? 's' : ''} processed`;

  // Get icon for action type
  const getStepIcon = (action: string) => {
    if (action.includes('click')) return FiMousePointer;
    if (action.includes('setValue') || action.includes('type')) return FiType;
    return FiPlay;
  };

  // Format action for display
  const formatAction = (action: string): string => {
    // Parse action like "click(123)" or "setValue(123, 'text')"
    const clickMatch = action.match(/click\((\d+)\)/);
    if (clickMatch) return `Clicked element #${clickMatch[1]}`;
    
    const setValueMatch = action.match(/setValue\((\d+),\s*['"](.+)['"]\)/);
    if (setValueMatch) {
      const value = setValueMatch[2].length > 15 
        ? setValueMatch[2].substring(0, 15) + '...' 
        : setValueMatch[2];
      return `Typed "${value}"`;
    }
    
    // Return cleaned action
    return action;
  };

  return (
    <Box w="100%">
      {/* Collapsed State: Pill Button */}
      <HStack
        as="button"
        onClick={() => setIsExpanded(!isExpanded)}
        spacing={1.5}
        px={2.5}
        py={1}
        borderRadius="full"
        bg={pillBg}
        color={hasErrors ? errorColor : textColor}
        fontSize="xs"
        fontWeight="medium"
        transition="all 0.15s ease"
        _hover={{ 
          bg: pillHoverBg,
          color: hasErrors ? errorColor : textHoverColor,
        }}
        cursor="pointer"
        border="none"
        outline="none"
        _focus={{ boxShadow: 'none' }}
      >
        <Icon 
          as={isExpanded ? FiChevronDown : FiChevronRight} 
          boxSize={3}
        />
        
        {/* Status Indicator Dot */}
        <Box
          w="6px"
          h="6px"
          borderRadius="full"
          bg={hasErrors ? errorColor : successColor}
        />
        
        <Text>{summaryText}</Text>
      </HStack>

      {/* Expanded State: Vertical Timeline */}
      <Collapse in={isExpanded} animateOpacity>
        <Box 
          mt={2} 
          ml={3}
          pl={3}
          borderLeftWidth="2px"
          borderLeftColor={timelineBorderColor}
          borderLeftStyle="solid"
        >
          <VStack align="stretch" spacing={0} py={1}>
            {steps.map((step, index) => {
              if (!step || !step.id) return null;
              
              const StepIcon = getStepIcon(step.action || '');
              const isSuccess = step.status === 'success';
              const isError = step.status === 'failure' || step.status === 'error';
              const formattedAction = formatAction(step.action || '');
              
              return (
                <HStack
                  key={step.id || `step-${index}`}
                  spacing={2}
                  py={1}
                  w="100%"
                  align="flex-start"
                >
                  {/* Step Icon */}
                  <Icon 
                    as={StepIcon} 
                    boxSize={3} 
                    color={isError ? errorColor : stepTextColor}
                    mt={0.5}
                    flexShrink={0}
                  />
                  
                  {/* Step Description */}
                  <Box flex="1" minW="0">
                    <Text 
                      fontSize="xs" 
                      color={isError ? errorColor : stepTextColor}
                      noOfLines={1}
                    >
                      {formattedAction}
                    </Text>
                    
                    {/* Error message (inline, red text - no box) */}
                    {isError && step.error && (
                      <Text fontSize="xs" color={errorColor} mt={0.5}>
                        {step.error.message || 'Action failed'}
                      </Text>
                    )}
                  </Box>
                  
                  {/* Duration (optional) */}
                  {step.duration && (
                    <Text fontSize="xs" color={durationColor} flexShrink={0}>
                      {step.duration}ms
                    </Text>
                  )}
                  
                  {/* Status Icon */}
                  <Icon 
                    as={isError ? FiX : FiCheck} 
                    boxSize={3} 
                    color={isError ? errorColor : successColor}
                    flexShrink={0}
                  />
                </HStack>
              );
            })}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
};

export default ExecutionDetails;
