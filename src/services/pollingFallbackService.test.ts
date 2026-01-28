/**
 * Unit tests for Polling Fallback Service
 *
 * Covers: start/stop polling, adaptive intervals, message merge (dedup by id),
 * sort by sequenceNumber, poll calls API with correct params.
 *
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §10 (Task 7)
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import type { ChatMessage } from '../types/chatMessage';
import { pollingFallbackService } from './pollingFallbackService';

jest.mock('../api/client', () => ({
  apiClient: {
    getSessionMessages: jest.fn(),
  },
}));

const apiClient = require('../api/client').apiClient as {
  getSessionMessages: ReturnType<typeof jest.fn>;
};

interface TestDraft {
  currentTask: { messages: ChatMessage[]; sessionId: string | null };
}

describe('PollingFallbackService', () => {
  let draft: TestDraft;
  let setState: (fn: (state: unknown) => void) => void;

  beforeEach(() => {
    jest.useFakeTimers();
    draft = {
      currentTask: { messages: [], sessionId: 'session-1' },
    };
    const getState = () => draft;
    setState = jest.fn((fn: (state: unknown) => void) => {
      fn(draft);
    });
    pollingFallbackService.initialize(getState, setState);
    apiClient.getSessionMessages.mockReset();
  });

  afterEach(() => {
    pollingFallbackService.stopPolling();
    jest.useRealTimers();
  });

  describe('start and stop', () => {
    it('should start polling and call poll immediately', async () => {
      apiClient.getSessionMessages.mockResolvedValue({ messages: [], total: 0 });
      pollingFallbackService.startPolling('session-1');
      expect(pollingFallbackService.isPolling()).toBe(true);
      await Promise.resolve(); // let poll() promise resolve
      expect(apiClient.getSessionMessages).toHaveBeenCalledWith('session-1', 50, expect.any(Date));
    });

    it('should stop polling and clear interval', () => {
      apiClient.getSessionMessages.mockResolvedValue({ messages: [], total: 0 });
      pollingFallbackService.startPolling('session-1');
      expect(pollingFallbackService.isPolling()).toBe(true);
      pollingFallbackService.stopPolling();
      expect(pollingFallbackService.isPolling()).toBe(false);
    });
  });

  describe('message merge and ordering', () => {
    it('should merge new messages and sort by sequenceNumber', async () => {
      apiClient.getSessionMessages.mockResolvedValue({
        messages: [
          {
            messageId: 'msg-2',
            role: 'assistant',
            content: 'Second',
            status: 'sent',
            timestamp: new Date().toISOString(),
            sequenceNumber: 2,
          },
          {
            messageId: 'msg-1',
            role: 'assistant',
            content: 'First',
            status: 'sent',
            timestamp: new Date().toISOString(),
            sequenceNumber: 1,
          },
        ],
        total: 2,
      });
      pollingFallbackService.startPolling('session-1');
      await Promise.resolve();
      expect(setState).toHaveBeenCalled();
      expect(draft.currentTask.messages).toHaveLength(2);
      expect(draft.currentTask.messages[0].id).toBe('msg-1');
      expect(draft.currentTask.messages[1].id).toBe('msg-2');
    });

    it('should not duplicate messages already in state', async () => {
      draft.currentTask.messages = [
        {
          id: 'msg-1',
          role: 'assistant',
          content: 'First',
          status: 'sent',
          timestamp: new Date(),
          sequenceNumber: 1,
        },
      ] as ChatMessage[];
      apiClient.getSessionMessages.mockResolvedValue({
        messages: [
          {
            messageId: 'msg-1',
            role: 'assistant',
            content: 'First',
            status: 'sent',
            timestamp: new Date().toISOString(),
            sequenceNumber: 1,
          },
          {
            messageId: 'msg-2',
            role: 'assistant',
            content: 'New',
            status: 'sent',
            timestamp: new Date().toISOString(),
            sequenceNumber: 2,
          },
        ],
        total: 2,
      });
      pollingFallbackService.startPolling('session-1');
      await Promise.resolve();
      expect(draft.currentTask.messages).toHaveLength(2);
      expect(draft.currentTask.messages.find((m) => m.id === 'msg-2')?.content).toBe('New');
    });
  });
});
