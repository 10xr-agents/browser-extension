/**
 * Pusher/Sockudo transport for real-time message sync
 *
 * Connects to Sockudo (Pusher-compatible) on port 3005, subscribes to
 * private-session-<sessionId>, binds new_message and interact_response.
 * Channel auth: POST to main server (e.g. port 3000) /api/pusher/auth with Bearer token.
 *
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §11.11, Client TODO List
 */

import { EventEmitter } from 'events';
import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';
import type { ChatMessage } from '../types/chatMessage';

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'fallback';

// These are replaced at build time by webpack DefinePlugin. In the browser there is no
// process.env, so we must not guard with typeof process - otherwise the inlined
// literal is never used and key stays empty (causing "PUSHER_KEY not set").
const getPusherConfig = (): {
  key: string;
  cluster: string;
  wsHost: string;
  wsPort: number;
  authEndpoint: string;
} => {
  const apiBase = process.env.WEBPACK_API_BASE
    ? String(process.env.WEBPACK_API_BASE).replace(/\/$/, '')
    : 'https://api.example.com';
  const key = process.env.WEBPACK_PUSHER_KEY ? String(process.env.WEBPACK_PUSHER_KEY) : '';
  const wsHost = process.env.WEBPACK_PUSHER_WS_HOST ? String(process.env.WEBPACK_PUSHER_WS_HOST) : 'localhost';
  const wsPort = process.env.WEBPACK_PUSHER_WS_PORT ? Number(process.env.WEBPACK_PUSHER_WS_PORT) : 3005;
  // pusher-js requires cluster; for Sockudo/custom wsHost we use a dummy (ignored when wsHost/wsPort are set)
  const cluster = 'local';
  return {
    key,
    cluster,
    wsHost,
    wsPort,
    authEndpoint: `${apiBase}/api/pusher/auth`,
  };
};

/** Map server message payload to client ChatMessage */
function mapMessagePayload(payload: {
  type?: string;
  sessionId?: string;
  message?: Record<string, unknown>;
}): ChatMessage | null {
  const msg = payload?.message;
  if (!msg || typeof msg !== 'object') return null;

  const id = typeof msg.messageId === 'string' ? msg.messageId : String(msg.messageId ?? '');
  if (!id) return null;

  const role = (typeof msg.role === 'string' ? msg.role : 'assistant') as ChatMessage['role'];
  const content = typeof msg.content === 'string' ? msg.content : String(msg.content ?? '');
  const status = ((msg.status as ChatMessage['status']) || 'sent') as ChatMessage['status'];
  const timestamp = msg.timestamp
    ? new Date(msg.timestamp as string | number)
    : new Date();
  const sequenceNumber =
    typeof msg.sequenceNumber === 'number' ? msg.sequenceNumber : undefined;

  return {
    id,
    role,
    content,
    status,
    timestamp,
    sequenceNumber,
    actionPayload: msg.actionPayload as ChatMessage['actionPayload'],
    error: msg.error as ChatMessage['error'],
  };
}

class PusherTransport extends EventEmitter {
  private pusher: Pusher | null = null;
  private channel: Channel | null = null;
  private connectionState: ConnectionState = 'disconnected';
  private currentSessionId: string | null = null;
  private config = getPusherConfig();
  private connectTimeout: ReturnType<typeof setTimeout> | null = null;
  private connectAttemptId = 0;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 3;
  private reconnectDelay = 2000; // Start with 2 seconds
  private reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
  private isManualDisconnect = false; // Track if disconnect was intentional
  
  // Auth failure tracking - prevents repeated 403 errors
  private lastAuthFailureTime = 0;
  private authFailureCount = 0;
  private readonly AUTH_FAILURE_COOLDOWN = 60000; // 1 minute cooldown after auth failure
  private readonly MAX_AUTH_FAILURES = 3; // After 3 failures, use longer cooldown

  constructor() {
    super();
    this.setMaxListeners(20);
  }
  
  /** Check if we should skip connection due to recent auth failures */
  private shouldSkipDueToAuthFailure(): boolean {
    if (this.authFailureCount === 0) return false;
    
    const timeSinceLastFailure = Date.now() - this.lastAuthFailureTime;
    const cooldownPeriod = this.authFailureCount >= this.MAX_AUTH_FAILURES 
      ? this.AUTH_FAILURE_COOLDOWN * 5  // 5 minute cooldown after repeated failures
      : this.AUTH_FAILURE_COOLDOWN;
    
    if (timeSinceLastFailure < cooldownPeriod) {
      console.debug(`[PusherTransport] Skipping connection - in auth failure cooldown (${Math.round((cooldownPeriod - timeSinceLastFailure) / 1000)}s remaining)`);
      return true;
    }
    
    // Cooldown expired, reset failure count
    this.authFailureCount = 0;
    return false;
  }
  
