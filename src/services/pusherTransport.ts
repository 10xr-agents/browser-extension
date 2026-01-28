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

  constructor() {
    super();
    this.setMaxListeners(20);
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

    channel.bind('new_message', (payload: { type?: string; sessionId?: string; message?: Record<string, unknown> }) => {
      const message = mapMessagePayload(payload);
      if (message) this.emit('newMessage', message);
    });

    channel.bind('interact_response', () => {
      this.emit('interact_response');
    });

    this.channel = channel;
    console.log('[PusherTransport] Subscribed to session channel:', sessionId);
  }

  async connect(sessionId: string): Promise<void> {
    if (this.connectionState === 'connected' && this.currentSessionId === sessionId) {
      return;
    }

    // Session switch: reuse existing connection, only change channel (no disconnect/reconnect).
    if (this.pusher && (this.connectionState === 'connected' || this.connectionState === 'connecting')) {
      if (this.currentSessionId !== sessionId) {
        this.subscribeToSessionChannel(sessionId);
      }
      return;
    }

    // No valid connection: disconnect any stale state then establish new connection.
    if (this.pusher) {
      await this.disconnect();
    }

    const token = await this.getToken();
    if (!token) {
      this.setConnectionState('failed');
      this.emit('error', { code: 'NO_TOKEN', message: 'No authentication token' });
      this.emit('fallback', { reason: 'No token' });
      return;
    }

    if (!this.config.key) {
      console.warn('[PusherTransport] PUSHER_KEY not set; using polling fallback');
      this.setConnectionState('fallback');
      this.emit('fallback', { reason: 'Pusher not configured' });
      return;
    }

    this.currentSessionId = sessionId;
    this.setConnectionState('connecting');

    try {
      const pusher = new Pusher(this.config.key, {
        cluster: this.config.cluster,
        wsHost: this.config.wsHost,
        wsPort: this.config.wsPort,
        forceTLS: false,
        disableStats: true,
        channelAuthorization: {
          endpoint: this.config.authEndpoint,
          transport: 'ajax',
          headers: { Authorization: `Bearer ${token}` },
        },
      });

      pusher.connection.bind('state_change', (states: { previous: string; current: string }) => {
        const pusherState = states.current;
        if (pusherState === 'connected') {
          this.setConnectionState('connected');
          this.subscribeToSessionChannel(this.currentSessionId!);
          this.emit('connected', { sessionId: this.currentSessionId });
        } else if (pusherState === 'connecting' || pusherState === 'unavailable') {
          this.setConnectionState(pusherState === 'connecting' ? 'connecting' : 'reconnecting');
        } else if (pusherState === 'failed' || pusherState === 'disconnected') {
          this.setConnectionState(pusherState === 'failed' ? 'failed' : 'disconnected');
          if (pusherState === 'failed') {
            this.emit('fallback', { reason: 'Pusher connection failed' });
          }
          this.emit('disconnected');
        }
      });

      pusher.connection.bind('error', (err: { data?: { code?: number } }) => {
        const code = err?.data?.code;
        if (code === 4004 || code === 401 || code === 403) {
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

  async disconnect(): Promise<void> {
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
