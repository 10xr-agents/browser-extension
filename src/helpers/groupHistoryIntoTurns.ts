/**
 * Group History Into Turns Helper
 * 
 * Transforms a linear messages array into grouped "turns" where:
 * - 1 User Prompt + All resulting AI Actions = 1 Turn
 * 
 * Reference: Turn-Based Chat Layout (Cursor/ChatGPT style)
 * 
 * IMPORTANT: This function MUST handle race conditions gracefully.
 * During Multi-Chat operations, messages may be partially loaded or in
 * intermediate states. All returned turns MUST have valid userMessage
 * properties to prevent React error #130.
 */

import type { ChatMessage } from '../types/chatMessage';

/**
 * A single interaction turn
 */
export interface ChatTurn {
  userMessage: ChatMessage;
  aiMessages: ChatMessage[];
}

/**
 * Validates that a message has all required properties for safe rendering
 */
function isValidMessage(message: unknown): message is ChatMessage {
  if (!message || typeof message !== 'object') {
    return false;
  }
  
  const msg = message as Record<string, unknown>;
  
  // Must have id (string)
  if (typeof msg.id !== 'string' || !msg.id) {
    return false;
  }
  
  // Must have role
  if (typeof msg.role !== 'string' || !msg.role) {
    return false;
  }
  
  return true;
}

/**
 * Creates a safe ChatMessage with all required properties guaranteed to be valid
 */
function createSafeUserMessage(message: ChatMessage): ChatMessage {
  return {
    id: typeof message.id === 'string' ? message.id : `msg-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    role: 'user',
    content: typeof message.content === 'string' ? message.content : String(message.content || ''),
    status: message.status || 'sent',
    timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(),
  };
}

/**
 * Groups linear message history into turns
 * 
 * Logic:
 * - Every time we see `role: 'user'`, start a new Turn
 * - Any subsequent `role: 'assistant'` or `role: 'system'` messages belong to that User's turn
 * 
 * CRITICAL: This function handles the "Pending State" where:
 * - A user just sent a message but AI hasn't replied yet
 * - In this case, we return a turn with aiMessages: [] (empty array, not undefined)
 * 
 * @param messages - Linear array of chat messages
 * @returns Array of grouped turns (NEVER returns undefined items, ALWAYS returns valid turns)
 */
export function groupHistoryIntoTurns(messages: ChatMessage[]): ChatTurn[] {
  // Safety check: Ensure messages is valid array
  if (!messages || !Array.isArray(messages)) {
    console.warn('groupHistoryIntoTurns: messages is not a valid array:', typeof messages);
    return [];
  }
  
  if (messages.length === 0) {
    return [];
  }
  
  const turns: ChatTurn[] = [];
  let currentTurn: ChatTurn | null = null;

  for (let i = 0; i < messages.length; i++) {
    const message = messages[i];
    
    // Safety check: Skip invalid messages
    if (!isValidMessage(message)) {
      console.warn(`groupHistoryIntoTurns: Skipping invalid message at index ${i}:`, message);
      continue;
    }
    
    if (message.role === 'user') {
      // Push the previous turn (if exists) before starting new one
      if (currentTurn && currentTurn.userMessage && currentTurn.userMessage.id) {
        turns.push(currentTurn);
      }
      
      // Start a new turn with a SAFE user message
      currentTurn = {
        userMessage: createSafeUserMessage(message),
        aiMessages: [], // ALWAYS initialize as empty array, never undefined
      };
    } else if (message.role === 'assistant' || message.role === 'system') {
      // Add to current turn's AI messages
      if (currentTurn) {
        // Only add valid AI messages
        if (isValidMessage(message)) {
          currentTurn.aiMessages.push(message);
        }
      } else {
        // Edge case: AI message without preceding user message
        // Create a synthetic turn with a system placeholder
        const systemId = typeof message.id === 'string' ? message.id : `system-${Date.now()}`;
        currentTurn = {
          userMessage: {
            id: `system-${systemId}`,
            role: 'user',
            content: 'System',
            status: 'sent',
            timestamp: message.timestamp instanceof Date ? message.timestamp : new Date(),
          },
          aiMessages: [message],
        };
      }
    }
  }

  // CRITICAL: Don't forget the last turn (handles "Pending State")
  // This is essential for when user submits a message but AI hasn't replied yet
  if (currentTurn && currentTurn.userMessage && currentTurn.userMessage.id) {
    // Ensure aiMessages is always an array (handles the pending state)
    if (!Array.isArray(currentTurn.aiMessages)) {
      currentTurn.aiMessages = [];
    }
    turns.push(currentTurn);
  }

  // Final safety filter: ensure all returned turns are valid
  return turns.filter((turn): turn is ChatTurn => {
    if (!turn) return false;
    if (!turn.userMessage) return false;
    if (typeof turn.userMessage.id !== 'string' || !turn.userMessage.id) return false;
    return true;
  });
}
