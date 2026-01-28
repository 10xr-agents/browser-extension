/**
 * Polling Fallback Service
 *
 * Provides message sync via polling when WebSocket is unavailable.
 * Uses adaptive polling intervals based on activity.
 *
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §8 (Task 5)
 */

import { apiClient } from '../api/client';
import type { ChatMessage } from '../types/chatMessage';

export class PollingFallbackService {
  private pollingInterval: ReturnType<typeof setInterval> | null = null;
  private currentSessionId: string | null = null;
  private isActive = false;
  private lastMessageTimestamp: Date | null = null;

  private readonly ACTIVE_INTERVAL = 3000;
  private readonly IDLE_INTERVAL = 30000;
  private readonly IDLE_THRESHOLD = 60000;

  private getState: (() => { currentTask: { messages: ChatMessage[]; sessionId: string | null } }) | null = null;
  private setState: ((fn: (state: unknown) => void) => void) | null = null;

  initialize(
    getState: () => { currentTask: { messages: ChatMessage[]; sessionId: string | null } },
    setState: (fn: (state: unknown) => void) => void
  ): void {
    this.getState = getState;
    this.setState = setState;
  }

  startPolling(sessionId: string): void {
    if (this.pollingInterval) {
      this.stopPolling();
    }

    this.currentSessionId = sessionId;
    this.isActive = true;
    this.lastMessageTimestamp = new Date();

    console.log('[PollingFallback] Starting polling for session:', sessionId);

    this.poll();
    this.pollingInterval = setInterval(() => {
      this.poll();
    }, this.getCurrentInterval());
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.currentSessionId = null;
    this.isActive = false;
    console.log('[PollingFallback] Stopped polling');
  }

  isPolling(): boolean {
    return this.isActive && this.pollingInterval !== null;
  }

  private getCurrentInterval(): number {
    if (!this.lastMessageTimestamp) {
      return this.ACTIVE_INTERVAL;
    }
    const timeSinceLastMessage = Date.now() - this.lastMessageTimestamp.getTime();
    return timeSinceLastMessage > this.IDLE_THRESHOLD ? this.IDLE_INTERVAL : this.ACTIVE_INTERVAL;
  }

  private async poll(): Promise<void> {
    if (!this.currentSessionId || !this.getState || !this.setState) {
      return;
    }

    try {
      const { messages } = await apiClient.getSessionMessages(
        this.currentSessionId,
        50,
        this.lastMessageTimestamp || undefined
      );

      if (messages && messages.length > 0) {
        this.lastMessageTimestamp = new Date();

        this.setState((state: unknown) => {
          const draft = state as { currentTask: { messages: ChatMessage[] } };
          if (!draft?.currentTask) return;
          const existingIds = new Set(draft.currentTask.messages.map((m: ChatMessage) => m.id));

          for (const msg of messages) {
            const messageId = typeof msg.messageId === 'string' ? msg.messageId : String(msg.messageId ?? '');
            if (!existingIds.has(messageId)) {
              const chatMessage: ChatMessage = {
                id: messageId,
                role: (typeof msg.role === 'string' ? msg.role : 'assistant') as ChatMessage['role'],
                content: typeof msg.content === 'string' ? msg.content : String(msg.content ?? ''),
                status: ((msg.status as ChatMessage['status']) || 'sent') as ChatMessage['status'],
                timestamp: msg.timestamp ? new Date(msg.timestamp) : new Date(),
                sequenceNumber: typeof msg.sequenceNumber === 'number' ? msg.sequenceNumber : undefined,
                actionPayload: msg.actionPayload as ChatMessage['actionPayload'],
                error: msg.error as ChatMessage['error'],
              };
              draft.currentTask.messages.push(chatMessage);
            }
          }

          draft.currentTask.messages.sort((a: ChatMessage, b: ChatMessage) => {
            if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
              return a.sequenceNumber - b.sequenceNumber;
            }
            const timeA =
              a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp as unknown as string).getTime();
            const timeB =
              b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp as unknown as string).getTime();
            return timeA - timeB;
          });
        });

        if (this.pollingInterval) {
          clearInterval(this.pollingInterval);
          this.pollingInterval = setInterval(() => {
            this.poll();
          }, this.getCurrentInterval());
        }
      }
    } catch (error: unknown) {
      console.warn('[PollingFallback] Poll failed:', error);
    }
  }
}

export const pollingFallbackService = new PollingFallbackService();
