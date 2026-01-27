/**
 * Session Service for Multi-Session Chat Interface
 * 
 * Manages chat sessions and messages using backend API with chrome.storage.local fallback.
 * Uses backend API endpoints when available, falls back to local storage for offline support.
 * The schema matches the backend API structure for seamless integration.
 * 
 * API Endpoints:
 * - GET /api/session/[sessionId]/messages - Get messages for a session (with limit, since params)
 * - GET /api/session/latest - Get latest session (with optional status filter)
 * 
 * Storage Keys (fallback):
 * - `chat_sessions_index`: Array of Session objects (the list for the drawer)
 * - `session_${sessionId}`: Array of Message objects for a specific session
 * 
 * Reference: 
 * - Multi-Session Chat Interface Implementation
 * - BACKEND_MISSING_ITEMS.md §2 (Session Management Endpoints)
 */

/**
 * Session object matching backend schema
 * 
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.8.2 (GET /api/session)
 */
export interface Session {
  sessionId: string;
  title: string;
  createdAt: number; // Unix timestamp (milliseconds)
  url: string;
  updatedAt?: number; // Unix timestamp (milliseconds)
  messageCount?: number;
  status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
}

/**
 * Message object matching backend schema
 */
export interface Message {
  messageId: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number; // Unix timestamp (milliseconds)
  actionPayload?: {
    action: string;
    parsedAction: unknown;
  };
  status?: 'sending' | 'sent' | 'pending' | 'error';
  error?: {
    message: string;
    code: string;
  };
  metadata?: {
    steps?: Array<{
      type: string;
      description: string;
      timestamp: number;
      success: boolean;
    }>;
    usage?: {
      promptTokens: number;
      completionTokens: number;
    };
  };
}

const SESSIONS_INDEX_KEY = 'chat_sessions_index';
const SESSION_PREFIX = 'session_';

/**
 * Generate a UUID v4 for session IDs
 * Uses crypto.randomUUID() if available (Chrome 92+), otherwise falls back to manual generation
 */
