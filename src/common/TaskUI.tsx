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
  Spacer,
  Textarea,
  useToast,
  Button,
  VStack,
  Box,
  Input,
  InputGroup,
  InputRightElement,
} from '@chakra-ui/react';
import React, { useCallback, useEffect, useState } from 'react';
import { SearchIcon } from '@chakra-ui/icons';
import { debugMode } from '../constants';
import { useAppState } from '../state/store';
import RunTaskButton from './RunTaskButton';
import TaskHistory from './TaskHistory';
import TaskStatus from './TaskStatus';
import KnowledgeOverlay from './KnowledgeOverlay';
import AccessibilityTreeView from './AccessibilityTreeView';
import HybridElementView from './HybridElementView';
import CoverageMetricsView from './CoverageMetricsView';

const TaskUI = () => {
  const state = useAppState((state) => ({
    taskHistory: state.currentTask.displayHistory, // Updated to use displayHistory
    taskStatus: state.currentTask.status,
    runTask: state.currentTask.actions.runTask,
    instructions: state.ui.instructions,
    setInstructions: state.ui.actions.setInstructions,
    accessibilityTree: state.currentTask.accessibilityTree, // Accessibility tree for display (Task 4)
    accessibilityElements: state.currentTask.accessibilityElements, // Filtered accessibility elements (Task 5)
    hybridElements: state.currentTask.hybridElements, // Hybrid elements combining accessibility and DOM (Task 7)
    coverageMetrics: state.currentTask.coverageMetrics, // Coverage metrics for accessibility-first selection (Task 8)
  }));

  const [activeUrl, setActiveUrl] = useState<string>('');
  const [knowledgeQuery, setKnowledgeQuery] = useState<string>('');
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

  const runTask = () => {
    state.instructions && state.runTask(toastError);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      runTask();
    }
  };

  const handleResolveKnowledge = () => {
    if (activeUrl) {
      setShowKnowledge(true);
    }
  };

  return (
    <VStack spacing={4} align="stretch">
      {/* Knowledge Resolution Section */}
      {activeUrl && (
        <Box p={4} borderWidth={1} borderRadius="md" bg="gray.50">
          <HStack mb={2}>
            <InputGroup size="sm">
              <Input
                placeholder="Optional query for knowledge search..."
                value={knowledgeQuery}
                onChange={(e) => setKnowledgeQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleResolveKnowledge();
                  }
                }}
              />
              <InputRightElement>
                <Button
                  size="xs"
                  onClick={handleResolveKnowledge}
                  leftIcon={<SearchIcon />}
                  colorScheme="blue"
                >
                  Resolve
                </Button>
              </InputRightElement>
            </InputGroup>
          </HStack>
          {showKnowledge && (
            <KnowledgeOverlay url={activeUrl} query={knowledgeQuery || undefined} />
          )}
        </Box>
      )}

      {/* Accessibility Tree Section (Task 4) */}
      {state.accessibilityTree && (
        <Box mt={4}>
          <AccessibilityTreeView tree={state.accessibilityTree} />
        </Box>
      )}

              {/* Accessibility Elements Info (Task 5) */}
              {state.accessibilityElements && state.accessibilityElements.length > 0 && (
                <Box mt={2} p={2} borderWidth={1} borderRadius="md" bg="blue.50">
                  <Text fontSize="xs" color="blue.700">
                    ✓ Using {state.accessibilityElements.length} accessibility-derived interactive elements
                    (reduces token count by filtering to interactive elements only)
                  </Text>
                </Box>
              )}

              {/* Coverage Metrics View (Task 8) */}
              {state.coverageMetrics && (
                <Box mt={4}>
                  <CoverageMetricsView metrics={state.coverageMetrics} />
                </Box>
              )}

              {/* Hybrid Elements View (Task 7) */}
              {state.hybridElements && state.hybridElements.length > 0 && (
                <Box mt={4}>
                  <HybridElementView hybridElements={state.hybridElements} />
                </Box>
              )}

      {/* Task Execution Section */}
      <Box>
        <Textarea
          autoFocus
          placeholder="Spadeworks Copilot AI uses OpenAI's GPT-4 API to perform actions on the current page. Try telling it to sign up for a newsletter, or to add an item to your cart."
          value={state.instructions || ''}
          disabled={taskInProgress}
          onChange={(e) => state.setInstructions(e.target.value)}
          mb={2}
          onKeyDown={onKeyDown}
        />
        <HStack>
          <RunTaskButton runTask={runTask} />
          <Spacer />
          {debugMode && <TaskStatus />}
        </HStack>
      </Box>

      <TaskHistory />
    </VStack>
  );
};

export default TaskUI;
