/**
 * EvidenceIndicator Component (Cursor/Manus Style)
 * 
 * Minimal inline indicator for evidence quality.
 * Uses subtle text and small dots instead of colored badges.
 * 
 * Reference: Cursor/Manus minimalist design aesthetic
 */

import React from 'react';
import {
  HStack,
  VStack,
  Text,
  Tooltip,
  useColorModeValue,
  Box,
  Icon,
} from '@chakra-ui/react';
import { FiCheck, FiAlertCircle, FiXCircle } from 'react-icons/fi';
import type { ReasoningEvidence } from '../api/client';

interface EvidenceIndicatorProps {
  evidence: ReasoningEvidence;
  compact?: boolean;
}

const EvidenceIndicator: React.FC<EvidenceIndicatorProps> = ({ evidence, compact = false }) => {
  // Color definitions - ALL at component top level
  const textColor = useColorModeValue('gray.500', 'gray.500');
  const highColor = useColorModeValue('green.500', 'green.400');
  const mediumColor = useColorModeValue('yellow.600', 'yellow.500');
  const lowColor = useColorModeValue('red.500', 'red.400');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const tooltipBg = useColorModeValue('gray.800', 'gray.200');
  const tooltipColor = useColorModeValue('gray.100', 'gray.800');

  // Get quality config
  const getQualityConfig = () => {
    switch (evidence.quality) {
      case 'high':
        return { label: 'High', icon: FiCheck, color: highColor };
      case 'medium':
        return { label: 'Medium', icon: FiAlertCircle, color: mediumColor };
      case 'low':
        return { label: 'Low', icon: FiXCircle, color: lowColor };
      default:
        return { label: 'Unknown', icon: FiCheck, color: textColor };
    }
  };

  const config = getQualityConfig();
  const sources = Array.isArray(evidence.sources) ? evidence.sources : [];
  const gaps = Array.isArray(evidence.gaps) ? evidence.gaps : [];

  // Compact: Just show quality with tooltip
  if (compact) {
    const tooltipContent = (
      <VStack align="stretch" spacing={1.5} maxW="240px">
        <HStack spacing={1}>
          <Icon as={config.icon} boxSize={3} color={config.color} />
          <Text fontSize="xs" fontWeight="medium">
            Evidence: {config.label}
          </Text>
        </HStack>
        
        {sources.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="medium" mb={0.5}>
              Sources:
            </Text>
            {sources.slice(0, 3).map((source, idx) => (
              <Text key={idx} fontSize="xs" opacity={0.9}>
                • {typeof source === 'string' ? source : String(source)}
              </Text>
            ))}
            {sources.length > 3 && (
              <Text fontSize="xs" opacity={0.7}>
                +{sources.length - 3} more
              </Text>
            )}
          </Box>
        )}
        
        {gaps.length > 0 && (
          <Box>
            <Text fontSize="xs" fontWeight="medium" mb={0.5}>
              Gaps:
            </Text>
            {gaps.slice(0, 2).map((gap, idx) => (
              <Text key={idx} fontSize="xs" opacity={0.9}>
                • {typeof gap === 'string' ? gap : String(gap)}
              </Text>
            ))}
          </Box>
        )}
      </VStack>
    );

    return (
      <Tooltip
        label={tooltipContent}
        placement="top"
        hasArrow
        openDelay={300}
        bg={tooltipBg}
        color={tooltipColor}
      >
        <HStack spacing={1} cursor="help">
          <Box
            w="6px"
            h="6px"
            borderRadius="full"
            bg={config.color}
          />
          <Text fontSize="xs" color={textColor}>
            {config.label} evidence
          </Text>
        </HStack>
      </Tooltip>
    );
  }

  // Full version (minimal)
  return (
    <VStack align="stretch" spacing={1.5} w="100%">
      {/* Quality */}
      <HStack spacing={1.5}>
        <Icon as={config.icon} boxSize={3} color={config.color} />
        <Text fontSize="xs" color={textColor}>
          <Text as="span" fontWeight="medium">{config.label}</Text> evidence quality
        </Text>
      </HStack>

      {/* Sources (inline) */}
      {sources.length > 0 && (
        <Text fontSize="xs" color={descColor}>
          Sources: {sources.map((s, i) => 
            typeof s === 'string' ? s : String(s)
          ).join(', ')}
        </Text>
      )}

      {/* Gaps (inline) */}
      {gaps.length > 0 && (
        <Text fontSize="xs" color={descColor} fontStyle="italic">
          Gaps: {gaps.map((g, i) => 
            typeof g === 'string' ? g : String(g)
          ).join(', ')}
        </Text>
      )}
    </VStack>
  );
};

export default EvidenceIndicator;