function generateSessionId(): string {
  // Use Web Crypto API if available (Chrome extensions support this)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback: Generate UUID v4 manually
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * Generate a UUID v4 for message IDs
 * Uses crypto.randomUUID() if available (Chrome 92+), otherwise falls back to manual generation
 */
function generateMessageId(): string {
  // Use Web Crypto API if available (Chrome extensions support this)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback: Generate UUID v4 manually
  // Format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

/**
 * List all chat sessions
 * Uses GET /api/session to fetch all active sessions from backend
 * Falls back to chrome.storage.local if API unavailable
 * Returns sessions sorted by updatedAt (most recent first)
 * 
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.8.2 (GET /api/session)
 */
export async function listSessions(options?: {
  status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
  includeArchived?: boolean;
  limit?: number;
}): Promise<Session[]> {
  try {
    // Try API first - GET /api/session with filtering
    const { apiClient } = await import('../api/client');
    try {
      const response = await apiClient.listSessions({
        status: options?.status || 'active',
        includeArchived: options?.includeArchived || false,
        limit: options?.limit || 50,
        offset: 0,
      });
      
      if (response.success && response.data.sessions.length > 0) {
        // Convert API response to Session format
        const apiSessions: Session[] = response.data.sessions.map((s) => ({
          sessionId: s.sessionId,
          title: s.metadata?.initialQuery 
            ? (typeof s.metadata.initialQuery === 'string' && s.metadata.initialQuery.length > 50
                ? s.metadata.initialQuery.substring(0, 50) + '...'
                : String(s.metadata.initialQuery || 'New Task'))
            : 'New Task',
          createdAt: new Date(s.createdAt).getTime(),
          url: s.url,
          updatedAt: new Date(s.updatedAt).getTime(),
          messageCount: s.messageCount,
          status: s.status,
        }));
        
        // Merge with local storage sessions (for offline support)
        const localSessions = await getLocalSessions();
        const localSessionIds = new Set(apiSessions.map(s => s.sessionId));
        const uniqueLocalSessions = localSessions.filter(s => !localSessionIds.has(s.sessionId));
        
        // Combine and sort by updatedAt descending
        // Filter out archived sessions (they should already be excluded by API, but filter as safeguard)
        const allSessions = [...apiSessions, ...uniqueLocalSessions]
          .filter(s => s.status !== 'archived')
          .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        return allSessions;
      }
    } catch (apiError) {
      // API failed, fall back to local storage
      console.debug('API unavailable, using local storage:', apiError);
    }
    
    // Fallback to local storage - filter out archived sessions
    const localSessions = await getLocalSessions();
    return localSessions.filter(s => s.status !== 'archived');
  } catch (error) {
    console.error('Error listing sessions:', error);
    return [];
  }
}

/**
 * Get sessions from local storage
 */
async function getLocalSessions(): Promise<Session[]> {
  try {
    const result = await chrome.storage.local.get(SESSIONS_INDEX_KEY);
    const sessions = result[SESSIONS_INDEX_KEY];
    
    if (!sessions || !Array.isArray(sessions)) {
      return [];
    }
    
    // Sort by createdAt descending (most recent first)
    return sessions.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  } catch (error) {
    console.error('Error getting local sessions:', error);
    return [];
  }
}

/**
 * Load all messages for a specific session
 * Uses GET /api/session/[sessionId]/messages with pagination support
 * Falls back to chrome.storage.local if API unavailable
 * 
 * @param sessionId - Session ID (UUID)
 * @param limit - Maximum number of messages to return (default: 50, max: 200)
 * @param since - ISO 8601 date string to filter messages created after this timestamp
 */
export async function loadSession(
  sessionId: string,
  limit?: number,
  since?: string
): Promise<Message[]> {
  try {
    // Try API first
    const { apiClient } = await import('../api/client');
    try {
      const sinceDate = since ? new Date(since) : undefined;
      const response = await apiClient.getSessionMessages(sessionId, limit, sinceDate);
      
      // Convert API response format to internal Message format
      return response.messages.map((msg) => ({
        messageId: msg.messageId,
        role: msg.role,
        content: msg.content,
        timestamp: new Date(msg.timestamp).getTime(), // Convert ISO 8601 to timestamp
        actionPayload: msg.actionPayload as Message['actionPayload'],
        status: msg.status as Message['status'],
        error: msg.error as Message['error'],
        metadata: msg.metadata as Message['metadata'],
      }));
    } catch (apiError) {
      // API failed, fall back to local storage
      console.debug(`API unavailable for session ${sessionId}, using local storage:`, apiError);
    }
    
    // Fallback to local storage
    const key = `${SESSION_PREFIX}${sessionId}`;
    const result = await chrome.storage.local.get(key);
    const messages = result[key];
    
    if (!messages || !Array.isArray(messages)) {
      return [];
    }
    
    // Apply filters if provided
    let filteredMessages = messages;
    if (since) {
      const sinceTimestamp = new Date(since).getTime();
      filteredMessages = messages.filter((msg: Message) => (msg.timestamp || 0) >= sinceTimestamp);
    }
    if (limit) {
      filteredMessages = filteredMessages.slice(0, limit);
    }
    
    // Sort by timestamp ascending (oldest first)
    return filteredMessages.sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));
  } catch (error) {
    console.error(`Error loading session ${sessionId}:`, error);
    return [];
  }
}

/**
 * Create a new session
 * Generates a UUID, creates a generic title, and saves it to the index
 */
export async function createNewSession(initialUrl: string = ''): Promise<Session> {
  const sessionId = generateSessionId();
  const now = Date.now();
  
  const session: Session = {
    sessionId,
    title: 'New Task',
    createdAt: now,
    url: initialUrl,
    updatedAt: now,
    messageCount: 0,
    status: 'active',
  };
  
  try {
    // Load existing sessions
    const existingSessions = await listSessions();
    
    // Add new session to the beginning
    const updatedSessions = [session, ...existingSessions];
    
    // Limit to 50 sessions
    const limitedSessions = updatedSessions.slice(0, 50);
    
    // Save updated index
    await chrome.storage.local.set({
      [SESSIONS_INDEX_KEY]: limitedSessions,
    });
    
    return session;
  } catch (error) {
    console.error('Error creating new session:', error);
    throw error;
  }
}

/**
 * Save a message to a session
 * Appends the message to the session's message array
 */
