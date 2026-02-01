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
  Box,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import ChatTurn from './ChatTurn';
import { groupHistoryIntoTurns } from '../helpers/groupHistoryIntoTurns';

const TaskHistoryUser: React.FC = () => {
  // Safety check: Ensure messages is always an array (never undefined)
  const messagesRaw = useAppState((state) => state.currentTask.messages);
  const messages = Array.isArray(messagesRaw) ? messagesRaw : [];
  
  const taskStatus = useAppState((state) => state.currentTask.status);
  const sessionId = useAppState((state) => state.currentTask.sessionId);
  const loadMessages = useAppState((state) => state.currentTask.actions.loadMessages);
  // Get loading state to prevent infinite loops
  const messagesLoadingState = useAppState((state) => state.currentTask.messagesLoadingState);
  
  // Load messages on mount if sessionId exists
  // Uses loading state to prevent infinite retry loops
  useEffect(() => {
    // Don't try to load if:
    // 1. No sessionId
    // 2. Already loading
    // 3. Already have messages
    if (!sessionId) return;
    if (messagesLoadingState.isLoading) return;
    if (messages.length > 0) return;
    
    loadMessages(sessionId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]); // Only trigger on sessionId change - loadMessages handles its own state

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

  // Remove legacy displayHistory mode completely.
  // Chat UI is now message-driven only (turn-based), per thin-client contract.
  const hasContent = messages.length > 0 || taskStatus === 'running';
  
  if (!hasContent) {
    return null;
  }

  return (
    <VStack align="stretch" spacing={3} w="100%">
      {/* Turn-based chat layout only (no legacy displayHistory rendering) */}
      <Box w="100%">
        <VStack align="stretch" spacing={6}>
          {/* CRITICAL: Safe rendering with explicit null checks to prevent React error #130 */}
          {Array.isArray(turns) && turns.length > 0
            ? turns.map((turn, index) => {
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

                const isActiveTurn = index === turns.length - 1;
                const isProcessingTurn = taskStatus === 'running' && isActiveTurn;

                return (
                  <React.Fragment key={turnKey}>
                    {/* Focus Mode anchor: always place before the LAST turn (active turn)
                        This allows scrollIntoView to bring the user's latest message to the top */}
                    {isActiveTurn && <Box id="focus-anchor" height="0px" />}
                    <ChatTurn turn={turn} isActive={isActiveTurn} isProcessing={isProcessingTurn} />
                  </React.Fragment>
                );
              })
            : null}
        </VStack>
      </Box>
    </VStack>
  );
};

export default TaskHistoryUser;
