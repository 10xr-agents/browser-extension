/**
 * Verification View Debug Component
 * 
 * Displays detailed verification results in debug panel.
 * Shows confidence scores, expected vs actual state, and verification history.
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §7.2 (Task 7: Verification Display Component)
 * Reference: MANUS_ORCHESTRATOR_ARCHITECTURE.md §6.4 (Verification Result Model)
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
  Progress,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import type { VerificationResult } from '../state/currentTask';

const VerificationViewDebug: React.FC = () => {
  const verificationHistory = useAppState((state) => state.currentTask.verificationHistory);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const codeBg = useColorModeValue('gray.100', 'gray.700');
  const progressBg = useColorModeValue('gray.200', 'gray.700');

  // Don't render if no verification data
  if (!verificationHistory || verificationHistory.length === 0) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
        <Text fontSize="sm" color={textColor}>
          No verification data available. Verification occurs when orchestrator verifies previous step.
        </Text>
      </Box>
    );
  }

  // Get status badge color
  const getStatusColor = (success: boolean): string => {
    return success ? 'green' : 'red';
  };

  // Get confidence color
  const getConfidenceColor = (confidence: number): string => {
    if (confidence >= 0.8) return 'green';
    if (confidence >= 0.5) return 'yellow';
    return 'red';
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
            Verification History
          </Text>
          <Badge colorScheme="blue" fontSize="xs">
            {verificationHistory.length} verification{verificationHistory.length !== 1 ? 's' : ''}
          </Badge>
        </HStack>

        <Divider />

        {/* Verification Results */}
        <Accordion allowMultiple defaultIndex={[]}>
          {verificationHistory.map((verification, index) => (
            <AccordionItem key={index}>
              <AccordionButton>
                <HStack flex="1" textAlign="left" spacing={3}>
                  <Badge
                    colorScheme={getStatusColor(verification.success)}
                    fontSize="xs"
                    minW="60px"
                    textAlign="center"
                  >
                    {verification.success ? 'Success' : 'Failed'}
                  </Badge>
                  <Text fontSize="xs" fontWeight="medium" color={headingColor} flex="1">
                    Step {verification.stepIndex + 1} Verification
                  </Text>
                  <Badge colorScheme={getConfidenceColor(verification.confidence)} fontSize="xs">
                    {(verification.confidence * 100).toFixed(0)}%
                  </Badge>
                  {index === verificationHistory.length - 1 && (
                    <Badge colorScheme="blue" fontSize="xs">
                      Latest
                    </Badge>
                  )}
                </HStack>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4}>
                <VStack align="stretch" spacing={3} fontSize="xs">
                  {/* Confidence Score */}
                  <Box>
                    <HStack mb={1} justify="space-between">
                      <Text fontWeight="semibold" color={headingColor}>
                        Confidence Score:
                      </Text>
                      <Text color={textColor}>
                        {(verification.confidence * 100).toFixed(1)}%
                      </Text>
                    </HStack>
                    <Progress
                      value={verification.confidence * 100}
                      colorScheme={getConfidenceColor(verification.confidence)}
                      size="sm"
                      borderRadius="full"
                      bg={progressBg}
                    />
                  </Box>

                  {/* Reason */}
                  {verification.reason && (
                    <Box>
                      <Text fontWeight="semibold" color={headingColor} mb={1}>
                        Reason:
                      </Text>
                      <Text color={textColor} whiteSpace="pre-wrap">
                        {String(verification.reason)}
                      </Text>
                    </Box>
                  )}

                  {/* Expected State */}
                  {verification.expectedState && (
                    <Box>
                      <Text fontWeight="semibold" color={headingColor} mb={1}>
                        Expected State:
                      </Text>
                      <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={codeBg} fontFamily="mono">
                        {String(verification.expectedState)}
                      </Code>
                    </Box>
                  )}

                  {/* Actual State */}
                  {verification.actualState && (
                    <Box>
                      <Text fontWeight="semibold" color={headingColor} mb={1}>
                        Actual State:
                      </Text>
                      <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={codeBg} fontFamily="mono">
                        {String(verification.actualState)}
                      </Code>
                    </Box>
                  )}

                  {/* Timestamp */}
                  <Box>
                    <Text fontSize="xs" color={descColor}>
                      Verified at: {formatTimestamp(verification.timestamp)}
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

export default VerificationViewDebug;
