/**
 * Sessions State Slice for Multi-Chat Support
 * 
 * Manages list of past chat sessions and current session selection.
 * Enables Cursor-style multi-chat functionality.
 * 
 * **Domain-Aware Sessions:**
 * Sessions are automatically managed based on the current domain.
 * When users navigate to a new domain, the extension will:
 * 1. Check if there's an existing active session for that domain
 * 2. If yes, switch to that session
 * 3. If no, create a new session for that domain
 * 
 * Uses sessionService for chrome.storage operations.
 * 
 * Reference: 
 * - Multi-Session Chat Interface Implementation
 * - Domain-Aware Sessions Feature
 */

import { MyStateCreator } from './store';
import * as sessionService from '../services/sessionService';
import type { Session, Message } from '../services/sessionService';
import { extractDomain } from '../helpers/domainUtils';

/**
 * Chat session summary (matches Session from sessionService)
 */
export type ChatSession = Session;

export type SessionsSlice = {
  sessions: ChatSession[];
  currentSessionId: string | null;
  /** Current domain being used (for domain-aware session switching) */
  currentDomain: string | null;
  isHistoryOpen: boolean; // UI toggle for history drawer
  
  actions: {
    loadSessions: (options?: { status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived'; includeArchived?: boolean }) => Promise<void>; // Load from sessionService
    createNewChat: (initialUrl?: string, taskDescription?: string) => Promise<string>; // Create new session, returns sessionId
    switchSession: (sessionId: string) => Promise<Message[]>; // Switch to session, load messages, returns messages
    /** Switch to or create a session for the given URL (domain-aware) */
    switchToUrlSession: (url: string) => Promise<{ sessionId: string; isNew: boolean }>; 
    updateSession: (sessionId: string, updates: Partial<ChatSession>) => Promise<void>; // Update via service
    /** Rename a session with custom title */
    renameSession: (sessionId: string, newTitle: string) => Promise<void>;
    archiveSession: (sessionId: string) => Promise<void>; // Archive session via service
    deleteSession: (sessionId: string) => Promise<void>; // Delete via service
    setCurrentSession: (sessionId: string | null) => void; // Set current session ID
    setHistoryOpen: (open: boolean) => void; // Toggle history drawer
    /** Initialize domain-aware sessions (call on startup) */
    initializeDomainAwareSessions: () => Promise<void>;
    /** Save a message to a session */
    saveMessage: (sessionId: string, message: Message) => Promise<void>;
    /** Load messages for a session */
    loadMessages: (sessionId: string, limit?: number, since?: string) => Promise<Message[]>;
  };
};

export const createSessionsSlice: MyStateCreator<SessionsSlice> = (set, get) => ({
  sessions: [],
  currentSessionId: null,
  currentDomain: null,
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
    
    createNewChat: async (initialUrl = '', taskDescription?: string) => {
      try {
        const session = await sessionService.createNewSession(initialUrl, taskDescription);
        
        // Extract domain for state tracking
        const domainInfo = extractDomain(initialUrl);
        
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
          state.sessions.currentDomain = domainInfo.isValid ? domainInfo.rootDomain : null;
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
        
        // Get the session to update domain state
        const sessions = get().sessions.sessions;
        const session = sessions.find(s => s.sessionId === sessionId);
        
        set((state) => {
          state.sessions.currentSessionId = sessionId;
          // Update current domain from session
          if (session?.domain) {
            state.sessions.currentDomain = session.domain;
          } else if (session?.url) {
            const domainInfo = extractDomain(session.url);
            state.sessions.currentDomain = domainInfo.isValid ? domainInfo.rootDomain : null;
          }
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
    
    /**
     * Switch to or create a session for the given URL (domain-aware)
     * This is the main entry point for domain-aware session management
     */
    switchToUrlSession: async (url: string) => {
      try {
        const domainInfo = extractDomain(url);
        const currentDomain = get().sessions.currentDomain;
        const currentSessionId = get().sessions.currentSessionId;
        
        // If same domain and we have an active session, just update URL
        if (domainInfo.isValid && domainInfo.rootDomain === currentDomain && currentSessionId) {
          // Same domain - update session URL but don't switch
          await sessionService.updateSession(currentSessionId, {
            url,
            updatedAt: Date.now(),
          });
          return { sessionId: currentSessionId, isNew: false };
        }
        
        // Different domain or no current session - use getOrCreateSessionForUrl
        const { session, isNew } = await sessionService.getOrCreateSessionForUrl(url);
        
        set((state) => {
          // Update sessions list
          const existingIndex = state.sessions.sessions.findIndex(s => s.sessionId === session.sessionId);
          if (existingIndex >= 0) {
            state.sessions.sessions[existingIndex] = session;
          } else {
            state.sessions.sessions.unshift(session);
            if (state.sessions.sessions.length > 50) {
              state.sessions.sessions = state.sessions.sessions.slice(0, 50);
            }
          }
          
          state.sessions.currentSessionId = session.sessionId;
          state.sessions.currentDomain = session.domain || (domainInfo.isValid ? domainInfo.rootDomain : null);
        });
        
        // Load messages for this session if it's not new
        if (!isNew) {
          const { currentTask } = get();
          if (currentTask.actions.loadMessages) {
            await currentTask.actions.loadMessages(session.sessionId);
          }
        }
        
        console.log(`[Sessions] ${isNew ? 'Created new' : 'Switched to existing'} session for domain: ${session.domain || 'unknown'}`);
        
        return { sessionId: session.sessionId, isNew };
      } catch (error) {
        console.error(`Error switching to URL session for ${url}:`, error);
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
    
    /**
     * Rename a session with custom title
     * Domain prefix will be preserved by default
     */
    renameSession: async (sessionId: string, newTitle: string) => {
      try {
        await sessionService.renameSession(sessionId, newTitle, true);
        
        // Reload sessions to get updated title
        // Note: Using sessionService directly to avoid nested get() calls
        const sessions = await sessionService.listSessions({
          status: 'active',
          includeArchived: false,
          limit: 50,
        });
        
        set((state) => {
          state.sessions.sessions = sessions;
        });
      } catch (error) {
        console.error(`Error renaming session ${sessionId}:`, error);
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
        // Note: Using sessionService directly to avoid nested get() calls
        const sessions = await sessionService.listSessions({
          status: 'active',
          includeArchived: false,
          limit: 50,
        });
        
        set((state) => {
          state.sessions.sessions = sessions;
        });
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
    
    /**
     * Initialize domain-aware sessions on extension startup
     * - Migrates existing sessions to add domain field
     * - Loads sessions list
     */
    initializeDomainAwareSessions: async () => {
      try {
        // Migrate existing sessions to add domain field
        await sessionService.migrateSessionsWithDomain();
        
        // Load sessions directly using sessionService to avoid nested get() calls
        const sessions = await sessionService.listSessions({
          status: 'active',
          includeArchived: false,
          limit: 50,
        });
        
        set((state) => {
          state.sessions.sessions = sessions;
        });
        
        console.log('[Sessions] Domain-aware sessions initialized');
      } catch (error) {
        console.error('Error initializing domain-aware sessions:', error);
      }
    },
    
    saveMessage: async (sessionId: string, message: Message) => {
      try {
        await sessionService.saveMessage(sessionId, message);
        
        // Update session's messageCount in local state
        const currentSessions = get().sessions.sessions;
        const session = currentSessions.find(s => s.sessionId === sessionId);
        if (session) {
          const messages = await sessionService.loadSession(sessionId);
          // Update directly using sessionService and set
          await sessionService.updateSession(sessionId, {
            messageCount: messages.length,
            updatedAt: Date.now(),
          });
          
          // Update local state
          set((state) => {
            const index = state.sessions.sessions.findIndex(s => s.sessionId === sessionId);
            if (index >= 0) {
              state.sessions.sessions[index] = {
                ...state.sessions.sessions[index],
                messageCount: messages.length,
                updatedAt: Date.now(),
              };
            }
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
