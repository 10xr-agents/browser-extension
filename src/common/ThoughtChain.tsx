/**
 * ThoughtChain Component (Cursor/Manus Style)
 * 
 * Vertical Timeline for process steps - minimal, professional design.
 * Collapsed: Small pill button "Processed N steps"
 * Expanded: Thin left border timeline with inline step items
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
  useColorModeValue,
  Icon,
} from '@chakra-ui/react';
import { FiChevronDown, FiChevronRight, FiLoader } from 'react-icons/fi';

interface ThoughtChainProps {
  children: React.ReactNode;
  isProcessing?: boolean;
  stepCount?: number;
  title?: string;
}

const ThoughtChain: React.FC<ThoughtChainProps> = ({ 
  children, 
  isProcessing = false,
  stepCount,
  title = 'Process details',
}) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Color definitions - ALL at component top level
  const textColor = useColorModeValue('gray.500', 'gray.500');
  const textHoverColor = useColorModeValue('gray.700', 'gray.300');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const pillBg = useColorModeValue('gray.100', 'gray.800');
  const pillHoverBg = useColorModeValue('gray.200', 'gray.700');
  const timelineBorderColor = useColorModeValue('gray.200', 'gray.700');
  const processingColor = useColorModeValue('blue.500', 'blue.400');

  // Count children if stepCount not provided
  const childArray = React.Children.toArray(children);
  const count = stepCount ?? childArray.length;
  
  // Generate button text
  const buttonText = isProcessing 
    ? 'Processing...' 
    : count > 0 
      ? `${count} step${count !== 1 ? 's' : ''} processed`
      : title;

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
        color={textColor}
        fontSize="xs"
        fontWeight="medium"
        transition="all 0.15s ease"
        _hover={{ 
          bg: pillHoverBg,
          color: textHoverColor,
        }}
        cursor="pointer"
        border="none"
        outline="none"
        _focus={{ boxShadow: 'none' }}
      >
        {/* Expand/Collapse Icon */}
        <Icon 
          as={isExpanded ? FiChevronDown : FiChevronRight} 
          boxSize={3}
          color={isProcessing ? processingColor : 'currentColor'}
        />
        
        {/* Processing Spinner or Text */}
        {isProcessing && (
          <Icon
            as={FiLoader}
            boxSize={3}
            color={processingColor}
            className="spin"
            sx={{
              animation: 'spin 1s linear infinite',
              '@keyframes spin': {
                '0%': { transform: 'rotate(0deg)' },
                '100%': { transform: 'rotate(360deg)' },
              },
            }}
          />
        )}
        
        <Text>{buttonText}</Text>
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
          <VStack align="stretch" spacing={0.5} py={1}>
            {React.Children.map(children, (child, index) => {
              // If child is a string, render it as a timeline item
              if (typeof child === 'string') {
                return (
                  <Text
                    key={index}
                    fontSize="xs"
                    color={textColor}
                    py={0.5}
                    lineHeight="1.5"
                  >
                    {child}
                  </Text>
                );
              }
              // Otherwise render the child as-is (e.g., ActionCard, custom components)
              return (
                <Box key={index} py={0.5}>
                  {child}
                </Box>
              );
            })}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
};

export default ThoughtChain;
