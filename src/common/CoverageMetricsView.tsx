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
} from '@chakra-ui/react';
import type { CoverageMetrics } from '../helpers/accessibilityFirst';
import CopyButton from './CopyButton';

interface CoverageMetricsViewProps {
  metrics: CoverageMetrics | null;
}

const CoverageMetricsView: React.FC<CoverageMetricsViewProps> = ({ metrics }) => {
  if (!metrics) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg="gray.50">
        <Text fontSize="sm" color="gray.600">
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
    <Box p={4} borderWidth={1} borderRadius="md" bg="white">
      <VStack align="stretch" spacing={4}>
        <HStack>
          <Heading size="sm">Accessibility Coverage Metrics</Heading>
          <Spacer />
          <Badge colorScheme={coverageColorScheme} fontSize="sm" fontWeight="bold">
            {metrics.axCoverage.toFixed(1)}% Coverage
          </Badge>
          <CopyButton text={JSON.stringify(metrics, null, 2)} />
        </HStack>
        <Divider />
        <Text fontSize="xs" color="gray.600">
          Percentage of interactive elements found in accessibility tree.
          Higher coverage indicates better accessibility-first selection.
        </Text>
        
        {/* Coverage Progress Bar */}
        <Box>
          <HStack mb={2}>
            <Text fontSize="xs" fontWeight="bold" color="gray.700">
              Accessibility Coverage
            </Text>
            <Spacer />
            <Text fontSize="xs" color="gray.600">
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
        <Box p={3} bg="blue.50" borderRadius="md" borderWidth={1} borderColor="blue.200">
          <Text fontSize="xs" color="blue.800" fontWeight="medium" mb={1}>
            Selection Strategy:
          </Text>
          <Text fontSize="xs" color="blue.700">
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
