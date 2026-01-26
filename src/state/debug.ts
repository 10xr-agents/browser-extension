/**
 * Debug Slice for Thin Client Architecture
 * 
 * Stores debug-specific state: network logs, RAG context, etc.
 * Not persisted (debug data is ephemeral).
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §3.1 (Task 3: Network/API Trace Inspector)
 */

import { MyStateCreator } from './store';

export type NetworkLogEntry = {
  id: string;
  timestamp: Date;
  method: string;
  endpoint: string;
  request: {
    body?: unknown;
    headers?: Record<string, string>;
  };
  response: {
    body?: unknown;
    status: number;
    headers?: Record<string, string>;
  };
  duration: number; // milliseconds
  error?: string;
};

export type RAGContext = {
  hasOrgKnowledge: boolean | null;
  activeDomain: string | null;
  domainMatch: boolean | null;
  ragMode: 'org_specific' | 'public_only' | null;
  reason: string | null;
  chunkCount: number | null;
  lastUpdated: Date | null;
};

export type DebugSlice = {
  networkLogs: NetworkLogEntry[];
  ragContext: RAGContext | null;
  actions: {
    addNetworkLog: (log: Omit<NetworkLogEntry, 'id' | 'timestamp'>) => void;
    clearNetworkLogs: () => void;
    updateRAGContext: (context: Partial<RAGContext>) => void;
    clearRAGContext: () => void;
  };
};

export const createDebugSlice: MyStateCreator<DebugSlice> = (set) => ({
  networkLogs: [],
  ragContext: null,
  actions: {
    addNetworkLog: (log) => {
      set((state) => {
        const newLog: NetworkLogEntry = {
          ...log,
          id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          timestamp: new Date(),
        };
        // Limit to last 100 logs to prevent memory issues
        state.debug.networkLogs = [...state.debug.networkLogs, newLog].slice(-100);
      });
    },
    clearNetworkLogs: () => {
      set((state) => {
        state.debug.networkLogs = [];
      });
    },
    updateRAGContext: (context) => {
      set((state) => {
        if (!state.debug.ragContext) {
          state.debug.ragContext = {
            hasOrgKnowledge: null,
            activeDomain: null,
            domainMatch: null,
            ragMode: null,
            reason: null,
            chunkCount: null,
            lastUpdated: null,
          };
        }
        state.debug.ragContext = {
          ...state.debug.ragContext,
          ...context,
          lastUpdated: new Date(),
        };
      });
    },
    clearRAGContext: () => {
      set((state) => {
        state.debug.ragContext = null;
      });
    },
  },
});
