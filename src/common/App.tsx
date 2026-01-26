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

import { Box, ChakraProvider, Heading, HStack, Text, Spinner } from '@chakra-ui/react';
import React, { useEffect, useState } from 'react';
import { apiClient } from '../api/client';
import { useAppState } from '../state/store';
import Login from './Login';
import TaskUI from './TaskUI';
import OptionsDropdown from './OptionsDropdown';
import logo from '../assets/img/icon-128.png';

const App = () => {
  const [checkingSession, setCheckingSession] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  
  const setUser = useAppState((state) => state.settings.actions.setUser);
  const setTenant = useAppState((state) => state.settings.actions.setTenant);
  const clearAuth = useAppState((state) => state.settings.actions.clearAuth);
  const user = useAppState((state) => state.settings.user);
  const tenantName = useAppState((state) => state.settings.tenantName);

  useEffect(() => {
    // Check session on startup
    const checkSession = async () => {
      try {
        const session = await apiClient.getSession();
        setUser(session.user);
        setTenant(session.tenantId, session.tenantName);
        setIsAuthenticated(true);
      } catch (error) {
        // 401 or network error - not authenticated
        clearAuth();
        setIsAuthenticated(false);
      } finally {
        setCheckingSession(false);
      }
    };

    checkSession();
  }, [setUser, setTenant, clearAuth]);

  if (checkingSession) {
    return (
      <ChakraProvider>
        <Box p="8" fontSize="lg" w="full">
          <HStack spacing={4} justify="center" align="center" minH="200px">
            <Spinner size="lg" />
            <Text>Checking session...</Text>
          </HStack>
        </Box>
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider>
      <Box p="8" fontSize="lg" w="full">
        <HStack mb={4} alignItems="center">
          <img
            src={logo}
            width={32}
            height={32}
            className="App-logo"
            alt="logo"
          />

          <Heading as="h1" size="lg" flex={1}>
            Spadeworks Copilot AI
          </Heading>
          {isAuthenticated && (
            <HStack spacing={2}>
              {tenantName && (
                <Text fontSize="sm" color="gray.600">
                  {tenantName}
                </Text>
              )}
              <OptionsDropdown />
            </HStack>
          )}
        </HStack>
        {isAuthenticated ? <TaskUI /> : <Login />}
      </Box>
    </ChakraProvider>
  );
};

export default App;
