/**
 * App Component for Thin Client Architecture
 * 
 * Handles session check on startup and conditional rendering:
 * - Shows Login when unauthenticated
 * - Shows TaskUI when authenticated
 * - Blocks task execution until authenticated
 * 
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
  
  const setUser = useAppState((state) => state.settings.actions.setUser);
  const setTenant = useAppState((state) => state.settings.actions.setTenant);
  const clearAuth = useAppState((state) => state.settings.actions.clearAuth);
  const addNetworkLog = useAppState((state) => state.debug.actions.addNetworkLog);
  const updateRAGContext = useAppState((state) => state.debug.actions.updateRAGContext);
  // Use user directly from store - this will trigger re-render when login updates it
  const user = useAppState((state) => state.settings.user);
  

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
      } catch (error) {
        // 401 or network error - not authenticated
        clearAuth();
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, [setUser, setTenant, setTheme, clearAuth]);

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
                currentRoute === '/settings' ? (
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
                )
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
