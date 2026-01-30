/**
 * TaskUI Component for Thin Client Architecture
 * 
 * Main task interface with knowledge overlay integration.
 * Displays knowledge context for the current page.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §3.1 (Task 2: Runtime Knowledge Resolution)
 */

import {
  VStack,
  Box,
  Text,
  Flex,
  HStack,
  Button,
  useColorModeValue,
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useState, useMemo, useRef } from 'react';
import { BsStopFill } from 'react-icons/bs';
import { FiSend, FiChevronDown } from 'react-icons/fi';
import { Icon, IconButton } from '@chakra-ui/react';
import { useAppState } from '../state/store';
import TaskHistory from './TaskHistory';
import KnowledgeOverlay from './KnowledgeOverlay';
import AutosizeTextarea from './AutosizeTextarea';
import { KnowledgeCheckSkeleton } from './KnowledgeCheckSkeleton';
import ErrorBoundary from './ErrorBoundary';
import ChatHistoryDrawer from './ChatHistoryDrawer';
import DomainStatus from './components/DomainStatus';
import TaskStatusIndicator from './components/TaskStatusIndicator';
import TaskHeader from './components/TaskHeader';
import PlanWidget from './components/PlanWidget';
import TaskCompletedCard from './components/TaskCompletedCard';
import { TypingIndicator } from './TypingIndicator';
import { messageSyncManager } from '../services/messageSyncService';

interface TaskUIProps {
  hasOrgKnowledge?: boolean | null;
  isDebugViewOpen?: boolean;
  setIsDebugViewOpen?: (open: boolean) => void;
  onNavigate?: (route: '/' | '/settings') => void;
}

