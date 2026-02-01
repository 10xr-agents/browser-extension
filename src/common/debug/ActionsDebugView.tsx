/**
 * Actions Debug View
 * 
 * Shows action execution history, current action status, and debugger state.
 * Critical for debugging action execution issues in the thin client architecture.
 * 
 * Reference: Action execution flow in domActions.ts and currentTask.ts
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Code,
  Divider,
  useColorModeValue,
  Icon,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Tooltip,
  Stat,
  StatLabel,
  StatNumber,
  SimpleGrid,
} from '@chakra-ui/react';
import { FiPlay, FiCheck, FiX, FiClock, FiZap, FiTarget, FiMousePointer } from 'react-icons/fi';
import { useAppState } from '../../state/store';

const ActionsDebugView: React.FC = () => {
  const taskStatus = useAppState((state) => state.currentTask.status);
  const actionStatus = useAppState((state) => state.currentTask.actionStatus);
  const tabId = useAppState((state) => state.currentTask.tabId);
  const displayHistory = useAppState((state) => state.currentTask.displayHistory);
  const currentStep = useAppState((state) => state.currentTask.currentStep);
  const totalSteps = useAppState((state) => state.currentTask.totalSteps);

  // Colors
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const codeBg = useColorModeValue('gray.50', 'gray.900');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const successBg = useColorModeValue('green.50', 'green.900/20');
  const errorBg = useColorModeValue('red.50', 'red.900/20');
  const activeBg = useColorModeValue('blue.50', 'blue.900/20');

  const getActionStatusConfig = (status: string) => {
    switch (status) {
      case 'idle':
        return { color: 'gray', label: 'Idle', icon: FiClock };
      case 'attaching-debugger':
        return { color: 'yellow', label: 'Attaching Debugger', icon: FiZap };
      case 'pulling-dom':
        return { color: 'blue', label: 'Reading DOM', icon: FiTarget };
      case 'transforming-dom':
        return { color: 'blue', label: 'Processing DOM', icon: FiTarget };
      case 'performing-query':
        return { color: 'purple', label: 'Running AI', icon: FiZap };
      case 'performing-action':
        return { color: 'orange', label: 'Executing Action', icon: FiMousePointer };
      case 'waiting':
        return { color: 'yellow', label: 'Waiting', icon: FiClock };
      default:
        return { color: 'gray', label: status, icon: FiClock };
    }
  };

  const actionStatusConfig = getActionStatusConfig(actionStatus);

  // Get action result badge
  const getActionResultBadge = (entry: { parsedAction?: unknown }) => {
    if (!entry.parsedAction) return null;
    
    if (typeof entry.parsedAction === 'object' && entry.parsedAction !== null) {
      if ('error' in entry.parsedAction) {
        return <Badge colorScheme="red" fontSize="xs">Error</Badge>;
      }
      if ('parsedAction' in entry.parsedAction) {
        const parsed = entry.parsedAction as { parsedAction: { name: string } };
        if (parsed.parsedAction.name === 'fail') {
          return <Badge colorScheme="red" fontSize="xs">Failed</Badge>;
        }
        if (parsed.parsedAction.name === 'finish') {
          return <Badge colorScheme="green" fontSize="xs">Completed</Badge>;
        }
        return <Badge colorScheme="blue" fontSize="xs">{parsed.parsedAction.name}</Badge>;
      }
    }
    return null;
  };

  // Extract action details for display
  const getActionDetails = (entry: { action?: string; parsedAction?: unknown }) => {
    const action = entry.action || '';
    const parsed = entry.parsedAction as { parsedAction?: { name: string; args?: Record<string, unknown> } } | undefined;
    
    return {
      raw: action,
      name: parsed?.parsedAction?.name || 'unknown',
      args: parsed?.parsedAction?.args || {},
    };
  };

  return (
    <VStack align="stretch" spacing={4}>
      {/* Current Status Card */}
      <Box p={4} borderWidth="1px" borderRadius="lg" bg={cardBg} borderColor={borderColor}>
        <Text fontSize="sm" fontWeight="semibold" color={headingColor} mb={3}>
          Current Status
        </Text>
        
        <SimpleGrid columns={2} spacing={4} mb={4}>
          <Stat size="sm">
            <StatLabel fontSize="xs" color={mutedColor}>Task Status</StatLabel>
            <StatNumber fontSize="sm">
              <Badge 
                colorScheme={
                  taskStatus === 'running' ? 'blue' : 
                  taskStatus === 'success' ? 'green' : 
                  taskStatus === 'error' ? 'red' : 'gray'
                }
                fontSize="xs"
              >
                {taskStatus || 'idle'}
              </Badge>
            </StatNumber>
          </Stat>
          <Stat size="sm">
            <StatLabel fontSize="xs" color={mutedColor}>Action Status</StatLabel>
            <StatNumber fontSize="sm">
              <HStack spacing={1}>
                <Icon as={actionStatusConfig.icon} boxSize={3} color={`${actionStatusConfig.color}.500`} />
                <Badge colorScheme={actionStatusConfig.color} fontSize="xs">
                  {actionStatusConfig.label}
                </Badge>
              </HStack>
            </StatNumber>
          </Stat>
          <Stat size="sm">
            <StatLabel fontSize="xs" color={mutedColor}>Tab ID</StatLabel>
            <StatNumber fontSize="sm">
              <Code fontSize="xs" bg={codeBg}>{tabId || 'None'}</Code>
            </StatNumber>
          </Stat>
          <Stat size="sm">
            <StatLabel fontSize="xs" color={mutedColor}>Progress</StatLabel>
            <StatNumber fontSize="sm">
              {currentStep && totalSteps ? (
                <Text fontSize="sm">{currentStep} / {totalSteps}</Text>
              ) : (
                <Text fontSize="sm" color={mutedColor}>—</Text>
              )}
            </StatNumber>
          </Stat>
        </SimpleGrid>

        <Divider mb={4} />

        <Text fontSize="sm" fontWeight="semibold" color={headingColor} mb={2}>
          Debugger Info
        </Text>
        <VStack align="stretch" spacing={2} fontSize="xs">
          <HStack justify="space-between">
            <Text color={mutedColor}>Debugger Attached:</Text>
            <Badge colorScheme={tabId ? 'green' : 'gray'} fontSize="xs">
              {tabId ? 'Yes' : 'No'}
            </Badge>
          </HStack>
          <HStack justify="space-between">
            <Text color={mutedColor}>Actions Executed:</Text>
            <Code fontSize="xs" bg={codeBg}>{displayHistory.length}</Code>
          </HStack>
        </VStack>
      </Box>

      {/* Action History */}
      <Box p={4} borderWidth="1px" borderRadius="lg" bg={cardBg} borderColor={borderColor}>
        <HStack justify="space-between" align="center" mb={3}>
          <Text fontSize="sm" fontWeight="semibold" color={headingColor}>
            Action History
          </Text>
          <Badge colorScheme="gray" fontSize="xs">{displayHistory.length} actions</Badge>
        </HStack>

        {displayHistory.length === 0 ? (
          <Text fontSize="sm" color={mutedColor} fontStyle="italic">
            No actions executed yet. Start a task to see action history.
          </Text>
        ) : (
          <Accordion allowMultiple defaultIndex={[0]}>
            {displayHistory.slice().reverse().slice(0, 10).map((entry, index) => {
              const actionDetails = getActionDetails(entry);
              const actualIndex = displayHistory.length - index;
              
              return (
                <AccordionItem key={index} border="none" mb={2}>
                  <AccordionButton 
                    bg={
                      actionDetails.name === 'fail' ? errorBg :
                      actionDetails.name === 'finish' ? successBg :
                      index === 0 ? activeBg : 'transparent'
                    }
                    borderRadius="md"
                    _hover={{ bg: useColorModeValue('gray.100', 'gray.700') }}
                  >
                    <HStack flex="1" spacing={2}>
                      <Badge colorScheme="gray" fontSize="xs" minW="24px" textAlign="center">
                        {actualIndex}
                      </Badge>
                      <Badge colorScheme={
                        actionDetails.name === 'click' ? 'blue' :
                        actionDetails.name === 'setValue' ? 'purple' :
                        actionDetails.name === 'finish' ? 'green' :
                        actionDetails.name === 'fail' ? 'red' : 'gray'
                      } fontSize="xs">
                        {actionDetails.name}
                      </Badge>
                      <Text 
                        fontSize="xs" 
                        color={textColor} 
                        flex="1" 
                        textAlign="left"
                        isTruncated
                      >
                        {typeof entry.thought === 'string' 
                          ? entry.thought.slice(0, 60) + (entry.thought.length > 60 ? '...' : '')
                          : 'No thought'
                        }
                      </Text>
                      {getActionResultBadge(entry)}
                    </HStack>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4}>
                    <VStack align="stretch" spacing={3} fontSize="xs">
                      {/* Thought */}
                      <Box>
                        <Text fontWeight="semibold" color={headingColor} mb={1}>Thought:</Text>
                        <Text color={textColor} whiteSpace="pre-wrap">
                          {typeof entry.thought === 'string' ? entry.thought : String(entry.thought || '')}
                        </Text>
                      </Box>
                      
                      {/* Raw Action */}
                      <Box>
                        <Text fontWeight="semibold" color={headingColor} mb={1}>Action:</Text>
                        <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={codeBg}>
                          {actionDetails.raw}
                        </Code>
                      </Box>

                      {/* Parsed Args */}
                      {Object.keys(actionDetails.args).length > 0 && (
                        <Box>
                          <Text fontWeight="semibold" color={headingColor} mb={1}>Arguments:</Text>
                          <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={codeBg}>
                            {JSON.stringify(actionDetails.args, null, 2)}
                          </Code>
                        </Box>
                      )}

                      {/* Token Usage */}
                      {entry.usage && (
                        <HStack spacing={4}>
                          <Text color={mutedColor}>
                            Tokens: {(entry.usage.promptTokens || 0) + (entry.usage.completionTokens || 0)}
                          </Text>
                          <Text color={mutedColor}>
                            (Prompt: {entry.usage.promptTokens || 0}, Completion: {entry.usage.completionTokens || 0})
                          </Text>
                        </HStack>
                      )}
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}

        {displayHistory.length > 10 && (
          <Text fontSize="xs" color={mutedColor} textAlign="center" mt={2}>
            Showing last 10 of {displayHistory.length} actions
          </Text>
        )}
      </Box>
    </VStack>
  );
};

export default ActionsDebugView;
