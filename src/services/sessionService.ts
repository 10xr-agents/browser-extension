/**
 * Session Service for Multi-Session Chat Interface
 * 
 * Manages chat sessions and messages using backend API with chrome.storage.local fallback.
 * Uses backend API endpoints when available, falls back to local storage for offline support.
 * The schema matches the backend API structure for seamless integration.
 * 
 * **Session Metadata (Domain/URL):**
 * Sessions store `url` + `domain` as metadata for display/awareness.
 * Session selection itself is handled at a higher layer (tab-scoped in `src/state/sessions.ts`).
 * 
 * API Endpoints:
 * - GET /api/session/[sessionId]/messages - Get messages for a session (with limit, since params)
 * - GET /api/session/latest - Get latest session (with optional status filter)
 * - PATCH /api/session/[sessionId] - Rename session (backend requirement)
 * 
 * Storage Keys (fallback):
 * - `chat_sessions_index`: Array of Session objects (the list for the drawer)
 * - `session_${sessionId}`: Array of Message objects for a specific session
 * 
 * Reference: 
 * - Multi-Session Chat Interface Implementation
 * - BACKEND_MISSING_ITEMS.md §2 (Session Management Endpoints)
 * - Tab-Scoped Sessions Feature
 */

import { extractDomain, formatSessionTitle } from '../helpers/domainUtils';

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
  /** Root domain metadata (e.g., "google.com") */
  domain?: string;
  updatedAt?: number; // Unix timestamp (milliseconds)
  messageCount?: number;
  status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
  /** Whether this session can be renamed by the user */
  isRenamed?: boolean;
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

// === SESSION INIT TRACKING ===
// Tracks which sessions have been successfully initialized on the backend
// to avoid redundant init calls and prevent race conditions
const INITIALIZED_SESSIONS_KEY = 'initialized_sessions';

/** Cache of sessionIds that have been confirmed to exist on backend */
let initializedSessionsCache: Set<string> = new Set();

/** In-flight init requests to prevent duplicate calls */
const initInFlightMap: Map<string, Promise<boolean>> = new Map();

/**
 * Load initialized sessions from storage into cache
 */
async function loadInitializedSessionsCache(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(INITIALIZED_SESSIONS_KEY);
    const sessions = result[INITIALIZED_SESSIONS_KEY];
    if (Array.isArray(sessions)) {
      initializedSessionsCache = new Set(sessions);
    }
  } catch (error) {
    console.debug('[sessionService] Error loading initialized sessions cache:', error);
  }
}

/**
 * Mark a session as initialized (exists on backend)
 */
async function markSessionInitialized(sessionId: string): Promise<void> {
  initializedSessionsCache.add(sessionId);
  try {
    await chrome.storage.local.set({
      [INITIALIZED_SESSIONS_KEY]: Array.from(initializedSessionsCache),
    });
  } catch (error) {
    console.debug('[sessionService] Error saving initialized sessions cache:', error);
  }
}

/**
 * Check if a session is known to be initialized on backend
 */
function isSessionInitialized(sessionId: string): boolean {
  return initializedSessionsCache.has(sessionId);
}

/**
 * Clear initialized sessions cache (call on logout or storage wipe)
 */
export function clearInitializedSessionsCache(): void {
  initializedSessionsCache.clear();
  chrome.storage.local.remove(INITIALIZED_SESSIONS_KEY).catch(() => {});
}

// === SESSION LIST CACHING ===
// Prevents excessive API calls when no task is running
// Cache is invalidated after MIN_REFRESH_INTERVAL or when explicitly requested

/** Minimum time between session list refreshes (30 seconds) */
const SESSION_LIST_MIN_REFRESH_INTERVAL = 30000;

/** Cache for session list to prevent redundant API calls */
let sessionListCache: {
  sessions: Session[];
  timestamp: number;
  status: string; // Cached status filter
} | null = null;

