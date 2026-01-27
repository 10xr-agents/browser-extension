/**
 * ThoughtChain Component
 * 
 * Collapsible component that groups technical execution details (RAG checks, DOM scanning, retries, etc.)
 * into a single, compact accordion item. Defaults to collapsed to keep the UI clean.
 * 
 * Reference: UX Refactor - User-Centric Chat Design
 */

import React from 'react';
import {
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Box,
  Text,
  VStack,
  HStack,
  Code,
  useColorModeValue,
  Spinner,
} from '@chakra-ui/react';

interface ThoughtChainProps {
  children: React.ReactNode;
  isProcessing?: boolean;
}

const ThoughtChain: React.FC<ThoughtChainProps> = ({ children, isProcessing = false }) => {
  const textColor = useColorModeValue('gray.500', 'gray.400');
  const bgColor = useColorModeValue('gray.50', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const codeBg = useColorModeValue('gray.100', 'gray.700');
  const codeText = useColorModeValue('gray.700', 'gray.300');

  return (
    <Accordion allowToggle defaultIndex={[]} w="100%">
      <AccordionItem border="none" bg="transparent">
        <AccordionButton
          px={2}
          py={1.5}
          _hover={{ bg: 'transparent' }}
          _focus={{ boxShadow: 'none' }}
        >
          <HStack spacing={2} flex="1" justify="flex-start">
            {isProcessing && (
              <Spinner size="xs" color={textColor} />
            )}
            <Text fontSize="xs" color={textColor} fontWeight="medium">
              {isProcessing ? 'Thinking...' : 'Process details'}
            </Text>
          </HStack>
          <AccordionIcon color={textColor} />
        </AccordionButton>
        <AccordionPanel px={2} pb={2} pt={0}>
          <Box
            bg={bgColor}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="md"
            p={3}
          >
            <VStack align="stretch" spacing={2}>
              {React.Children.map(children, (child, index) => {
                // If child is a string, wrap it in Code block
                if (typeof child === 'string') {
                  return (
                    <Code
                      key={index}
                      fontSize="xs"
                      bg={codeBg}
                      color={codeText}
                      px={2}
                      py={1}
                      borderRadius="sm"
                      whiteSpace="pre-wrap"
                      display="block"
                    >
                      {child}
                    </Code>
                  );
                }
                return <Box key={index}>{child}</Box>;
              })}
            </VStack>
          </Box>
        </AccordionPanel>
      </AccordionItem>
    </Accordion>
  );
};

export default ThoughtChain;
