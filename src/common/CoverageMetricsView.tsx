/**
 * Coverage Metrics View Component for Thin Client Architecture
 * 
 * Displays accessibility coverage metrics in debug UI.
 * Shows percentage of interactive elements found in accessibility tree,
 * counts of DOM-only and accessibility-only elements, and overlap statistics.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §9.1 (Task 8: Accessibility-First Element Selection)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 5)
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Badge,
  Divider,
  Progress,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  StatGroup,
  Spacer,
  useColorModeValue,
} from '@chakra-ui/react';
import type { CoverageMetrics } from '../helpers/accessibilityFirst';
import CopyButton from './CopyButton';

interface CoverageMetricsViewProps {
  metrics: CoverageMetrics | null;
}

const CoverageMetricsView: React.FC<CoverageMetricsViewProps> = ({ metrics }) => {
  const emptyBg = useColorModeValue('gray.50', 'gray.800');
  const emptyTextColor = useColorModeValue('gray.600', 'gray.300');
  const containerBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const labelColor = useColorModeValue('gray.700', 'gray.300');
  const summaryBg = useColorModeValue('blue.50', 'blue.900/30');
  const summaryBorder = useColorModeValue('blue.200', 'blue.700');
  const summaryText = useColorModeValue('blue.800', 'blue.200');
  const summaryTextSecondary = useColorModeValue('blue.700', 'blue.300');

  if (!metrics) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg={emptyBg} borderColor={borderColor}>
        <Text fontSize="sm" color={emptyTextColor}>
          No coverage metrics available. Using DOM-only approach.
        </Text>
      </Box>
    );
  }

  const coverageColorScheme =
    metrics.axCoverage >= 80 ? 'green' :
    metrics.axCoverage >= 50 ? 'yellow' :
    metrics.axCoverage >= 25 ? 'orange' :
    'red';

  return (
    <Box p={4} borderWidth={1} borderRadius="md" bg={containerBg} borderColor={borderColor}>
      <VStack align="stretch" spacing={4}>
        <HStack>
          <Heading size="sm" color={headingColor}>Interaction Coverage</Heading>
          <Spacer />
          <Badge colorScheme={coverageColorScheme} fontSize="sm" fontWeight="bold">
            {metrics.axCoverage.toFixed(1)}% Coverage
          </Badge>
          <CopyButton text={JSON.stringify(metrics, null, 2)} />
        </HStack>
        <Divider />
        <Text fontSize="xs" color={descColor}>
          Percentage of interactive elements found in accessibility tree.
          Higher coverage indicates better accessibility-first selection.
        </Text>
        
        {/* Coverage Progress Bar */}
        <Box>
          <HStack mb={2}>
            <Text fontSize="xs" fontWeight="bold" color={labelColor}>
              Accessibility Coverage
            </Text>
            <Spacer />
            <Text fontSize="xs" color={descColor}>
              {metrics.axCoverage.toFixed(1)}%
            </Text>
          </HStack>
          <Progress
            value={metrics.axCoverage}
            colorScheme={coverageColorScheme}
            size="sm"
            borderRadius="md"
          />
        </Box>

        {/* Statistics */}
        <StatGroup>
          <Stat>
            <StatLabel fontSize="xs">Total Interactive</StatLabel>
            <StatNumber fontSize="md">{metrics.totalInteractive}</StatNumber>
            <StatHelpText fontSize="xs">Total interactive elements</StatHelpText>
          </Stat>
          <Stat>
            <StatLabel fontSize="xs">Accessibility Nodes</StatLabel>
            <StatNumber fontSize="md">{metrics.totalAXNodes}</StatNumber>
            <StatHelpText fontSize="xs">Filtered accessibility nodes</StatHelpText>
          </Stat>
        </StatGroup>

        <Divider />

        {/* Breakdown */}
        <VStack align="stretch" spacing={2}>
          <HStack>
            <Badge colorScheme="green" fontSize="xs">
              Overlap
            </Badge>
            <Text fontSize="sm" flex="1">
              Elements found in both accessibility tree and DOM
            </Text>
            <Badge colorScheme="green" fontSize="sm" fontWeight="bold">
              {metrics.overlap}
            </Badge>
          </HStack>
          <HStack>
            <Badge colorScheme="blue" fontSize="xs">
              Accessibility-Only
            </Badge>
            <Text fontSize="sm" flex="1">
              Elements found only in accessibility tree
            </Text>
            <Badge colorScheme="blue" fontSize="sm" fontWeight="bold">
              {metrics.axOnlyElements}
            </Badge>
          </HStack>
          <HStack>
            <Badge colorScheme="gray" fontSize="xs">
              DOM-Only
            </Badge>
            <Text fontSize="sm" flex="1">
              Elements found only in DOM (supplemented)
            </Text>
            <Badge colorScheme="gray" fontSize="sm" fontWeight="bold">
              {metrics.domOnlyElements}
            </Badge>
          </HStack>
        </VStack>

        {/* Summary */}
        <Box p={3} bg={summaryBg} borderRadius="md" borderWidth={1} borderColor={summaryBorder}>
          <Text fontSize="xs" color={summaryText} fontWeight="medium" mb={1}>
            Selection Strategy:
          </Text>
          <Text fontSize="xs" color={summaryTextSecondary}>
            {metrics.axCoverage >= 50
              ? `✓ Accessibility-first approach working well. ${metrics.axCoverage.toFixed(1)}% of interactive elements found in accessibility tree.`
              : metrics.axCoverage > 0
              ? `⚠ Accessibility coverage is ${metrics.axCoverage.toFixed(1)}%. DOM supplementation is filling ${metrics.domOnlyElements} missing elements.`
              : `✗ No accessibility coverage. Using DOM-only approach with ${metrics.domOnlyElements} elements.`}
          </Text>
        </Box>
      </VStack>
    </Box>
  );
};

export default CoverageMetricsView;
