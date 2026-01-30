/**
 * PusherService - Background-Centric WebSocket Management
 * 
 * Manages Pusher/Soketi WebSocket connection in the background service worker.
 * Benefits:
 * - WebSocket survives side panel close/reopen
 * - Single connection, multiple channels
 * - Background can buffer messages if UI is closed
 * - Service worker keep-alive via WebSocket activity
 * 
 * Reference: ARCHITECTURE_REVIEW.md §5 (WebSocket Architecture Recommendation)
 */

import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';
import type { ChatMessage } from '../../types/chatMessage';

// ============================================================================
// Types
// ============================================================================

export type ConnectionState =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'failed'
  | 'fallback';

export interface PusherState {
  connectionState: ConnectionState;
  currentSessionId: string | null;
  fallbackReason: string | null;
  lastMessageAt: number | null;
}

export type PusherCommand =
  | { type: 'CONNECT'; sessionId: string }
  | { type: 'DISCONNECT' }
  | { type: 'SWITCH_SESSION'; sessionId: string }
  | { type: 'GET_STATE' };

export type PusherCommandResponse =
  | { success: true; state?: PusherState }
  | { success: false; error: string };

// Storage key for Pusher state
export const PUSHER_STATE_KEY = 'background_pusher_state';

// ============================================================================
// Configuration
// ============================================================================

function getPusherConfig(): {
  key: string;
  cluster: string;
  wsHost: string;
  wsPort: number;
  authEndpoint: string;
} {
  // These are replaced at build time by webpack DefinePlugin
  const apiBase = process.env.WEBPACK_API_BASE
    ? String(process.env.WEBPACK_API_BASE).replace(/\/$/, '')
    : 'https://api.example.com';
  const key = process.env.WEBPACK_PUSHER_KEY ? String(process.env.WEBPACK_PUSHER_KEY) : '';
  const wsHost = process.env.WEBPACK_PUSHER_WS_HOST ? String(process.env.WEBPACK_PUSHER_WS_HOST) : 'localhost';
  const wsPort = process.env.WEBPACK_PUSHER_WS_PORT ? Number(process.env.WEBPACK_PUSHER_WS_PORT) : 3005;
  const cluster = 'local';
  
  return {
    key,
    cluster,
    wsHost,
    wsPort,
    authEndpoint: `${apiBase}/api/pusher/auth`,
  };
}

// ============================================================================
// Singleton Service
// ============================================================================

class BackgroundPusherService {
  private pusher: Pusher | null = null;
  private channel: Channel | null = null;
  private state: PusherState = {
    connectionState: 'disconnected',
    currentSessionId: null,
    fallbackReason: null,
    lastMessageAt: null,
  };
  private config = getPusherConfig();

  constructor() {
    console.log('[BackgroundPusherService] Initialized');
  }

  // ============================================================================
  // State Management
  // ============================================================================

  private async getToken(): Promise<string | null> {
    try {
      const result = await chrome.storage.local.get('accessToken');
      return result.accessToken || null;
    } catch (error) {
      console.error('[BackgroundPusherService] Error reading token:', error);
      return null;
    }
  }

  private async updateState(updates: Partial<PusherState>): Promise<void> {
    this.state = { ...this.state, ...updates };
    
    // Persist to storage for UI to read
    try {
      await chrome.storage.local.set({ [PUSHER_STATE_KEY]: this.state });
    } catch (error) {
      console.error('[BackgroundPusherService] Failed to persist state:', error);
    }
  }

  getState(): PusherState {
    return { ...this.state };
  }

  // ============================================================================
  // Connection Management
  // ============================================================================

