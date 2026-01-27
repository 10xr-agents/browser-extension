/**
 * Debug Session Export Helper
 * 
 * Exports complete debug session data as JSON file.
 * Masks sensitive information (API keys, tokens).
 * 
 * Reference: THIN_CLIENT_ROADMAP.md Part 2 §3.5 (Task 3: Session Export)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §4.5 (Session Export)
 */

import { StoreType } from '../state/store';

export interface DebugSessionExport {
  timestamp: string;
  url: string | null;
  settings: {
    user: StoreType['settings']['user'];
    tenantId: StoreType['settings']['tenantId'];
    tenantName: StoreType['settings']['tenantName'];
    theme: StoreType['settings']['theme'];
    developerMode: StoreType['settings']['developerMode'];
    // API keys are not stored in settings (removed in Thin Client)
  };
  currentTask: {
    taskId: StoreType['currentTask']['taskId'];
    status: StoreType['currentTask']['status'];
    actionStatus: StoreType['currentTask']['actionStatus'];
    displayHistory: StoreType['currentTask']['displayHistory'];
    hasOrgKnowledge: StoreType['currentTask']['hasOrgKnowledge'];
    // Large data structures excluded or truncated
    accessibilityTree: StoreType['currentTask']['accessibilityTree'] | null;
    coverageMetrics: StoreType['currentTask']['coverageMetrics'] | null;
    hybridElements: StoreType['currentTask']['hybridElements'] | null;
  };
  networkLogs: StoreType['debug']['networkLogs'];
  ragContext: StoreType['debug']['ragContext'];
  stateSnapshot: {
    currentTask: Partial<StoreType['currentTask']>;
    settings: Partial<StoreType['settings']>;
    ui: StoreType['ui'];
    debug: Partial<StoreType['debug']>;
  };
}

export function exportDebugSession(state: StoreType, currentUrl: string | null): void {
  // Mask sensitive data in network logs
  const maskedNetworkLogs = state.debug.networkLogs.map((log) => ({
    ...log,
    request: {
      ...log.request,
      headers: log.request.headers
        ? Object.fromEntries(
            Object.entries(log.request.headers).map(([key, value]) => [
              key,
              key.toLowerCase() === 'authorization' ? 'Bearer ***' : value,
            ])
          )
        : undefined,
    },
  }));

  const exportData: DebugSessionExport = {
    timestamp: new Date().toISOString(),
    url: currentUrl,
    settings: {
      user: state.settings.user,
      tenantId: state.settings.tenantId,
      tenantName: state.settings.tenantName,
      theme: state.settings.theme,
      developerMode: state.settings.developerMode,
    },
    currentTask: {
      taskId: state.currentTask.taskId,
      status: state.currentTask.status,
      actionStatus: state.currentTask.actionStatus,
      displayHistory: state.currentTask.displayHistory,
      hasOrgKnowledge: state.currentTask.hasOrgKnowledge,
      accessibilityTree: state.currentTask.accessibilityTree,
      coverageMetrics: state.currentTask.coverageMetrics,
      hybridElements: state.currentTask.hybridElements,
    },
    networkLogs: maskedNetworkLogs,
    ragContext: state.debug.ragContext,
    stateSnapshot: {
      currentTask: {
        taskId: state.currentTask.taskId,
        status: state.currentTask.status,
        actionStatus: state.currentTask.actionStatus,
        // Exclude large data structures from snapshot
      },
      settings: {
        user: state.settings.user,
        tenantId: state.settings.tenantId,
        tenantName: state.settings.tenantName,
        theme: state.settings.theme,
        developerMode: state.settings.developerMode,
      },
      ui: state.ui,
      debug: {
        ragContext: state.debug.ragContext,
        // Exclude networkLogs from snapshot (already included separately)
      },
    },
  };

  // Generate JSON
  const json = JSON.stringify(exportData, null, 2);

  // Create blob and trigger download
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `debug-session-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
