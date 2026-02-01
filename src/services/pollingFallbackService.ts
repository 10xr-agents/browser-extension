/**
 * Polling Fallback Service
 *
 * Provides message sync via polling when WebSocket is unavailable.
 * Uses adaptive polling intervals based on activity.
 * 
 * OPTIMIZATION: Reduces polling frequency when no task is running.
 * - Active task: 3 seconds
 * - Recently active (< 1 min): 10 seconds  
 * - Idle (> 1 min): 30 seconds
 * - Very idle (> 5 min): 60 seconds
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
  private lastPollTime: number = 0;
  private pollInFlight = false; // Prevent overlapping polls

  // Adaptive intervals based on activity
  private readonly ACTIVE_TASK_INTERVAL = 3000; // 3s when task is running
  private readonly RECENT_ACTIVITY_INTERVAL = 10000; // 10s after recent activity
  private readonly IDLE_INTERVAL = 30000; // 30s when idle
  private readonly VERY_IDLE_INTERVAL = 60000; // 60s when very idle
  
  // Activity thresholds
  private readonly RECENT_THRESHOLD = 60000; // 1 minute
  private readonly IDLE_THRESHOLD = 300000; // 5 minutes

  private getState: (() => { 
    currentTask: { 
      messages: ChatMessage[]; 
      sessionId: string | null;
      status?: string; // 'idle' | 'running' | 'paused' | 'completed' | 'error'
    } 
  }) | null = null;
  private setState: ((fn: (state: unknown) => void) => void) | null = null;

  initialize(
    getState: () => { currentTask: { messages: ChatMessage[]; sessionId: string | null; status?: string } },
    setState: (fn: (state: unknown) => void) => void
  ): void {
    this.getState = getState;
    this.setState = setState;
  }

  startPolling(sessionId: string): void {
    // If already polling for this session, don't restart
    if (this.pollingInterval && this.currentSessionId === sessionId && this.isActive) {
      console.debug('[PollingFallback] Already polling for session:', sessionId);
      return;
    }
    
    // Stop any existing polling
    if (this.pollingInterval) {
      this.stopPolling();
    }

    this.currentSessionId = sessionId;
    this.isActive = true;
    this.lastMessageTimestamp = new Date();
    this.lastPollTime = 0; // Allow immediate first poll

    console.log('[PollingFallback] Starting polling for session:', sessionId);

    // Initial poll
    this.poll();
    
    // Use adaptive interval
    this.scheduleNextPoll();
  }

  stopPolling(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
      this.pollingInterval = null;
    }
    this.currentSessionId = null;
    this.isActive = false;
    this.pollInFlight = false;
    console.log('[PollingFallback] Stopped polling');
  }

  isPolling(): boolean {
    return this.isActive && this.pollingInterval !== null;
  }
  
  private scheduleNextPoll(): void {
    if (this.pollingInterval) {
      clearInterval(this.pollingInterval);
    }
    
    const interval = this.getCurrentInterval();
    this.pollingInterval = setInterval(() => {
      this.poll();
      // Re-schedule with potentially different interval
      this.scheduleNextPoll();
    }, interval);
  }

  private getCurrentInterval(): number {
    // Check if a task is actively running
    const state = this.getState?.();
    const taskStatus = state?.currentTask?.status;
    
    if (taskStatus === 'running') {
      return this.ACTIVE_TASK_INTERVAL;
    }
    
    if (!this.lastMessageTimestamp) {
      return this.RECENT_ACTIVITY_INTERVAL;
    }
    
    const timeSinceLastMessage = Date.now() - this.lastMessageTimestamp.getTime();
    
    if (timeSinceLastMessage < this.RECENT_THRESHOLD) {
      return this.RECENT_ACTIVITY_INTERVAL;
    } else if (timeSinceLastMessage < this.IDLE_THRESHOLD) {
      return this.IDLE_INTERVAL;
    }
    return this.VERY_IDLE_INTERVAL;
  }

  private async poll(): Promise<void> {
    if (!this.currentSessionId || !this.getState || !this.setState) {
      return;
    }
    
    // Prevent overlapping polls
    if (this.pollInFlight) {
      console.debug('[PollingFallback] Skipping poll - previous poll still in flight');
      return;
    }
    
    // Rate limit: minimum 2 seconds between polls
    const now = Date.now();
    const timeSinceLastPoll = now - this.lastPollTime;
    if (timeSinceLastPoll < 2000) {
      console.debug('[PollingFallback] Skipping poll - too soon since last poll');
      return;
    }
    
    this.pollInFlight = true;
    this.lastPollTime = now;

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

          // CRITICAL FIX: Collect new messages first, then create new array
          // Avoids push() mutation on potentially frozen arrays
          const newMessages: ChatMessage[] = [];
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
              newMessages.push(chatMessage);
            }
          }

          // Only update if we have new messages
          if (newMessages.length > 0) {
            // Create a new array with all messages combined and sorted
            const allMessages = [...draft.currentTask.messages, ...newMessages];
            const sortedMessages = allMessages.sort((a: ChatMessage, b: ChatMessage) => {
              if (a.sequenceNumber !== undefined && b.sequenceNumber !== undefined) {
                return a.sequenceNumber - b.sequenceNumber;
              }
              const timeA =
                a.timestamp instanceof Date ? a.timestamp.getTime() : new Date(a.timestamp as unknown as string).getTime();
              const timeB =
                b.timestamp instanceof Date ? b.timestamp.getTime() : new Date(b.timestamp as unknown as string).getTime();
              return timeA - timeB;
            });
            draft.currentTask.messages = sortedMessages;
          }
        });
      }
    } catch (error: unknown) {
      // Don't log rate limit errors as warnings - they're expected sometimes
      const errorMessage = error instanceof Error ? error.message : String(error);
      if (errorMessage.includes('429') || errorMessage.includes('Rate limit')) {
        console.debug('[PollingFallback] Rate limited, will retry later');
      } else {
        console.warn('[PollingFallback] Poll failed:', error);
      }
    } finally {
      this.pollInFlight = false;
    }
  }
}

export const pollingFallbackService = new PollingFallbackService();
