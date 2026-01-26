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
  useToast,
  VStack,
  Box,
  Text,
  Button,
  Flex,
  Icon,
  useColorModeValue,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import React, { useCallback, useEffect, useState, useMemo } from 'react';
import { BsPlayFill, BsStopFill } from 'react-icons/bs';
import { useAppState } from '../state/store';
import TaskHistory from './TaskHistory';
import KnowledgeOverlay from './KnowledgeOverlay';
import AutosizeTextarea from './AutosizeTextarea';
import { KnowledgeCheckSkeleton } from './KnowledgeCheckSkeleton';
import DebugPanel from './DebugPanel';
import PlanView from './PlanView';
import VerificationView from './VerificationView';
import CorrectionView from './CorrectionView';

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

  const toast = useToast();

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

  const toastError = useCallback(
    (message: string) => {
      toast({
        title: 'Error',
        description: message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    },
    [toast]
  );

  const handleRunTask = useCallback(() => {
    instructions && runTask(toastError);
  }, [instructions, runTask, toastError]);

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

  return (
    <Flex direction="column" h="100%" minH="0" w="100%" overflow="hidden" bg={contentBg}>
      {/* Scrollable Content Area */}
      <Box flex="1" overflowY="auto" overflowX="hidden" minW="0" px={4} py={3} bg={contentBg}>
        <VStack spacing={4} align="stretch" minW="0">
          {/* Plan View (Manus Orchestrator) */}
          <PlanView />

          {/* Verification View (Manus Orchestrator) */}
          <VerificationView />

          {/* Correction View (Manus Orchestrator) */}
          <CorrectionView />

          {/* Status Banner */}
          {hasOrgKnowledge === false && (
            <Box minW="0" mb={2}>
              <Alert
                status="info"
                variant="subtle"
                borderRadius="md"
                bg={bannerBg}
                minW="0"
                py={2}
                px={3}
              >
                <AlertIcon as={InfoIcon} boxSize={3.5} />
                <Text
                  fontSize="xs"
                  color={bannerTextColor}
                  lineHeight="1.3"
                  fontWeight="medium"
                  minW="0"
                >
                  This website is not part of your organization's approved tools. Suggestions are based on general knowledge only.
                </Text>
              </Alert>
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
            <Box minW="0">
              <KnowledgeOverlay url={activeUrl} />
            </Box>
          )}

          {/* Accessibility Elements Info (Task 5) - User-facing indicator only */}
          {state.accessibilityElements && state.accessibilityElements.length > 0 && (
            <Box
              p={3}
              borderWidth="1px"
              borderColor={borderColor}
              borderRadius="lg"
              bg="blue.50"
              _dark={{ bg: 'blue.900/20' }}
              minW="0"
            >
              <Text
                fontSize="xs"
                color="blue.700"
                _dark={{ color: 'blue.300' }}
                fontWeight="medium"
                minW="0"
              >
                ✓ Using {state.accessibilityElements.length} accessibility-derived interactive elements
              </Text>
            </Box>
          )}

          {/* Task History - User-facing view only */}
          <Box minW="0">
            <TaskHistory />
          </Box>
        </VStack>
      </Box>

      {/* Fixed Chat Input at Bottom */}
      <Box
        flex="none"
        bg={contentBg}
        borderTopWidth="1px"
        borderColor={borderColor}
        px={4}
        pt={3}
        pb={3}
        minW="0"
      >
        {/* Prompt Input Card */}
        <Box
          borderWidth="1px"
          borderColor={borderColor}
          borderRadius="xl"
          p={4}
          bg={cardBg}
          shadow="sm"
          minW="0"
        >
          <VStack spacing={3} align="stretch" minW="0">
            <AutosizeTextarea
              autoFocus
              placeholder="What would you like me to do on this page?"
              value={instructions || ''}
              isDisabled={isRunning}
              onChange={(e) => setInstructions(e.target.value)}
              onKeyDown={onKeyDown}
              bg={inputBg}
              borderWidth="1px"
              borderColor={useColorModeValue('gray.300', 'gray.600')}
              borderRadius="lg"
              px={4}
              py={3}
              fontSize="sm"
              resize="none"
              minW="0"
              _focus={{
                borderColor: 'blue.500',
                _dark: { borderColor: 'blue.400' },
                boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)',
              }}
              _focusVisible={{
                boxShadow: '0 0 0 1px var(--chakra-colors-blue-500)',
              }}
              _disabled={{
                opacity: 0.6,
                cursor: 'not-allowed',
              }}
              minRows={2}
              maxRows={6}
            />
            
            <Flex justify="flex-end" gap={2} minW="0" align="center">
              {isRunning ? (
                <Button
                  leftIcon={<Icon as={BsStopFill} />}
                  onClick={interruptTask}
                  colorScheme="red"
                  size="md"
                  fontWeight="medium"
                  _focusVisible={{
                    boxShadow: 'outline',
                  }}
                >
                  Stop
                </Button>
              ) : (
                <Button
                  leftIcon={<Icon as={BsPlayFill} />}
                  onClick={handleRunTask}
                  colorScheme="blue"
                  size="md"
                  fontWeight="medium"
                  isDisabled={!instructions}
                  _disabled={{
                    opacity: 0.5,
                    cursor: 'not-allowed',
                  }}
                  _focusVisible={{
                    boxShadow: 'outline',
                  }}
                >
                  Start Task
                </Button>
              )}
            </Flex>
          </VStack>
        </Box>
      </Box>

      {/* Debug Panel - Only visible when developer mode is enabled */}
      <DebugPanel />
    </Flex>
  );
};

export default TaskUI;
