/**
 * Debug Panel Component - Redesigned for Thin Client Architecture
 * 
 * Streamlined tabbed interface focused on the most useful debugging information:
 * - Connection: WebSocket/Pusher status, sync state
 * - Actions: Action execution history and debugger state
 * - Messages: Message flow between extension and backend
 * - Network: API request/response traces
 * - State: Simplified state inspector
 * 
 * Reference: Thin Client Architecture, REALTIME_MESSAGE_SYNC_ROADMAP.md
 */

import React from 'react';
import {
  Box,
  useColorModeValue,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
  Badge,
  HStack,
  Icon,
} from '@chakra-ui/react';
import { FiWifi, FiZap, FiMessageSquare, FiActivity, FiDatabase } from 'react-icons/fi';
import { useAppState } from '../state/store';
import { ConnectionDebugView, ActionsDebugView, MessagesDebugView, StateDebugView } from './debug';
import NetworkTraceView from './NetworkTraceView';
import ErrorBoundary from './ErrorBoundary';

interface DebugPanelProps {
  // Props can be added here in the future if needed
}

const DebugPanel: React.FC<DebugPanelProps> = () => {
  const developerMode = useAppState((state) => state.settings.developerMode);
  const wsConnectionState = useAppState((state) => state.currentTask.wsConnectionState);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const messagesCount = useAppState((state) => state.currentTask.messages.length);
  const actionsCount = useAppState((state) => state.currentTask.displayHistory.length);
  const networkLogsCount = useAppState((state) => state.debug.networkLogs.length);

  // Dark mode colors - defined at component top level
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');

  // Tab colors
  const tabBg = useColorModeValue('white', 'gray.800');
  const tabSelectedBg = useColorModeValue('blue.50', 'blue.900/20');
  const tabSelectedColor = useColorModeValue('blue.600', 'blue.400');
  const tabBorderColor = useColorModeValue('gray.200', 'gray.700');
  const tabPanelBg = useColorModeValue('white', 'gray.900');
  const tabHoverBg = useColorModeValue('gray.50', 'gray.700');
  const scrollbarTrackBg = useColorModeValue('gray.100', 'gray.700');
  const scrollbarThumbBg = useColorModeValue('gray.400', 'gray.500');

  // Don't render if developer mode is off
  if (!developerMode) {
    return null;
  }

  // Tab configuration with icons and badges
  const tabs = [
    { 
      id: 'connection', 
      label: 'Connection', 
      icon: FiWifi,
      badge: wsConnectionState === 'connected' ? null : wsConnectionState,
      badgeColor: wsConnectionState === 'connected' ? 'green' : 
                  wsConnectionState === 'fallback' ? 'orange' : 
                  wsConnectionState === 'failed' ? 'red' : 'gray',
    },
    { 
      id: 'actions', 
      label: 'Actions', 
      icon: FiZap,
      badge: actionsCount > 0 ? actionsCount : null,
      badgeColor: taskStatus === 'running' ? 'blue' : 'gray',
    },
    { 
      id: 'messages', 
      label: 'Messages', 
      icon: FiMessageSquare,
      badge: messagesCount > 0 ? messagesCount : null,
      badgeColor: 'gray',
    },
    { 
      id: 'network', 
      label: 'Network', 
      icon: FiActivity,
      badge: networkLogsCount > 0 ? networkLogsCount : null,
      badgeColor: 'gray',
    },
    { 
      id: 'state', 
      label: 'State', 
      icon: FiDatabase,
      badge: null,
      badgeColor: 'gray',
    },
  ];

  return (
    <Box w="100%" h="100%" display="flex" flexDirection="column" overflow="hidden">
      <Tabs 
        variant="enclosed" 
        size="sm" 
        isLazy 
        colorScheme="blue" 
        display="flex" 
        flexDirection="column" 
        h="100%" 
        overflow="hidden"
      >
        <TabList
          flex="none"
          overflowX="auto"
          overflowY="hidden"
          borderBottomWidth="1px"
          borderColor={tabBorderColor}
          bg={tabBg}
          sx={{
            '&::-webkit-scrollbar': {
              height: '4px',
            },
            '&::-webkit-scrollbar-track': {
              bg: scrollbarTrackBg,
            },
            '&::-webkit-scrollbar-thumb': {
              bg: scrollbarThumbBg,
              borderRadius: '2px',
            },
          }}
        >
          {tabs.map((tab) => (
            <Tab
              key={tab.id}
              fontSize="xs"
              fontWeight="medium"
              px={3}
              py={2}
              _selected={{
                bg: tabSelectedBg,
                color: tabSelectedColor,
                borderColor: tabBorderColor,
                borderBottomColor: 'transparent',
              }}
              _hover={{
                bg: tabHoverBg,
              }}
            >
              <HStack spacing={1.5}>
                <Icon as={tab.icon} boxSize={3.5} />
                <span>{tab.label}</span>
                {tab.badge !== null && (
                  <Badge 
                    colorScheme={tab.badgeColor} 
                    fontSize="xs" 
                    ml={1}
                    minW="18px"
                    textAlign="center"
                  >
                    {typeof tab.badge === 'number' && tab.badge > 99 ? '99+' : tab.badge}
                  </Badge>
                )}
              </HStack>
            </Tab>
          ))}
        </TabList>

        <TabPanels flex="1" overflow="hidden" display="flex" flexDirection="column">
          {/* Connection Tab */}
          <TabPanel 
            px={0} 
            py={4} 
            bg={tabPanelBg}
            flex="1"
            overflowY="auto"
            overflowX="hidden"
            minH="0"
          >
            <ErrorBoundary>
              <ConnectionDebugView />
            </ErrorBoundary>
          </TabPanel>

          {/* Actions Tab */}
          <TabPanel 
            px={0} 
            py={4} 
            bg={tabPanelBg}
            flex="1"
            overflowY="auto"
            overflowX="hidden"
            minH="0"
          >
            <ErrorBoundary>
              <ActionsDebugView />
            </ErrorBoundary>
          </TabPanel>

          {/* Messages Tab */}
          <TabPanel 
            px={0} 
            py={4} 
            bg={tabPanelBg}
            flex="1"
            overflowY="auto"
            overflowX="hidden"
            minH="0"
          >
            <ErrorBoundary>
              <MessagesDebugView />
            </ErrorBoundary>
          </TabPanel>

          {/* Network Tab */}
          <TabPanel 
            px={0} 
            py={4} 
            bg={tabPanelBg}
            flex="1"
            overflowY="auto"
            overflowX="hidden"
            minH="0"
          >
            <ErrorBoundary>
              <Box
                borderWidth="1px"
                borderColor={borderColor}
                borderRadius="lg"
                p={4}
                bg={cardBg}
                shadow="sm"
              >
                <NetworkTraceView />
              </Box>
            </ErrorBoundary>
          </TabPanel>

          {/* State Tab */}
          <TabPanel 
            px={0} 
            py={4} 
            bg={tabPanelBg}
            flex="1"
            overflowY="auto"
            overflowX="hidden"
            minH="0"
          >
            <ErrorBoundary>
              <StateDebugView />
            </ErrorBoundary>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
};

export default DebugPanel;
