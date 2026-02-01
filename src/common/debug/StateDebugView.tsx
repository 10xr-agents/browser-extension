/**
 * State Debug View
 * 
 * Simplified state inspector showing only the most relevant state slices
 * for debugging the thin client architecture.
 * 
 * Reference: Zustand store in state/store.ts
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Code,
  Input,
  Button,
  useColorModeValue,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Badge,
  Spacer,
  Heading,
} from '@chakra-ui/react';
import { useAppState } from '../../state/store';
import CopyButton from '../CopyButton';

const StateDebugView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');

  // Get relevant state slices
  const currentSessionId = useAppState((state) => state.sessions.currentSessionId);
  const currentDomain = useAppState((state) => state.sessions.currentDomain);
  const sessionsCount = useAppState((state) => state.sessions.sessions.length);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const actionStatus = useAppState((state) => state.currentTask.actionStatus);
  const tabId = useAppState((state) => state.currentTask.tabId);
  const messagesCount = useAppState((state) => state.currentTask.messages.length);
  const displayHistoryCount = useAppState((state) => state.currentTask.displayHistory.length);
  const wsConnectionState = useAppState((state) => state.currentTask.wsConnectionState);
  const user = useAppState((state) => state.settings.user);
  const developerMode = useAppState((state) => state.settings.developerMode);
  const networkLogsCount = useAppState((state) => state.debug.networkLogs.length);

  // Colors
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const codeBg = useColorModeValue('gray.50', 'gray.900');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');

  // Get full state for JSON view
  const fullState = useAppState.getState();

  // Create a sanitized state object
  const sanitizedState = useMemo(() => {
    return {
      sessions: {
        currentSessionId,
        currentDomain,
        sessionsCount,
      },
      currentTask: {
        status: taskStatus,
        actionStatus,
        tabId,
        messagesCount,
        displayHistoryCount,
        wsConnectionState,
      },
      settings: {
        user: user ? { email: user.email, id: user.id } : null,
        developerMode,
      },
      debug: {
        networkLogsCount,
      },
    };
  }, [
    currentSessionId, currentDomain, sessionsCount,
    taskStatus, actionStatus, tabId, messagesCount, displayHistoryCount, wsConnectionState,
    user, developerMode, networkLogsCount
  ]);

  // Filter state by search term
  const filteredStateJson = useMemo(() => {
    const json = JSON.stringify(sanitizedState, null, 2);
    if (!searchTerm) return json;
    
    // Highlight matching lines
    const lines = json.split('\n');
    const term = searchTerm.toLowerCase();
    const matchingLines = lines.filter(line => line.toLowerCase().includes(term));
    return matchingLines.length > 0 ? matchingLines.join('\n') : 'No matches found';
  }, [sanitizedState, searchTerm]);

  const StateRow: React.FC<{ label: string; value: React.ReactNode }> = ({ label, value }) => (
    <HStack justify="space-between" py={1}>
      <Text fontSize="xs" color={mutedColor}>{label}</Text>
      <Box>{value}</Box>
    </HStack>
  );

  return (
    <VStack align="stretch" spacing={4}>
      {/* Quick Overview */}
      <Box p={4} borderWidth="1px" borderRadius="lg" bg={cardBg} borderColor={borderColor}>
        <Text fontSize="sm" fontWeight="semibold" color={headingColor} mb={3}>
          State Overview
        </Text>
        
        <Accordion allowMultiple defaultIndex={[0, 1]}>
          {/* Session State */}
          <AccordionItem border="none">
            <AccordionButton px={0} _hover={{ bg: 'transparent' }}>
              <HStack flex="1">
                <Text fontSize="xs" fontWeight="medium" color={headingColor}>Sessions</Text>
                <Badge colorScheme="blue" fontSize="xs">{sessionsCount}</Badge>
              </HStack>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pb={4} px={0}>
              <VStack align="stretch" spacing={0}>
                <StateRow 
                  label="Current Session" 
                  value={
                    <Code fontSize="xs" bg={codeBg}>
                      {currentSessionId ? `${currentSessionId.slice(0, 12)}...` : 'None'}
                    </Code>
                  } 
                />
                <StateRow 
                  label="Domain" 
                  value={
                    <Code fontSize="xs" bg={codeBg}>{currentDomain || 'None'}</Code>
                  } 
                />
                <StateRow 
                  label="Total Sessions" 
                  value={<Badge colorScheme="gray" fontSize="xs">{sessionsCount}</Badge>} 
                />
              </VStack>
            </AccordionPanel>
          </AccordionItem>

          {/* Task State */}
          <AccordionItem border="none">
            <AccordionButton px={0} _hover={{ bg: 'transparent' }}>
              <HStack flex="1">
                <Text fontSize="xs" fontWeight="medium" color={headingColor}>Current Task</Text>
                <Badge 
                  colorScheme={taskStatus === 'running' ? 'blue' : taskStatus === 'success' ? 'green' : 'gray'} 
                  fontSize="xs"
                >
                  {taskStatus || 'idle'}
                </Badge>
              </HStack>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pb={4} px={0}>
              <VStack align="stretch" spacing={0}>
                <StateRow 
                  label="Task Status" 
                  value={<Badge colorScheme={taskStatus === 'running' ? 'blue' : 'gray'} fontSize="xs">{taskStatus || 'idle'}</Badge>} 
                />
                <StateRow 
                  label="Action Status" 
                  value={<Badge colorScheme={actionStatus !== 'idle' ? 'yellow' : 'gray'} fontSize="xs">{actionStatus}</Badge>} 
                />
                <StateRow 
                  label="Tab ID" 
                  value={<Code fontSize="xs" bg={codeBg}>{tabId || 'None'}</Code>} 
                />
                <StateRow 
                  label="Messages" 
                  value={<Badge colorScheme="gray" fontSize="xs">{messagesCount}</Badge>} 
                />
                <StateRow 
                  label="Actions" 
                  value={<Badge colorScheme="gray" fontSize="xs">{displayHistoryCount}</Badge>} 
                />
                <StateRow 
                  label="WebSocket" 
                  value={
                    <Badge 
                      colorScheme={wsConnectionState === 'connected' ? 'green' : wsConnectionState === 'fallback' ? 'orange' : 'gray'} 
                      fontSize="xs"
                    >
                      {wsConnectionState || 'disconnected'}
                    </Badge>
                  } 
                />
              </VStack>
            </AccordionPanel>
          </AccordionItem>

          {/* User State */}
          <AccordionItem border="none">
            <AccordionButton px={0} _hover={{ bg: 'transparent' }}>
              <HStack flex="1">
                <Text fontSize="xs" fontWeight="medium" color={headingColor}>User & Settings</Text>
                {user && <Badge colorScheme="green" fontSize="xs">Logged In</Badge>}
              </HStack>
              <AccordionIcon />
            </AccordionButton>
            <AccordionPanel pb={4} px={0}>
              <VStack align="stretch" spacing={0}>
                <StateRow 
                  label="User" 
                  value={<Code fontSize="xs" bg={codeBg}>{user?.email || 'Not logged in'}</Code>} 
                />
                <StateRow 
                  label="Developer Mode" 
                  value={<Badge colorScheme={developerMode ? 'green' : 'gray'} fontSize="xs">{developerMode ? 'On' : 'Off'}</Badge>} 
                />
                <StateRow 
                  label="Network Logs" 
                  value={<Badge colorScheme="gray" fontSize="xs">{networkLogsCount}</Badge>} 
                />
              </VStack>
            </AccordionPanel>
          </AccordionItem>
        </Accordion>
      </Box>

      {/* Full State JSON */}
      <Box p={4} borderWidth="1px" borderRadius="lg" bg={cardBg} borderColor={borderColor}>
        <HStack mb={3}>
          <Text fontSize="sm" fontWeight="semibold" color={headingColor}>
            State JSON
          </Text>
          <Spacer />
          <Input
            placeholder="Search..."
            size="xs"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            maxW="150px"
          />
          <CopyButton text={JSON.stringify(sanitizedState, null, 2)} />
        </HStack>
        
        <Code
          p={3}
          fontSize="xs"
          display="block"
          whiteSpace="pre-wrap"
          bg={codeBg}
          maxH="300px"
          overflowY="auto"
          borderRadius="md"
        >
          {filteredStateJson}
        </Code>
      </Box>
    </VStack>
  );
};

export default StateDebugView;
