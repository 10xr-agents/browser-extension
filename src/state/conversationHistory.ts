/**
 * Conversation History State for Thin Client Architecture
 * 
 * Stores previous tasks/conversations so users can see their chat history.
 * Each conversation includes the user's instructions and the task's display history.
 * 
 * Reference: User request - Show previous chat context
 */

import { MyStateCreator } from './store';
import { DisplayHistoryEntry } from './currentTask';

/**
 * A completed conversation/task
 */
export type Conversation = {
  id: string; // Unique ID for this conversation
  instructions: string; // User's task instructions
  displayHistory: DisplayHistoryEntry[]; // Task history entries
  status: 'success' | 'error' | 'interrupted'; // Final status
  createdAt: Date; // When the conversation started
  completedAt: Date; // When the conversation ended
  url?: string; // URL where the task was performed
};

export type ConversationHistorySlice = {
  conversations: Conversation[];
  actions: {
    addConversation: (conversation: Conversation) => void;
    clearHistory: () => void;
    removeConversation: (id: string) => void;
  };
};

export const createConversationHistorySlice: MyStateCreator<ConversationHistorySlice> = (
  set
) => ({
  conversations: [],
  actions: {
    addConversation: (conversation) => {
      set((state) => {
        // Add to beginning of array (most recent first)
        state.conversationHistory.conversations.unshift(conversation);
        // Keep only last 50 conversations to prevent memory issues
        if (state.conversationHistory.conversations.length > 50) {
          state.conversationHistory.conversations = state.conversationHistory.conversations.slice(0, 50);
        }
      });
    },
    clearHistory: () => {
      set((state) => {
        state.conversationHistory.conversations = [];
      });
    },
    removeConversation: (id) => {
      set((state) => {
        state.conversationHistory.conversations = state.conversationHistory.conversations.filter(
          (conv) => conv.id !== id
        );
      });
    },
  },
});