const TaskUI: React.FC<TaskUIProps> = ({ 
  hasOrgKnowledge,
  isDebugViewOpen = false,
  setIsDebugViewOpen,
  onNavigate,
}) => {
  // Split selectors to avoid creating new objects on every render (prevents infinite loops)
  // Safety check: Ensure displayHistory is always an array
  const taskHistory = useAppState((state) => {
    const history = state.currentTask.displayHistory;
    return Array.isArray(history) ? history : [];
  });
  const taskStatus = useAppState((state) => state.currentTask.status);
  const runTask = useAppState((state) => state.currentTask.actions.runTask);
  const instructions = useAppState((state) => state.ui.instructions);
  const setInstructions = useAppState((state) => state.ui.actions.setInstructions);
  const interruptTask = useAppState((state) => state.currentTask.actions.interrupt);
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

  // Session management and message state (declared before effects that use them)
  const isHistoryOpen = useAppState((state) => state.sessions.isHistoryOpen);
  const setHistoryOpen = useAppState((state) => state.sessions.actions.setHistoryOpen);
  const createNewChat = useAppState((state) => state.sessions.actions.createNewChat);
  const startNewChat = useAppState((state) => state.currentTask.actions.startNewChat);

  const taskInProgress = state.taskStatus === 'running';
  const sessionId = useAppState((state) => state.currentTask.sessionId);
  const loadMessages = useAppState((state) => state.currentTask.actions.loadMessages);
  // Safety check: Ensure messages is always an array
  const messages = useAppState((state) => {
    const msgs = state.currentTask.messages;
    return Array.isArray(msgs) ? msgs : [];
  });
  // Get loading state to prevent infinite loops
  const messagesLoadingState = useAppState((state) => state.currentTask.messagesLoadingState);

  // Check if we're waiting for user input (ASK_USER state)
  const waitingForUserInput = useAppState((state) => {
    // Safety check: Ensure messages is an array before accessing
    const messagesArray = Array.isArray(state.currentTask.messages) ? state.currentTask.messages : [];
    if (messagesArray.length === 0) return false;

    const lastMessage = messagesArray[messagesArray.length - 1];
    return lastMessage?.userQuestion &&
           (lastMessage.status === 'pending' || lastMessage.meta?.reasoning?.source === 'ASK_USER');
  });

  // Scroll container ref and stick-to-bottom: only auto-scroll if user was at bottom
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const userWasAtBottomRef = useRef(true);
  const [showNewMessagesButton, setShowNewMessagesButton] = useState(false);
  const prevContentLengthRef = useRef(0);

  const scrollToBottom = useCallback(() => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
      userWasAtBottomRef.current = true;
      setShowNewMessagesButton(false);
    }
  }, []);

  useEffect(() => {
    const messagesArray = Array.isArray(messages) ? messages : [];
    const taskHistoryArray = Array.isArray(taskHistory) ? taskHistory : [];
    const contentLength = messagesArray.length + taskHistoryArray.length;
    if (contentLength === 0) return;

    const el = scrollContainerRef.current;
    if (!el) return;

    const wasAtBottom = userWasAtBottomRef.current;
    const prevLength = prevContentLengthRef.current;
    prevContentLengthRef.current = contentLength;

    if (contentLength > prevLength) {
      setTimeout(() => {
        if (!scrollContainerRef.current) return;
        if (wasAtBottom) {
          scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
          setShowNewMessagesButton(false);
        } else {
          setShowNewMessagesButton(true);
        }
      }, 100);
    }
  }, [messages, taskHistory]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 80;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    userWasAtBottomRef.current = atBottom;
    if (atBottom) setShowNewMessagesButton(false);
  }, []);

  // Load messages on mount if sessionId exists
  // Uses loading state to prevent infinite retry loops
  useEffect(() => {
    // Don't try to load if:
    // 1. No sessionId
    // 2. Already loading
    // 3. Have an error that's blocking retries (handled by loadMessages itself)
    // 4. Already have messages
    if (!sessionId) return;
    if (messagesLoadingState.isLoading) return;
    
    const messagesArray = Array.isArray(messages) ? messages : [];
    if (messagesArray.length === 0) {
      loadMessages(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // Only trigger on sessionId change - loadMessages handles its own state

  // Real-time message sync: start WebSocket (or polling fallback) when sessionId is set
  // Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md
  useEffect(() => {
    if (!sessionId) return;
    messageSyncManager.startSync(sessionId);
    return () => {
      messageSyncManager.stopSync();
    };
  }, [sessionId]);

  // Visibility-based reconnect: when popup becomes visible again, reconnect if needed
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && sessionId) {
        const wsState = useAppState.getState().currentTask.wsConnectionState;
        if (wsState !== 'connected' && wsState !== 'connecting' && wsState !== 'reconnecting') {
          messageSyncManager.startSync(sessionId);
        }
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [sessionId]);

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
    // Type guard: Ensure instructions is a string
    const safeInstructions = typeof instructions === 'string' ? instructions : String(instructions || '').trim();
    
    if (safeInstructions) {
      // If we're waiting for user input, this is a response to the question
      // Resume the task with the user's response
      if (waitingForUserInput) {
        // The task will continue with the new instructions
        // The backend will treat this as additional context
      }
      
      // Silently handle errors - they will be shown in the UI via error state
      runTask((message: string) => {
        console.error('Task error:', message);
      });
    }
  }, [instructions, runTask, waitingForUserInput]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleRunTask();
    }
  };

  const isRunning = taskStatus === 'running';

  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const inputBg = useColorModeValue('white', 'gray.900');
  const cardBg = useColorModeValue('gray.50', 'gray.800');
  const contentBg = useColorModeValue('white', 'gray.900');
  const bannerBg = useColorModeValue('blue.50', 'blue.900/20');
  const bannerTextColor = useColorModeValue('blue.800', 'blue.200');
  
  // Command Center design colors
  const floatingInputBg = useColorModeValue('white', 'gray.800');
  const floatingInputBorder = useColorModeValue('gray.300', 'gray.600');
  
  // System notice colors (for organization knowledge warning)
  const systemNoticeBg = useColorModeValue('orange.50', 'orange.900/20');
  const systemNoticeBorderColor = useColorModeValue('orange.400', 'orange.500');
  const systemNoticeTextColor = useColorModeValue('orange.800', 'orange.300');

  // Handlers for DomainStatus actions
  const handleNewChat = useCallback(async () => {
    // Stop any running task first
    if (isRunning) {
      interruptTask();
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Stop real-time message sync before clearing state
    messageSyncManager.stopSync();

    // Clear current task state (clears messages, displayHistory, instructions)
    startNewChat();

    // Create new session
    await createNewChat(activeUrl);

    // Clear instructions explicitly (startNewChat should do this, but ensure it)
    setInstructions('');
  }, [activeUrl, createNewChat, startNewChat, isRunning, interruptTask, setInstructions, taskStatus]);

  return (
    <Flex direction="column" h="100%" minH="0" w="100%" overflow="hidden" bg={contentBg} position="relative">
      {/* Zone A: Unified Command Bar (Domain Status + Actions) */}
      <DomainStatus
        currentUrl={activeUrl}
        onHistoryClick={() => setHistoryOpen(true)}
        onNewChatClick={handleNewChat}
        onDebugClick={setIsDebugViewOpen ? () => setIsDebugViewOpen(!isDebugViewOpen) : undefined}
        onSettingsClick={onNavigate ? () => onNavigate('/settings') : undefined}
        isDebugViewOpen={isDebugViewOpen}
      />
      
      {/* Chat History Drawer */}
      <ChatHistoryDrawer
        isOpen={isHistoryOpen}
        onClose={() => setHistoryOpen(false)}
      />

      {/* Zone B: Scrollable Document Stream (stick-to-bottom; "New messages" when scrolled up) */}
      <Box
        ref={scrollContainerRef}
        flex="1"
        overflowY="auto"
        overflowX="hidden"
        minW="0"
        px={4}
        py={4}
        bg={contentBg}
        pb="100px"
        onScroll={handleScroll}
        position="relative"
      >
        <VStack spacing={4} align="stretch" minW="0">
          {/* Task Header - Status badge (RUNNING / COMPLETED / FAILED) */}
          <ErrorBoundary>
            <TaskHeader />
          </ErrorBoundary>
          {/* Live Plan - Stepper or Planning skeleton */}
          <ErrorBoundary>
            <PlanWidget />
          </ErrorBoundary>
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
          {/* Task Completed summary card */}
          <ErrorBoundary>
            <TaskCompletedCard />
          </ErrorBoundary>
        </VStack>

        {/* "New messages" button when user has scrolled up */}
        {showNewMessagesButton && (
          <Box position="absolute" bottom={24} left="50%" transform="translateX(-50%)" zIndex={15}>
            <Button
              size="sm"
              leftIcon={<Icon as={FiChevronDown} />}
              onClick={scrollToBottom}
              colorScheme="blue"
              shadow="md"
              aria-label="Scroll to new messages"
            >
              New messages
            </Button>
          </Box>
        )}
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
        <TypingIndicator />
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
            {/* Task status: running / done / failed (icon + optional motion) */}
            <ErrorBoundary>
              <TaskStatusIndicator />
            </ErrorBoundary>
            {/* Text Input - Takes up most space */}
            <Box flex="1" minW="0">
              <AutosizeTextarea
                autoFocus
                placeholder={
                  waitingForUserInput
                    ? "Please provide the requested information..."
                    : "What would you like me to do on this page? (e.g., fill out the form, click the button, search for products)"
                }
                value={instructions || ''}
                isDisabled={isRunning && !waitingForUserInput}
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
                  colorScheme={waitingForUserInput ? 'yellow' : 'blue'}
                  size="sm"
                  isDisabled={!instructions || (isRunning && !waitingForUserInput)}
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
