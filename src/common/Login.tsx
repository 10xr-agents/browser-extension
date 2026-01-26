/**
 * Login Component for Thin Client Architecture
 * 
 * Replaces SetAPIKey component with email/password login form.
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
  useColorModeValue,
} from '@chakra-ui/react';
import React, { useState } from 'react';
import { apiClient, API_BASE } from '../api/client';
import { useAppState } from '../state/store';

export const Login: React.FC = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  
  const setUser = useAppState((state) => state.settings.actions.setUser);
  const setTenant = useAppState((state) => state.settings.actions.setTenant);
  
  // Dark mode color values - defined at component top level
  const bgColor = useColorModeValue('white', 'gray.900');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const labelColor = useColorModeValue('gray.700', 'gray.300');
  const errorBg = useColorModeValue('red.50', 'red.900/30');
  const errorText = useColorModeValue('red.800', 'red.300');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const response = await apiClient.login(email, password);
      
      // Update Zustand state for UI
      setUser(response.user);
      setTenant(response.tenantId, response.tenantName);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Login failed';
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleSignup = () => {
    // Open signup page in a new tab - navigate to API base URL
    chrome.tabs.create({ url: API_BASE }).catch((error) => {
      console.error('Error opening signup page:', error);
    });
  };

  return (
    <Box p={4} bg={bgColor} minH="100%">
      <VStack spacing={4} as="form" onSubmit={handleLogin}>
        <Text fontSize="lg" fontWeight="bold" color={textColor}>
          Sign in to Spadeworks Copilot AI
        </Text>
        
        {error && (
          <Alert
            status="error"
            bg={errorBg}
            _dark={{ bg: 'red.900/30' }}
          >
            <AlertIcon />
            <Text color={errorText} _dark={{ color: 'red.300' }}>
              {error}
            </Text>
          </Alert>
        )}
        
        <FormControl isRequired>
          <FormLabel color={labelColor}>Email</FormLabel>
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
          <FormLabel color={labelColor}>Password</FormLabel>
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

        <Button
          type="button"
          variant="outline"
          width="full"
          onClick={handleSignup}
          disabled={loading}
        >
          Sign Up
        </Button>
      </VStack>
    </Box>
  );
};

export default Login;
