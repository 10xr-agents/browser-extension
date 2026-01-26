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
    } catch (error) {
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
      
      // Navigate back to main view (will show login)
      onNavigate('/');
      window.location.reload();
    } catch (error) {
      // Silently handle logout errors - user will see login screen anyway
      console.error('Logout error:', error);
      clearAuth();
      onNavigate('/');
      window.location.reload();
    }
  };

  // Get user initials for avatar
  const getUserInitials = (email: string) => {
    return email.charAt(0).toUpperCase();
  };

  // Dark mode colors - ALL defined at component top level (before any conditional returns)
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const hoverBg = useColorModeValue('red.50', 'red.900/20');
  const contentBg = useColorModeValue('white', 'gray.900');
  const profileBg = useColorModeValue('gray.50', 'gray.700/50');
  const nameColor = useColorModeValue('gray.900', 'gray.100');
  const emailColor = useColorModeValue('gray.600', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const backButtonBorderColor = useColorModeValue('gray.300', 'gray.600');
  const backButtonHoverBg = useColorModeValue('gray.100', 'gray.700');
  const backButtonHoverBorderColor = useColorModeValue('gray.400', 'gray.500');
  const formLabelColor = useColorModeValue('gray.700', 'gray.300');
  const formDescColor = useColorModeValue('gray.600', 'gray.400');

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
        <Flex align="center" justify="space-between" minW="0" position="relative">
          {/* Left: Back Button */}
          <IconButton
            aria-label="Back"
            icon={<ChevronLeftIcon />}
            variant="outline"
            size="md"
            onClick={() => onNavigate('/')}
            borderColor={backButtonBorderColor}
            _hover={{
              bg: backButtonHoverBg,
              borderColor: backButtonHoverBorderColor,
            }}
            _focusVisible={{
              boxShadow: 'outline',
            }}
            flexShrink={0}
          />
          
          {/* Center: Settings Title */}
          <Text 
            fontSize="lg" 
            fontWeight="semibold" 
            minW="0" 
            color={headingColor}
            position="absolute"
            left="50%"
            transform="translateX(-50%)"
            pointerEvents="none"
          >
            Settings
          </Text>
          
          {/* Right: Spacer to balance the layout */}
          <Box w="32px" flexShrink={0} />
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
            <FormLabel htmlFor="developer-mode" mb={0} fontSize="sm" fontWeight="medium" color={formLabelColor}>
              Enable Developer Mode
            </FormLabel>
            <Text fontSize="xs" color={formDescColor} mt={1}>
              Show technical debug information and advanced debugging tools
            </Text>
          </Box>
          <Switch
            id="developer-mode"
            isChecked={developerMode}
            onChange={(e) => {
              const newValue = e.target.checked;
              setDeveloperMode(newValue);
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

            {/* Sign Out Button - Full Width */}
            <Button
              leftIcon={<Icon as={BsBoxArrowRight} />}
              variant="solid"
              colorScheme="red"
              size="md"
              onClick={handleLogout}
              fontWeight="medium"
              width="100%"
              justifyContent="center"
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
