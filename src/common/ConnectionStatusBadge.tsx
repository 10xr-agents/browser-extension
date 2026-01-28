/**
 * Connection Status Badge
 *
 * Shows real-time connection status (Pusher/Soketi or polling fallback) with appropriate icons and colors.
 * Rendered only in the debug panel (SystemView), not in the chat view.
 *
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §9 (Task 6)
 */

import React from 'react';
import { Badge, Icon, Tooltip } from '@chakra-ui/react';
import { FiWifi, FiWifiOff, FiRefreshCw, FiAlertCircle } from 'react-icons/fi';
import { useAppState } from '../state/store';

export const ConnectionStatusBadge: React.FC = () => {
  const wsConnectionState = useAppState((state) => state.currentTask.wsConnectionState);
  const wsFallbackReason = useAppState((state) => state.currentTask.wsFallbackReason);

  const getStatusConfig = () => {
    switch (wsConnectionState) {
      case 'connected':
        return {
          icon: FiWifi,
          label: 'Connected',
          tooltip: 'Real-time sync active',
          colorScheme: 'green',
        };
      case 'connecting':
        return {
          icon: FiRefreshCw,
          label: 'Connecting',
          tooltip: 'Establishing connection...',
          colorScheme: 'yellow',
        };
      case 'reconnecting':
        return {
          icon: FiRefreshCw,
          label: 'Reconnecting',
          tooltip: 'Reconnecting to server...',
          colorScheme: 'yellow',
        };
      case 'fallback':
        return {
          icon: FiAlertCircle,
          label: 'Polling',
          tooltip:
            typeof wsFallbackReason === 'string' && wsFallbackReason
              ? `Using polling: ${wsFallbackReason}`
              : 'Using polling (real-time unavailable)',
          colorScheme: 'orange',
        };
      case 'failed':
        return {
          icon: FiWifiOff,
          label: 'Disconnected',
          tooltip: 'Connection failed',
          colorScheme: 'red',
        };
      default:
        return {
          icon: FiWifiOff,
          label: 'Offline',
          tooltip: 'Not connected',
          colorScheme: 'gray',
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Tooltip label={config.tooltip} placement="bottom">
      <Badge
        colorScheme={config.colorScheme}
        variant="subtle"
        px={2}
        py={1}
        borderRadius="md"
        display="flex"
        alignItems="center"
        gap={1}
        fontSize="xs"
      >
        <Icon as={config.icon} boxSize={3} />
        {config.label}
      </Badge>
    </Tooltip>
  );
};