/** In-flight request deduplication */
let sessionListInFlight: Promise<Session[]> | null = null;

/** Clear session list cache (call after creating/updating sessions) */
export function invalidateSessionListCache(): void {
  sessionListCache = null;
  console.debug('[sessionService] Session list cache invalidated');
}

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
 * OPTIMIZATION: Uses caching to prevent excessive API calls when idle.
 * Cache is valid for 30 seconds unless explicitly invalidated.
 * 
 * Reference: SERVER_SIDE_AGENT_ARCH.md §4.8.2 (GET /api/session)
 */
export async function listSessions(options?: {
  status?: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
  includeArchived?: boolean;
  limit?: number;
  /** Force refresh, ignoring cache */
  forceRefresh?: boolean;
}): Promise<Session[]> {
  const includeArchived = options?.includeArchived || false;
  const limit = options?.limit || 50;
  const forceRefresh = options?.forceRefresh || false;
  
  // Default to 'active' status - this is the most common case and reduces API calls
  // Only fetch multiple statuses when explicitly needed (e.g., history drawer)
  const requestedStatus: (typeof options)['status'] | undefined =
    options === undefined ? 'active' : options.status || 'active';
  
  const cacheKey = `${requestedStatus}-${includeArchived}`;
  
  // === CHECK CACHE ===
  // Return cached results if still valid and not forced refresh
  if (!forceRefresh && sessionListCache) {
    const cacheAge = Date.now() - sessionListCache.timestamp;
    if (cacheAge < SESSION_LIST_MIN_REFRESH_INTERVAL && sessionListCache.status === cacheKey) {
      console.debug(`[sessionService] Using cached session list (age: ${Math.round(cacheAge / 1000)}s)`);
      return sessionListCache.sessions;
    }
  }
  
  // === DEDUPLICATE IN-FLIGHT REQUESTS ===
  // If a request is already in progress, wait for it instead of making a new one
  if (sessionListInFlight) {
    console.debug('[sessionService] Waiting for in-flight session list request');
    try {
      return await sessionListInFlight;
    } catch {
      // If the in-flight request fails, continue to make a new request
    }
  }
  
  // Create the request promise for deduplication
  const requestPromise = (async (): Promise<Session[]> => {
    try {
      // Try API first - GET /api/session with filtering
      const { apiClient } = await import('../api/client');
      try {
        // Fetch sessions from API - SINGLE request with specific status
        // This avoids the previous pattern of making 4 parallel requests
        const response = await apiClient.listSessions({
          status: requestedStatus,
          includeArchived,
          limit,
          offset: 0,
        });
        
        let apiSessionsRaw: Array<{
          sessionId: string;
          url: string;
          status: 'active' | 'completed' | 'failed' | 'interrupted' | 'archived';
          createdAt: string;
          updatedAt: string;
          messageCount: number;
          metadata?: {
            taskType?: string;
            initialQuery?: string;
            [key: string]: unknown;
          };
        }> = [];
        
        if (response.success && Array.isArray(response.data.sessions)) {
          apiSessionsRaw = response.data.sessions;
        }

        if (apiSessionsRaw.length > 0 || response.success) {
          // Convert API response to Session format
          const byId = new Map<string, Session>();
          for (const s of apiSessionsRaw) {
            const session: Session = {
              sessionId: s.sessionId,
              title: s.metadata?.initialQuery
                ? typeof s.metadata.initialQuery === 'string' && s.metadata.initialQuery.length > 50
                  ? s.metadata.initialQuery.substring(0, 50) + '...'
                  : String(s.metadata.initialQuery || 'New Task')
                : 'New Task',
              createdAt: new Date(s.createdAt).getTime(),
              url: s.url,
              updatedAt: new Date(s.updatedAt).getTime(),
              messageCount: s.messageCount,
              status: s.status,
            };

            const prev = byId.get(session.sessionId);
            if (!prev || (session.updatedAt || 0) > (prev.updatedAt || 0)) {
              byId.set(session.sessionId, session);
            }
          }
          const apiSessions = Array.from(byId.values());
          
          // Merge with local storage sessions (for offline support)
          const localSessions = await getLocalSessions();
          const localSessionIds = new Set(apiSessions.map(s => s.sessionId));
          const uniqueLocalSessions = localSessions.filter(s => !localSessionIds.has(s.sessionId));
          
          // Combine and sort by updatedAt descending
          // Filter out archived sessions (they should already be excluded by API, but filter as safeguard)
          const allSessions = [...apiSessions, ...uniqueLocalSessions]
            .filter(s => s.status !== 'archived')
            .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
          
          // Update cache
          sessionListCache = {
            sessions: allSessions,
            timestamp: Date.now(),
            status: cacheKey,
          };
          
          return allSessions;
        }
      } catch (apiError) {
        // API failed, fall back to local storage
        console.debug('API unavailable, using local storage:', apiError);
      }
      
      // Fallback to local storage - filter out archived sessions
      const localSessions = await getLocalSessions();
      const filteredSessions = localSessions.filter(s => s.status !== 'archived');
      
      // Cache local results too (shorter validity)
      sessionListCache = {
        sessions: filteredSessions,
        timestamp: Date.now() - (SESSION_LIST_MIN_REFRESH_INTERVAL / 2), // Half validity for local-only
        status: cacheKey,
      };
      
      return filteredSessions;
    } catch (error) {
      console.error('Error listing sessions:', error);
      return [];
    } finally {
      // Clear in-flight marker
      sessionListInFlight = null;
    }
  })();
  
  sessionListInFlight = requestPromise;
  return requestPromise;
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
 * Ensure a session exists on the backend before Pusher subscription.
 * This is the CRITICAL function that prevents 403 errors from /api/pusher/auth.
 *
 * Call flow:
 * 1. Check if session is already known to be initialized (cache)
 * 2. If not, call POST /api/session/init to create/verify on backend
 * 3. Mark as initialized in cache for future calls
 *
 * @param sessionId - Session UUID to ensure exists
 * @param metadata - Optional metadata for session creation
 * @returns true if session exists on backend, false if initialization failed
 */
export async function ensureSessionInitialized(
  sessionId: string,
  metadata?: {
    url?: string;
    domain?: string;
    initialQuery?: string;
    tabId?: number;
  }
): Promise<boolean> {
  // 1. Check cache first - already initialized
  if (isSessionInitialized(sessionId)) {
    console.debug(`[sessionService] Session ${sessionId.slice(0, 8)}... already initialized (cached)`);
    return true;
  }

  // 2. Check if init is already in-flight for this session (prevent duplicate calls)
  const inFlight = initInFlightMap.get(sessionId);
  if (inFlight) {
    console.debug(`[sessionService] Session ${sessionId.slice(0, 8)}... init already in-flight, waiting`);
    return inFlight;
  }

  // 3. Call backend to init session
  const initPromise = (async (): Promise<boolean> => {
    try {
      const { apiClient } = await import('../api/client');
      const response = await apiClient.initSession(sessionId, metadata);

      if (response.success) {
        await markSessionInitialized(sessionId);
        console.log(
          `[sessionService] Session ${sessionId.slice(0, 8)}... initialized on backend (created: ${response.data.created})`
        );
        return true;
      }

      console.warn(`[sessionService] Session init returned success=false for ${sessionId.slice(0, 8)}...`);
      return false;
    } catch (error) {
      // Handle specific error cases
      const errorMessage = error instanceof Error ? error.message : String(error);

      // If the error indicates session already exists (some backends return 409 Conflict)
      // treat it as success
      if (errorMessage.includes('already exists') || errorMessage.includes('CONFLICT')) {
        await markSessionInitialized(sessionId);
        console.debug(`[sessionService] Session ${sessionId.slice(0, 8)}... already exists on backend`);
        return true;
      }

      // Network errors - session might not be initialized, but we can't confirm
      // Allow proceeding but don't cache (will retry on next call)
      console.warn(`[sessionService] Failed to init session ${sessionId.slice(0, 8)}...:`, errorMessage);

      // For offline mode, we still want to allow local operations
      // The session will be synced when connection is restored
      return false;
    } finally {
      initInFlightMap.delete(sessionId);
    }
  })();

  initInFlightMap.set(sessionId, initPromise);
  return initPromise;
}

/**
 * Create a new session
 * Generates a UUID, creates a domain-prefixed title, and saves it to the index.
 * Also initializes the session on the backend for Pusher support.
 *
 * @param initialUrl - The URL where the session was started
 * @param taskDescription - Optional description for the task (will be prefixed with domain)
 */
export async function createNewSession(initialUrl: string = '', taskDescription?: string): Promise<Session> {
  const sessionId = generateSessionId();
  const now = Date.now();

  // Extract domain from URL for metadata
  const domainInfo = extractDomain(initialUrl);
  const domain = domainInfo.isValid ? domainInfo.rootDomain : '';

  // Format title with domain prefix
  const title = formatSessionTitle(domain, taskDescription || 'New Task');

  const session: Session = {
    sessionId,
    title,
    createdAt: now,
    url: initialUrl,
    domain, // Store domain for quick lookup
    updatedAt: now,
    messageCount: 0,
    status: 'active',
    isRenamed: false,
  };

  try {
    // Invalidate cache since we're creating a new session
    invalidateSessionListCache();

    // === CRITICAL: Initialize session on backend BEFORE saving locally ===
    // This ensures Pusher auth will succeed when we subscribe
    // Fire-and-forget: don't block local session creation on backend
    // If backend is down, session will be synced later
    void ensureSessionInitialized(sessionId, {
      url: initialUrl,
      domain,
      initialQuery: taskDescription,
    }).catch((error) => {
      console.debug('[sessionService] Background session init failed (will retry):', error);
    });

    // Load existing sessions
    const existingSessions = await listSessions({ forceRefresh: true });

    // Add new session to the beginning
    const updatedSessions = [session, ...existingSessions];

    // Limit to 50 sessions
    const limitedSessions = updatedSessions.slice(0, 50);

    // Save updated index
    await chrome.storage.local.set({
      [SESSIONS_INDEX_KEY]: limitedSessions,
    });

    // Invalidate cache again after modification
    invalidateSessionListCache();

    return session;
  } catch (error) {
    console.error('Error creating new session:', error);
    throw error;
  }
}

/**
 * Rename a session
 * Allows users to customize the session title
 * 
 * @param sessionId - The session ID to rename
 * @param newTitle - The new title (domain prefix will be preserved if not already in title)
 * @param preserveDomainPrefix - Whether to automatically add domain prefix if missing (default: true)
 */
export async function renameSession(
  sessionId: string,
  newTitle: string,
  preserveDomainPrefix: boolean = true
): Promise<void> {
  try {
    const sessions = await getLocalSessions();
    const session = sessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }
    
    let finalTitle = newTitle.trim();
    
    // If preserveDomainPrefix is true and the new title doesn't have a domain prefix,
    // add the domain prefix from the session
    if (preserveDomainPrefix && session.domain) {
      const domainPrefix = `${session.domain}: `;
      if (!finalTitle.startsWith(domainPrefix) && !finalTitle.includes(': ')) {
        finalTitle = `${domainPrefix}${finalTitle}`;
      }
    }
    
    // Try API first (backend requirement)
    try {
      const { apiClient } = await import('../api/client');
      // Note: This endpoint needs to be implemented on the backend
      // See BACKEND_REQUIREMENTS section below
      await apiClient.request('PATCH', `/api/session/${sessionId}`, {
        title: finalTitle,
      });
    } catch (apiError) {
      console.debug('API rename unavailable, updating local only:', apiError);
    }
    
    // Update local storage
    await updateSession(sessionId, {
      title: finalTitle,
      isRenamed: true,
      updatedAt: Date.now(),
    });
  } catch (error) {
    console.error(`Error renaming session ${sessionId}:`, error);
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
 * 
 * NOTE: Only invalidates cache for significant changes (status, title changes)
 * Minor updates (url, updatedAt) use cached session list for efficiency
 */
export async function updateSession(
  sessionId: string,
  updates: Partial<Session>
): Promise<void> {
  try {
    // Only invalidate cache for significant changes
    const isSignificantChange = updates.status !== undefined || updates.title !== undefined;
    if (isSignificantChange) {
      invalidateSessionListCache();
    }
    
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
      
      // Invalidate cache after creating new session
      invalidateSessionListCache();
    } else {
      // Update existing session
      // CRITICAL FIX: Use map() instead of direct index assignment to avoid "read only property" errors
      // The existingSessions array may be cached/frozen from sessionListCache
      const updatedSessions = existingSessions.map((s, i) => 
        i === sessionIndex 
          ? { ...s, ...updates }
          : s
      );
      
      // Save updated index
      await chrome.storage.local.set({
        [SESSIONS_INDEX_KEY]: updatedSessions,
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
    // Invalidate cache since we're archiving
    invalidateSessionListCache();
    
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
      // CRITICAL FIX: Use map() instead of direct index assignment to avoid "read only property" errors
      // The existingSessions array may be returned frozen from getLocalSessions or cached
      const updatedSessions = existingSessions.map((s, i) =>
        i === sessionIndex
          ? { ...s, status: 'archived' as const, updatedAt: Date.now() }
          : s
      );
      
      await chrome.storage.local.set({
        [SESSIONS_INDEX_KEY]: updatedSessions,
      });
      
      // Invalidate cache after modification
      invalidateSessionListCache();
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
 * Preserves domain prefix if the session has a domain
 */
export async function updateSessionTitleFromMessage(
  sessionId: string,
  firstUserMessage: string
): Promise<void> {
  try {
    // Get the session to check for domain
    const sessions = await getLocalSessions();
    const session = sessions.find(s => s.sessionId === sessionId);
    
    if (!session) {
      console.warn(`Session ${sessionId} not found, cannot update title`);
      return;
    }
    
    // Skip if user has already renamed the session
    if (session.isRenamed) {
      console.debug(`Session ${sessionId} was renamed by user, skipping auto-title update`);
      return;
    }
    
    // Get domain from session or extract from URL
    let domain = session.domain;
    if (!domain && session.url) {
      const domainInfo = extractDomain(session.url);
      domain = domainInfo.isValid ? domainInfo.rootDomain : '';
    }
    
    // Format title with domain prefix
    const title = formatSessionTitle(domain || '', firstUserMessage, 60);
    
    await updateSession(sessionId, { title });
  } catch (error) {
    console.error(`Error updating session title for ${sessionId}:`, error);
  }
}

/**
 * Migrate existing sessions to add domain field
 * Call this on extension startup to backfill domain data
 */
export async function migrateSessionsWithDomain(): Promise<void> {
  try {
    const sessions = await getLocalSessions();
    let updated = false;

    const migratedSessions = sessions.map((session) => {
      // Skip if already has domain
      if (session.domain) {
        return session;
      }

      // Extract domain from URL
      if (session.url) {
        const domainInfo = extractDomain(session.url);
        if (domainInfo.isValid) {
          updated = true;
          return {
            ...session,
            domain: domainInfo.rootDomain,
          };
        }
      }

      return session;
    });

    if (updated) {
      await chrome.storage.local.set({
        [SESSIONS_INDEX_KEY]: migratedSessions,
      });
      console.log('Migrated sessions with domain data');
    }
  } catch (error) {
    console.error('Error migrating sessions:', error);
  }
}

/**
 * Initialize session service on extension startup.
 * - Loads initialized sessions cache from storage
 * - Handles storage loss recovery by syncing from backend
 *
 * Call this early in the extension lifecycle (before any session operations).
 */
export async function initializeSessionService(): Promise<void> {
  try {
    // Load the initialized sessions cache from storage
    await loadInitializedSessionsCache();
    console.debug('[sessionService] Loaded initialized sessions cache:', initializedSessionsCache.size, 'sessions');
  } catch (error) {
    console.error('[sessionService] Error initializing session service:', error);
  }
}

/**
 * Recover sessions from backend when local storage is empty.
 * This handles the "storage loss" scenario where chrome.storage was cleared
 * but the backend still has the user's sessions.
 *
 * @param currentUrl - Current tab URL for domain matching (optional)
 * @returns The recovered session ID if successful, null otherwise
 */
export async function recoverSessionsFromBackend(currentUrl?: string): Promise<string | null> {
  try {
    // Check if local storage has any sessions
    const localSessions = await getLocalSessions();

    if (localSessions.length > 0) {
      // Local storage has sessions - no recovery needed
      console.debug('[sessionService] Local sessions exist, no recovery needed');
      return null;
    }

    console.log('[sessionService] Local storage empty, attempting to recover sessions from backend...');

    // Fetch sessions from backend
    const { apiClient } = await import('../api/client');
    const response = await apiClient.listSessions({
      status: 'active',
      includeArchived: false,
      limit: 50,
    });

    if (!response.success || !response.data.sessions || response.data.sessions.length === 0) {
      console.debug('[sessionService] No sessions found on backend to recover');
      return null;
    }

    // Convert backend sessions to local format and save
    const recoveredSessions: Session[] = response.data.sessions.map((s) => {
      const domainInfo = extractDomain(s.url || '');
      return {
        sessionId: s.sessionId,
        title: s.metadata?.initialQuery
          ? typeof s.metadata.initialQuery === 'string' && s.metadata.initialQuery.length > 50
            ? s.metadata.initialQuery.substring(0, 50) + '...'
            : String(s.metadata.initialQuery || 'New Task')
          : 'New Task',
        createdAt: new Date(s.createdAt).getTime(),
        url: s.url,
        domain: domainInfo.isValid ? domainInfo.rootDomain : undefined,
        updatedAt: new Date(s.updatedAt).getTime(),
        messageCount: s.messageCount,
        status: s.status,
      };
    });

    // Save recovered sessions to local storage
    await chrome.storage.local.set({
      [SESSIONS_INDEX_KEY]: recoveredSessions,
    });

    // Mark all recovered sessions as initialized (they already exist on backend)
    for (const session of recoveredSessions) {
      await markSessionInitialized(session.sessionId);
    }

    console.log(`[sessionService] Recovered ${recoveredSessions.length} sessions from backend`);

    // Invalidate cache to pick up recovered sessions
    invalidateSessionListCache();

    // Try to find a session matching the current domain
    if (currentUrl) {
      const currentDomainInfo = extractDomain(currentUrl);
      if (currentDomainInfo.isValid) {
        const matchingSession = recoveredSessions.find(
          (s) => s.domain === currentDomainInfo.rootDomain
        );
        if (matchingSession) {
          console.log(
            `[sessionService] Found matching session for domain ${currentDomainInfo.rootDomain}:`,
            matchingSession.sessionId.slice(0, 8)
          );
          return matchingSession.sessionId;
        }
      }
    }

    // Return most recent session if no domain match
    if (recoveredSessions.length > 0) {
      return recoveredSessions[0].sessionId;
    }

    return null;
  } catch (error) {
    console.error('[sessionService] Error recovering sessions from backend:', error);
    return null;
  }
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
