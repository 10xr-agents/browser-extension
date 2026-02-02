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
import { IoSend, IoStop } from 'react-icons/io5';
import { Icon, IconButton } from '@chakra-ui/react';
import { useAppState } from '../state/store';
import TaskHistory from './TaskHistory';
import KnowledgeOverlay from './KnowledgeOverlay';
import AutosizeTextarea from './AutosizeTextarea';
import { KnowledgeCheckSkeleton } from './KnowledgeCheckSkeleton';
import ErrorBoundary from './ErrorBoundary';
import ChatHistoryDrawer from './ChatHistoryDrawer';
import DomainStatus from './components/DomainStatus';
import { TypingIndicator } from './TypingIndicator';
import { messageSyncManager } from '../services/messageSyncService';
import BlockerDialog from './BlockerDialog';
import FileAttachmentInput from './FileAttachmentInput';
import ReportDownloadMenu from './ReportDownloadMenu';
import type { ReportFormat } from '../api/client';

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
  const createNewChatForTab = useAppState((state) => state.sessions.actions.createNewChatForTab);
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

  // Blocker state for pause/resume flow
  // Reference: INTERACT_FLOW_WALKTHROUGH.md §H (Blocker Detection & Task Pause/Resume System)
  const blockerInfo = useAppState((state) => state.currentTask.blockerInfo);
  const isResumingTask = useAppState((state) => state.currentTask.isResumingTask);
  const resumeTaskWithCredentials = useAppState((state) => state.currentTask.actions.resumeTaskWithCredentials);
  const resumeTaskFromWebsite = useAppState((state) => state.currentTask.actions.resumeTaskFromWebsite);
  const clearBlocker = useAppState((state) => state.currentTask.actions.clearBlocker);

  // File attachment state for chat-only and web-with-file tasks
  // Reference: INTERACT_FLOW_WALKTHROUGH.md §7 (File-Based Tasks & Chat-Only Mode)
  const attachment = useAppState((state) => state.currentTask.attachment);
  const attachmentUploadProgress = useAppState((state) => state.currentTask.attachmentUploadProgress);
  const uploadFile = useAppState((state) => state.currentTask.actions.uploadFile);
  const clearAttachment = useAppState((state) => state.currentTask.actions.clearAttachment);
  const downloadReport = useAppState((state) => state.currentTask.actions.downloadReport);
  const taskType = useAppState((state) => state.currentTask.taskType);
  const taskId = useAppState((state) => state.currentTask.taskId);

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
  const prevContentLengthRef = useRef(0);
  // Focus mode: use state to trigger the effect (refs don't cause re-renders)
  const [focusScrollTrigger, setFocusScrollTrigger] = useState(0);

  // Auto-scroll when new content arrives
  // More aggressive scrolling when task is running to ensure new messages are visible
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

    // Scroll to bottom when:
    // 1. New content arrives AND user was at bottom, OR
    // 2. Task is running (always keep up with new messages during active task)
    const shouldScroll = (contentLength > prevLength && wasAtBottom) || 
                         (contentLength > prevLength && taskStatus === 'running');

    if (shouldScroll) {
      // Use requestAnimationFrame for smoother scrolling timing
      requestAnimationFrame(() => {
        if (!scrollContainerRef.current) return;
        scrollContainerRef.current.scrollTo({
          top: scrollContainerRef.current.scrollHeight,
          behavior: 'smooth'
        });
      });
    }
  }, [messages, taskHistory, taskStatus]);

  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const threshold = 80;
    const atBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - threshold;
    userWasAtBottomRef.current = atBottom;
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
      // Focus mode: trigger scroll to snap the newly-submitted user query to top
      // Increment trigger to force the useEffect to run
      setFocusScrollTrigger(prev => prev + 1);
      runTask((message: string) => {
        console.error('Task error:', message);
      });
    }
  }, [instructions, runTask, waitingForUserInput]);

  // Focus mode: after submit, snap the active task section to top of viewport
  // Use a retry mechanism since the DOM may not be updated immediately
  useEffect(() => {
    // Only run when triggered (focusScrollTrigger > 0)
    if (focusScrollTrigger === 0) return;
    
    let scrollCompleted = false;
    
    // Retry finding and scrolling to the focus-anchor with increasing delays
    // This handles the race condition where DOM hasn't updated yet
    const attemptScroll = (attempt: number): boolean => {
      if (scrollCompleted) return true;
      
      // First try the focus-anchor element
      const anchor = document.getElementById('focus-anchor');
      if (anchor) {
        anchor.scrollIntoView({ block: 'start', behavior: 'smooth' });
        scrollCompleted = true;
        userWasAtBottomRef.current = false;
        console.log('[FocusMode] Scrolled to focus-anchor on attempt', attempt);
        return true;
      }
      
      // Fallback: find the last chat-turn element and scroll to it
      const chatTurns = document.querySelectorAll('[id^="chat-turn-"]');
      if (chatTurns.length > 0) {
        const lastTurn = chatTurns[chatTurns.length - 1];
        lastTurn.scrollIntoView({ block: 'start', behavior: 'smooth' });
        scrollCompleted = true;
        userWasAtBottomRef.current = false;
        console.log('[FocusMode] Scrolled to last chat-turn (fallback) on attempt', attempt);
        return true;
      }
      
      return false;
    };
    
    // Try immediately
    if (attemptScroll(0)) return;
    
    // Retry with delays: 100ms, 200ms, 400ms, 600ms
    const delays = [100, 200, 400, 600];
    const timeouts: NodeJS.Timeout[] = [];
    
    delays.forEach((delay, i) => {
      const timeout = setTimeout(() => {
        attemptScroll(i + 1);
      }, delay);
      timeouts.push(timeout);
    });
    
    // Final fallback after 800ms - scroll to bottom of scroll container
    const finalTimeout = setTimeout(() => {
      if (!scrollCompleted && scrollContainerRef.current) {
        // Scroll to show the latest content
        const container = scrollContainerRef.current;
        // Scroll to bottom
        container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        userWasAtBottomRef.current = false;
        console.log('[FocusMode] Used final fallback scroll');
      }
    }, 800);
    timeouts.push(finalTimeout);
    
    // Cleanup timeouts on unmount or re-trigger
    return () => {
      timeouts.forEach(t => clearTimeout(t));
    };
  }, [focusScrollTrigger]);

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

    // Create new session for the ACTIVE tab (tab-scoped sessions)
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (typeof tab?.id === 'number') {
        await createNewChatForTab(tab.id, activeUrl);
      } else {
        await createNewChat(activeUrl);
      }
    } catch (error: unknown) {
      // If tab query fails, still create a session (but may not be pinned correctly)
      await createNewChat(activeUrl);
    }

    // Clear instructions explicitly (startNewChat should do this, but ensure it)
    setInstructions('');
  }, [activeUrl, createNewChat, createNewChatForTab, startNewChat, isRunning, interruptTask, setInstructions, taskStatus]);

  // Blocker resolution handlers
  const handleBlockerCredentials = useCallback((data: Record<string, unknown>) => {
    resumeTaskWithCredentials(data);
  }, [resumeTaskWithCredentials]);

  const handleBlockerResolvedOnWebsite = useCallback(() => {
    resumeTaskFromWebsite();
  }, [resumeTaskFromWebsite]);

  const handleBlockerCancel = useCallback(() => {
    clearBlocker();
  }, [clearBlocker]);

  // Check if blocker is active
  const hasActiveBlocker = blockerInfo !== null && taskStatus === 'awaiting_user';

  // File attachment handlers
  const handleFileSelect = useCallback(async (file: File) => {
    try {
      await uploadFile(file);
    } catch (error) {
      console.error('File upload failed:', error);
    }
  }, [uploadFile]);

  const handleClearAttachment = useCallback(() => {
    clearAttachment();
  }, [clearAttachment]);

  // Report download handler
  const handleDownloadReport = useCallback(async (format: ReportFormat) => {
    await downloadReport(format);
  }, [downloadReport]);

  // Check if task is complete (for showing report download option)
  const isTaskComplete = taskStatus === 'success' && taskId !== null && sessionId !== null;

  // Check if this looks like a chat-only query (allows submitting without URL)
  const isChatOnlyQuery = useCallback((query: string): boolean => {
    if (!query) return false;
    const chatOnlyPatterns = [
      /^(what|how|why|when|where|who|which)\s/i,
      /\b(calculate|sum|total|analyze|explain)\b/i,
      /\b(remember|recall|what did)\b/i,
      /\b(from the|in the uploaded)\s+(file|csv|pdf)\b/i,
    ];
    // If has attachment with question, likely chat-only
    if (attachment && /\?$/.test(query.trim())) {
      return true;
    }
    return chatOnlyPatterns.some(p => p.test(query));
  }, [attachment]);

  // Can submit query even without URL for chat-only queries
  const canSubmitWithoutUrl = isChatOnlyQuery(instructions || '');

  return (
    <Flex direction="column" h="100%" minH="0" w="100%" overflow="hidden" bg={contentBg}>
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

      {/* Zone B: Scrollable Document Stream (stick-to-bottom) */}
      <Box
        ref={scrollContainerRef}
        flex="1"
        overflowY="auto"
        overflowX="hidden"
        minW="0"
        minH="0"
        px={4}
        pt={4}
        pb={2}
        bg={contentBg}
        onScroll={handleScroll}
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

          {/* Blocker Dialog - Shown when task is awaiting user intervention */}
          {/* Reference: INTERACT_FLOW_WALKTHROUGH.md §H (Blocker Detection) */}
          {hasActiveBlocker && blockerInfo && (
            <ErrorBoundary>
              <Box minW="0" py={2}>
                <BlockerDialog
                  blockerInfo={blockerInfo}
                  onSubmitCredentials={handleBlockerCredentials}
                  onResolvedOnWebsite={handleBlockerResolvedOnWebsite}
                  onCancel={handleBlockerCancel}
                  isLoading={isResumingTask}
                />
              </Box>
            </ErrorBoundary>
          )}

          {/* Spacer to ensure last message can scroll fully above input bar */}
          <Box minH="16px" flexShrink={0} />
        </VStack>

      </Box>

      {/* Zone C: Fixed Command Bar at bottom */}
      <Box
        flexShrink={0}
        px={4}
        pb={4}
        pt={2}
        bg={contentBg}
        minW="0"
      >
        <TypingIndicator />
        <Box
          borderWidth="1px"
          borderColor={floatingInputBorder}
          borderRadius="xl"
          bg={floatingInputBg}
          shadow="md"
          minW="0"
          _focusWithin={{
            borderColor: 'blue.500',
            _dark: { borderColor: 'blue.400' },
            boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)',
          }}
        >
          {/* Status line removed - cleaner design without visual artifacts */}

          {/* Attached file indicator */}
          {attachment && (
            <Box px={4} pt={2}>
              <FileAttachmentInput
                attachment={attachment}
                uploadProgress={attachmentUploadProgress}
                onFileSelect={handleFileSelect}
                onClear={handleClearAttachment}
                isDisabled={isRunning}
              />
            </Box>
          )}

          <Flex align="flex-end" px={4} py={3} gap={2} minW="0">
            {/* File attachment button */}
            {!attachment && (
              <Box flexShrink={0} pb={1}>
                <FileAttachmentInput
                  attachment={null}
                  uploadProgress={attachmentUploadProgress}
                  onFileSelect={handleFileSelect}
                  onClear={handleClearAttachment}
                  isDisabled={isRunning}
                />
              </Box>
            )}

            {/* Text Input - Takes up most space */}
            <Box flex="1" minW="0">
              <AutosizeTextarea
                autoFocus
                placeholder={
                  waitingForUserInput
                    ? "Please provide the requested information..."
                    : attachment
                    ? "Ask a question about the attached file..."
                    : "Ask a question or describe what to do (attach files for analysis)"
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

            {/* Report download button (shown when task is complete) */}
            {isTaskComplete && (
              <Box flexShrink={0} pb={1}>
                <ReportDownloadMenu
                  onDownload={handleDownloadReport}
                  isDisabled={isRunning}
                  size="sm"
                />
              </Box>
            )}

            {/* Send Button - Solid filled icons for high contrast */}
            <Box flexShrink={0} pb={1}>
              <IconButton
                aria-label={isRunning && !waitingForUserInput ? 'Stop task' : 'Send task'}
                icon={<Icon as={isRunning && !waitingForUserInput ? IoStop : IoSend} boxSize={4} />}
                onClick={isRunning && !waitingForUserInput ? interruptTask : handleRunTask}
                variant="solid"
                colorScheme={isRunning && !waitingForUserInput ? 'red' : waitingForUserInput ? 'yellow' : 'blue'}
                size="sm"
                isDisabled={!isRunning && !instructions && !canSubmitWithoutUrl}
                _disabled={{
                  opacity: 0.5,
                  cursor: 'not-allowed',
                }}
                _focusVisible={{
                  boxShadow: 'outline',
                }}
                borderRadius="md"
              />
            </Box>
          </Flex>
        </Box>
      </Box>
    </Flex>
  );
};

export default TaskUI;
