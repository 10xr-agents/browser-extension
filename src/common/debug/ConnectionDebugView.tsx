/**
 * Connection Debug View
 * 
 * Shows real-time connection status, WebSocket state, and sync information.
 * Critical for debugging connection issues in the thin client architecture.
 * 
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md
 */

import React, { useState, useEffect } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Button,
  Code,
  Divider,
  useColorModeValue,
  Icon,
  Tooltip,
  Stat,
  StatLabel,
  StatNumber,
  StatHelpText,
  SimpleGrid,
} from '@chakra-ui/react';
import { FiWifi, FiWifiOff, FiRefreshCw, FiAlertCircle, FiCheck, FiClock } from 'react-icons/fi';
import { useAppState } from '../../state/store';
import { pusherTransport, type ConnectionState } from '../../services/pusherTransport';
import { messageSyncManager } from '../../services/messageSyncService';

const ConnectionDebugView: React.FC = () => {
  const wsConnectionState = useAppState((state) => state.currentTask.wsConnectionState);
  const wsFallbackReason = useAppState((state) => state.currentTask.wsFallbackReason);
  const currentSessionId = useAppState((state) => state.sessions.currentSessionId);
  const messagesCount = useAppState((state) => state.currentTask.messages.length);
  
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);

  // Colors
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const codeBg = useColorModeValue('gray.50', 'gray.900');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');

  // Update last sync time when messages change
  useEffect(() => {
    if (messagesCount > 0) {
      setLastSyncTime(new Date());
    }
  }, [messagesCount]);

  const getConnectionStatusConfig = (state: ConnectionState | undefined) => {
    switch (state) {
      case 'connected':
        return { icon: FiWifi, color: 'green', label: 'Connected', description: 'Real-time sync active' };
      case 'connecting':
        return { icon: FiRefreshCw, color: 'yellow', label: 'Connecting', description: 'Establishing connection...' };
      case 'reconnecting':
        return { icon: FiRefreshCw, color: 'yellow', label: 'Reconnecting', description: 'Attempting to reconnect...' };
      case 'fallback':
        return { icon: FiAlertCircle, color: 'orange', label: 'Polling Mode', description: 'Using polling fallback' };
      case 'failed':
        return { icon: FiWifiOff, color: 'red', label: 'Failed', description: 'Connection failed' };
      default:
        return { icon: FiWifiOff, color: 'gray', label: 'Disconnected', description: 'Not connected' };
    }
  };

  const statusConfig = getConnectionStatusConfig(wsConnectionState);

  const handleReconnect = async () => {
    if (!currentSessionId) return;
    
    setIsReconnecting(true);
    try {
      await messageSyncManager.startSync(currentSessionId);
    } catch (error) {
      console.error('[ConnectionDebugView] Reconnect failed:', error);
    } finally {
      setIsReconnecting(false);
    }
  };

  const handleDisconnect = async () => {
    try {
      await messageSyncManager.stopSync();
    } catch (error) {
      console.error('[ConnectionDebugView] Disconnect failed:', error);
    }
  };

  return (
    <VStack align="stretch" spacing={4}>
      {/* Connection Status Card */}
      <Box p={4} borderWidth="1px" borderRadius="lg" bg={cardBg} borderColor={borderColor}>
        <HStack justify="space-between" align="center" mb={4}>
          <HStack spacing={3}>
            <Icon 
              as={statusConfig.icon} 
              boxSize={6} 
              color={`${statusConfig.color}.500`}
              className={wsConnectionState === 'connecting' || wsConnectionState === 'reconnecting' ? 'animate-spin' : ''}
            />
            <Box>
              <Badge colorScheme={statusConfig.color} fontSize="sm" px={2} py={1}>
                {statusConfig.label}
              </Badge>
              <Text fontSize="xs" color={mutedColor} mt={1}>
                {statusConfig.description}
              </Text>
            </Box>
          </HStack>
          <HStack spacing={2}>
            {wsConnectionState !== 'connected' && currentSessionId && (
              <Button 
                size="sm" 
                colorScheme="blue" 
                onClick={handleReconnect}
                isLoading={isReconnecting}
                leftIcon={<Icon as={FiRefreshCw} />}
              >
                Reconnect
              </Button>
            )}
            {wsConnectionState === 'connected' && (
              <Button 
                size="sm" 
                variant="outline" 
                colorScheme="red"
                onClick={handleDisconnect}
              >
                Disconnect
              </Button>
            )}
          </HStack>
        </HStack>

        {/* Fallback Reason */}
        {wsFallbackReason && wsConnectionState === 'fallback' && (
          <Box p={3} bg={useColorModeValue('orange.50', 'orange.900/20')} borderRadius="md" mb={4}>
            <Text fontSize="xs" color={useColorModeValue('orange.800', 'orange.200')}>
              <strong>Fallback Reason:</strong> {wsFallbackReason}
            </Text>
          </Box>
        )}

        <Divider mb={4} />

        {/* Stats Grid */}
        <SimpleGrid columns={2} spacing={4}>
          <Stat size="sm">
            <StatLabel fontSize="xs" color={mutedColor}>Session ID</StatLabel>
            <StatNumber fontSize="sm">
              <Code fontSize="xs" bg={codeBg}>
                {currentSessionId ? `${currentSessionId.slice(0, 8)}...` : 'None'}
              </Code>
            </StatNumber>
          </Stat>
          <Stat size="sm">
            <StatLabel fontSize="xs" color={mutedColor}>Messages Loaded</StatLabel>
            <StatNumber fontSize="sm">{messagesCount}</StatNumber>
          </Stat>
          <Stat size="sm">
            <StatLabel fontSize="xs" color={mutedColor}>Last Sync</StatLabel>
            <StatNumber fontSize="sm">
              {lastSyncTime ? lastSyncTime.toLocaleTimeString() : 'Never'}
            </StatNumber>
          </Stat>
          <Stat size="sm">
            <StatLabel fontSize="xs" color={mutedColor}>Transport</StatLabel>
            <StatNumber fontSize="sm">
              <Badge 
                colorScheme={wsConnectionState === 'fallback' ? 'orange' : 'blue'} 
                fontSize="xs"
              >
                {wsConnectionState === 'fallback' ? 'HTTP Polling' : 'WebSocket'}
              </Badge>
            </StatNumber>
          </Stat>
        </SimpleGrid>
      </Box>

      {/* Connection Details */}
      <Box p={4} borderWidth="1px" borderRadius="lg" bg={cardBg} borderColor={borderColor}>
        <Text fontSize="sm" fontWeight="semibold" color={headingColor} mb={3}>
          Connection Details
        </Text>
        <VStack align="stretch" spacing={2} fontSize="xs">
          <HStack justify="space-between">
            <Text color={mutedColor}>WebSocket State:</Text>
            <Code fontSize="xs" bg={codeBg}>{wsConnectionState || 'unknown'}</Code>
          </HStack>
          <HStack justify="space-between">
            <Text color={mutedColor}>Channel:</Text>
            <Code fontSize="xs" bg={codeBg}>
              {currentSessionId ? `private-session-${currentSessionId.slice(0, 8)}...` : 'Not subscribed'}
            </Code>
          </HStack>
          <HStack justify="space-between">
            <Text color={mutedColor}>Full Session ID:</Text>
            <Tooltip label={currentSessionId || 'None'}>
              <Code fontSize="xs" bg={codeBg} maxW="200px" isTruncated>
                {currentSessionId || 'None'}
              </Code>
            </Tooltip>
          </HStack>
        </VStack>
      </Box>

      {/* Help Text */}
      <Box p={3} bg={useColorModeValue('blue.50', 'blue.900/20')} borderRadius="md">
        <Text fontSize="xs" color={useColorModeValue('blue.800', 'blue.200')}>
          <strong>Tip:</strong> If connection fails, check that the backend WebSocket server is running on the configured port.
          The extension will automatically fall back to HTTP polling if WebSocket fails.
        </Text>
      </Box>
    </VStack>
  );
};

export default ConnectionDebugView;