  /** Record an auth failure */
  private recordAuthFailure(): void {
    this.lastAuthFailureTime = Date.now();
    this.authFailureCount++;
    console.warn(`[PusherTransport] Auth failure #${this.authFailureCount}`);
  }
  
  /** Reset auth failure state (call on successful connection) */
  private resetAuthFailures(): void {
    this.authFailureCount = 0;
    this.lastAuthFailureTime = 0;
  }

  private async getToken(): Promise<string | null> {
    try {
      if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
      const result = await chrome.storage.local.get('accessToken');
      return result.accessToken || null;
    } catch (error: unknown) {
      console.error('[PusherTransport] Error reading token:', error);
      return null;
    }
  }

  getConnectionState(): ConnectionState {
    return this.connectionState;
  }

  getCurrentSessionId(): string | null {
    return this.currentSessionId;
  }

  /**
   * Subscribe to a session channel on an existing Pusher instance.
   * Used when switching chats: reuse the same WebSocket, only change the channel.
   * If not yet connected, just sets currentSessionId so we subscribe when 'connected' fires.
   * Triggers one POST /api/pusher/auth per new private channel (required by Sockudo).
   */
  private subscribeToSessionChannel(sessionId: string): void {
    if (!this.pusher) return;

    const connState = this.pusher.connection?.state ?? '';
    if (connState !== 'connected') {
      this.currentSessionId = sessionId;
      return;
    }

    if (this.currentSessionId === sessionId && this.channel) return;

    // Unsubscribe from previous channel (no new auth call)
    if (this.currentSessionId) {
      try {
        this.pusher.unsubscribe(`private-session-${this.currentSessionId}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('CLOSING') && !msg.includes('CLOSED')) {
          console.warn('[PusherTransport] Unsubscribe (switch) error:', error);
        }
      }
      this.channel = null;
    }

    this.currentSessionId = sessionId;
    const channelName = `private-session-${sessionId}`;
    const channel = this.pusher.subscribe(channelName);

    // CRITICAL: Handle channel subscription errors (e.g., 403 from /api/pusher/auth)
    // When channel auth fails, Pusher emits this event on the channel
    channel.bind('pusher:subscription_error', (status: { status: number; type?: string; error?: string }) => {
      const statusCode = status?.status ?? 0;
      const errorType = status?.type ?? 'unknown';
      const errorMessage = status?.error ?? 'Channel subscription failed';
      
      console.warn(`[PusherTransport] Channel subscription error for ${channelName}:`, {
        status: statusCode,
        type: errorType,
        error: errorMessage,
      });
      
      // 403 = Forbidden (auth rejected), 401 = Unauthorized (token invalid)
      if (statusCode === 403 || statusCode === 401) {
        // Record auth failure for cooldown tracking
        this.recordAuthFailure();
        
        console.warn('[PusherTransport] Channel auth failed with', statusCode, '- switching to polling fallback');
        this.setConnectionState('failed');
        this.emit('fallback', { 
          reason: `Channel auth failed (${statusCode}): ${errorMessage}`,
        });
        // Disconnect to prevent retry loops - polling will take over
        void this.disconnect();
      } else if (statusCode >= 500) {
        // Server error - might be temporary, let reconnect logic handle it
        console.warn('[PusherTransport] Channel auth server error', statusCode, '- will retry');
        this.setConnectionState('reconnecting');
      }
    });

    // Handle successful subscription
    channel.bind('pusher:subscription_succeeded', () => {
      console.log('[PusherTransport] Successfully subscribed to channel:', channelName);
      // Reset auth failures on successful subscription
      this.resetAuthFailures();
    });

    channel.bind('new_message', (payload: { type?: string; sessionId?: string; message?: Record<string, unknown> }) => {
      const message = mapMessagePayload(payload);
      if (message) this.emit('newMessage', message);
    });

    channel.bind('interact_response', () => {
      this.emit('interact_response');
    });

    this.channel = channel;
    console.log('[PusherTransport] Subscribing to session channel:', sessionId);
  }

  async connect(sessionId: string): Promise<void> {
    // Reset manual disconnect flag - this is an intentional connect
    this.isManualDisconnect = false;
    
    if (this.connectionState === 'connected' && this.currentSessionId === sessionId) {
      return;
    }
    
    // Check if we're in auth failure cooldown
    if (this.shouldSkipDueToAuthFailure()) {
      this.setConnectionState('fallback');
      this.emit('fallback', { reason: 'In auth failure cooldown period' });
      return;
    }

    // Session switch: reuse existing connection, only change channel (no disconnect/reconnect).
    // BUT: If we're in a failed/fallback state, we need to reconnect with fresh credentials
    if (this.pusher && (this.connectionState === 'connected' || this.connectionState === 'connecting')) {
      if (this.currentSessionId !== sessionId) {
        console.log('[PusherTransport] Switching session channel from', this.currentSessionId, 'to', sessionId);
        this.subscribeToSessionChannel(sessionId);
      }
      return;
    }

    // Clear any pending reconnect timeout since we're connecting now
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }

    // No valid connection: disconnect any stale state then establish new connection.
    // Use a silent disconnect that doesn't set isManualDisconnect
    if (this.pusher) {
      const prevManual = this.isManualDisconnect;
      await this.disconnect();
      this.isManualDisconnect = prevManual; // Restore - we're about to reconnect
    }

    // Always get a fresh token when creating a new Pusher instance
    // This ensures we have the latest token, especially after page refresh or re-login
    const token = await this.getToken();
    if (!token) {
      console.warn('[PusherTransport] No authentication token found in storage');
      this.setConnectionState('failed');
      this.emit('error', { code: 'NO_TOKEN', message: 'No authentication token' });
      this.emit('fallback', { reason: 'No token - user may need to re-login' });
      return;
    }

    if (!this.config.key) {
      console.warn('[PusherTransport] PUSHER_KEY not set; using polling fallback');
      this.setConnectionState('fallback');
      this.emit('fallback', { reason: 'Pusher not configured' });
      return;
    }

    // Validate sessionId before connecting
    if (!sessionId || typeof sessionId !== 'string' || sessionId.length === 0) {
      console.warn('[PusherTransport] Invalid sessionId provided:', sessionId);
      this.setConnectionState('failed');
      this.emit('fallback', { reason: 'Invalid session ID' });
      return;
    }

    console.log('[PusherTransport] Connecting to session:', sessionId, 'token length:', token.length);
    
    this.currentSessionId = sessionId;
    this.setConnectionState('connecting');
    this.connectAttemptId += 1;
    const attemptId = this.connectAttemptId;

    try {
      const pusher = new Pusher(this.config.key, {
        cluster: this.config.cluster,
        wsHost: this.config.wsHost,
        wsPort: this.config.wsPort,
        forceTLS: false,
        // Explicitly allow both ws/wss for self-hosted Sockudo setups.
        // Some environments will prefer wss even when forceTLS is false.
        enabledTransports: ['ws', 'wss'],
        disableStats: true,
        channelAuthorization: {
          endpoint: this.config.authEndpoint,
          transport: 'ajax',
          headers: { Authorization: `Bearer ${token}` },
        },
      });

      // If the socket can't reach Sockudo (e.g. server not running / port blocked),
      // pusher-js can stay in "connecting/unavailable" indefinitely without surfacing a fatal error.
      // Per REALTIME_MESSAGE_SYNC_ROADMAP.md, treat this as a connection failure and fall back to polling.
      if (this.connectTimeout) {
        clearTimeout(this.connectTimeout);
        this.connectTimeout = null;
      }
      this.connectTimeout = setTimeout(() => {
        if (attemptId !== this.connectAttemptId) return; // stale attempt
        const current = this.pusher?.connection?.state ?? '';
        if (current !== 'connected') {
          console.warn('[PusherTransport] Connect timeout; switching to polling fallback. state=', current);
          this.setConnectionState('failed');
          this.emit('fallback', { reason: 'Pusher connection timeout' });
          // Stop reconnection churn; polling will keep UI updated.
          void this.disconnect();
        }
      }, 8000);

      pusher.connection.bind('state_change', (states: { previous: string; current: string }) => {
        const pusherState = states.current;
        if (pusherState === 'connected') {
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
          }
          // Reset reconnect state on successful connection
          this.reconnectAttempts = 0;
          this.reconnectDelay = 2000;
          this.isManualDisconnect = false;
          this.setConnectionState('connected');
          this.subscribeToSessionChannel(this.currentSessionId!);
          this.emit('connected', { sessionId: this.currentSessionId });
        } else if (pusherState === 'connecting' || pusherState === 'unavailable') {
          this.setConnectionState(pusherState === 'connecting' ? 'connecting' : 'reconnecting');
        } else if (pusherState === 'failed' || pusherState === 'disconnected') {
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
          }
          this.setConnectionState(pusherState === 'failed' ? 'failed' : 'disconnected');
          
          // Try auto-reconnect for unexpected disconnects (not manual disconnect)
          // Only attempt if we have a session and haven't exceeded max attempts
          if (!this.isManualDisconnect && this.currentSessionId && this.reconnectAttempts < this.maxReconnectAttempts) {
            this.scheduleReconnect();
          } else if (pusherState === 'failed' || this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.emit('fallback', { reason: pusherState === 'failed' ? 'Pusher connection failed' : 'Max reconnect attempts exceeded' });
          }
          this.emit('disconnected');
        }
      });

      pusher.connection.bind('error', (err: { data?: { code?: number } }) => {
        const code = err?.data?.code;
        if (code === 4004 || code === 401 || code === 403) {
          if (this.connectTimeout) {
            clearTimeout(this.connectTimeout);
            this.connectTimeout = null;
          }
          this.setConnectionState('failed');
          this.emit('fallback', { reason: 'Pusher auth failed' });
        }
      });

      this.pusher = pusher;
      // Channel subscription happens in state_change 'connected' via subscribeToSessionChannel
    } catch (error: unknown) {
      console.error('[PusherTransport] Connect error:', error);
      this.setConnectionState('failed');
      this.emit('fallback', { reason: 'Pusher connect error' });
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff.
   * Called automatically when connection drops unexpectedly.
   * 
   * NOTE: Does NOT schedule reconnect after auth failures (403/401) - those require
   * user action (re-login, session fix) and won't succeed on automatic retry.
   */
  private scheduleReconnect(): void {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    const sessionId = this.currentSessionId;
    if (!sessionId) return;
    
    this.reconnectAttempts += 1;
    const delay = Math.min(this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1), 30000); // Max 30 seconds
    
    console.log(`[PusherTransport] Scheduling reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimeout = setTimeout(async () => {
      if (this.isManualDisconnect || !sessionId) return;
      
      // Re-check token before reconnecting - it might have been refreshed
      const token = await this.getToken();
      if (!token) {
        console.warn('[PusherTransport] No token available for reconnect, switching to fallback');
        this.setConnectionState('failed');
        this.emit('fallback', { reason: 'No token for reconnect' });
        return;
      }
      
      try {
        // Clean up existing connection state
        this.pusher = null;
        this.channel = null;
        
        // Attempt reconnection with fresh state
        await this.connect(sessionId);
      } catch (error: unknown) {
        console.warn('[PusherTransport] Reconnect attempt failed:', error);
      }
    }, delay);
  }

  async disconnect(): Promise<void> {
    // Mark as manual disconnect to prevent auto-reconnect
    this.isManualDisconnect = true;
    
    if (this.connectTimeout) {
      clearTimeout(this.connectTimeout);
      this.connectTimeout = null;
    }
    
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    
    if (!this.pusher) {
      this.currentSessionId = null;
      this.setConnectionState('disconnected');
      return;
    }

    const connState = this.pusher.connection?.state ?? '';
    const canSend = connState === 'connected';

    // Only unsubscribe if we can send (socket open). Otherwise pusher-js throws "WebSocket is already in CLOSING or CLOSED state".
    if (canSend && this.currentSessionId) {
      try {
        this.pusher.unsubscribe(`private-session-${this.currentSessionId}`);
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('CLOSING') && !msg.includes('CLOSED')) {
          console.warn('[PusherTransport] Unsubscribe error:', error);
        }
      }
    }

    // Only call disconnect() when connection is not already disconnected/failed; otherwise close() can throw.
    if (connState !== 'disconnected' && connState !== 'failed' && connState !== 'unavailable') {
      try {
        this.pusher.disconnect();
      } catch (error: unknown) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('CLOSING') && !msg.includes('CLOSED')) {
          console.warn('[PusherTransport] Disconnect error:', error);
        }
      }
    }

    this.pusher = null;
    this.channel = null;
    this.currentSessionId = null;
    this.reconnectAttempts = 0;
    this.setConnectionState('disconnected');
    this.emit('disconnected');
  }

  private setConnectionState(state: ConnectionState): void {
    const previous = this.connectionState;
    this.connectionState = state;
    if (previous !== state) {
      this.emit('stateChange', { previousState: previous, currentState: state });
    }
  }
}

export const pusherTransport = new PusherTransport();
