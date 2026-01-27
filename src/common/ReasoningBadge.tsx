/**
 * ReasoningBadge Component (Cursor/Manus Style)
 * 
 * Minimal inline indicator for reasoning source.
 * Uses subtle text and small icons instead of colored badges.
 * 
 * Reference: Cursor/Manus minimalist design aesthetic
 */

import React from 'react';
import {
  HStack,
  Text,
  Tooltip,
  useColorModeValue,
  VStack,
  Box,
  Icon,
} from '@chakra-ui/react';
import { FiDatabase, FiFileText, FiSearch, FiHelpCircle } from 'react-icons/fi';
import EvidenceIndicator from './EvidenceIndicator';
import type { ReasoningEvidence } from '../api/client';

interface ReasoningBadgeProps {
  source: 'MEMORY' | 'PAGE' | 'WEB_SEARCH' | 'ASK_USER';
  confidence?: number;
  reasoning?: string;
  evidence?: ReasoningEvidence;
  searchIteration?: {
    attempt: number;
    maxAttempts: number;
    refinedQuery?: string;
    evaluationResult?: {
      solved: boolean;
      shouldRetry: boolean;
      shouldAskUser: boolean;
      confidence: number;
    };
  };
}

const ReasoningBadge: React.FC<ReasoningBadgeProps> = ({ 
  source, 
  confidence, 
  reasoning,
  evidence,
  searchIteration,
}) => {
  // Color definitions - ALL at component top level
  const textColor = useColorModeValue('gray.500', 'gray.500');
  const iconColor = useColorModeValue('gray.400', 'gray.600');
  const highConfidenceColor = useColorModeValue('green.500', 'green.400');
  const medConfidenceColor = useColorModeValue('yellow.600', 'yellow.400');
  const lowConfidenceColor = useColorModeValue('red.500', 'red.400');
  const tooltipBg = useColorModeValue('gray.800', 'gray.200');
  const tooltipColor = useColorModeValue('gray.100', 'gray.800');

  // Get source config
  const getSourceConfig = () => {
    switch (source) {
      case 'MEMORY':
        return { label: 'Memory', icon: FiDatabase };
      case 'PAGE':
        return { label: 'Page', icon: FiFileText };
      case 'WEB_SEARCH':
        return { label: 'Search', icon: FiSearch };
      case 'ASK_USER':
        return { label: 'Input needed', icon: FiHelpCircle };
      default:
        return { label: 'Unknown', icon: FiDatabase };
    }
  };

  const config = getSourceConfig();
  const confidencePercent = typeof confidence === 'number' && !isNaN(confidence)
    ? Math.round(confidence * 100)
    : null;

  // Get confidence color
  const getConfidenceColor = () => {
    if (confidencePercent === null) return textColor;
    if (confidencePercent >= 90) return highConfidenceColor;
    if (confidencePercent >= 70) return medConfidenceColor;
    return lowConfidenceColor;
  };

  // Build tooltip content
  const buildTooltipContent = () => {
    const parts: React.ReactNode[] = [];
    
    if (reasoning && typeof reasoning === 'string' && reasoning.trim().length > 0) {
      parts.push(
        <Text key="reasoning" fontSize="xs" mb={evidence ? 2 : 0}>
          {reasoning}
        </Text>
      );
    }
    
    if (evidence) {
      parts.push(
        <Box key="evidence" mb={searchIteration?.evaluationResult ? 2 : 0}>
          <EvidenceIndicator evidence={evidence} compact />
        </Box>
      );
    }
    
    if (searchIteration?.evaluationResult) {
      const evalResult = searchIteration.evaluationResult;
      parts.push(
        <Box key="evaluation">
          <Text fontSize="xs" fontWeight="medium" mb={0.5}>
            Search: {evalResult.solved ? 'Resolved' : 'Searching'}
          </Text>
          {searchIteration.refinedQuery && (
            <Text fontSize="xs" opacity={0.8}>
              Query: {searchIteration.refinedQuery}
            </Text>
          )}
        </Box>
      );
    }
    
    return parts.length > 0 ? (
      <VStack align="stretch" spacing={1} maxW="280px">
        {parts}
      </VStack>
    ) : null;
  };

  const tooltipContent = buildTooltipContent();

  // Minimal inline content
  const inlineContent = (
    <HStack 
      spacing={1} 
      color={textColor} 
      fontSize="xs"
      cursor={tooltipContent ? 'help' : 'default'}
    >
      <Icon as={config.icon} boxSize={3} color={iconColor} />
      <Text fontWeight="medium">{config.label}</Text>
      {confidencePercent !== null && (
        <>
          <Text color={textColor}>•</Text>
          <Text color={getConfidenceColor()} fontWeight="medium">
            {confidencePercent}%
          </Text>
        </>
      )}
      {searchIteration && source === 'WEB_SEARCH' && (
        <Text opacity={0.7}>
          ({searchIteration.attempt}/{searchIteration.maxAttempts})
        </Text>
      )}
    </HStack>
  );

  if (tooltipContent) {
    return (
      <Tooltip
        label={tooltipContent}
        placement="top"
        hasArrow
        openDelay={300}
        bg={tooltipBg}
        color={tooltipColor}
      >
        {inlineContent}
      </Tooltip>
    );
  }

  return inlineContent;
};

export default ReasoningBadge;
