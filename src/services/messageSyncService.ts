/**
 * Message Sync Manager
 *
 * Coordinates between Pusher/Soketi transport and Zustand store.
 * Handles message deduplication, ordering, and state updates.
 * Integrates polling fallback when Pusher is not configured or fails.
 *
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §7 (Task 4), §8 (Task 5), Client TODO List
 */

import { pusherTransport } from './pusherTransport';
import { pollingFallbackService } from './pollingFallbackService';
import type { ChatMessage } from '../types/chatMessage';
import type { MessageUpdatePayload } from './realtimeTypes';
import type { StoreType } from '../state/store';

type GetState = () => StoreType;
/** Accepts Immer draft or store state from Zustand */
type SetState = (fn: (state: unknown) => void) => void;

export interface MessageSyncManagerInitOptions {
  /** When true, overwrite getState/setState even if already initialized (for tests). */
  forceReinit?: boolean;
}

class MessageSyncManager {
  private isInitialized = false;
  private getState: GetState | null = null;
  private setState: SetState | null = null;

  initialize(getState: GetState, setState: SetState, options?: MessageSyncManagerInitOptions): void {
    if (this.isInitialized && !options?.forceReinit) return;

    this.getState = getState;
    this.setState = setState;

    if (!this.isInitialized) {
      pollingFallbackService.initialize(
        () => ({ currentTask: getState().currentTask }),
        setState as (fn: (state: unknown) => void) => void
      );

      pusherTransport.on('newMessage', this.handleNewMessage.bind(this));
      pusherTransport.on('messageUpdate', this.handleMessageUpdate.bind(this));
      pusherTransport.on('sessionUpdate', this.handleSessionUpdate.bind(this));
      pusherTransport.on('typing', this.handleTyping.bind(this));
      pusherTransport.on('stateChange', this.handleConnectionStateChange.bind(this));
      pusherTransport.on('fallback', this.handleFallback.bind(this));
      pusherTransport.on('interact_response', this.handleInteractResponse.bind(this));
    }

    this.isInitialized = true;
    if (!options?.forceReinit) {
      console.log('[MessageSyncManager] Initialized');
    }
  }

  async startSync(sessionId: string): Promise<void> {
    pollingFallbackService.stopPolling();

    try {
      await pusherTransport.connect(sessionId);
    } catch (error: unknown) {
      console.warn('[MessageSyncManager] Pusher connect failed, using fallback:', error);
      pollingFallbackService.startPolling(sessionId);
    }
  }

  async stopSync(): Promise<void> {
    pollingFallbackService.stopPolling();
    await pusherTransport.disconnect();
  }

  /** On interact_response from server: refresh messages from REST (chosen behavior per roadmap). */
  private handleInteractResponse(): void {
    const state = this.getState?.();
    if (state?.currentTask.sessionId) {
      state.currentTask.actions.loadMessages(state.currentTask.sessionId);
    }
  }

  private handleNewMessage(message: ChatMessage): void {
    if (!this.setState || !this.getState) return;

    this.setState((draft: unknown) => {
      const d = draft as { currentTask: { messages: ChatMessage[] } };
      if (!d?.currentTask) return;
      const messages = d.currentTask.messages;
      const existingIndex = messages.findIndex((m: ChatMessage) => m.id === message.id);

      if (existingIndex === -1) {
        messages.push(message);
        messages.sort((a: ChatMessage, b: ChatMessage) => {
          if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
            return a.sequenceNumber - b.sequenceNumber;
          }
          const timeA =
            a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp as unknown as string).getTime();
          const timeB =
            b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp as unknown as string).getTime();
          return timeA - timeB;
        });
        console.log('[MessageSyncManager] Added new message:', message.id);
      } else {
        messages[existingIndex] = { ...messages[existingIndex], ...message };
        console.log('[MessageSyncManager] Updated existing message:', message.id);
      }
    });
  }

  private handleMessageUpdate(payload: MessageUpdatePayload): void {
    if (!this.setState) return;

    this.setState((draft: unknown) => {
      const d = draft as { currentTask: { messages: ChatMessage[] } };
      const message = d?.currentTask?.messages?.find((m: ChatMessage) => m.id === payload.messageId);
      if (message) {
        message.status = payload.status;
        if (payload.error) {
          message.error = payload.error;
        }
      }
    });
  }

  private handleSessionUpdate(payload: { sessionId: string; status: string }): void {
    if (!this.setState || !this.getState) return;

    const state = this.getState();
    if (state.currentTask.sessionId === payload.sessionId) {
      state.sessions.actions.updateSession(payload.sessionId, {
        status: payload.status as 'active' | 'completed' | 'failed' | 'interrupted' | 'archived',
        updatedAt: Date.now(),
      });
    }
  }

  private handleTyping(payload: { isTyping: boolean; context?: string }): void {
    if (!this.setState) return;

    this.setState((draft: unknown) => {
      const d = draft as { currentTask: { isServerTyping: boolean; serverTypingContext: string | null } };
      if (d?.currentTask) {
        d.currentTask.isServerTyping = payload.isTyping;
        d.currentTask.serverTypingContext = payload.context ?? null;
      }
    });
  }

  private handleConnectionStateChange(payload: { currentState: string }): void {
    if (!this.setState) return;

    this.setState((draft: unknown) => {
      const d = draft as { currentTask: { wsConnectionState: string; wsFallbackReason: string | null } };
      if (d?.currentTask) {
        d.currentTask.wsConnectionState = payload.currentState as StoreType['currentTask']['wsConnectionState'];
        if (payload.currentState !== 'fallback') {
          d.currentTask.wsFallbackReason = null;
        }
      }
    });
  }

  private handleFallback(payload?: { reason?: string }): void {
    const reason = typeof payload?.reason === 'string' ? payload.reason : 'Unknown';
    console.log('[MessageSyncManager] Switched to polling fallback:', reason);
    if (!this.setState) return;

    this.setState((draft: unknown) => {
      const d = draft as { currentTask: { wsConnectionState: string; wsFallbackReason: string | null } };
      if (d?.currentTask) {
        d.currentTask.wsConnectionState = 'fallback';
        d.currentTask.wsFallbackReason = reason;
      }
    });

    const state = this.getState?.();
    if (state?.currentTask.sessionId) {
      pollingFallbackService.startPolling(state.currentTask.sessionId);
    }
  }
}

export const messageSyncManager = new MessageSyncManager();
