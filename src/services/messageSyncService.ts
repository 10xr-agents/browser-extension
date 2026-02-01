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
  
  // === SYNC DEDUPLICATION ===
  // Prevents multiple parallel sync starts and duplicate polling instances
  private currentSyncSessionId: string | null = null;
  private syncInProgress: Promise<void> | null = null;
  private lastSyncStartTime = 0;
  private readonly MIN_SYNC_INTERVAL = 2000; // 2 seconds minimum between sync starts

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
    // === DEDUPLICATION: Check if already syncing for this session ===
    if (this.currentSyncSessionId === sessionId) {
      // If sync is in progress, wait for it
      if (this.syncInProgress) {
        console.debug('[MessageSyncManager] Sync already in progress for session:', sessionId);
        return this.syncInProgress;
      }

      // Check if we recently started sync (prevent rapid restarts)
      const timeSinceLastSync = Date.now() - this.lastSyncStartTime;
      if (timeSinceLastSync < this.MIN_SYNC_INTERVAL) {
        console.debug(`[MessageSyncManager] Skipping sync - started ${timeSinceLastSync}ms ago`);
        return;
      }
    }

    // Stop polling first (will be restarted if Pusher fails)
    pollingFallbackService.stopPolling();

    // Track this sync
    this.currentSyncSessionId = sessionId;
    this.lastSyncStartTime = Date.now();

    const syncPromise = (async () => {
      try {
        // === CRITICAL: Ensure session exists on backend BEFORE Pusher subscribe ===
        // This prevents 403 errors from /api/pusher/auth
        // Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md (Session Init Contract)
        const { ensureSessionInitialized } = await import('./sessionService');

        // Get session metadata from store if available
        const state = this.getState?.();
        const session = state?.sessions.sessions.find((s) => s.sessionId === sessionId);

        const initialized = await ensureSessionInitialized(sessionId, {
          url: session?.url,
          domain: session?.domain,
        });

        if (!initialized) {
          // Backend init failed - session might not exist on server
          // Fall back to polling (doesn't require Pusher auth)
          console.warn('[MessageSyncManager] Session init failed, falling back to polling');
          pollingFallbackService.startPolling(sessionId);
          return;
        }

        // Session confirmed to exist on backend, safe to connect Pusher
        await pusherTransport.connect(sessionId);
      } catch (error: unknown) {
        console.warn('[MessageSyncManager] Pusher connect failed, using fallback:', error);
        pollingFallbackService.startPolling(sessionId);
      } finally {
        this.syncInProgress = null;
      }
    })();

    this.syncInProgress = syncPromise;
    return syncPromise;
  }

  async stopSync(): Promise<void> {
    // Clear sync tracking
    this.currentSyncSessionId = null;
    this.syncInProgress = null;
    
    pollingFallbackService.stopPolling();
    await pusherTransport.disconnect();
  }

  // Track last interact_response to prevent duplicate refreshes
  private lastInteractResponseTime = 0;
  private readonly INTERACT_RESPONSE_DEBOUNCE = 1000; // 1 second debounce
  
  /** On interact_response from server: refresh messages from REST (chosen behavior per roadmap). */
  private handleInteractResponse(): void {
    const now = Date.now();
    
    // Debounce rapid interact_response events
    if (now - this.lastInteractResponseTime < this.INTERACT_RESPONSE_DEBOUNCE) {
      console.debug('[MessageSyncManager] Debouncing interact_response');
      return;
    }
    this.lastInteractResponseTime = now;
    
    const state = this.getState?.();
    if (state?.currentTask.sessionId) {
      // Use void to explicitly ignore the promise (fire and forget)
      void state.currentTask.actions.loadMessages(state.currentTask.sessionId);
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
        // CRITICAL FIX: Create new array with message added, then sort
        // Avoids push() mutation on potentially frozen arrays
        const newMessages = [...messages, message];
        const sortedMessages = newMessages.sort((a: ChatMessage, b: ChatMessage) => {
          if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
            return a.sequenceNumber - b.sequenceNumber;
          }
          const timeA =
            a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp as unknown as string).getTime();
          const timeB =
            b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp as unknown as string).getTime();
          return timeA - timeB;
        });
        d.currentTask.messages = sortedMessages;
        console.log('[MessageSyncManager] Added new message:', message.id);
      } else {
        // CRITICAL FIX: Use map() instead of direct index assignment to avoid "read only property" errors
        d.currentTask.messages = messages.map((m, i) =>
          i === existingIndex ? { ...m, ...message } : m
        );
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
    const sessionId = state?.currentTask.sessionId;
    
    // Only start polling if we have a session and aren't already polling
    if (sessionId && !pollingFallbackService.isPolling()) {
      pollingFallbackService.startPolling(sessionId);
    } else if (sessionId) {
      console.debug('[MessageSyncManager] Polling already active, skipping duplicate start');
    }
  }
}

export const messageSyncManager = new MessageSyncManager();