export async function saveMessage(sessionId: string, message: Message): Promise<void> {
  try {
    const key = `${SESSION_PREFIX}${sessionId}`;
    
    // Load existing messages
    const existingMessages = await loadSession(sessionId);
    
    // Add new message
    const updatedMessages = [...existingMessages, message];
    
    // Save messages
    await chrome.storage.local.set({
      [key]: updatedMessages,
    });
    
    // Update session's messageCount and updatedAt
    await updateSession(sessionId, {
      messageCount: updatedMessages.length,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error(`Error saving message to session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Update a session's metadata
 * If session doesn't exist in index, it will be created
 */
export async function updateSession(
  sessionId: string,
  updates: Partial<Session>
): Promise<void> {
  try {
    const existingSessions = await listSessions();
    const sessionIndex = existingSessions.findIndex(s => s.sessionId === sessionId);
    
    if (sessionIndex === -1) {
      // Session doesn't exist, create it
      const newSession: Session = {
        sessionId,
        title: updates.title || 'New Task',
        createdAt: updates.createdAt || Date.now(),
        url: updates.url || '',
        updatedAt: updates.updatedAt || Date.now(),
        messageCount: updates.messageCount || 0,
        status: updates.status || 'active',
        ...updates,
      };
      
      // Add to beginning of list
      const updatedSessions = [newSession, ...existingSessions].slice(0, 50);
      
      await chrome.storage.local.set({
        [SESSIONS_INDEX_KEY]: updatedSessions,
      });
    } else {
      // Update existing session
      const updatedSession = {
        ...existingSessions[sessionIndex],
        ...updates,
      };
      
      // Replace in array
      existingSessions[sessionIndex] = updatedSession;
      
      // Save updated index
      await chrome.storage.local.set({
        [SESSIONS_INDEX_KEY]: existingSessions,
      });
    }
  } catch (error) {
    console.error(`Error updating session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Archive a session
 * Marks a session as archived on the backend (excluded from Chrome extension queries)
 * Also updates local storage
 * 
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.8.3 (POST /api/session)
 */
export async function archiveSession(sessionId: string): Promise<void> {
  try {
    // Try API first
    const { apiClient } = await import('../api/client');
    try {
      await apiClient.archiveSession(sessionId);
    } catch (apiError) {
      // API failed, but continue to update local storage
      console.debug('API unavailable, archiving in local storage only:', apiError);
    }
    
    // Update local storage - mark as archived
    const existingSessions = await getLocalSessions();
    const sessionIndex = existingSessions.findIndex(s => s.sessionId === sessionId);
    
    if (sessionIndex >= 0) {
      existingSessions[sessionIndex] = {
        ...existingSessions[sessionIndex],
        status: 'archived',
        updatedAt: Date.now(),
      };
      
      await chrome.storage.local.set({
        [SESSIONS_INDEX_KEY]: existingSessions,
      });
    }
  } catch (error) {
    console.error(`Error archiving session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Delete a session and all its messages
 */
export async function deleteSession(sessionId: string): Promise<void> {
  try {
    // Remove from index
    const existingSessions = await getLocalSessions();
    const filteredSessions = existingSessions.filter(s => s.sessionId !== sessionId);
    
    await chrome.storage.local.set({
      [SESSIONS_INDEX_KEY]: filteredSessions,
    });
    
    // Remove messages
    const key = `${SESSION_PREFIX}${sessionId}`;
    await chrome.storage.local.remove(key);
  } catch (error) {
    console.error(`Error deleting session ${sessionId}:`, error);
    throw error;
  }
}

/**
 * Update session title from first user message
 */
export async function updateSessionTitleFromMessage(
  sessionId: string,
  firstUserMessage: string
): Promise<void> {
  const title = firstUserMessage.length > 50 
    ? firstUserMessage.substring(0, 50) + '...' 
    : firstUserMessage;
  
  await updateSession(sessionId, { title });
}

/**
 * Helper to convert Date objects to timestamps for storage
 */
export function toTimestamp(date: Date | number): number {
  return typeof date === 'number' ? date : date.getTime();
}

/**
 * Helper to convert timestamps to Date objects
 */
export function fromTimestamp(timestamp: number): Date {
  return new Date(timestamp);
}
