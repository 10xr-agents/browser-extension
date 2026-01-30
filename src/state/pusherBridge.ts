/**
 * Pusher Bridge - UI Interface to Background Pusher Service
 * 
 * Provides React hooks and commands to interact with the background
 * PusherService. The actual WebSocket connection lives in the background
 * service worker for resilience.
 * 
 * Reference: ARCHITECTURE_REVIEW.md §5 (WebSocket Architecture Recommendation)
 */

import { useEffect, useState, useCallback } from 'react';
import type { ChatMessage } from '../types/chatMessage';

// ============================================================================
// Types (must match PusherService.ts)
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
const PUSHER_STATE_KEY = 'background_pusher_state';

// ============================================================================
// Default State
// ============================================================================

const DEFAULT_PUSHER_STATE: PusherState = {
  connectionState: 'disconnected',
  currentSessionId: null,
  fallbackReason: null,
  lastMessageAt: null,
};

// ============================================================================
// Commands
// ============================================================================

/**
 * Send a command to the background PusherService
 */
async function sendPusherCommand(command: PusherCommand): Promise<PusherCommandResponse> {
  try {
    if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) {
      console.error('[PusherBridge] Chrome runtime not available');
      return { success: false, error: 'Chrome runtime not available' };
    }
    
    const response = await chrome.runtime.sendMessage({
      type: 'PUSHER_COMMAND',
      command,
    });
    
    return response as PusherCommandResponse;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[PusherBridge] Command failed:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * Pusher commands that can be called from UI components
 */
export const pusherCommands = {
  /**
   * Connect to a session's Pusher channel
   */
  connect: async (sessionId: string): Promise<PusherCommandResponse> => {
    console.log('[PusherBridge] Connecting to session:', sessionId);
    return sendPusherCommand({ type: 'CONNECT', sessionId });
  },
  
  /**
   * Disconnect from Pusher
   */
  disconnect: async (): Promise<PusherCommandResponse> => {
    console.log('[PusherBridge] Disconnecting');
    return sendPusherCommand({ type: 'DISCONNECT' });
  },
  
  /**
   * Switch to a different session's channel
   */
  switchSession: async (sessionId: string): Promise<PusherCommandResponse> => {
    console.log('[PusherBridge] Switching to session:', sessionId);
    return sendPusherCommand({ type: 'SWITCH_SESSION', sessionId });
  },
  
  /**
   * Get current Pusher state
   */
  getState: async (): Promise<PusherCommandResponse> => {
    return sendPusherCommand({ type: 'GET_STATE' });
  },
};

// ============================================================================
// React Hooks
// ============================================================================

/**
 * Hook to get Pusher connection state
 * Updates automatically when state changes in background
 */
export function usePusherState(): PusherState {
  const [state, setState] = useState<PusherState>(DEFAULT_PUSHER_STATE);
  
  // Initial load
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }
    
    chrome.storage.local.get(PUSHER_STATE_KEY).then((result) => {
      if (result[PUSHER_STATE_KEY]) {
        setState(result[PUSHER_STATE_KEY] as PusherState);
      }
    });
  }, []);
  
  // Subscribe to storage changes
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.onChanged) {
      return;
    }
    
    const handleStorageChange = (
      changes: { [key: string]: chrome.storage.StorageChange },
      areaName: string
    ) => {
      if (areaName !== 'local') return;
      
      if (changes[PUSHER_STATE_KEY]) {
        const newValue = changes[PUSHER_STATE_KEY].newValue as PusherState | undefined;
        setState(newValue || DEFAULT_PUSHER_STATE);
      }
    };
    
    chrome.storage.onChanged.addListener(handleStorageChange);
    
    return () => {
      chrome.storage.onChanged.removeListener(handleStorageChange);
    };
  }, []);
  
  return state;
}

/**
 * Hook to get just the connection state
 */
export function usePusherConnectionState(): ConnectionState {
  const state = usePusherState();
  return state.connectionState;
}

/**
 * Hook to subscribe to new messages from Pusher
 * Returns new messages and clears them after being read
 */
export function usePusherMessages(onNewMessage?: (message: ChatMessage) => void): {
  messages: ChatMessage[];
  clearMessages: () => void;
} {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  
  // Listen for new messages via runtime message
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
      return;
    }
    
    const handleMessage = (
      message: { type: string; message?: ChatMessage },
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (message.type === 'PUSHER_NEW_MESSAGE' && message.message) {
        setMessages((prev) => {
          // Avoid duplicates
          if (prev.some(m => m.id === message.message!.id)) {
            return prev;
          }
          return [...prev, message.message!];
        });
        
        if (onNewMessage) {
          onNewMessage(message.message);
        }
      }
      return false;
    };
    
    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [onNewMessage]);
  
  // Also check storage for buffered messages (in case UI was closed when message arrived)
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.storage?.local) {
      return;
    }
    
    chrome.storage.local.get('pusher_new_messages').then((result) => {
      const bufferedMessages = result.pusher_new_messages as ChatMessage[] | undefined;
      if (bufferedMessages && bufferedMessages.length > 0) {
        setMessages((prev) => {
          const newMessages = bufferedMessages.filter(
            msg => !prev.some(m => m.id === msg.id)
          );
          return [...prev, ...newMessages];
        });
        
        // Clear buffered messages
        chrome.storage.local.remove('pusher_new_messages');
      }
    });
  }, []);
  
  const clearMessages = useCallback(() => {
    setMessages([]);
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      chrome.storage.local.remove('pusher_new_messages');
    }
  }, []);
  
  return { messages, clearMessages };
}

/**
 * Hook to listen for interact_response events
 * Used to trigger message refresh
 */
export function usePusherInteractResponse(onInteractResponse: () => void): void {
  useEffect(() => {
    if (typeof chrome === 'undefined' || !chrome.runtime?.onMessage) {
      return;
    }
    
    const handleMessage = (
      message: { type: string },
      sender: chrome.runtime.MessageSender,
      sendResponse: (response?: unknown) => void
    ) => {
      if (message.type === 'PUSHER_INTERACT_RESPONSE') {
        onInteractResponse();
      }
      return false;
    };
    
    chrome.runtime.onMessage.addListener(handleMessage);
    
    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage);
    };
  }, [onInteractResponse]);
}

/**
 * Hook that manages Pusher connection for a session
 * Automatically connects when sessionId is provided and disconnects on unmount
 */
export function usePusherSession(sessionId: string | null): {
  connectionState: ConnectionState;
  fallbackReason: string | null;
  connect: () => Promise<void>;
  disconnect: () => Promise<void>;
} {
  const state = usePusherState();
  
  // Auto-connect when sessionId changes
  useEffect(() => {
    if (!sessionId) return;
    
    // Connect or switch session
    if (state.currentSessionId !== sessionId) {
      if (state.connectionState === 'connected') {
        pusherCommands.switchSession(sessionId);
      } else {
        pusherCommands.connect(sessionId);
      }
    }
  }, [sessionId, state.currentSessionId, state.connectionState]);
  
  const connect = useCallback(async () => {
    if (sessionId) {
      await pusherCommands.connect(sessionId);
    }
  }, [sessionId]);
  
  const disconnect = useCallback(async () => {
    await pusherCommands.disconnect();
  }, []);
  
  return {
    connectionState: state.connectionState,
    fallbackReason: state.fallbackReason,
    connect,
    disconnect,
  };
}
