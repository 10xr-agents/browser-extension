/**
 * Task History User View Component for Thin Client Architecture
 * 
 * User-centric chat interface with message bubbles, action cards, and collapsible technical details.
 * Similar to ChatGPT/Claude with clean, modern conversation stream.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md Part 2 §1.2 (Task 1: Task History Refactor)
 * Reference: UX Refactor - User-Centric Chat Design
 */

import React, { useMemo, useEffect } from 'react';
import {
  VStack,
  HStack,
  Box,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import { DisplayHistoryEntry } from '../state/currentTask';
import ActionCard from './ActionCard';
import ThoughtChain from './ThoughtChain';
import { transformThought } from '../helpers/userFriendlyMessages';
import ChatTurn from './ChatTurn';
import { groupHistoryIntoTurns } from '../helpers/groupHistoryIntoTurns';

const TaskHistoryUser: React.FC = () => {
  const taskHistory = useAppState((state) => state.currentTask.displayHistory);
  // Safety check: Ensure messages is always an array (never undefined)
  const messagesRaw = useAppState((state) => state.currentTask.messages);
  const messages = Array.isArray(messagesRaw) ? messagesRaw : [];
  
  const taskStatus = useAppState((state) => state.currentTask.status);
  const instructions = useAppState((state) => state.currentTask.instructions);
  const sessionId = useAppState((state) => state.currentTask.sessionId);
  const loadMessages = useAppState((state) => state.currentTask.actions.loadMessages);
  const accessibilityElements = useAppState((state) => state.currentTask.accessibilityElements);
  const correctionHistory = useAppState((state) => state.currentTask.correctionHistory);
  const verificationHistory = useAppState((state) => state.currentTask.verificationHistory);
  // NOTE: previousConversations removed - now handled by ChatHistoryDrawer
  
  // Load messages on mount if sessionId exists
  useEffect(() => {
    if (sessionId && messages.length === 0) {
      loadMessages(sessionId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, messages.length]); // loadMessages is stable from Zustand, no need in deps

  // Color definitions - ALL at component top level
  const userMessageBg = useColorModeValue('blue.50', 'blue.900/20');
  const assistantMessageBg = useColorModeValue('transparent', 'transparent');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const errorText = useColorModeValue('red.800', 'red.300');
  const warningBg = useColorModeValue('orange.50', 'orange.900/20');
  const warningText = useColorModeValue('orange.800', 'orange.300');
  const successColor = useColorModeValue('green.600', 'green.400');
  const technicalDetailColor = useColorModeValue('gray.600', 'gray.400');
  const warningBorderColor = useColorModeValue('orange.400', 'orange.500');

  // Group technical details for ThoughtChain
  // NOTE: This hook MUST be called before any early returns to comply with Rules of Hooks
  const technicalDetails = useMemo(() => {
    const details: string[] = [];
    
    // Accessibility elements count
    if (accessibilityElements && accessibilityElements.length > 0) {
      details.push(`Using ${accessibilityElements.length} accessibility-derived interactive elements`);
    }
    
    // Reasoning layer information (from latest message) - Enhanced v2.0
    if (messages.length > 0) {
      const latestMessage = messages[messages.length - 1];
      if (latestMessage.meta?.reasoning) {
        const reasoning = latestMessage.meta.reasoning;
        const sourceLabel = reasoning.source === 'MEMORY' ? 'memory' 
          : reasoning.source === 'PAGE' ? 'page analysis'
          : reasoning.source === 'WEB_SEARCH' ? 'web search'
          : 'user input needed';
        const confidencePercent = typeof reasoning.confidence === 'number' && !isNaN(reasoning.confidence)
          ? Math.round(reasoning.confidence * 100)
          : null;
        
        details.push(`Reasoning: ${sourceLabel}${confidencePercent !== null ? ` (${confidencePercent}% confidence)` : ''}`);
        
        // Evidence information
        if (reasoning.evidence) {
          const qualityLabel = reasoning.evidence.quality === 'high' ? 'High' 
            : reasoning.evidence.quality === 'medium' ? 'Medium' 
            : 'Low';
          details.push(`Evidence Quality: ${qualityLabel}`);
          
          if (Array.isArray(reasoning.evidence.sources) && reasoning.evidence.sources.length > 0) {
            details.push(`Evidence Sources: ${reasoning.evidence.sources.join(', ')}`);
          }
          
          if (Array.isArray(reasoning.evidence.gaps) && reasoning.evidence.gaps.length > 0) {
            details.push(`Gaps: ${reasoning.evidence.gaps.join(', ')}`);
          }
        }
        
        if (reasoning.reasoning && typeof reasoning.reasoning === 'string' && reasoning.reasoning.trim().length > 0) {
          details.push(reasoning.reasoning);
        }
        
        // Enhanced missingInfo structure
        if (reasoning.missingInfo && Array.isArray(reasoning.missingInfo) && reasoning.missingInfo.length > 0) {
          const missingFields = reasoning.missingInfo
            .map((item) => {
              if (typeof item === 'string') {
                return item;
              }
              return `${item.field} (${item.type === 'EXTERNAL_KNOWLEDGE' ? 'can search' : 'need input'})`;
            })
            .join(', ');
          details.push(`Missing: ${missingFields}`);
        }
        
        // Search iteration information
        if (reasoning.searchIteration) {
          const iter = reasoning.searchIteration;
          details.push(`Search Iteration: ${iter.attempt}/${iter.maxAttempts}`);
          if (iter.refinedQuery) {
            details.push(`Refined Query: ${iter.refinedQuery}`);
          }
          if (iter.evaluationResult) {
            const evalResult = iter.evaluationResult;
            details.push(`Evaluation: Solved=${evalResult.solved}, Confidence=${Math.round(evalResult.confidence * 100)}%`);
          }
        }
      }
      
      // Reasoning context (search summary) - Enhanced v2.0
      if (latestMessage.meta?.reasoningContext?.searchPerformed) {
        if (latestMessage.meta.reasoningContext.searchSummary) {
          const summary = typeof latestMessage.meta.reasoningContext.searchSummary === 'string'
            ? latestMessage.meta.reasoningContext.searchSummary
            : String(latestMessage.meta.reasoningContext.searchSummary || '');
          if (summary.trim().length > 0) {
            details.push(`Search results: ${summary}`);
          }
        }
        if (typeof latestMessage.meta.reasoningContext.searchIterations === 'number') {
          details.push(`Search iterations: ${latestMessage.meta.reasoningContext.searchIterations}`);
        }
        if (latestMessage.meta.reasoningContext.finalQuery) {
          details.push(`Final query: ${latestMessage.meta.reasoningContext.finalQuery}`);
        }
      }
    }
    
    // Correction details
    if (correctionHistory.length > 0) {
      const latest = correctionHistory[correctionHistory.length - 1];
      const stepIndex = typeof latest.stepIndex === 'number' && !isNaN(latest.stepIndex)
        ? latest.stepIndex + 1
        : 'current';
      details.push(`Retrying step ${stepIndex} with ${latest.strategy.replace(/_/g, ' ').toLowerCase()}`);
      if (latest.reason) {
        details.push(`Reason: ${latest.reason}`);
      }
    }
    
    // Verification details
    if (verificationHistory.length > 0) {
      const latest = verificationHistory[verificationHistory.length - 1];
      const stepIndex = typeof latest.stepIndex === 'number' && !isNaN(latest.stepIndex)
        ? latest.stepIndex + 1
        : 'current';
      details.push(`Step ${stepIndex} verification: ${latest.success ? 'Success' : 'Failed'} (${(latest.confidence * 100).toFixed(0)}% confidence)`);
      if (latest.reason) {
        details.push(`Reason: ${latest.reason}`);
      }
    }
    
    return details;
  }, [accessibilityElements, correctionHistory, verificationHistory, messages]);

  // Group messages into turns for turn-based layout
  // NOTE: This hook MUST be called before any early returns to comply with Rules of Hooks
  // CRITICAL: This handles race conditions during Multi-Chat operations
  const turns = useMemo(() => {
    // Safety check: Ensure messages is a valid array
    if (!Array.isArray(messages)) {
      console.warn('TaskHistoryUser: messages is not an array:', typeof messages);
      return [];
    }
    
    if (messages.length === 0) {
      return [];
    }
    
    // Filter out any undefined/null/invalid messages before grouping
    // This prevents crashes when messages array contains partial data during state updates
    const validMessages = messages.filter((msg): msg is NonNullable<typeof msg> => {
      if (msg === null || msg === undefined) return false;
      if (typeof msg !== 'object') return false;
      if (!('id' in msg) || typeof msg.id !== 'string' || !msg.id) return false;
      if (!('role' in msg) || typeof msg.role !== 'string') return false;
      return true;
    });
    
    if (validMessages.length === 0) {
      return [];
    }
    
    try {
      const groupedTurns = groupHistoryIntoTurns(validMessages);
      
      // Double-check: Filter out any invalid turns after grouping
      // This is a safety net for race conditions
      const safeTurns = groupedTurns.filter((turn): turn is NonNullable<typeof turn> => {
        if (!turn) return false;
        if (!turn.userMessage) return false;
        if (typeof turn.userMessage.id !== 'string' || !turn.userMessage.id) return false;
        // Ensure aiMessages is always an array
        if (!Array.isArray(turn.aiMessages)) {
          turn.aiMessages = [];
        }
        return true;
      });
      
      return safeTurns;
    } catch (error) {
      console.error('TaskHistoryUser: Error grouping messages into turns:', error);
      return [];
    }
  }, [messages]);
  
  // Debug logging: Log turns before rendering
  useEffect(() => {
    if (turns.length > 0) {
      console.log('TaskHistoryUser: Rendering turns:', turns.length, turns);
    }
  }, [turns]);

  // Show component if there's messages, history, a running task, or instructions (user has started a task)
  const hasContent = messages.length > 0 || taskHistory.length > 0 || taskStatus === 'running' || (instructions && instructions.trim());
  
  // Prefer messages over displayHistory (new structure)
  const useNewStructure = messages.length > 0;
  
  if (!hasContent) {
    return null;
  }

  // Extract user-friendly message from entry
  const getMessage = (entry: DisplayHistoryEntry): string | null => {
    // Use thought as primary message, transformed to user-friendly
    // Ensure thought is a string before processing
    const thoughtStr = typeof entry.thought === 'string' ? entry.thought : String(entry.thought || '');
    if (thoughtStr && thoughtStr.trim()) {
      const transformed = transformThought(thoughtStr);
      // Ensure transformThought returns a string
      return typeof transformed === 'string' ? transformed : String(transformed || '');
    }
    
    // For finish/fail actions, return a simple message
    if (entry.parsedAction && 'parsedAction' in entry.parsedAction) {
      const action = entry.parsedAction.parsedAction;
      if (action && typeof action === 'object' && 'name' in action) {
        if (action.name === 'finish') {
          return 'Task completed successfully!';
        }
        if (action.name === 'fail') {
          return 'Task failed.';
        }
      }
    }
    
    return null;
  };

  // Check if entry is an error
  const isError = (entry: DisplayHistoryEntry): boolean => {
    return entry.parsedAction && 'error' in entry.parsedAction;
  };

  // Check if entry is complete
  const isComplete = (entry: DisplayHistoryEntry): boolean => {
    return entry.parsedAction && 'parsedAction' in entry.parsedAction && 
      entry.parsedAction.parsedAction.name === 'finish';
  };

  // Check if entry is a user message
  // Note: User's initial instruction is stored in instructions state, not displayHistory
  // So all entries in displayHistory are assistant responses
  const isUserMessage = (entry: DisplayHistoryEntry, index: number): boolean => {
    // Currently, all entries are assistant responses
    // If we want to show user messages, we'd need to add them to displayHistory
    return false;
  };

  // Format date for display
  const formatDate = (date: Date | undefined | null): string => {
    if (!date || !(date instanceof Date) || isNaN(date.getTime())) {
      return 'Unknown date';
    }
    
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    const dateStr = date.toLocaleDateString();
    return typeof dateStr === 'string' ? dateStr : String(dateStr || 'Unknown date');
  };

  // Render a conversation entry (reusable for both previous and current)
  const renderConversationEntry = (
    entry: DisplayHistoryEntry,
    index: number,
    isPreviousConversation: boolean = false
  ) => {
    if (!entry) return null;

    try {
      const message = getMessage(entry);
      const userMessage = isUserMessage(entry, index);
      const error = isError(entry);
      const complete = isComplete(entry);

      // Skip entries with no message, no action, and no error
      const hasError = error && entry.parsedAction && 'error' in entry.parsedAction;
      if (!message && !entry.parsedAction && !hasError) {
        return null;
      }

      return (
        <Box key={index} w="100%" opacity={isPreviousConversation ? 0.8 : 1}>
          {/* Assistant message (left-aligned) */}
          {!userMessage && message && (
            <Box
              display="flex"
              justifyContent="flex-start"
              mb={2}
            >
              <Box
                bg={assistantMessageBg}
                borderRadius="lg"
                px={0}
                py={1}
                maxW="100%"
              >
                <Text
                  fontSize="sm"
                  lineHeight="1.6"
                  color={error ? errorText : complete ? successColor : textColor}
                >
                  {String(message || '')}
                </Text>
              </Box>
            </Box>
          )}

          {/* Action card */}
          {entry.parsedAction && 'parsedAction' in entry.parsedAction && (
            <Box mb={2}>
              <ActionCard entry={entry} />
            </Box>
          )}

          {/* Error message (subtle warning style) */}
          {error && entry.parsedAction && 'error' in entry.parsedAction && (
            <Box
              bg={warningBg}
              borderLeftWidth="4px"
              borderLeftColor={warningBorderColor}
              px={3}
              py={2}
              borderRadius="sm"
              mb={2}
            >
              <Text fontSize="xs" color={warningText}>
                {String(entry.parsedAction.error || 'Unknown error')}
              </Text>
            </Box>
          )}
        </Box>
      );
    } catch (err) {
      // If rendering fails for this entry, log and skip it
      console.error(`Error rendering history entry ${index}:`, err, entry);
      return (
        <Box key={index} w="100%" p={2} bg={warningBg} borderRadius="sm" mb={2}>
          <Text fontSize="xs" color={warningText}>
            Error displaying entry {index + 1}
          </Text>
        </Box>
      );
    }
  };

  return (
    <VStack align="stretch" spacing={3} w="100%">
      {/* NOTE: Previous Conversations section removed - now handled by ChatHistoryDrawer */}
      {/* Users can access chat history via the history drawer in the header */}

      {/* Current Task - Use new Turn-Based layout if messages available, otherwise fallback to old structure */}
      {useNewStructure ? (
        <Box w="100%">
          <VStack align="stretch" spacing={0}>
            {/* CRITICAL: Safe rendering with explicit null checks to prevent React error #130 */}
            {Array.isArray(turns) && turns.length > 0 ? (
              turns.map((turn, index) => {
                // SAFETY CHECK: Ensure turn and turn.userMessage exist and have valid id
                // This is the last line of defense against race condition crashes
                if (!turn) {
                  console.warn(`TaskHistoryUser: turn at index ${index} is null/undefined`);
                  return null;
                }
                
                if (!turn.userMessage) {
                  console.warn(`TaskHistoryUser: turn.userMessage at index ${index} is null/undefined:`, turn);
                  return null;
                }
                
                if (!turn.userMessage.id || typeof turn.userMessage.id !== 'string') {
                  console.warn(`TaskHistoryUser: turn.userMessage.id at index ${index} is invalid:`, turn.userMessage);
                  return null;
                }
                
                // Generate a stable key
                const turnKey = turn.userMessage.id;
                
                return (
                  <ChatTurn
                    key={turnKey}
                    turn={turn}
                    isActive={index === turns.length - 1}
                    isProcessing={taskStatus === 'running' && index === turns.length - 1}
                  />
                );
              })
            ) : null}
          </VStack>
        </Box>
      ) : (
        <>
          {/* Legacy displayHistory structure (backward compatibility) */}
      {/* User's initial instruction as first message bubble */}
      {/* Only show if there's task activity (history or running) to avoid showing empty input */}
      {instructions && instructions.trim() && (taskHistory.length > 0 || taskStatus === 'running') && (
        <Box
          display="flex"
          justifyContent="flex-end"
          mb={2}
        >
          <Box
            bg={userMessageBg}
            borderRadius="lg"
            px={4}
            py={2}
            maxW="80%"
          >
            <Text fontSize="sm" color={textColor}>
              {typeof instructions === 'string' 
                ? instructions 
                : String(instructions || '')}
            </Text>
          </Box>
        </Box>
      )}

      {/* Technical details in collapsible ThoughtChain */}
      {technicalDetails.length > 0 && (
        <Box w="100%">
          <ThoughtChain isProcessing={taskStatus === 'running'}>
            {technicalDetails.map((detail, idx) => (
              <Text key={idx} fontSize="xs" color={technicalDetailColor}>
                {detail}
              </Text>
            ))}
          </ThoughtChain>
        </Box>
      )}

          {/* Current Task Message history */}
          {taskHistory.map((entry, index) =>
            renderConversationEntry(entry, index, false)
          )}
        </>
      )}
    </VStack>
  );
};

export default TaskHistoryUser;
