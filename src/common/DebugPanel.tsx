/**
 * Debug Panel Component for Thin Client Architecture
 * 
 * Dedicated container for all debug components. Only visible when developer mode is enabled.
 * Collapsible panel with accordion organization and health signals in header.
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §2 (Task 2: Space Utilization & Layout)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §3 (Task 2: Space Utilization & Layout)
 */

import React from 'react';
import {
  Box,
  VStack,
  Collapse,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Heading,
  useColorModeValue,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import AccessibilityTreeView from './AccessibilityTreeView';
import CoverageMetricsView from './CoverageMetricsView';
import HybridElementView from './HybridElementView';
import TaskStatus from './TaskStatus';
import TaskHistoryDebug from './TaskHistoryDebug';
import DebugPanelHeader from './DebugPanelHeader';
import NetworkTraceView from './NetworkTraceView';
import RAGContextView from './RAGContextView';
import StateInspectorView from './StateInspectorView';
import PlanViewDebug from './PlanViewDebug';
import VerificationViewDebug from './VerificationViewDebug';
import CorrectionViewDebug from './CorrectionViewDebug';

const DebugPanel: React.FC = () => {
  const developerMode = useAppState((state) => state.settings.developerMode);
  const debugPanelExpanded = useAppState((state) => state.ui.debugPanelExpanded);
  const setDebugPanelExpanded = useAppState((state) => state.ui.actions.setDebugPanelExpanded);
  
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

  // Terminal aesthetic theme: darker background to distinguish from main UI
  const panelBg = useColorModeValue('gray.100', 'gray.950');
  const borderColor = useColorModeValue('gray.300', 'gray.800');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const terminalBorder = useColorModeValue('gray.300', 'gray.700');

  // Don't render if developer mode is off
  if (!developerMode) {
    return null;
  }

  const handleToggle = () => {
    setDebugPanelExpanded(!debugPanelExpanded);
  };

  return (
    <Box 
      w="100%" 
      borderTopWidth="2px" 
      borderColor={terminalBorder}
      shadow="md"
      bg={panelBg}
    >
      {/* Compact Header with Health Signals - Always Visible */}
      <DebugPanelHeader
        isExpanded={debugPanelExpanded}
        onToggle={handleToggle}
      />

      {/* Collapsible Panel Content */}
      <Collapse in={debugPanelExpanded} animateOpacity>
        <Box
          bg={panelBg}
          maxH="400px"
          overflowY="auto"
          p={4}
          borderTopWidth="1px"
          borderColor={borderColor}
        >
          <VStack align="stretch" spacing={4}>
            <Heading size="sm" color={headingColor} fontFamily="mono" letterSpacing="wide">
              Debug Panel
            </Heading>

            {/* Accordion Organization */}
            <Accordion allowMultiple allowToggle defaultIndex={[]}>
              {/* Execution Status */}
              {(taskStatus === 'running' || actionStatus !== 'idle') && (
                <AccordionItem>
                  <AccordionButton>
                    <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                      Execution Status
                    </Heading>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4}>
                    <TaskStatus />
                  </AccordionPanel>
                </AccordionItem>
              )}

              {/* Action Plan (Manus Orchestrator) */}
              {(plan || currentStep || totalSteps) && (
                <AccordionItem>
                  <AccordionButton>
                    <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                      Action Plan
                    </Heading>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4}>
                    <PlanViewDebug />
                  </AccordionPanel>
                </AccordionItem>
              )}

              {/* Verification Results (Manus Orchestrator) */}
              {verificationHistory && verificationHistory.length > 0 && (
                <AccordionItem>
                  <AccordionButton>
                    <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                      Verification Results
                    </Heading>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4}>
                    <VerificationViewDebug />
                  </AccordionPanel>
                </AccordionItem>
              )}

              {/* Correction Results (Manus Orchestrator) */}
              {correctionHistory && correctionHistory.length > 0 && (
                <AccordionItem>
                  <AccordionButton>
                    <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                      Correction Results
                    </Heading>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4}>
                    <CorrectionViewDebug />
                  </AccordionPanel>
                </AccordionItem>
              )}

              {/* Page Structure (Accessibility Tree) */}
              {accessibilityTree && (
                <AccordionItem>
                  <AccordionButton>
                    <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                      Page Structure
                    </Heading>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4}>
                    <AccessibilityTreeView tree={accessibilityTree} />
                  </AccordionPanel>
                </AccordionItem>
              )}

              {/* Interaction Coverage (Coverage Metrics) */}
              {coverageMetrics && (
                <AccordionItem>
                  <AccordionButton>
                    <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                      Interaction Coverage
                    </Heading>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4}>
                    <CoverageMetricsView metrics={coverageMetrics} />
                  </AccordionPanel>
                </AccordionItem>
              )}

              {/* Element Sources (Hybrid Elements) */}
              {hybridElements && hybridElements.length > 0 && (
                <AccordionItem>
                  <AccordionButton>
                    <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                      Element Sources
                    </Heading>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4}>
                    <HybridElementView hybridElements={hybridElements} />
                  </AccordionPanel>
                </AccordionItem>
              )}

              {/* Raw Logs (Task History Debug View) */}
              <AccordionItem>
                <AccordionButton>
                  <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                    Raw Logs
                  </Heading>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <TaskHistoryDebug />
                </AccordionPanel>
              </AccordionItem>

              {/* Network/API Trace (NEW - Task 3) */}
              <AccordionItem>
                <AccordionButton>
                  <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                    Network/API Trace
                  </Heading>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <NetworkTraceView />
                </AccordionPanel>
              </AccordionItem>

              {/* RAG Context (NEW - Task 3) */}
              <AccordionItem>
                <AccordionButton>
                  <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                    RAG Context
                  </Heading>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <RAGContextView />
                </AccordionPanel>
              </AccordionItem>

              {/* State Inspector (NEW - Task 3) */}
              <AccordionItem>
                <AccordionButton>
                  <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
                    State Inspector
                  </Heading>
                  <AccordionIcon />
                </AccordionButton>
                <AccordionPanel pb={4}>
                  <StateInspectorView />
                </AccordionPanel>
              </AccordionItem>
            </Accordion>
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
};

export default DebugPanel;
