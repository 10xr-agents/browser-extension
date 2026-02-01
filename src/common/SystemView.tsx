/**
 * System View Component - Redesigned for Thin Client Architecture
 * 
 * Dedicated "Debug" view with streamlined health indicators and tabbed debug panel.
 * Only visible when developer mode is enabled.
 * 
 * Reference: Thin Client Architecture, User request for debug view redesign
 */

import React from 'react';
import {
  Box,
  Flex,
  Heading,
  SimpleGrid,
  useColorModeValue,
  Text,
  Badge,
  Button,
  HStack,
  IconButton,
  Icon,
  Tooltip,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
} from '@chakra-ui/react';
import { DownloadIcon } from '@chakra-ui/icons';
import { FiArrowLeft, FiWifi, FiWifiOff, FiZap, FiMessageSquare, FiActivity } from 'react-icons/fi';
import { useAppState } from '../state/store';
import DebugPanel from './DebugPanel';
import { ConnectionStatusBadge } from './ConnectionStatusBadge';
import { exportDebugSession } from '../helpers/exportDebugSession';
import ErrorBoundary from './ErrorBoundary';

interface SystemViewProps {
  onBackToChat?: () => void;
}

const SystemView: React.FC<SystemViewProps> = ({ onBackToChat }) => {
  const developerMode = useAppState((state) => state.settings.developerMode);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const displayHistory = useAppState((state) => state.currentTask.displayHistory);
  const messagesCount = useAppState((state) => state.currentTask.messages.length);
  const networkLogs = useAppState((state) => state.debug.networkLogs);
  const wsConnectionState = useAppState((state) => state.currentTask.wsConnectionState);

  // Dark mode colors - ALL at component top level
  const bgColor = useColorModeValue('white', 'gray.900');
  const cardBg = useColorModeValue('gray.50', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const backButtonColor = useColorModeValue('gray.700', 'gray.300');
  const backButtonHoverBg = useColorModeValue('gray.100', 'gray.700');

  // Calculate health signals
  const apiStatus = networkLogs.length > 0 
    ? networkLogs[networkLogs.length - 1].error 
      ? 'Error' 
      : 'Online'
    : 'Unknown';
  
  const lastApiStatus = networkLogs.length > 0 
    ? networkLogs[networkLogs.length - 1].response?.status || null
    : null;

  const totalTokens = displayHistory.reduce((sum, entry) => {
    const promptTokens = entry.usage?.promptTokens || 0;
    const completionTokens = entry.usage?.completionTokens || 0;
    return sum + promptTokens + completionTokens;
  }, 0);

  const handleExport = async () => {
    try {
      const state = useAppState.getState();
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      exportDebugSession(state, tab?.url || null);
    } catch (error) {
      console.error('Failed to export debug session:', error);
    }
  };

  // Don't render if developer mode is off
  if (!developerMode) {
    return (
      <Box p={4} bg={bgColor} minH="100%">
        <Text color={textColor} fontSize="sm">
          Developer mode is disabled. Enable it in Settings to view debug information.
        </Text>
      </Box>
    );
  }

  return (
    <Flex direction="column" h="100%" minH="0" w="100%" overflow="hidden" bg={bgColor}>
      {/* Compact Header with Health Indicators */}
      <Box
        flex="none"
        bg={cardBg}
        borderBottomWidth="1px"
        borderColor={borderColor}
        px={3}
        py={2}
      >
        <HStack justify="space-between" align="center">
          <HStack spacing={2} align="center">
            {/* Back to Chat Button */}
            {onBackToChat && (
              <Tooltip label="Back to Chat" placement="bottom" openDelay={500}>
                <IconButton
                  aria-label="Back to Chat"
                  icon={<Icon as={FiArrowLeft} />}
                  size="sm"
                  variant="ghost"
                  onClick={onBackToChat}
                  color={backButtonColor}
                  _hover={{
                    bg: backButtonHoverBg,
                  }}
                />
              </Tooltip>
            )}
            <Heading size="sm" color={headingColor}>
              Debug
            </Heading>
          </HStack>

          {/* Quick Stats */}
          <HStack spacing={3}>
            {/* Connection Status */}
            <Tooltip label="WebSocket Connection">
              <HStack spacing={1}>
                <Icon 
                  as={wsConnectionState === 'connected' ? FiWifi : FiWifiOff} 
                  boxSize={3.5} 
                  color={
                    wsConnectionState === 'connected' ? 'green.500' : 
                    wsConnectionState === 'fallback' ? 'orange.500' : 'gray.500'
                  }
                />
                <Badge 
                  colorScheme={
                    wsConnectionState === 'connected' ? 'green' : 
                    wsConnectionState === 'fallback' ? 'orange' : 'gray'
                  } 
                  fontSize="xs"
                >
                  {wsConnectionState || 'offline'}
                </Badge>
              </HStack>
            </Tooltip>

            {/* API Status */}
            <Tooltip label="API Status">
              <Badge
                colorScheme={apiStatus === 'Online' && lastApiStatus === 200 ? 'green' : 'red'}
                fontSize="xs"
              >
                {apiStatus} {lastApiStatus ? `(${lastApiStatus})` : ''}
              </Badge>
            </Tooltip>

            {/* Actions Count */}
            <Tooltip label="Actions Executed">
              <HStack spacing={1}>
                <Icon as={FiZap} boxSize={3.5} color={descColor} />
                <Text fontSize="xs" color={descColor}>{displayHistory.length}</Text>
              </HStack>
            </Tooltip>

            {/* Messages Count */}
            <Tooltip label="Messages">
              <HStack spacing={1}>
                <Icon as={FiMessageSquare} boxSize={3.5} color={descColor} />
                <Text fontSize="xs" color={descColor}>{messagesCount}</Text>
              </HStack>
            </Tooltip>

            {/* Export Button */}
            <Tooltip label="Export Debug Session">
              <IconButton
                aria-label="Export debug session"
                icon={<DownloadIcon />}
                size="xs"
                variant="outline"
                onClick={handleExport}
              />
            </Tooltip>
          </HStack>
        </HStack>
      </Box>

      {/* Debug Panel Content */}
      <Box flex="1" overflow="hidden" minW="0" bg={bgColor} display="flex" flexDirection="column">
        <ErrorBoundary>
          <Box px={3} py={3} h="100%" display="flex" flexDirection="column" overflow="hidden">
            <DebugPanel />
          </Box>
        </ErrorBoundary>
      </Box>
    </Flex>
  );
};

export default SystemView;
