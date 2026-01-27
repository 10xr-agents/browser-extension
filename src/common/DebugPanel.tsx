/**
 * Debug Panel Component for Thin Client Architecture
 * 
 * Tabbed interface for system/debug information to improve navigation and information density.
 * System Health cards remain fixed at top, debug sections organized in tabs below.
 * 
 * Reference: Debug Panel Refactor - Tabbed Interface
 */

import React from 'react';
import {
  Box,
  VStack,
  Heading,
  useColorModeValue,
  Text,
  Code,
  Tabs,
  TabList,
  TabPanels,
  Tab,
  TabPanel,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import AccessibilityTreeView from './AccessibilityTreeView';
import CoverageMetricsView from './CoverageMetricsView';
import HybridElementView from './HybridElementView';
import TaskStatus from './TaskStatus';
import TaskHistoryDebug from './TaskHistoryDebug';
import NetworkTraceView from './NetworkTraceView';
import RAGContextView from './RAGContextView';
import StateInspectorView from './StateInspectorView';
import PlanViewDebug from './PlanViewDebug';
import VerificationViewDebug from './VerificationViewDebug';
import CorrectionViewDebug from './CorrectionViewDebug';
import ErrorBoundary from './ErrorBoundary';

interface DebugPanelProps {
  // Props can be added here in the future if needed
}

const DebugPanel: React.FC<DebugPanelProps> = () => {
  const developerMode = useAppState((state) => state.settings.developerMode);
  
  // Get debug data from store
  const accessibilityTree = useAppState((state) => state.currentTask.accessibilityTree);
  const coverageMetrics = useAppState((state) => state.currentTask.coverageMetrics);
  const hybridElements = useAppState((state) => state.currentTask.hybridElements);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const actionStatus = useAppState((state) => state.currentTask.actionStatus);
  const plan = useAppState((state) => state.currentTask.plan);
  const currentStep = useAppState((state) => state.currentTask.currentStep);
  const totalSteps = useAppState((state) => state.currentTask.totalSteps);
  const verificationHistory = useAppState((state) => state.currentTask.verificationHistory);
  const correctionHistory = useAppState((state) => state.currentTask.correctionHistory);

  // Dark mode colors - defined at component top level
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const descColor = useColorModeValue('gray.600', 'gray.400');

  // Don't render if developer mode is off
  if (!developerMode) {
    return null;
  }

  // Card wrapper component for consistent styling
  const DebugCard: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
    <Box
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="lg"
      p={4}
      bg={cardBg}
      shadow="sm"
    >
      <Heading size="sm" mb={3} color={headingColor}>
        {title}
      </Heading>
      {children}
    </Box>
  );

  // Empty state component
  const EmptyState: React.FC<{ message: string }> = ({ message }) => (
    <Text fontSize="sm" color={descColor} fontStyle="italic">
      {message}
    </Text>
  );

  // Tab colors
  const tabBg = useColorModeValue('white', 'gray.800');
  const tabSelectedBg = useColorModeValue('blue.50', 'blue.900/20');
  const tabSelectedColor = useColorModeValue('blue.600', 'blue.400');
  const tabBorderColor = useColorModeValue('gray.200', 'gray.700');
  const tabPanelBg = useColorModeValue('white', 'gray.900');
  const tabHoverBg = useColorModeValue('gray.50', 'gray.700');
  const scrollbarTrackBg = useColorModeValue('gray.100', 'gray.700');
  const scrollbarThumbBg = useColorModeValue('gray.400', 'gray.500');

  return (
    <Box w="100%" h="100%" display="flex" flexDirection="column" overflow="hidden">
      {/* Tabbed Interface - All content in tabs */}
      <Tabs variant="enclosed" size="sm" isLazy colorScheme="blue" display="flex" flexDirection="column" h="100%" overflow="hidden">
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
          <Tab
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
            Execution
          </Tab>
          <Tab
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
            Network
          </Tab>
          <Tab
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
            State
          </Tab>
          <Tab
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
            Logs
          </Tab>
          <Tab
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
            RAG
          </Tab>
        </TabList>

        <TabPanels flex="1" overflow="hidden" display="flex" flexDirection="column">
          {/* Execution Tab - Contains Execution Status, Action Plan, Verification, Correction */}
          <TabPanel 
            px={0} 
            py={4} 
            bg={tabPanelBg}
            flex="1"
            overflowY="auto"
            overflowX="hidden"
            minH="0"
          >
            <VStack align="stretch" spacing={4}>
              {/* Execution Status */}
              {(taskStatus === 'running' || actionStatus !== 'idle') && (
                <ErrorBoundary>
                  <DebugCard title="Execution Status">
                    <TaskStatus />
                  </DebugCard>
                </ErrorBoundary>
              )}

              {/* Action Plan (Manus Orchestrator) */}
              {(plan || currentStep || totalSteps) && (
                <ErrorBoundary>
                  <DebugCard title="Action Plan">
                    <PlanViewDebug />
                  </DebugCard>
                </ErrorBoundary>
              )}

              {/* Verification Results (Manus Orchestrator) */}
              {verificationHistory && verificationHistory.length > 0 && (
                <ErrorBoundary>
                  <DebugCard title="Verification Results">
                    <VerificationViewDebug />
                  </DebugCard>
                </ErrorBoundary>
              )}

              {/* Correction Results (Manus Orchestrator) */}
              {correctionHistory && correctionHistory.length > 0 && (
                <ErrorBoundary>
                  <DebugCard title="Correction Results">
                    <CorrectionViewDebug />
                  </DebugCard>
                </ErrorBoundary>
              )}

              {/* Empty state if no execution data */}
              {!(taskStatus === 'running' || actionStatus !== 'idle') && 
               !(plan || currentStep || totalSteps) && 
               (!verificationHistory || verificationHistory.length === 0) && 
               (!correctionHistory || correctionHistory.length === 0) && (
                <EmptyState message="No execution data available. Start a task to see execution details here." />
              )}
            </VStack>
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
              <DebugCard title="Network/API Trace">
                <NetworkTraceView />
              </DebugCard>
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
            <VStack align="stretch" spacing={4}>
              <ErrorBoundary>
                <DebugCard title="State Inspector">
                  <StateInspectorView />
                </DebugCard>
              </ErrorBoundary>
              
              {/* Page Structure (Accessibility Tree) */}
              {accessibilityTree && (
                <ErrorBoundary>
                  <DebugCard title="Page Structure">
                    <AccessibilityTreeView tree={accessibilityTree} />
                  </DebugCard>
                </ErrorBoundary>
              )}

              {/* Interaction Coverage (Coverage Metrics) */}
              {coverageMetrics && (
                <ErrorBoundary>
                  <DebugCard title="Interaction Coverage">
                    <CoverageMetricsView metrics={coverageMetrics} />
                  </DebugCard>
                </ErrorBoundary>
              )}

              {/* Element Sources (Hybrid Elements) */}
              {hybridElements && hybridElements.length > 0 && (
                <ErrorBoundary>
                  <DebugCard title="Element Sources">
                    <HybridElementView hybridElements={hybridElements} />
                  </DebugCard>
                </ErrorBoundary>
              )}
            </VStack>
          </TabPanel>

          {/* Logs Tab */}
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
              <DebugCard title="Raw Logs">
                <TaskHistoryDebug />
              </DebugCard>
            </ErrorBoundary>
          </TabPanel>

          {/* RAG Tab */}
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
              <DebugCard title="RAG Context">
                <RAGContextView />
              </DebugCard>
            </ErrorBoundary>
          </TabPanel>
        </TabPanels>
      </Tabs>
    </Box>
  );
};

export default DebugPanel;
