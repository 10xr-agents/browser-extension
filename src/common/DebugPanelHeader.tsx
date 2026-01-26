/**
 * Debug Panel Header Component for Thin Client Architecture
 * 
 * Compact header showing health signals when Debug Panel is collapsed.
 * Clickable to expand/collapse the panel.
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §2.3 (Task 2: Compact Headers)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §3.3 (Compact Headers)
 */

import React, { useMemo } from 'react';
import {
  Box,
  HStack,
  Badge,
  IconButton,
  Tooltip,
  useColorModeValue,
  Text,
  Button,
} from '@chakra-ui/react';
import { ChevronUpIcon, ChevronDownIcon, DownloadIcon } from '@chakra-ui/icons';
import { useAppState } from '../state/store';
import { exportDebugSession } from '../helpers/exportDebugSession';
import { useToast } from '@chakra-ui/react';

interface DebugPanelHeaderProps {
  isExpanded: boolean;
  onToggle: () => void;
}

const DebugPanelHeader: React.FC<DebugPanelHeaderProps> = ({
  isExpanded,
  onToggle,
}) => {
  const toast = useToast();
  // Get data for health signals from store
  const coverageMetrics = useAppState((state) => state.currentTask.coverageMetrics);
  const displayHistory = useAppState((state) => state.currentTask.displayHistory);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const hasOrgKnowledge = useAppState((state) => state.currentTask.hasOrgKnowledge);

  // Calculate health signals from real data
  const healthSignals = useMemo(() => {
    // Coverage Percentage
    const coverage = coverageMetrics?.axCoverage ?? null;
    const coverageDisplay = coverage !== null ? `${coverage.toFixed(0)}% Coverage` : null;

    // Token Usage - sum all tokens from history entries
    const totalTokens = displayHistory.reduce((sum, entry) => {
      const promptTokens = entry.usage?.promptTokens || 0;
      const completionTokens = entry.usage?.completionTokens || 0;
      return sum + promptTokens + completionTokens;
    }, 0);
    const tokenDisplay = totalTokens > 0 ? `${totalTokens.toLocaleString()} Tokens` : null;

    // Status Indicator
    const statusDisplay = taskStatus === 'running' ? 'Running' :
                         taskStatus === 'success' ? 'Complete' :
                         taskStatus === 'error' ? 'Error' :
                         taskStatus === 'interrupted' ? 'Interrupted' :
                         'Idle';

    // Action Count
    const actionCount = displayHistory.length;
    const actionDisplay = actionCount > 0 ? `${actionCount} Actions` : null;

    // RAG Mode (prepared for Task 3, but can show if data available)
    const ragModeDisplay = hasOrgKnowledge === true ? 'Org RAG' :
                          hasOrgKnowledge === false ? 'Public Only' :
                          null;

    return {
      coverage: coverageDisplay,
      tokens: tokenDisplay,
      status: statusDisplay,
      statusValue: taskStatus,
      actions: actionDisplay,
      ragMode: ragModeDisplay,
    };
  }, [coverageMetrics, displayHistory, taskStatus, hasOrgKnowledge]);

  // Terminal aesthetic: slightly darker header to match panel theme
  const headerBg = useColorModeValue('gray.200', 'gray.900');
  const borderColor = useColorModeValue('gray.300', 'gray.800');
  const textColor = useColorModeValue('gray.700', 'gray.300');

  // Status color scheme
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'running':
        return 'blue';
      case 'success':
        return 'green';
      case 'error':
        return 'red';
      case 'interrupted':
        return 'orange';
      default:
        return 'gray';
    }
  };

  // Coverage color scheme
  const getCoverageColor = (coverage: number | null) => {
    if (coverage === null) return 'gray';
    if (coverage >= 80) return 'green';
    if (coverage >= 50) return 'yellow';
    if (coverage >= 25) return 'orange';
    return 'red';
  };

  return (
    <Box
      w="100%"
      borderTopWidth="1px"
      borderColor={borderColor}
      bg={headerBg}
      px={3}
      py={2}
      minH="40px"
      cursor="pointer"
      onClick={onToggle}
      _hover={{ bg: useColorModeValue('gray.200', 'gray.700') }}
      transition="background-color 0.2s"
    >
      <HStack spacing={3} justify="space-between" align="center">
        <HStack spacing={2} flex="1" overflowX="auto">
          {/* Status Indicator */}
          <Tooltip label={`Task Status: ${healthSignals.status}`}>
            <Badge
              colorScheme={getStatusColor(healthSignals.statusValue)}
              fontSize="xs"
              px={2}
              py={1}
            >
              {healthSignals.status}
            </Badge>
          </Tooltip>

          {/* Coverage Percentage */}
          {healthSignals.coverage && coverageMetrics && (
            <Tooltip label={`Accessibility Coverage: ${coverageMetrics.axCoverage.toFixed(1)}%`}>
              <Badge
                colorScheme={getCoverageColor(coverageMetrics.axCoverage)}
                fontSize="xs"
                px={2}
                py={1}
              >
                {healthSignals.coverage}
              </Badge>
            </Tooltip>
          )}

          {/* Token Usage */}
          {healthSignals.tokens && (
            <Tooltip label={`Total tokens used across all actions`}>
              <Badge colorScheme="purple" fontSize="xs" px={2} py={1}>
                {healthSignals.tokens}
              </Badge>
            </Tooltip>
          )}

          {/* Action Count */}
          {healthSignals.actions && (
            <Tooltip label={`Number of actions executed`}>
              <Badge colorScheme="blue" fontSize="xs" px={2} py={1}>
                {healthSignals.actions}
              </Badge>
            </Tooltip>
          )}

          {/* RAG Mode */}
          {healthSignals.ragMode && (
            <Tooltip label={`RAG Mode: ${healthSignals.ragMode === 'Org RAG' ? 'Organization-specific knowledge' : 'Public knowledge only'}`}>
              <Badge
                colorScheme={healthSignals.ragMode === 'Org RAG' ? 'green' : 'yellow'}
                fontSize="xs"
                px={2}
                py={1}
              >
                {healthSignals.ragMode}
              </Badge>
            </Tooltip>
          )}

          {/* Show message if no signals available */}
          {!healthSignals.coverage &&
           !healthSignals.tokens &&
           !healthSignals.actions &&
           healthSignals.statusValue === 'idle' && (
            <Text fontSize="xs" color={textColor}>
              No debug data available
            </Text>
          )}
        </HStack>

        {/* Export Button */}
        <Button
          size="sm"
          leftIcon={<DownloadIcon />}
          onClick={async (e) => {
            e.stopPropagation();
            try {
              const state = useAppState.getState();
              const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
              exportDebugSession(state, tab?.url || null);
              toast({
                title: 'Debug session exported',
                description: 'Debug session data has been downloaded as JSON.',
                status: 'success',
                duration: 3000,
                isClosable: true,
              });
            } catch (error) {
              toast({
                title: 'Export failed',
                description: error instanceof Error ? error.message : 'Failed to export debug session',
                status: 'error',
                duration: 5000,
                isClosable: true,
              });
            }
          }}
        >
          Export
        </Button>

        {/* Toggle Button */}
        <IconButton
          aria-label={isExpanded ? 'Collapse Debug Panel' : 'Expand Debug Panel'}
          icon={isExpanded ? <ChevronDownIcon /> : <ChevronUpIcon />}
          size="sm"
          variant="ghost"
          onClick={(e) => {
            e.stopPropagation();
            onToggle();
          }}
        />
      </HStack>
    </Box>
  );
};

export default DebugPanelHeader;
