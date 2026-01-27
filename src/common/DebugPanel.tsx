/**
 * Debug Panel Component for Thin Client Architecture
 * 
 * Flat dashboard view for system/debug information.
 * No accordions - all sections displayed as cards in a vertical stack.
 * 
 * Reference: User request for flat dashboard design
 */

import React from 'react';
import {
  Box,
  VStack,
  Heading,
  useColorModeValue,
  Text,
  Code,
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
  hideHeader?: boolean;
}

const DebugPanel: React.FC<DebugPanelProps> = ({ hideHeader = false }) => {
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

  return (
    <VStack align="stretch" spacing={5} w="100%">
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

        {/* Network/API Trace */}
        <ErrorBoundary>
          <DebugCard title="Network/API Trace">
            <NetworkTraceView />
          </DebugCard>
        </ErrorBoundary>

        {/* Raw Logs */}
        <ErrorBoundary>
          <DebugCard title="Raw Logs">
            <TaskHistoryDebug />
          </DebugCard>
        </ErrorBoundary>

        {/* RAG Context */}
        <ErrorBoundary>
          <DebugCard title="RAG Context">
            <RAGContextView />
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

        {/* State Inspector */}
        <ErrorBoundary>
          <DebugCard title="State Inspector">
            <StateInspectorView />
          </DebugCard>
        </ErrorBoundary>
      </VStack>
  );
};

export default DebugPanel;
