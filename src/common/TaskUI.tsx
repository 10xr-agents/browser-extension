/**
 * TaskUI Component for Thin Client Architecture
 * 
 * Main task interface with knowledge overlay integration.
 * Displays knowledge context for the current page.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §3.1 (Task 2: Runtime Knowledge Resolution)
 */

import {
  HStack,
  VStack,
  Box,
  Text,
  Button,
  Flex,
  Icon,
  useColorModeValue,
  IconButton,
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { BsStopFill } from 'react-icons/bs';
import { FiSend } from 'react-icons/fi';
import { useAppState } from '../state/store';
import TaskHistory from './TaskHistory';
import KnowledgeOverlay from './KnowledgeOverlay';
import AutosizeTextarea from './AutosizeTextarea';
import { KnowledgeCheckSkeleton } from './KnowledgeCheckSkeleton';
import ErrorBoundary from './ErrorBoundary';

interface TaskUIProps {
  hasOrgKnowledge?: boolean | null;
}

const TaskUI: React.FC<TaskUIProps> = ({ hasOrgKnowledge }) => {
  // Split selectors to avoid creating new objects on every render (prevents infinite loops)
  const taskHistory = useAppState((state) => state.currentTask.displayHistory);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const runTask = useAppState((state) => state.currentTask.actions.runTask);
  const instructions = useAppState((state) => state.ui.instructions);
  const setInstructions = useAppState((state) => state.ui.actions.setInstructions);
  const accessibilityElements = useAppState((state) => state.currentTask.accessibilityElements);

  // Memoize only state values (not action functions) to prevent re-renders
  // Action functions should be stable and don't need to be in dependencies
  const state = useMemo(
    () => ({
      taskHistory,
      taskStatus,
      instructions,
      accessibilityElements,
    }),
    [
      taskHistory,
      taskStatus,
      instructions,
      accessibilityElements,
    ]
  );

  const [activeUrl, setActiveUrl] = useState<string>('');
  const [showKnowledge, setShowKnowledge] = useState(false);

  const taskInProgress = state.taskStatus === 'running';
  const sessionId = useAppState((state) => state.currentTask.sessionId);
  const loadMessages = useAppState((state) => state.currentTask.actions.loadMessages);
  const messages = useAppState((state) => state.currentTask.messages);

  // Load messages on mount if sessionId exists
  useEffect(() => {
    if (sessionId && messages.length === 0) {
      loadMessages(sessionId);
    }
  }, [sessionId, messages.length, loadMessages]);

  // Get active tab URL on mount and when tab changes
  useEffect(() => {
    const getActiveTabUrl = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          setActiveUrl(tab.url);
          // Auto-trigger knowledge resolve when URL changes
          setShowKnowledge(true);
        }
      } catch (error) {
        console.error('Error getting active tab URL:', error);
      }
    };

    getActiveTabUrl();

    // Listen for tab updates
    const handleTabUpdate = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (changeInfo.status === 'complete' && tab?.url) {
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
          setActiveUrl(tab.url);
          setShowKnowledge(true);
        }
      }
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);

    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    };
  }, []);

  const handleRunTask = useCallback(() => {
    if (instructions) {
      // Silently handle errors - they will be shown in the UI via error state
      runTask((message: string) => {
        console.error('Task error:', message);
      });
    }
  }, [instructions, runTask]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRunTask();
    }
  };

  const taskState = useAppState((state) => state.currentTask.status);
  const interruptTask = useAppState((state) => state.currentTask.actions.interrupt);
  const isRunning = taskState === 'running';

  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const inputBg = useColorModeValue('white', 'gray.900');
  const cardBg = useColorModeValue('gray.50', 'gray.800');
  const contentBg = useColorModeValue('white', 'gray.900');
  const bannerBg = useColorModeValue('blue.50', 'blue.900/20');
  const bannerTextColor = useColorModeValue('blue.800', 'blue.200');
  
  // Command Center design colors
  const headerBg = useColorModeValue('white', 'gray.900');
  const headerBorder = useColorModeValue('gray.200', 'gray.700');
  const contextPillBg = useColorModeValue('gray.100', 'gray.800');
  const contextPillText = useColorModeValue('gray.700', 'gray.300');
  const floatingInputBg = useColorModeValue('white', 'gray.800');
  const floatingInputBorder = useColorModeValue('gray.300', 'gray.600');
  
  // System notice colors (for organization knowledge warning)
  const systemNoticeBg = useColorModeValue('orange.50', 'orange.900/20');
  const systemNoticeBorderColor = useColorModeValue('orange.400', 'orange.500');
  const systemNoticeTextColor = useColorModeValue('orange.800', 'orange.300');

  // Get current context (active URL domain or task name)
  const getCurrentContext = () => {
    if (activeUrl) {
      try {
        const url = new URL(activeUrl);
        return url.hostname;
      } catch {
        return 'Current page';
      }
    }
    return 'Ready to start';
  };

  return (
    <Flex direction="column" h="100%" minH="0" w="100%" overflow="hidden" bg={contentBg} position="relative">
      {/* Zone A: Sticky Context Header */}
      <Box
        flex="none"
        position="sticky"
        top={0}
        zIndex={10}
        bg={headerBg}
        borderBottomWidth="1px"
        borderColor={headerBorder}
        px={4}
        py={2}
        shadow="sm"
      >
        <HStack spacing={3} justify="flex-start" align="center">
          {/* Current Context Pill */}
          <Box
            px={3}
            py={1}
            borderRadius="full"
            bg={contextPillBg}
            _dark={{ bg: 'gray.800' }}
          >
            <Text fontSize="xs" fontWeight="medium" color={contextPillText} _dark={{ color: 'gray.300' }}>
              {getCurrentContext()}
            </Text>
          </Box>
        </HStack>
      </Box>

      {/* Zone B: Scrollable Document Stream */}
      <Box 
        flex="1" 
        overflowY="auto" 
        overflowX="hidden" 
        minW="0" 
        px={4} 
        py={4} 
        bg={contentBg}
        pb="100px" // Add padding bottom to account for floating input
      >
        <VStack spacing={4} align="stretch" minW="0">
          {/* System Notice - Slim, inline style */}
          {hasOrgKnowledge === false && (
            <Box
              minW="0"
              bg={systemNoticeBg}
              borderLeftWidth="4px"
              borderLeftColor={systemNoticeBorderColor}
              px={3}
              py={2}
              borderRadius="sm"
            >
              <Text
                fontSize="xs"
                color={systemNoticeTextColor}
                lineHeight="1.3"
                fontWeight="medium"
                minW="0"
              >
                This website is not part of your organization's approved tools. Suggestions are based on general knowledge only.
              </Text>
            </Box>
          )}

          {/* Loading State for Knowledge Check */}
          {hasOrgKnowledge === null && (
            <Box minW="0">
              <KnowledgeCheckSkeleton />
            </Box>
          )}

          {/* Knowledge Resolution Section */}
          {activeUrl && showKnowledge && (
            <ErrorBoundary>
              <Box minW="0">
                <KnowledgeOverlay url={activeUrl} />
              </Box>
            </ErrorBoundary>
          )}

          {/* Task History - User-facing view with message bubbles */}
          <ErrorBoundary>
            <Box minW="0">
              <TaskHistory />
            </Box>
          </ErrorBoundary>
        </VStack>
      </Box>

      {/* Zone C: Floating Command Bar */}
      <Box
        position="absolute"
        bottom={4}
        left={4}
        right={4}
        zIndex={20}
        minW="0"
      >
        <Box
          borderWidth="1px"
          borderColor={floatingInputBorder}
          borderRadius="xl"
          bg={floatingInputBg}
          shadow="lg"
          minW="0"
          _focusWithin={{
            borderColor: 'blue.500',
            _dark: { borderColor: 'blue.400' },
            boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)',
          }}
        >
          <Flex align="flex-end" px={4} py={3} gap={2} minW="0">
            {/* Text Input - Takes up most space */}
            <Box flex="1" minW="0">
              <AutosizeTextarea
                autoFocus
                placeholder="What would you like me to do on this page? (e.g., fill out the form, click the button, search for products)"
                value={instructions || ''}
                isDisabled={isRunning}
                onChange={(e) => setInstructions(e.target.value)}
                onKeyDown={onKeyDown}
                bg="transparent"
                borderWidth="0"
                px={0}
                py={0}
                fontSize="sm"
                resize="none"
                minW="0"
                _focus={{
                  outline: 'none',
                  boxShadow: 'none',
                }}
                _focusVisible={{
                  outline: 'none',
                  boxShadow: 'none',
                }}
                _disabled={{
                  opacity: 0.6,
                  cursor: 'not-allowed',
                }}
                minRows={2}
                maxRows={6}
              />
            </Box>
            
            {/* Send Button - Inline with text input */}
            <Box flexShrink={0} pb={1}>
              {isRunning ? (
                <IconButton
                  aria-label="Stop task"
                  icon={<Icon as={BsStopFill} />}
                  onClick={interruptTask}
                  colorScheme="red"
                  size="sm"
                  _focusVisible={{
                    boxShadow: 'outline',
                  }}
                  borderRadius="md"
                />
              ) : (
                <IconButton
                  aria-label="Send task"
                  icon={<Icon as={FiSend} />}
                  onClick={handleRunTask}
                  colorScheme="blue"
                  size="sm"
                  isDisabled={!instructions}
                  _disabled={{
                    opacity: 0.5,
                    cursor: 'not-allowed',
                  }}
                  _focusVisible={{
                    boxShadow: 'outline',
                  }}
                  borderRadius="md"
                />
              )}
            </Box>
          </Flex>
        </Box>
      </Box>
    </Flex>
  );
};

export default TaskUI;
