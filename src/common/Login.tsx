/**
 * Login Component for Thin Client Architecture
 * 
 * Replaces SetAPIKey component with email/password login form.
 * Calls POST /api/v1/auth/login and stores token in chrome.storage.local.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §2.1 (Task 1: Authentication & API Client)
 */

import {
  Box,
  Button,
  FormControl,
  FormLabel,
  Input,
  VStack,
  Text,
  Alert,
  AlertIcon,
  useToast,
} from '@chakra-ui/react';
import React, { useState } from 'react';
import { apiClient } from '../api/client';
import { useAppState } from '../state/store';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const toast = useToast();
  
  const setUser = useAppState((state) => state.settings.actions.setUser);
  const setTenant = useAppState((state) => state.settings.actions.setTenant);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiClient.login(email, password);
      
      // Update Zustand state for UI
      setUser(response.user);
      setTenant(response.tenantId, response.tenantName);

      toast({
        title: 'Login successful',
        description: `Welcome, ${response.user.email}`,
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
      
      toast({
        title: 'Login failed',
        description: message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Box p={4}>
      <VStack spacing={4} as="form" onSubmit={handleLogin}>
        <Text fontSize="lg" fontWeight="bold">
          Sign in to Spadeworks Copilot AI
        </Text>
        
        {error && (
          <Alert status="error">
            <AlertIcon />
            {error}
          </Alert>
        )}
        
        <FormControl isRequired>
          <FormLabel>Email</FormLabel>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            required
            disabled={loading}
          />
        </FormControl>
        
        <FormControl isRequired>
          <FormLabel>Password</FormLabel>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter your password"
            required
            disabled={loading}
          />
        </FormControl>
        
        <Button
          type="submit"
          colorScheme="blue"
          isLoading={loading}
          width="full"
          disabled={!email || !password}
        >
          Sign In
        </Button>
      </VStack>
    </Box>
  );
};

export default Login;
