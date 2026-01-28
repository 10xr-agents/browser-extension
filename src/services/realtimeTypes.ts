/**
 * Realtime transport types (Pusher/Soketi)
 *
 * Shared payload types for message sync. Used by pusherTransport and messageSyncService.
 *
 * Reference: REALTIME_MESSAGE_SYNC_ROADMAP.md §11.11 (Protocol mapping)
 */

import type { ChatMessage } from '../types/chatMessage';

/** Payload for MESSAGE_UPDATE / message status change */
export interface MessageUpdatePayload {
  messageId: string;
  status: ChatMessage['status'];
  error?: { message: string; code: string };
  updatedAt: string;
}
