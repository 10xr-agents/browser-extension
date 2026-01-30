/**
 * MultiplexedSocket - Single WebSocket with Tab-Based Routing
 * 
 * Phase 4 Implementation: Multiplexed WebSocket
 * 
 * This module implements a single multiplexed WebSocket connection that:
 * - Maintains ONE socket connection (not N per tab)
 * - Routes messages to correct storage bucket by tabId
 * - ONLY writes to chrome.storage (never sends to UI directly)
 * - Survives tab switches (data lands in correct bucket)
 * 
 * The Envelope Pattern:
 * All backend messages include: { tabId: 123, sessionId: "...", payload: {...} }
 * This router checks tabId and writes to storage[`session_${tabId}`]
 * 
 * Reference: ARCHITECTURE_REVIEW.md §Phase 4 (Multiplexed Socket)
 */

import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';
import {
  routeIncomingMessage,
  routeTaskUpdate,
  setConnectionState,
  getConnectionState,
  getSession,
  setSession,
  type TabSession,
} from './StorageFirstManager';
import type { ChatMessage } from '../types/chatMessage';

// ============================================================================
// Types
// ============================================================================

/**
 * Message envelope from backend
 */
interface MessageEnvelope {
  /** Target tab ID */
  tabId: number;
  /** Session ID */
  sessionId: string;
  /** Event type */
  type: 'message' | 'task_update' | 'interact_response' | 'error';
  /** Payload data */
  payload: unknown;
  /** Timestamp */
  timestamp: number;
}

/**
 * Task update payload
 */
interface TaskUpdatePayload {
  status?: TabSession['status'];
  actionStatus?: string;
  taskId?: string;
  thought?: string;
  action?: string;
  currentStep?: number;
  totalSteps?: number;
}

/**
 * Interact response payload (from /api/agent/interact)
 */
interface InteractResponsePayload {
  thought: string;
  action: string;
  taskId: string;
  sessionId: string;
  status: string;
}

// ============================================================================
// Configuration
// ============================================================================

interface PusherConfig {
  key: string;
  cluster: string;
  wsHost?: string;
  wsPort?: number;
  forceTLS?: boolean;
  authEndpoint: string;
}

function getPusherConfig(): PusherConfig {
  // Check for Soketi (self-hosted) first
  const soketiHost = process.env.SOKETI_HOST || process.env.REACT_APP_SOKETI_HOST;
  const soketiKey = process.env.SOKETI_APP_KEY || process.env.REACT_APP_SOKETI_APP_KEY;
  const apiBaseUrl = process.env.REACT_APP_API_BASE_URL || 'https://api.spadeworks.co';
  
  if (soketiHost && soketiKey) {
    return {
      key: soketiKey,
      cluster: 'mt1',
      wsHost: soketiHost,
      wsPort: parseInt(process.env.SOKETI_PORT || process.env.REACT_APP_SOKETI_PORT || '6001', 10),
      forceTLS: false,
      authEndpoint: `${apiBaseUrl}/api/pusher/auth`,
    };
  }
  
  // Fallback to standard Pusher
  return {
    key: process.env.REACT_APP_PUSHER_KEY || '',
    cluster: process.env.REACT_APP_PUSHER_CLUSTER || 'mt1',
    forceTLS: true,
    authEndpoint: `${apiBaseUrl}/api/pusher/auth`,
  };
}

// ============================================================================
// Multiplexed Socket Service
// ============================================================================

class MultiplexedSocketService {
  private pusher: Pusher | null = null;
  private channels: Map<string, Channel> = new Map();
  private tabToChannel: Map<number, string> = new Map();
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  
  /**
   * Initialize the socket connection
   */
  async connect(authToken: string): Promise<boolean> {
    if (this.pusher) {
      console.log('[MultiplexedSocket] Already connected');
      return true;
    }
    
    const config = getPusherConfig();
    if (!config.key) {
      console.error('[MultiplexedSocket] No Pusher key configured');
      await setConnectionState({ status: 'error', error: 'No Pusher key' });
      return false;
    }
    
    try {
      await setConnectionState({ status: 'connecting' });
      
      this.pusher = new Pusher(config.key, {
        cluster: config.cluster,
        wsHost: config.wsHost,
        wsPort: config.wsPort,
        forceTLS: config.forceTLS ?? true,
        enabledTransports: config.wsHost ? ['ws', 'wss'] : undefined,
        authEndpoint: config.authEndpoint,
        auth: {
          headers: {
            Authorization: `Bearer ${authToken}`,
          },
        },
      });
      
      // Bind connection events
      this.pusher.connection.bind('connected', () => {
        console.log('[MultiplexedSocket] Connected');
        this.reconnectAttempts = 0;
        setConnectionState({
          connected: true,
          status: 'connected',
          lastConnectedAt: Date.now(),
          error: null,
        });
      });
      
      this.pusher.connection.bind('disconnected', () => {
        console.log('[MultiplexedSocket] Disconnected');
        setConnectionState({ connected: false, status: 'disconnected' });
        this.handleReconnect(authToken);
      });
      
      this.pusher.connection.bind('error', (error: unknown) => {
        const errorMsg = error instanceof Error ? error.message : String(error);
        console.error('[MultiplexedSocket] Connection error:', errorMsg);
        setConnectionState({ status: 'error', error: errorMsg });
      });
      
      return true;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error('[MultiplexedSocket] Failed to connect:', errorMsg);
      await setConnectionState({ status: 'error', error: errorMsg });
      return false;
    }
  }
  
