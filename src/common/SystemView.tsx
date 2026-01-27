/**
 * System View Component for Thin Client Architecture
 * 
 * Dedicated "System" tab containing all debug and technical information.
 * Only visible when developer mode is enabled or when there are errors.
 * 
 * Reference: User request for Activity vs System tabs separation
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
} from '@chakra-ui/react';
import { DownloadIcon, ArrowLeftIcon } from '@chakra-ui/icons';
import { FiArrowLeft } from 'react-icons/fi';
import { useAppState } from '../state/store';
import DebugPanel from './DebugPanel';
import { exportDebugSession } from '../helpers/exportDebugSession';
import ErrorBoundary from './ErrorBoundary';

interface SystemViewProps {
  onBackToChat?: () => void;
}

const SystemView: React.FC<SystemViewProps> = ({ onBackToChat }) => {
  const developerMode = useAppState((state) => state.settings.developerMode);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const coverageMetrics = useAppState((state) => state.currentTask.coverageMetrics);
  const displayHistory = useAppState((state) => state.currentTask.displayHistory);
  const hasOrgKnowledge = useAppState((state) => state.currentTask.hasOrgKnowledge);
  const networkLogs = useAppState((state) => state.debug.networkLogs);

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

  const ragMode = hasOrgKnowledge === true 
    ? 'Org' 
    : hasOrgKnowledge === false 
    ? 'Public' 
    : 'Unknown';

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
          Developer mode is disabled. Enable it in Settings to view system information.
        </Text>
      </Box>
    );
  }

  return (
    <Flex direction="column" h="100%" minH="0" w="100%" overflow="hidden" bg={bgColor}>
      {/* System Health Header */}
      <Box
        flex="none"
        bg={cardBg}
        borderBottomWidth="1px"
        borderColor={borderColor}
        px={4}
        py={3}
      >
        <HStack justify="space-between" align="center" mb={3}>
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
              Debug Panel
            </Heading>
          </HStack>
          <Button
            size="sm"
            leftIcon={<DownloadIcon />}
            onClick={handleExport}
            variant="outline"
          >
            Export
          </Button>
        </HStack>

        {/* Health Signals Grid */}
        <SimpleGrid columns={3} spacing={3}>
          {/* API Status Card */}
          <Box
            p={3}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="md"
            bg={bgColor}
          >
            <Text fontSize="xs" color={descColor} mb={1}>
              API
            </Text>
            <HStack spacing={2}>
              <Badge
                colorScheme={apiStatus === 'Online' && lastApiStatus === 200 ? 'green' : 'red'}
                fontSize="xs"
              >
                {apiStatus}
              </Badge>
              {lastApiStatus && (
                <Text fontSize="xs" color={descColor}>
                  {lastApiStatus}
                </Text>
              )}
            </HStack>
          </Box>

          {/* RAG Mode Card */}
          <Box
            p={3}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="md"
            bg={bgColor}
          >
            <Text fontSize="xs" color={descColor} mb={1}>
              RAG
            </Text>
            <Badge
              colorScheme={ragMode === 'Org' ? 'green' : ragMode === 'Public' ? 'yellow' : 'gray'}
              fontSize="xs"
            >
              {ragMode}
            </Badge>
          </Box>

          {/* Token Count Card */}
          <Box
            p={3}
            borderWidth="1px"
            borderColor={borderColor}
            borderRadius="md"
            bg={bgColor}
          >
            <Text fontSize="xs" color={descColor} mb={1}>
              Tokens
            </Text>
            <Text fontSize="sm" fontWeight="medium" color={textColor}>
              {totalTokens.toLocaleString()}
            </Text>
          </Box>
        </SimpleGrid>
      </Box>

      {/* Debug Panel Content - Full height for tabs */}
      <Box flex="1" overflow="hidden" minW="0" bg={bgColor} display="flex" flexDirection="column">
        <ErrorBoundary>
          <Box px={4} py={4} h="100%" display="flex" flexDirection="column" overflow="hidden">
            <DebugPanel />
          </Box>
        </ErrorBoundary>
      </Box>
    </Flex>
  );
};

export default SystemView;
