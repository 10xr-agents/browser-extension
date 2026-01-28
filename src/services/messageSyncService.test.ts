/**
 * Unit tests for Message Sync Manager
 *
 * Covers: message deduplication by ID, ordering by sequenceNumber,
 * state updates from newMessage, messageUpdate, typing, stateChange.
 *
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §10 (Task 7)
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { ChatMessage } from '../types/chatMessage';
import { messageSyncManager } from './messageSyncService';
import { pusherTransport } from './pusherTransport';

// Minimal draft shape that handlers mutate
interface TestDraft {
  currentTask: {
    messages: ChatMessage[];
    sessionId: string | null;
    wsConnectionState: string;
    isServerTyping: boolean;
    serverTypingContext: string | null;
  };
  sessions: { actions: { updateSession: ReturnType<typeof jest.fn> } };
}

function makeDraft(): TestDraft {
  return {
    currentTask: {
      messages: [],
      sessionId: 'session-1',
      wsConnectionState: 'disconnected',
      isServerTyping: false,
      serverTypingContext: null,
    },
    sessions: { actions: { updateSession: jest.fn() } },
  };
}

function makeMessage(overrides: Partial<ChatMessage> & { id: string }): ChatMessage {
  return {
    id: overrides.id,
    role: overrides.role ?? 'assistant',
    content: typeof overrides.content === 'string' ? overrides.content : String(overrides.content ?? ''),
    status: overrides.status ?? 'sent',
    timestamp: overrides.timestamp instanceof Date ? overrides.timestamp : new Date(),
    sequenceNumber: overrides.sequenceNumber,
    ...overrides,
  };
}

describe('MessageSyncManager', () => {
  let draft: TestDraft;
  let getState: () => TestDraft;
  let setState: (fn: (draft: unknown) => void) => void;

  beforeAll(async () => {
    await new Promise((r) => setTimeout(r, 0)); // after store's setTimeout(0) init
    draft = makeDraft();
    getState = () => draft;
    setState = jest.fn((fn: (draft: unknown) => void) => {
      fn(draft);
    });
    messageSyncManager.initialize(
      getState as () => import('../state/store').StoreType,
      setState as (fn: (state: unknown) => void) => void,
      { forceReinit: true }
    );
  });

  beforeEach(() => {
    draft.currentTask.messages = [];
    draft.currentTask.sessionId = 'session-1';
    draft.currentTask.wsConnectionState = 'disconnected';
    draft.currentTask.isServerTyping = false;
    draft.currentTask.serverTypingContext = null;
    jest.mocked(setState).mockClear();
  });

  describe('message deduplication and ordering', () => {
    it('should add new message and sort by sequenceNumber', () => {
      const msg1 = makeMessage({ id: 'msg-1', content: 'First', sequenceNumber: 1 });
      const msg2 = makeMessage({ id: 'msg-2', content: 'Second', sequenceNumber: 2 });

      pusherTransport.emit('newMessage', msg1);
      pusherTransport.emit('newMessage', msg2);

      expect(setState).toHaveBeenCalledTimes(2);
      expect(draft.currentTask.messages).toHaveLength(2);
      expect(draft.currentTask.messages[0].id).toBe('msg-1');
      expect(draft.currentTask.messages[1].id).toBe('msg-2');
    });

    it('should deduplicate by id and update existing message', () => {
      const msg = makeMessage({ id: 'msg-1', content: 'Original', sequenceNumber: 1 });
      pusherTransport.emit('newMessage', msg);
      expect(draft.currentTask.messages).toHaveLength(1);
      expect(draft.currentTask.messages[0].content).toBe('Original');

      const updated = makeMessage({ id: 'msg-1', content: 'Updated', sequenceNumber: 1 });
      pusherTransport.emit('newMessage', updated);
      expect(draft.currentTask.messages).toHaveLength(1);
      expect(draft.currentTask.messages[0].content).toBe('Updated');
    });

    it('should order by sequenceNumber when present', () => {
      const msg2 = makeMessage({ id: 'msg-2', content: 'Second', sequenceNumber: 2 });
      const msg1 = makeMessage({ id: 'msg-1', content: 'First', sequenceNumber: 1 });
      pusherTransport.emit('newMessage', msg2);
      pusherTransport.emit('newMessage', msg1);

      expect(draft.currentTask.messages[0].sequenceNumber).toBe(1);
      expect(draft.currentTask.messages[1].sequenceNumber).toBe(2);
    });
  });

  describe('messageUpdate', () => {
    it('should update message status on MESSAGE_UPDATE', () => {
      const msg = makeMessage({ id: 'msg-1', content: 'Hi', status: 'sent' });
      pusherTransport.emit('newMessage', msg);
      expect(draft.currentTask.messages[0].status).toBe('sent');

      pusherTransport.emit('messageUpdate', {
        messageId: 'msg-1',
        status: 'success',
        updatedAt: new Date().toISOString(),
      });
      expect(draft.currentTask.messages[0].status).toBe('success');
    });
  });

  describe('typing and stateChange', () => {
    it('should set isServerTyping and serverTypingContext on typing', () => {
      pusherTransport.emit('typing', { sessionId: 'session-1', isTyping: true, context: 'thinking' });
      expect(draft.currentTask.isServerTyping).toBe(true);
      expect(draft.currentTask.serverTypingContext).toBe('thinking');

      pusherTransport.emit('typing', { sessionId: 'session-1', isTyping: false });
      expect(draft.currentTask.isServerTyping).toBe(false);
    });

    it('should update wsConnectionState on stateChange', () => {
      pusherTransport.emit('stateChange', { previousState: 'disconnected', currentState: 'connected' });
      expect(draft.currentTask.wsConnectionState).toBe('connected');
    });
  });
});
