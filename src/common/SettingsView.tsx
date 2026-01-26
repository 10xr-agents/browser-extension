/**
 * Settings View Component
 * 
 * Dedicated settings page accessible via /settings route.
 * Displays theme preferences and account actions.
 * 
 * Reference: EXTENSION_SETTINGS_ROADMAP.md (future implementation)
 */

import {
  Box,
  Button,
  VStack,
  useToast,
  Text,
  HStack,
  Flex,
  Avatar,
  IconButton,
  Skeleton,
  SkeletonText,
  useColorModeValue,
  Icon,
  Switch,
  FormControl,
  FormLabel,
} from '@chakra-ui/react';
import React, { useState, useEffect } from 'react';
import { BsBoxArrowRight } from 'react-icons/bs';
import { apiClient } from '../api/client';
import { useAppState } from '../state/store';
import { ChevronLeftIcon } from '@chakra-ui/icons';
import { SettingsSection } from './SettingsSection';
import { ThemeToggle } from './ThemeToggle';

interface SettingsViewProps {
  onNavigate: (route: '/' | '/settings') => void;
}

const SettingsView: React.FC<SettingsViewProps> = ({ onNavigate }) => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  const user = useAppState((state) => state.settings.user);
  const theme = useAppState((state) => state.settings.theme);
  const developerMode = useAppState((state) => state.settings.developerMode);
  const setTheme = useAppState((state) => state.settings.actions.setTheme);
  const setDeveloperMode = useAppState((state) => state.settings.actions.setDeveloperMode);
  const clearAuth = useAppState((state) => state.settings.actions.clearAuth);
  const toast = useToast();

  // Load preferences on mount and sync with backend
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const response = await apiClient.getPreferences();
        if (response.preferences?.theme) {
          // Update Zustand store (which will trigger theme change via ThemeProvider)
          setTheme(response.preferences.theme);
        }
      } catch (error) {
        console.error('Error loading preferences:', error);
        // Use default if load fails
      } finally {
        setLoading(false);
      }
    };

    if (user) {
      loadPreferences();
    }
  }, [user, setTheme]);

  const handleThemeChange = async (newTheme: 'light' | 'dark' | 'system') => {
    // Store previous theme for error rollback
    const previousTheme = theme;
    
    // Update Zustand store immediately (triggers theme change)
    setTheme(newTheme);
    setSaving(true);
    
    try {
      // Sync to backend
      await apiClient.updatePreferences({ theme: newTheme });
      toast({
        title: 'Preferences saved',
        description: 'Your theme preference has been updated.',
        status: 'success',
        duration: 2000,
        isClosable: true,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to save preferences';
      toast({
        title: 'Save error',
        description: message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
      // Revert on error
      setTheme(previousTheme);
    } finally {
      setSaving(false);
    }
  };

  const handleLogout = async () => {
    try {
      await apiClient.logout();
      clearAuth();
      
      toast({
        title: 'Logged out',
        description: 'You have been successfully logged out.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      
      // Navigate back to main view (will show login)
      onNavigate('/');
      window.location.reload();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Logout failed';
      toast({
        title: 'Logout error',
        description: message,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  // Get user initials for avatar
  const getUserInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const hoverBg = useColorModeValue('red.50', 'red.900/20');
  const contentBg = useColorModeValue('white', 'gray.900');
  const profileBg = useColorModeValue('gray.50', 'gray.700/50');
  const nameColor = useColorModeValue('gray.900', 'gray.100');
  const emailColor = useColorModeValue('gray.600', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');

  if (loading) {
    return (
      <VStack spacing={6} align="stretch" minW="0">
        <HStack spacing={3} alignItems="center" mb={2}>
          <Skeleton height="32px" width="32px" borderRadius="md" />
          <SkeletonText noOfLines={1} width="100px" />
        </HStack>
        <SettingsSection title="Appearance">
          <Skeleton height="40px" borderRadius="md" />
        </SettingsSection>
        <SettingsSection title="Account">
          <VStack spacing={4} align="stretch">
            <Skeleton height="60px" borderRadius="lg" />
            <Skeleton height="32px" borderRadius="md" />
          </VStack>
        </SettingsSection>
      </VStack>
    );
  }

  return (
    <Flex direction="column" h="100%" minH="0" w="100%" overflow="hidden" bg={contentBg}>
      {/* Navigation Header - Fixed */}
      <Box flex="none" px={4} pt={4} pb={2} minW="0" bg={contentBg}>
        <Flex align="center" minW="0">
          <IconButton
            aria-label="Back"
            icon={<ChevronLeftIcon />}
            variant="ghost"
            size="sm"
            onClick={() => onNavigate('/')}
            mr={2}
            _focusVisible={{
              boxShadow: 'outline',
            }}
          />
          <Text fontSize="lg" fontWeight="semibold" minW="0" color={headingColor}>
            Settings
          </Text>
        </Flex>
      </Box>

      {/* Scrollable Content */}
      <Box flex="1" overflowY="auto" overflowX="hidden" px={4} pb={4} minW="0" bg={contentBg}>
        <VStack spacing={4} align="stretch" minW="0">

      {/* Appearance Section */}
      <SettingsSection title="Appearance">
        <ThemeToggle
          value={theme}
          onChange={handleThemeChange}
          isDisabled={saving}
        />
      </SettingsSection>

      {/* Developer Options Section */}
      <SettingsSection title="Developer Options">
        <FormControl display="flex" alignItems="center" justifyContent="space-between">
          <Box flex="1">
            <FormLabel htmlFor="developer-mode" mb={0} fontSize="sm" fontWeight="medium" color={useColorModeValue('gray.700', 'gray.300')}>
              Enable Developer Mode
            </FormLabel>
            <Text fontSize="xs" color={useColorModeValue('gray.600', 'gray.400')} mt={1}>
              Show technical debug information and advanced debugging tools
            </Text>
          </Box>
          <Switch
            id="developer-mode"
            isChecked={developerMode}
            onChange={(e) => {
              const newValue = e.target.checked;
              setDeveloperMode(newValue);
              toast({
                title: newValue ? 'Developer mode enabled' : 'Developer mode disabled',
                description: newValue
                  ? 'Debug panel is now available. You can access it from the main task view.'
                  : 'Debug panel has been hidden.',
                status: 'info',
                duration: 3000,
                isClosable: true,
              });
            }}
            colorScheme="blue"
            size="md"
          />
        </FormControl>
      </SettingsSection>

      {/* Account Section */}
      <SettingsSection title="Account">
        {user && (
          <VStack spacing={4} align="stretch" minW="0">
            {/* User Profile Row */}
            <HStack
              spacing={3}
              alignItems="center"
              p={3}
              borderWidth="1px"
              borderColor={borderColor}
              borderRadius="lg"
              bg={profileBg}
              minW="0"
            >
              <Avatar
                size="md"
                name={user.name || user.email}
                bg="blue.500"
                color="white"
                flexShrink={0}
              >
                {getUserInitials(user.email)}
              </Avatar>
              <VStack align="start" spacing={0} flex={1} minW="0">
                <Text
                  fontSize="sm"
                  fontWeight="semibold"
                  color={nameColor}
                  minW="0"
                  isTruncated
                >
                  {user.name || 'User'}
                </Text>
                <Text
                  fontSize="xs"
                  color={emailColor}
                  minW="0"
                  isTruncated
                >
                  {user.email}
                </Text>
              </VStack>
            </HStack>

            {/* Sign Out Button */}
            <Button
              leftIcon={<Icon as={BsBoxArrowRight} />}
              variant="ghost"
              colorScheme="red"
              size="sm"
              onClick={handleLogout}
              justifyContent="flex-start"
              fontWeight="medium"
              px={0}
              _hover={{
                bg: hoverBg,
              }}
              _focusVisible={{
                boxShadow: 'outline',
              }}
            >
              Sign Out
            </Button>
          </VStack>
        )}
      </SettingsSection>
        </VStack>
      </Box>
    </Flex>
  );
};

export default SettingsView;