  /**
   * Handle reconnection with exponential backoff
   */
  private async handleReconnect(authToken: string): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[MultiplexedSocket] Max reconnect attempts reached');
      await setConnectionState({ status: 'error', error: 'Max reconnect attempts reached' });
      return;
    }
    
    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);
    
    console.log(`[MultiplexedSocket] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);
    await setConnectionState({ status: 'reconnecting' });
    
    setTimeout(() => {
      this.pusher = null;
      this.connect(authToken);
    }, delay);
  }
  
  /**
   * Disconnect the socket
   */
  async disconnect(): Promise<void> {
    if (this.pusher) {
      // Unsubscribe all channels
      for (const [channelName] of this.channels) {
        this.pusher.unsubscribe(channelName);
      }
      this.channels.clear();
      this.tabToChannel.clear();
      
      this.pusher.disconnect();
      this.pusher = null;
    }
    
    await setConnectionState({
      connected: false,
      status: 'disconnected',
      subscriptions: {},
    });
  }
  
  /**
   * Subscribe to a session channel for a specific tab
   * Messages will be routed to storage[`session_${tabId}`]
   */
  async subscribeTab(tabId: number, sessionId: string): Promise<boolean> {
    if (!this.pusher) {
      console.error('[MultiplexedSocket] Not connected');
      return false;
    }
    
    const channelName = `private-session-${sessionId}`;
    
    // Check if already subscribed
    if (this.tabToChannel.get(tabId) === channelName) {
      console.log(`[MultiplexedSocket] Tab ${tabId} already subscribed to ${channelName}`);
      return true;
    }
    
    // Unsubscribe from old channel if switching sessions
    const oldChannel = this.tabToChannel.get(tabId);
    if (oldChannel && oldChannel !== channelName) {
      await this.unsubscribeTab(tabId);
    }
    
    try {
      const channel = this.pusher.subscribe(channelName);
      
      // Bind message events - route to storage by tabId
      channel.bind('new-message', (data: unknown) => {
        this.routeMessage(tabId, sessionId, 'message', data);
      });
      
      channel.bind('task-update', (data: unknown) => {
        this.routeMessage(tabId, sessionId, 'task_update', data);
      });
      
      channel.bind('interact-response', (data: unknown) => {
        this.routeMessage(tabId, sessionId, 'interact_response', data);
      });
      
      channel.bind('error', (data: unknown) => {
        this.routeMessage(tabId, sessionId, 'error', data);
      });
      
      channel.bind('pusher:subscription_succeeded', () => {
        console.log(`[MultiplexedSocket] Tab ${tabId} subscribed to ${channelName}`);
      });
      
      channel.bind('pusher:subscription_error', (error: unknown) => {
        console.error(`[MultiplexedSocket] Subscription error for tab ${tabId}:`, error);
      });
      
      this.channels.set(channelName, channel);
      this.tabToChannel.set(tabId, channelName);
      
      // Update connection state with subscription info
      const connState = await getConnectionState();
      await setConnectionState({
        subscriptions: {
          ...connState.subscriptions,
          [tabId]: channelName,
        },
      });
      
      return true;
    } catch (error) {
      console.error(`[MultiplexedSocket] Failed to subscribe tab ${tabId}:`, error);
      return false;
    }
  }
  
  /**
   * Unsubscribe a tab from its channel
   */
  async unsubscribeTab(tabId: number): Promise<void> {
    const channelName = this.tabToChannel.get(tabId);
    if (!channelName) return;
    
    if (this.pusher) {
      this.pusher.unsubscribe(channelName);
    }
    
    this.channels.delete(channelName);
    this.tabToChannel.delete(tabId);
    
    // Update connection state
    const connState = await getConnectionState();
    const { [tabId]: removed, ...remaining } = connState.subscriptions;
    await setConnectionState({ subscriptions: remaining });
    
    console.log(`[MultiplexedSocket] Tab ${tabId} unsubscribed from ${channelName}`);
  }
  
  /**
   * Route incoming message to correct storage bucket
   * This is the core of the multiplexing - messages go to storage, not UI
   */
  private async routeMessage(
    tabId: number,
    sessionId: string,
    type: string,
    payload: unknown
  ): Promise<void> {
    console.log(`[MultiplexedSocket] Routing ${type} to tab ${tabId}`);
    
    try {
      switch (type) {
        case 'message':
          await this.handleIncomingMessage(tabId, payload);
          break;
        
        case 'task_update':
          await this.handleTaskUpdate(tabId, payload as TaskUpdatePayload);
          break;
        
        case 'interact_response':
          await this.handleInteractResponse(tabId, payload as InteractResponsePayload);
          break;
        
        case 'error':
          await this.handleError(tabId, payload);
          break;
        
        default:
          console.warn(`[MultiplexedSocket] Unknown message type: ${type}`);
      }
    } catch (error) {
      console.error(`[MultiplexedSocket] Failed to route message:`, error);
    }
  }
  
  /**
   * Handle incoming chat message
   */
  private async handleIncomingMessage(tabId: number, payload: unknown): Promise<void> {
    const data = payload as {
      id?: string;
      role?: string;
      content?: string;
      type?: string;
      timestamp?: string;
    };
    
    const message: ChatMessage = {
      id: data.id || `msg_${Date.now()}`,
      role: (data.role as 'user' | 'assistant' | 'system') || 'assistant',
      content: typeof data.content === 'string' ? data.content : String(data.content || ''),
      type: data.type || 'text',
      timestamp: data.timestamp ? new Date(data.timestamp) : new Date(),
    };
    
    await routeIncomingMessage(tabId, message);
  }
  
  /**
   * Handle task update
   */
  private async handleTaskUpdate(tabId: number, payload: TaskUpdatePayload): Promise<void> {
    await routeTaskUpdate(tabId, payload);
  }
  
  /**
   * Handle interact response (from /api/agent/interact)
   */
  private async handleInteractResponse(
    tabId: number,
    payload: InteractResponsePayload
  ): Promise<void> {
    // Update task state
    await routeTaskUpdate(tabId, {
      thought: payload.thought,
      action: payload.action,
      taskId: payload.taskId,
      status: payload.status === 'completed' ? 'success' : 
              payload.status === 'failed' ? 'error' : 'running',
    });
    
    // Also add as message for display
    if (payload.thought) {
      const message: ChatMessage = {
        id: `interact_${Date.now()}`,
        role: 'assistant',
        content: payload.thought,
        type: 'thought',
        timestamp: new Date(),
      };
      await routeIncomingMessage(tabId, message);
    }
  }
  
  /**
   * Handle error from backend
   */
  private async handleError(tabId: number, payload: unknown): Promise<void> {
    const error = payload as { message?: string; code?: string };
    const message: ChatMessage = {
      id: `error_${Date.now()}`,
      role: 'system',
      content: `Error: ${error.message || 'Unknown error'}`,
      type: 'error',
      timestamp: new Date(),
    };
    
    await routeIncomingMessage(tabId, message);
    await routeTaskUpdate(tabId, { status: 'error' });
  }
  
  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.pusher?.connection?.state === 'connected';
  }
  
  /**
   * Get subscribed tabs
   */
  getSubscribedTabs(): number[] {
    return Array.from(this.tabToChannel.keys());
  }
}

// ============================================================================
// Singleton Instance
// ============================================================================

export const multiplexedSocket = new MultiplexedSocketService();

// ============================================================================
// Commands for Background/UI
// ============================================================================

export const socketCommands = {
  connect: (authToken: string) => multiplexedSocket.connect(authToken),
  disconnect: () => multiplexedSocket.disconnect(),
  subscribeTab: (tabId: number, sessionId: string) => 
    multiplexedSocket.subscribeTab(tabId, sessionId),
  unsubscribeTab: (tabId: number) => multiplexedSocket.unsubscribeTab(tabId),
  isConnected: () => multiplexedSocket.isConnected(),
  getSubscribedTabs: () => multiplexedSocket.getSubscribedTabs(),
};
