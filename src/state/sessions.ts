/**
 * Sessions State Slice for Multi-Chat Support
 * 
 * Manages list of past chat sessions and current session selection.
 * Enables Cursor-style multi-chat functionality.
 * 
 * **Tab-Scoped Sessions (with Domain Awareness):**
 * Sessions are now scoped primarily to the Chrome `tabId` (one active session per tab).
 * When users navigate within the same tab (including across domains), we keep the same session
 * and update the session's `url` + `domain` metadata for awareness.
 *
 * Why: the automation debugger lifecycle is tab-scoped; a tab can navigate across domains quickly.
 * 
 * Uses sessionService for chrome.storage operations.
 * 
 * Reference: 
 * - Multi-Session Chat Interface Implementation
 * - Tab-Scoped Sessions Feature
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
  /** Current domain associated with the current tab/session (awareness only) */
  currentDomain: string | null;
  /** Active tab id the UI is currently reflecting (best-effort) */
  currentTabId: number | null;
  /** Mapping of tabId -> active sessionId for that tab */
  tabSessionMap: Record<string, string>;
  isHistoryOpen: boolean; // UI toggle for history drawer
  
  actions: {
    loadSessions: (options?: { status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived'; includeArchived?: boolean }) => Promise<void>; // Load from sessionService
    createNewChat: (initialUrl?: string, taskDescription?: string) => Promise<string>; // Create new session, returns sessionId
    /** Create a new session and associate it to a specific tab */
    createNewChatForTab: (tabId: number, initialUrl?: string, taskDescription?: string) => Promise<string>;
    switchSession: (sessionId: string) => Promise<Message[]>; // Switch to session, load messages, returns messages
    /** Switch to (or create) the session for a specific tab (tab-scoped) */
    switchToTabSession: (tabId: number, url?: string) => Promise<{ sessionId: string; isNew: boolean }>;
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

// Track last load time and in-flight request to prevent excessive calls
let lastLoadSessionsTime = 0;
let loadSessionsInFlight: Promise<void> | null = null;
const MIN_LOAD_INTERVAL = 5000; // Minimum 5 seconds between loads

export const createSessionsSlice: MyStateCreator<SessionsSlice> = (set, get) => ({
  sessions: [],
  currentSessionId: null,
  currentDomain: null,
  currentTabId: null,
  tabSessionMap: {},
  isHistoryOpen: false,
  
  actions: {
    loadSessions: async (options?: { status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived'; includeArchived?: boolean; forceRefresh?: boolean }) => {
      const now = Date.now();
      const forceRefresh = options?.forceRefresh || false;
      
      // Skip if called too recently (unless forced)
      if (!forceRefresh && (now - lastLoadSessionsTime) < MIN_LOAD_INTERVAL) {
        console.debug('[Sessions] Skipping loadSessions - called too recently');
        return;
      }
      
      // Deduplicate in-flight requests
      if (loadSessionsInFlight && !forceRefresh) {
        console.debug('[Sessions] Waiting for in-flight loadSessions request');
        return loadSessionsInFlight;
      }
      
      const requestPromise = (async () => {
        try {
          lastLoadSessionsTime = now;
          
          // Use sessionService.listSessions which handles API with fallback and caching
          // Default to active sessions, exclude archived unless explicitly requested
          const sessions = await sessionService.listSessions({
            status: options?.status || 'active',
            includeArchived: options?.includeArchived || false,
            limit: 50,
            forceRefresh,
          });
          
          set((state) => {
            state.sessions.sessions = sessions;
          });
        } catch (error) {
          console.error('Error loading sessions:', error);
        } finally {
          loadSessionsInFlight = null;
        }
      })();
      
      loadSessionsInFlight = requestPromise;
      return requestPromise;
    },
    
    createNewChat: async (initialUrl = '', taskDescription?: string) => {
      try {
        const currentTabId = get().sessions.currentTabId;
        if (typeof currentTabId === 'number' && Number.isFinite(currentTabId) && currentTabId >= 0) {
          return await get().sessions.actions.createNewChatForTab(currentTabId, initialUrl, taskDescription);
        }

        const session = await sessionService.createNewSession(initialUrl, taskDescription);
        
        // Extract domain for state tracking
        const domainInfo = extractDomain(initialUrl);
        
        set((state) => {
          // Add to sessions list (already sorted by sessionService)
          // CRITICAL FIX: Use map() instead of direct index assignment to avoid "read only property" errors
          const existingIndex = state.sessions.sessions.findIndex(s => s.sessionId === session.sessionId);
          if (existingIndex >= 0) {
            state.sessions.sessions = state.sessions.sessions.map((s, i) => 
              i === existingIndex ? session : s
            );
          } else {
            // Create new array with session at front
            state.sessions.sessions = [session, ...state.sessions.sessions].slice(0, 50);
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

    createNewChatForTab: async (tabId: number, initialUrl = '', taskDescription?: string) => {
      try {
        // If tabId is not valid, fall back to non-tab-scoped creation.
        // (We avoid polluting tabSessionMap with sentinel keys like "-1".)
        if (!Number.isFinite(tabId) || tabId < 0) {
          const session = await sessionService.createNewSession(initialUrl, taskDescription);

          const domainInfo = extractDomain(initialUrl);
          set((state) => {
            const existingIndex = state.sessions.sessions.findIndex(s => s.sessionId === session.sessionId);
            if (existingIndex >= 0) {
              state.sessions.sessions = state.sessions.sessions.map((s, i) =>
                i === existingIndex ? session : s
              );
            } else {
              state.sessions.sessions = [session, ...state.sessions.sessions].slice(0, 50);
            }

            state.sessions.currentSessionId = session.sessionId;
            state.sessions.currentDomain = domainInfo.isValid ? domainInfo.rootDomain : null;
          });

          void chrome.storage.local
            .set({ last_session_id: session.sessionId })
            .catch((error: unknown) => {
              console.debug('[Sessions] Failed to persist last_session_id:', error);
            });

          return session.sessionId;
        }

        const session = await sessionService.createNewSession(initialUrl, taskDescription);

        // Extract domain for state tracking
        const domainInfo = extractDomain(initialUrl);

        set((state) => {
          // Add to sessions list (already sorted by sessionService)
          // CRITICAL FIX: Use map() instead of direct index assignment to avoid "read only property" errors
          const existingIndex = state.sessions.sessions.findIndex(s => s.sessionId === session.sessionId);
          if (existingIndex >= 0) {
            state.sessions.sessions = state.sessions.sessions.map((s, i) =>
              i === existingIndex ? session : s
            );
          } else {
            // Create new array with session at front
            state.sessions.sessions = [session, ...state.sessions.sessions].slice(0, 50);
          }

          state.sessions.currentTabId = tabId;
          state.sessions.currentSessionId = session.sessionId;
          state.sessions.currentDomain = domainInfo.isValid ? domainInfo.rootDomain : null;
          state.sessions.tabSessionMap[String(tabId)] = session.sessionId;
        });

        // Persist last-opened session for reliable restore on startup
        void chrome.storage.local
          .set({ last_session_id: session.sessionId })
          .catch((error: unknown) => {
            console.debug('[Sessions] Failed to persist last_session_id:', error);
          });

        return session.sessionId;
      } catch (error) {
        console.error('Error creating new chat for tab:', error);
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

          // If the user manually switched sessions, pin that session to the current tab.
          const currentTabId = state.sessions.currentTabId;
          if (typeof currentTabId === 'number') {
            state.sessions.tabSessionMap[String(currentTabId)] = sessionId;
          }
        });

        // Persist last-opened session for reliable restore on startup
        void chrome.storage.local
          .set({ last_session_id: sessionId })
          .catch((error: unknown) => {
            console.debug('[Sessions] Failed to persist last_session_id:', error);
          });
        
        // Update currentTask with messages
        const { currentTask } = get();
        if (currentTask.actions.loadMessages) {
          // Load messages into currentTask (it will handle conversion from Message[] to ChatMessage[])
          // This also starts WebSocket sync via messageSyncManager.startSync()
          await currentTask.actions.loadMessages(sessionId);
        }
        
        return messages;
      } catch (error) {
        console.error(`Error switching to session ${sessionId}:`, error);
        throw error;
      }
    },
    
    /**
     * Switch to or create the session for a given tab (tab-scoped).
     * If the tab already has an associated session, we keep it and only update metadata.
     */
    switchToTabSession: async (tabId: number, url?: string) => {
      try {
        const tabKey = String(tabId);
        const existingForTab = get().sessions.tabSessionMap[tabKey];

        const urlToUse = typeof url === 'string' ? url : '';
        const domainInfo = extractDomain(urlToUse);
        const nextDomain = domainInfo.isValid ? domainInfo.rootDomain : null;

        // Always track which tab the UI is currently reflecting.
        set((state) => {
          state.sessions.currentTabId = tabId;
        });

        // If tab already has a session, keep it; just update metadata.
        if (typeof existingForTab === 'string' && existingForTab.length > 0) {
          const sessionId = existingForTab;

          set((state) => {
            state.sessions.currentSessionId = sessionId;
            state.sessions.currentDomain = nextDomain;
          });

          // Update session metadata (best-effort).
          if (urlToUse) {
            await sessionService.updateSession(sessionId, {
              url: urlToUse,
              domain: nextDomain || undefined,
              updatedAt: Date.now(),
            });
          }

          // Ensure currentTask is hydrated for this session so chat renders immediately.
          const taskSessionId = get().currentTask.sessionId;
          const taskMessages = Array.isArray(get().currentTask.messages) ? get().currentTask.messages : [];
          if (taskSessionId !== sessionId || taskMessages.length === 0) {
            try {
              const { currentTask } = get();
              if (currentTask.actions.loadMessages) {
                await currentTask.actions.loadMessages(sessionId);
              }
            } catch (loadError: unknown) {
              console.debug('[Sessions] Failed to hydrate messages on tab session:', loadError);
            }
          }

          // Persist current session as last-opened (best-effort)
          void chrome.storage.local
            .set({ last_session_id: sessionId })
            .catch((error: unknown) => {
              console.debug('[Sessions] Failed to persist last_session_id:', error);
            });

          return { sessionId, isNew: false };
        }

        // No session mapped to this tab yet: create a new session for the tab.
        const session = await sessionService.createNewSession(urlToUse);

        set((state) => {
          // Add to sessions list (already sorted by sessionService)
          const existingIndex = state.sessions.sessions.findIndex(s => s.sessionId === session.sessionId);
          if (existingIndex >= 0) {
            state.sessions.sessions = state.sessions.sessions.map((s, i) =>
              i === existingIndex ? session : s
            );
          } else {
            state.sessions.sessions = [session, ...state.sessions.sessions].slice(0, 50);
          }

          state.sessions.currentTabId = tabId;
          state.sessions.currentSessionId = session.sessionId;
          state.sessions.currentDomain = nextDomain;
          state.sessions.tabSessionMap[tabKey] = session.sessionId;
        });

        void chrome.storage.local
          .set({ last_session_id: session.sessionId })
          .catch((error: unknown) => {
            console.debug('[Sessions] Failed to persist last_session_id:', error);
          });

        console.log(`[Sessions] Created new session for tab ${tabId} (domain: ${nextDomain || 'unknown'})`);

        return { sessionId: session.sessionId, isNew: true };
      } catch (error) {
        console.error(`Error switching to tab session for tabId=${tabId}:`, error);
        throw error;
      }
    },
    
    updateSession: async (sessionId: string, updates: Partial<ChatSession>) => {
      try {
        await sessionService.updateSession(sessionId, updates);
        
        // Update local state
        // CRITICAL FIX: Use map() instead of direct index assignment to avoid "read only property" errors
        set((state) => {
          state.sessions.sessions = state.sessions.sessions.map(s => 
            s.sessionId === sessionId ? { ...s, ...updates } : s
          );
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
        // CRITICAL FIX: Use map() instead of direct index assignment to avoid "read only property" errors
        set((state) => {
          state.sessions.sessions = state.sessions.sessions.map(s => 
            s.sessionId === sessionId 
              ? { ...s, status: 'archived' as const, updatedAt: Date.now() }
              : s
          );
          
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

      // Persist last-opened session for reliable restoration on next extension open
      // (works even if backend is slow/unavailable).
      if (sessionId) {
        void chrome.storage.local
          .set({ last_session_id: sessionId })
          .catch((error: unknown) => {
            console.debug('[Sessions] Failed to persist last_session_id:', error);
          });
      }
    },
    
    setHistoryOpen: (open: boolean) => {
      set((state) => {
        state.sessions.isHistoryOpen = open;
      });
    },
    
    /**
     * Initialize sessions on extension startup
     * - Migrates existing sessions to add domain field
     * - Loads sessions list
     * - Cleans up stale tab mappings (tabIds don't survive browser restarts)
     */
    initializeDomainAwareSessions: async () => {
      try {
        // Migrate existing sessions to add domain field
        await sessionService.migrateSessionsWithDomain();
        
        // Load sessions directly using sessionService to avoid nested get() calls
        const sessions = await sessionService.listSessions({
          includeArchived: false,
          limit: 50,
        });
        
        set((state) => {
          state.sessions.sessions = sessions;
        });

        // Clean up stale tabId -> sessionId mappings (best-effort).
        // Tab IDs are not stable across browser restarts; remove mappings for tabs that no longer exist.
        try {
          const tabs = await chrome.tabs.query({});
          const openTabIds = new Set<number>();
          for (const t of tabs) {
            if (typeof t.id === 'number') openTabIds.add(t.id);
          }

          set((state) => {
            const currentMap = state.sessions.tabSessionMap || {};
            const cleaned: Record<string, string> = {};
            for (const [k, v] of Object.entries(currentMap)) {
              const n = Number(k);
              if (Number.isFinite(n) && openTabIds.has(n) && typeof v === 'string' && v.length > 0) {
                cleaned[String(n)] = v;
              }
            }
            state.sessions.tabSessionMap = cleaned;

            const currentTabId = state.sessions.currentTabId;
            if (typeof currentTabId === 'number' && !openTabIds.has(currentTabId)) {
              state.sessions.currentTabId = null;
            }
          });
        } catch (tabQueryError: unknown) {
          console.debug('[Sessions] Could not clean tab session map:', tabQueryError);
        }

        // CRITICAL: `sessions.currentSessionId` is persisted (localStorage) but `currentTask.sessionId/messages`
        // are not. On a fresh open, the UI can have a current session selected but an empty chat stream
        // until the user sends the first message. Hydrate currentTask for the selected session on startup.
        const persistedCurrentSessionId = get().sessions.currentSessionId;
        if (typeof persistedCurrentSessionId === 'string' && persistedCurrentSessionId.length > 0) {
          const taskSessionId = get().currentTask.sessionId;
          const taskMessages = Array.isArray(get().currentTask.messages) ? get().currentTask.messages : [];
          if (taskSessionId !== persistedCurrentSessionId || taskMessages.length === 0) {
            try {
              const { currentTask } = get();
              if (currentTask.actions.loadMessages) {
                await currentTask.actions.loadMessages(persistedCurrentSessionId);
              }
            } catch (loadError: unknown) {
              console.debug('[Sessions] Failed to hydrate messages for persisted currentSessionId:', loadError);
            }
          }
        }

        // On first open, proactively restore the most recent session so the user
        // immediately sees previous chat history (even before they send a new message).
        // Domain-aware switching (App.tsx) may override this shortly after based on active tab URL.
        const existingCurrentSessionId = get().sessions.currentSessionId;
        if (!existingCurrentSessionId) {
          // 1) Prefer a persisted last session id (works even if session list is empty/offline).
          try {
            const stored = await chrome.storage.local.get('last_session_id');
            const lastSessionId = stored?.last_session_id;
            if (typeof lastSessionId === 'string' && lastSessionId.length > 0) {
              set((state) => {
                state.sessions.currentSessionId = lastSessionId;
                state.sessions.currentDomain = null;
              });

              try {
                const { currentTask } = get();
                if (currentTask.actions.loadMessages) {
                  await currentTask.actions.loadMessages(lastSessionId);
                }
              } catch (loadError: unknown) {
                console.debug('[Sessions] Failed to preload messages for last_session_id:', loadError);
              }

              console.log('[Sessions] Restored last session from local storage');
              return;
            }
          } catch (storageError: unknown) {
            console.debug('[Sessions] Could not read last_session_id:', storageError);
          }

          // 2) Fallback: use the most recent session from the sessions list (if any).
          if (sessions.length > 0) {
            const mostRecent = sessions[0];
            const mostRecentSessionId = mostRecent?.sessionId;
            if (typeof mostRecentSessionId === 'string' && mostRecentSessionId.length > 0) {
              // Set current session id for UI + for runTask session continuity.
              set((state) => {
                state.sessions.currentSessionId = mostRecentSessionId;
                state.sessions.currentDomain = mostRecent.domain || null;
              });

              // Hydrate chat messages into currentTask so TaskUI can render immediately.
              // This is safe: loadMessages has its own backoff/loop protection.
              try {
                const { currentTask } = get();
                if (currentTask.actions.loadMessages) {
                  await currentTask.actions.loadMessages(mostRecentSessionId);
                }
              } catch (loadError: unknown) {
                console.debug('[Sessions] Failed to preload messages for most recent session:', loadError);
              }
            }
          }
        }
        
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
          // CRITICAL FIX: Use map() instead of direct index assignment to avoid "read only property" errors
          set((state) => {
            state.sessions.sessions = state.sessions.sessions.map(s => 
              s.sessionId === sessionId 
                ? { ...s, messageCount: messages.length, updatedAt: Date.now() }
                : s
            );
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
