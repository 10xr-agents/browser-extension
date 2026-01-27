/**
 * Correction View Debug Component
 * 
 * Displays detailed self-correction information in debug panel.
 * Shows correction strategies, reasons, retry attempts, and step comparisons.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md Part 2 §8.2 (Task 8: Correction Display Component)
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §9 (Self-Correction Architecture)
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  useColorModeValue,
  Code,
  Divider,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import type { CorrectionResult } from '../state/currentTask';

const CorrectionViewDebug: React.FC = () => {
  const correctionHistory = useAppState((state) => state.currentTask.correctionHistory);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const codeBg = useColorModeValue('gray.100', 'gray.700');

  // Don't render if no correction data
  if (!correctionHistory || correctionHistory.length === 0) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
        <Text fontSize="sm" color={textColor}>
          No correction data available. Corrections occur when orchestrator self-corrects after verification failures.
        </Text>
      </Box>
    );
  }

  // Format strategy name for display
  const formatStrategy = (strategy: string): string => {
    return strategy
      .replace(/_/g, ' ')
      .toLowerCase()
      .replace(/\b\w/g, (l) => l.toUpperCase());
  };

  // Get strategy badge color
  const getStrategyColor = (strategy: string): string => {
    if (strategy.includes('ALTERNATIVE_SELECTOR')) return 'blue';
    if (strategy.includes('ALTERNATIVE_TOOL')) return 'purple';
    if (strategy.includes('GATHER_INFORMATION')) return 'cyan';
    if (strategy.includes('UPDATE_PLAN')) return 'yellow';
    if (strategy.includes('RETRY_WITH_DELAY')) return 'orange';
    return 'gray';
  };

  // Format timestamp
  const formatTimestamp = (timestamp: Date): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor} maxH="600px" overflowY="auto">
      <VStack align="stretch" spacing={4}>
        {/* Header */}
        <HStack justify="space-between" align="center">
          <Text fontSize="sm" fontWeight="semibold" color={headingColor}>
            Correction History
          </Text>
          <Badge colorScheme="orange" fontSize="xs">
            {correctionHistory.length} correction{correctionHistory.length !== 1 ? 's' : ''}
          </Badge>
        </HStack>

        <Divider />

        {/* Correction Results */}
        <Accordion allowMultiple defaultIndex={[]}>
          {correctionHistory.map((correction, index) => (
            <AccordionItem key={index}>
              <AccordionButton>
                <HStack flex="1" textAlign="left" spacing={3}>
                  <Badge
                    colorScheme={getStrategyColor(correction.strategy)}
                    fontSize="xs"
                    minW="80px"
                    textAlign="center"
                  >
                    {formatStrategy(correction.strategy)}
                  </Badge>
                  <Text fontSize="xs" fontWeight="medium" color={headingColor} flex="1">
                    Step {typeof correction.stepIndex === 'number' && !isNaN(correction.stepIndex) 
                      ? correction.stepIndex + 1 
                      : 'current'} Correction
                  </Text>
                  <Badge colorScheme="orange" fontSize="xs">
                    Attempt {correction.attemptNumber}
                  </Badge>
                  {index === correctionHistory.length - 1 && (
                    <Badge colorScheme="blue" fontSize="xs">
                      Latest
                    </Badge>
                  )}
                </HStack>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4}>
                <VStack align="stretch" spacing={3} fontSize="xs">
                  {/* Strategy */}
                  <Box>
                    <Text fontWeight="semibold" color={headingColor} mb={1}>
                      Strategy:
                    </Text>
                    <Badge colorScheme={getStrategyColor(correction.strategy)} fontSize="xs">
                      {formatStrategy(correction.strategy)}
                    </Badge>
                  </Box>

                  {/* Reason */}
                  {correction.reason && (
                    <Box>
                      <Text fontWeight="semibold" color={headingColor} mb={1}>
                        Reason:
                      </Text>
                      <Text color={textColor} whiteSpace="pre-wrap">
                        {String(correction.reason)}
                      </Text>
                    </Box>
                  )}

                  {/* Attempt Number */}
                  <Box>
                    <Text fontWeight="semibold" color={headingColor} mb={1}>
                      Retry Attempt:
                    </Text>
                    <Text color={textColor}>
                      Attempt {correction.attemptNumber}
                    </Text>
                  </Box>

                  {/* Original Step */}
                  {correction.originalStep && (
                    <Box>
                      <Text fontWeight="semibold" color={headingColor} mb={1}>
                        Original Step:
                      </Text>
                      <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={codeBg} fontFamily="mono">
                        {String(correction.originalStep)}
                      </Code>
                    </Box>
                  )}

                  {/* Corrected Step */}
                  {correction.correctedStep && (
                    <Box>
                      <Text fontWeight="semibold" color={headingColor} mb={1}>
                        Corrected Step:
                      </Text>
                      <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={codeBg} fontFamily="mono" color="green.600" _dark={{ color: 'green.400' }}>
                        {String(correction.correctedStep)}
                      </Code>
                    </Box>
                  )}

                  {/* Timestamp */}
                  <Box>
                    <Text fontSize="xs" color={descColor}>
                      Corrected at: {formatTimestamp(correction.timestamp)}
                    </Text>
                  </Box>
                </VStack>
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>
      </VStack>
    </Box>
  );
};

export default CorrectionViewDebug;