  async connect(sessionId: string): Promise<void> {
    console.log('[BackgroundPusherService] Connecting to session:', sessionId);

    // Already connected to this session
    if (this.state.connectionState === 'connected' && this.state.currentSessionId === sessionId) {
      console.log('[BackgroundPusherService] Already connected to this session');
      return;
    }

    // Session switch: reuse existing connection
    if (this.pusher && (this.state.connectionState === 'connected' || this.state.connectionState === 'connecting')) {
      if (this.state.currentSessionId !== sessionId) {
        await this.switchChannel(sessionId);
      }
      return;
    }

    // Disconnect stale connection
    if (this.pusher) {
      await this.disconnect();
    }

    // Check token
    const token = await this.getToken();
    if (!token) {
      await this.updateState({
        connectionState: 'failed',
        fallbackReason: 'No authentication token',
      });
      return;
    }

    // Check Pusher key
    if (!this.config.key) {
      console.warn('[BackgroundPusherService] PUSHER_KEY not set; using polling fallback');
      await this.updateState({
        connectionState: 'fallback',
        fallbackReason: 'Pusher not configured',
      });
      return;
    }

    await this.updateState({
      connectionState: 'connecting',
      currentSessionId: sessionId,
    });

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

      // Connection state handlers
      pusher.connection.bind('state_change', async (states: { previous: string; current: string }) => {
        const pusherState = states.current;
        console.log('[BackgroundPusherService] Connection state change:', states);

        if (pusherState === 'connected') {
          await this.updateState({ connectionState: 'connected' });
          await this.subscribeToChannel(sessionId);
        } else if (pusherState === 'connecting' || pusherState === 'unavailable') {
          await this.updateState({
            connectionState: pusherState === 'connecting' ? 'connecting' : 'reconnecting',
          });
        } else if (pusherState === 'failed' || pusherState === 'disconnected') {
          await this.updateState({
            connectionState: pusherState === 'failed' ? 'failed' : 'disconnected',
            fallbackReason: pusherState === 'failed' ? 'Pusher connection failed' : null,
          });
        }
      });

      pusher.connection.bind('error', async (err: { data?: { code?: number } }) => {
        const code = err?.data?.code;
        if (code === 4004 || code === 401 || code === 403) {
          await this.updateState({
            connectionState: 'failed',
            fallbackReason: 'Pusher auth failed',
          });
        }
      });

      this.pusher = pusher;
    } catch (error) {
      console.error('[BackgroundPusherService] Connect error:', error);
      await this.updateState({
        connectionState: 'failed',
        fallbackReason: 'Pusher connect error',
      });
    }
  }

  async disconnect(): Promise<void> {
    console.log('[BackgroundPusherService] Disconnecting');

    if (!this.pusher) {
      await this.updateState({
        connectionState: 'disconnected',
        currentSessionId: null,
      });
      return;
    }

    const connState = this.pusher.connection?.state ?? '';
    const canSend = connState === 'connected';

    // Unsubscribe from channel if connected
    if (canSend && this.state.currentSessionId) {
      try {
        this.pusher.unsubscribe(`private-session-${this.state.currentSessionId}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('CLOSING') && !msg.includes('CLOSED')) {
          console.warn('[BackgroundPusherService] Unsubscribe error:', error);
        }
      }
    }

    // Disconnect if not already disconnected
    if (connState !== 'disconnected' && connState !== 'failed' && connState !== 'unavailable') {
      try {
        this.pusher.disconnect();
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('CLOSING') && !msg.includes('CLOSED')) {
          console.warn('[BackgroundPusherService] Disconnect error:', error);
        }
      }
    }

    this.pusher = null;
    this.channel = null;
    
    await this.updateState({
      connectionState: 'disconnected',
      currentSessionId: null,
      fallbackReason: null,
    });
  }

  // ============================================================================
  // Channel Management
  // ============================================================================

  private async subscribeToChannel(sessionId: string): Promise<void> {
    if (!this.pusher) return;

    const connState = this.pusher.connection?.state ?? '';
    if (connState !== 'connected') {
      // Will subscribe when connected
      return;
    }

    const channelName = `private-session-${sessionId}`;
    console.log('[BackgroundPusherService] Subscribing to channel:', channelName);

    const channel = this.pusher.subscribe(channelName);

    // Handle new messages
    channel.bind('new_message', async (payload: {
      type?: string;
      sessionId?: string;
      message?: Record<string, unknown>;
    }) => {
      const message = this.mapMessagePayload(payload);
      if (message) {
        await this.handleNewMessage(message);
      }
    });

    // Handle interact_response (task state update)
    channel.bind('interact_response', async () => {
      await this.handleInteractResponse();
    });

    this.channel = channel;
    await this.updateState({ currentSessionId: sessionId });
  }

  private async switchChannel(newSessionId: string): Promise<void> {
    if (!this.pusher) return;

    console.log('[BackgroundPusherService] Switching channel to:', newSessionId);

    // Unsubscribe from current channel
    if (this.state.currentSessionId) {
      try {
        this.pusher.unsubscribe(`private-session-${this.state.currentSessionId}`);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        if (!msg.includes('CLOSING') && !msg.includes('CLOSED')) {
          console.warn('[BackgroundPusherService] Unsubscribe (switch) error:', error);
        }
      }
      this.channel = null;
    }

    // Subscribe to new channel
    await this.subscribeToChannel(newSessionId);
  }

  // ============================================================================
  // Message Handling
  // ============================================================================

  private mapMessagePayload(payload: {
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

  private async handleNewMessage(message: ChatMessage): Promise<void> {
    console.log('[BackgroundPusherService] New message received:', message.id);
    
    await this.updateState({ lastMessageAt: Date.now() });

    // Store message in chrome.storage for UI to pick up
    // The UI listens to storage changes and updates reactively
    try {
      const result = await chrome.storage.local.get('pusher_new_messages');
      const existingMessages = (result.pusher_new_messages || []) as ChatMessage[];
      
      // Add new message if not already present
      if (!existingMessages.some(m => m.id === message.id)) {
        await chrome.storage.local.set({
          pusher_new_messages: [...existingMessages, message],
        });
      }
    } catch (error) {
      console.error('[BackgroundPusherService] Failed to store message:', error);
    }

    // Also notify via runtime message (for immediate UI update)
    try {
      await chrome.runtime.sendMessage({
        type: 'PUSHER_NEW_MESSAGE',
        message,
      });
    } catch (error) {
      // No listeners - UI may be closed
    }
  }

  private async handleInteractResponse(): Promise<void> {
    console.log('[BackgroundPusherService] Interact response received');
    
    // Notify UI to refresh messages
    try {
      await chrome.runtime.sendMessage({
        type: 'PUSHER_INTERACT_RESPONSE',
      });
    } catch (error) {
      // No listeners - UI may be closed
    }
  }

  // ============================================================================
  // Command Handler
  // ============================================================================

  async handleCommand(command: PusherCommand): Promise<PusherCommandResponse> {
    console.log('[BackgroundPusherService] Handling command:', command.type);

    try {
      switch (command.type) {
        case 'CONNECT':
          await this.connect(command.sessionId);
          return { success: true, state: this.getState() };

        case 'DISCONNECT':
          await this.disconnect();
          return { success: true, state: this.getState() };

        case 'SWITCH_SESSION':
          if (this.pusher && this.state.connectionState === 'connected') {
            await this.switchChannel(command.sessionId);
          } else {
            await this.connect(command.sessionId);
          }
          return { success: true, state: this.getState() };

        case 'GET_STATE':
          return { success: true, state: this.getState() };

        default:
          return { success: false, error: `Unknown command: ${(command as PusherCommand).type}` };
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('[BackgroundPusherService] Command failed:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }
}

// Singleton instance
export const backgroundPusherService = new BackgroundPusherService();

// Export for message handler
export async function handlePusherCommand(command: PusherCommand): Promise<PusherCommandResponse> {
  return backgroundPusherService.handleCommand(command);
}
