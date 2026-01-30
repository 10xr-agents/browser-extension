/**
 * App Component for Thin Client Architecture
 * 
 * ARCHITECTURE (Phase 2 - Background-Centric):
 * - TaskProvider wraps authenticated content
 * - Task state flows from background TaskOrchestrator via chrome.storage
 * - UI components are pure renderers that send commands to background
 * 
 * Reference: ARCHITECTURE_REVIEW.md §3.2 (Option B: Background-Centric Architecture)
 * Reference: THIN_CLIENT_ROADMAP.md §2.1 (Task 1: Authentication & API Client)
 */

import { 
  Box, 
  HStack, 
  Text, 
  Spinner,
  Flex,
  useColorModeValue,
} from '@chakra-ui/react';
import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAppState } from '../state/store';
import { TaskProvider } from '../state/TaskProvider';
import Login from './Login';
import TaskUI from './TaskUI';
import SystemView from './SystemView';
import SettingsView from './SettingsView';
import { ThemeProvider } from './ThemeProvider';
import ErrorBoundary from './ErrorBoundary';

type Route = '/' | '/settings';

const App = () => {
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasOrgKnowledge, setHasOrgKnowledge] = useState<boolean | null>(null);
  const [currentRoute, setCurrentRoute] = useState<Route>('/');
  const [isDebugViewOpen, setIsDebugViewOpen] = useState(false);

  // Suppress pusher-js "WebSocket is already in CLOSING or CLOSED state" when thrown asynchronously
  useEffect(() => {
    const handler = (event: ErrorEvent): boolean => {
      const msg =
        event.message ??
        (event.error instanceof Error ? event.error.message : String(event.error ?? ''));
      if (
        typeof msg === 'string' &&
        msg.includes('WebSocket') &&
        (msg.includes('CLOSING') || msg.includes('CLOSED'))
      ) {
        event.preventDefault();
        return true;
      }
      return false;
    };
    window.addEventListener('error', handler);
    return () => window.removeEventListener('error', handler);
  }, []);

  const setUser = useAppState((state) => state.settings.actions.setUser);
  const setTenant = useAppState((state) => state.settings.actions.setTenant);
  const clearAuth = useAppState((state) => state.settings.actions.clearAuth);
  const addNetworkLog = useAppState((state) => state.debug.actions.addNetworkLog);
  const updateRAGContext = useAppState((state) => state.debug.actions.updateRAGContext);
  // Domain-aware session management
  const initializeDomainAwareSessions = useAppState((state) => state.sessions.actions.initializeDomainAwareSessions);
  const switchToUrlSession = useAppState((state) => state.sessions.actions.switchToUrlSession);
  const currentDomain = useAppState((state) => state.sessions.currentDomain);
  // Use user directly from store - this will trigger re-render when login updates it
  const user = useAppState((state) => state.settings.user);
  // CRITICAL: Get task status to prevent session switching during active task
  const taskStatus = useAppState((state) => state.currentTask.status);
  

  // Check knowledge availability for current page
  useEffect(() => {
    if (!user) {
      setHasOrgKnowledge(null);
      return;
    }

    const checkKnowledge = async () => {
      try {
        const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
        if (tab?.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
          const response = await apiClient.knowledgeResolve(
            tab.url,
            undefined,
            addNetworkLog ? (log) => {
              addNetworkLog({
                method: log.method,
                endpoint: log.endpoint,
                request: log.request,
                response: log.response,
                duration: log.duration,
                error: log.error,
              });
            } : undefined
          );
          setHasOrgKnowledge(response.hasOrgKnowledge);

          // Update RAG context for debug panel
          if (updateRAGContext) {
            try {
              const urlObj = new URL(tab.url);
              const activeDomain = urlObj.hostname;
              updateRAGContext({
                hasOrgKnowledge: response.hasOrgKnowledge,
                activeDomain,
                domainMatch: response.hasOrgKnowledge, // Simplified
                ragMode: response.hasOrgKnowledge ? 'org_specific' : 'public_only',
                reason: response.hasOrgKnowledge
                  ? 'Organization-specific knowledge available for this domain'
                  : 'No organization-specific knowledge for this domain. Using public knowledge only.',
                chunkCount: response.context?.length || null,
              });
            } catch (err) {
              // Ignore URL parsing errors
            }
          }
        }
      } catch (error) {
        // If resolve fails, assume no org knowledge
        setHasOrgKnowledge(false);
      }
    };

    checkKnowledge();

    // Listen for tab changes
    const handleTabUpdate = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (changeInfo.status === 'complete' && tab?.url) {
        if (tab.url.startsWith('http://') || tab.url.startsWith('https://')) {
          checkKnowledge();
        }
      }
    };

    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
    };
  }, [user, addNetworkLog, updateRAGContext]);

  const setTheme = useAppState((state) => state.settings.actions.setTheme);

  useEffect(() => {
    // Check session on startup
    const checkSession = async () => {
      try {
        const session = await apiClient.getSession();
        setUser(session.user);
        setTenant(session.tenantId, session.tenantName);
        
        // Initialize domain-aware sessions
        await initializeDomainAwareSessions();
        
        // Load theme preferences
        try {
          const preferences = await apiClient.getPreferences();
          if (preferences.preferences?.theme) {
            setTheme(preferences.preferences.theme);
          }
        } catch (prefError) {
          // Theme loading is optional, continue if it fails
          console.debug('Could not load theme preferences:', prefError);
        }
        
        // Auto-switch to session for current tab's domain
        try {
          const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
          if (tab?.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
            await switchToUrlSession(tab.url);
          }
        } catch (urlError) {
          console.debug('Could not auto-switch session for current URL:', urlError);
        }
      } catch (error) {
        // 401 or network error - not authenticated
        clearAuth();
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setUser, setTenant, setTheme, clearAuth]); // initializeDomainAwareSessions and switchToUrlSession are stable
  
  // Handle URL changes - switch sessions when domain changes
  // CRITICAL FIX: Do NOT switch sessions when a task is actively running
  // This prevents breaking multi-step tasks that navigate across domains (e.g., "Go to Google and search")
  useEffect(() => {
    if (!user) return;
    
    const handleUrlChange = async (url: string) => {
      if (url.startsWith('http://') || url.startsWith('https://')) {
        // CRITICAL: Check if a task is currently running
        // If so, skip session switching to preserve task context
        const currentStatus = useAppState.getState().currentTask.status;
        if (currentStatus === 'running') {
          console.debug('[App] Skipping session switch - task is running. URL:', url);
          return; // Don't switch sessions during active task
        }
        
        try {
          await switchToUrlSession(url);
        } catch (error) {
          console.debug('Could not switch session for URL change:', error);
        }
      }
    };
    
    // Listen for tab updates (navigation within the same tab)
    const handleTabUpdate = (
      tabId: number,
      changeInfo: chrome.tabs.TabChangeInfo,
      tab: chrome.tabs.Tab
    ) => {
      if (changeInfo.status === 'complete' && tab?.url) {
        handleUrlChange(tab.url);
      }
    };
    
    // Listen for tab activation (switching to a different tab)
    const handleTabActivation = async (activeInfo: chrome.tabs.TabActiveInfo) => {
      try {
        const tab = await chrome.tabs.get(activeInfo.tabId);
        if (tab?.url) {
          handleUrlChange(tab.url);
        }
      } catch (error) {
        console.debug('Could not get tab info on activation:', error);
      }
    };
    
    chrome.tabs.onUpdated.addListener(handleTabUpdate);
    chrome.tabs.onActivated.addListener(handleTabActivation);
    
    return () => {
      chrome.tabs.onUpdated.removeListener(handleTabUpdate);
      chrome.tabs.onActivated.removeListener(handleTabActivation);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]); // switchToUrlSession is stable from Zustand

  // Dark mode color values - defined at component top level
  const bgColor = useColorModeValue('white', 'gray.900');

  if (checkingSession) {
    return (
      <ThemeProvider>
        <Flex
          h="100vh"
          w="100%"
          direction="column"
          overflow="hidden"
          bg={bgColor}
          align="center"
          justify="center"
        >
          <HStack spacing={4}>
            <Spinner size="lg" />
            <Text fontSize="lg" color={useColorModeValue('gray.900', 'gray.100')}>
              Checking session...
            </Text>
          </HStack>
        </Flex>
      </ThemeProvider>
    );
  }

  return (
    <ThemeProvider>
      <ErrorBoundary>
        {/* Bulletproof Root Container */}
        <Flex
          h="100vh"
          w="100%"
          direction="column"
          overflow="hidden"
          bg={bgColor}
        >
          {/* Header removed - functionality moved to DomainStatus bar in TaskUI */}

          {/* Content Area - Let child components handle their own scrolling */}
          <Box
            flex="1"
            overflow="hidden"
            minW="0"
            position="relative"
            bg={bgColor}
          >
            <ErrorBoundary>
              {/* Route-based rendering */}
              {user ? (
                /* TaskProvider wraps all authenticated content
                 * This provides task state from background TaskOrchestrator
                 * Reference: ARCHITECTURE_REVIEW.md §3.2 */
                <TaskProvider>
                  {currentRoute === '/settings' ? (
                    <SettingsView onNavigate={setCurrentRoute} />
                  ) : (
                    // Conditional rendering based on debug toggle
                    isDebugViewOpen ? (
                      <SystemView onBackToChat={() => setIsDebugViewOpen(false)} />
                    ) : (
                      <TaskUI 
                        hasOrgKnowledge={hasOrgKnowledge}
                        isDebugViewOpen={isDebugViewOpen}
                        setIsDebugViewOpen={setIsDebugViewOpen}
                        onNavigate={setCurrentRoute}
                      />
                    )
                  )}
                </TaskProvider>
              ) : (
                <Login />
              )}
            </ErrorBoundary>
          </Box>
        </Flex>
      </ErrorBoundary>
    </ThemeProvider>
  );
};

export default App;
