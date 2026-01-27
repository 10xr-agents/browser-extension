/**
 * Sessions State Slice for Multi-Chat Support
 * 
 * Manages list of past chat sessions and current session selection.
 * Enables Cursor-style multi-chat functionality.
 * 
 * Uses sessionService for chrome.storage operations.
 * 
 * Reference: Multi-Session Chat Interface Implementation
 */

import { MyStateCreator } from './store';
import * as sessionService from '../services/sessionService';
import type { Session, Message } from '../services/sessionService';

/**
 * Chat session summary (matches Session from sessionService)
 */
export type ChatSession = Session;

export type SessionsSlice = {
  sessions: ChatSession[];
  currentSessionId: string | null;
  isHistoryOpen: boolean; // UI toggle for history drawer
  
  actions: {
    loadSessions: (options?: { status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived'; includeArchived?: boolean }) => Promise<void>; // Load from sessionService
    createNewChat: (initialUrl?: string) => Promise<string>; // Create new session, returns sessionId
    switchSession: (sessionId: string) => Promise<Message[]>; // Switch to session, load messages, returns messages
    updateSession: (sessionId: string, updates: Partial<ChatSession>) => Promise<void>; // Update via service
    archiveSession: (sessionId: string) => Promise<void>; // Archive session via service
    deleteSession: (sessionId: string) => Promise<void>; // Delete via service
    setCurrentSession: (sessionId: string | null) => void; // Set current session ID
    setHistoryOpen: (open: boolean) => void; // Toggle history drawer
  };
};

export const createSessionsSlice: MyStateCreator<SessionsSlice> = (set, get) => ({
  sessions: [],
  currentSessionId: null,
  isHistoryOpen: false,
  
  actions: {
    loadSessions: async (options?: { status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived'; includeArchived?: boolean }) => {
      try {
        // Use sessionService.listSessions which handles API with fallback
        // Default to active sessions, exclude archived unless explicitly requested
        const sessions = await sessionService.listSessions({
          status: options?.status || 'active',
          includeArchived: options?.includeArchived || false,
          limit: 50,
        });
        
        set((state) => {
          state.sessions.sessions = sessions;
        });
      } catch (error) {
        console.error('Error loading sessions:', error);
      }
    },
    
    createNewChat: async (initialUrl = '') => {
      try {
        const session = await sessionService.createNewSession(initialUrl);
        
        set((state) => {
          // Add to sessions list (already sorted by sessionService)
          const existingIndex = state.sessions.sessions.findIndex(s => s.sessionId === session.sessionId);
          if (existingIndex >= 0) {
            state.sessions.sessions[existingIndex] = session;
          } else {
            state.sessions.sessions.unshift(session);
            // Limit to 50
            if (state.sessions.sessions.length > 50) {
              state.sessions.sessions = state.sessions.sessions.slice(0, 50);
            }
          }
          state.sessions.currentSessionId = session.sessionId;
        });
        
        return session.sessionId;
      } catch (error) {
        console.error('Error creating new chat:', error);
        throw error;
      }
    },
    
    switchSession: async (sessionId: string) => {
      try {
        // Load messages for this session (uses API with fallback to local storage)
        const messages = await sessionService.loadSession(sessionId, 50); // Default limit: 50
        
        set((state) => {
          state.sessions.currentSessionId = sessionId;
        });
        
        // Update currentTask with messages
        const { currentTask } = get();
        if (currentTask.actions.loadMessages) {
          // Load messages into currentTask (it will handle conversion from Message[] to ChatMessage[])
          await currentTask.actions.loadMessages(sessionId);
        }
        
        return messages;
      } catch (error) {
        console.error(`Error switching to session ${sessionId}:`, error);
        throw error;
      }
    },
    
    updateSession: async (sessionId: string, updates: Partial<ChatSession>) => {
      try {
        await sessionService.updateSession(sessionId, updates);
        
        // Update local state
        set((state) => {
          const index = state.sessions.sessions.findIndex(s => s.sessionId === sessionId);
          if (index >= 0) {
            state.sessions.sessions[index] = {
              ...state.sessions.sessions[index],
              ...updates,
            };
          }
        });
      } catch (error) {
        console.error(`Error updating session ${sessionId}:`, error);
        throw error;
      }
    },
    
    archiveSession: async (sessionId: string) => {
      try {
        await sessionService.archiveSession(sessionId);
        
        // Update local state - mark as archived
        set((state) => {
          const index = state.sessions.sessions.findIndex(s => s.sessionId === sessionId);
          if (index >= 0) {
            state.sessions.sessions[index] = {
              ...state.sessions.sessions[index],
              status: 'archived',
              updatedAt: Date.now(),
            };
          }
          
          // If archiving current session, clear currentSessionId
          if (state.sessions.currentSessionId === sessionId) {
            state.sessions.currentSessionId = null;
          }
        });
        
        // Reload sessions to refresh the list (archived sessions excluded by default)
        await get().sessions.actions.loadSessions();
      } catch (error) {
        console.error(`Error archiving session ${sessionId}:`, error);
        throw error;
      }
    },
    
    deleteSession: async (sessionId: string) => {
      try {
        await sessionService.deleteSession(sessionId);
        
        set((state) => {
          state.sessions.sessions = state.sessions.sessions.filter(s => s.sessionId !== sessionId);
          // If deleting current session, clear currentSessionId
          if (state.sessions.currentSessionId === sessionId) {
            state.sessions.currentSessionId = null;
          }
        });
      } catch (error) {
        console.error(`Error deleting session ${sessionId}:`, error);
        throw error;
      }
    },
    
    setCurrentSession: (sessionId: string | null) => {
      set((state) => {
        state.sessions.currentSessionId = sessionId;
      });
    },
    
    setHistoryOpen: (open: boolean) => {
      set((state) => {
        state.sessions.isHistoryOpen = open;
      });
    },
    
    saveMessage: async (sessionId: string, message: Message) => {
      try {
        await sessionService.saveMessage(sessionId, message);
        
        // Update session's messageCount in local state
        const session = get().sessions.sessions.find(s => s.sessionId === sessionId);
        if (session) {
          const messages = await sessionService.loadSession(sessionId);
          await get().sessions.actions.updateSession(sessionId, {
            messageCount: messages.length,
            updatedAt: Date.now(),
          });
        }
      } catch (error) {
        console.error(`Error saving message to session ${sessionId}:`, error);
        throw error;
      }
    },
    
    loadMessages: async (sessionId: string, limit?: number, since?: string): Promise<Message[]> => {
      try {
        // Use sessionService.loadSession which handles API with fallback
        return await sessionService.loadSession(sessionId, limit, since);
      } catch (error) {
        console.error(`Error loading messages for session ${sessionId}:`, error);
        return [];
      }
    },
  },
});
