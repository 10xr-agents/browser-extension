/**
 * DomainStatus Component - Unified Command Bar
 * 
 * Main application header that consolidates domain status and action buttons.
 * Replaces the old separate header component.
 * 
 * Layout:
 * - Left: Domain Pill (current URL domain)
 * - Right: Action Dock with 4 buttons (History, New Chat, Debug, Settings)
 * 
 * Reference: Multi-Session Chat Interface Implementation
 */

import React from 'react';
import {
  Box,
  HStack,
  Text,
  IconButton,
  Icon,
  Tooltip,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiClock, FiPlus } from 'react-icons/fi';
import { FaBug } from 'react-icons/fa';
import { SettingsIcon } from '@chakra-ui/icons';
import { useAppState } from '../../state/store';

interface DomainStatusProps {
  currentUrl?: string;
  onHistoryClick: () => void;
  onNewChatClick: () => void;
  onDebugClick?: () => void;
  onSettingsClick?: () => void;
  isDebugViewOpen?: boolean;
}

const DomainStatus: React.FC<DomainStatusProps> = ({
  currentUrl,
  onHistoryClick,
  onNewChatClick,
  onDebugClick,
  onSettingsClick,
  isDebugViewOpen = false,
}) => {
  // Color definitions - ALL at component top level
  const headerBg = useColorModeValue('white', 'gray.900');
  const headerBorder = useColorModeValue('gray.200', 'gray.700');
  const contextPillBg = useColorModeValue('gray.100', 'gray.800');
  const contextPillText = useColorModeValue('gray.700', 'gray.300');
  const actionButtonColor = useColorModeValue('gray.700', 'gray.300');
  const actionButtonHoverBg = useColorModeValue('gray.100', 'gray.700');
  const debugButtonActiveColor = useColorModeValue('red.600', 'red.400');
  const debugButtonActiveHoverBg = useColorModeValue('red.50', 'red.900/20');
  
  // Get developer mode state
  const developerMode = useAppState((state) => state.settings.developerMode);
  
  // Get current context (active URL domain or task name)
  const getCurrentContext = () => {
    if (currentUrl) {
      try {
        const url = new URL(currentUrl);
        return url.hostname;
      } catch {
        return 'Current page';
      }
    }
    return 'Ready to start';
  };

  return (
    <Box
      flex="none"
      position="sticky"
      top={0}
      zIndex={10}
      bg={headerBg}
      borderBottomWidth="1px"
      borderColor={headerBorder}
      px={2}
      py={2}
      shadow="sm"
    >
      <HStack spacing={2} justify="space-between" align="center" w="full">
        {/* Left: Domain Pill */}
        <Box
          px={3}
          py={1}
          borderRadius="full"
          bg={contextPillBg}
          _dark={{ bg: 'gray.800' }}
        >
          <Text fontSize="xs" fontWeight="medium" color={contextPillText} _dark={{ color: 'gray.300' }}>
            {getCurrentContext()}
          </Text>
        </Box>
        
        {/* Right: Action Dock */}
        <HStack spacing={1} flexShrink={0}>
          {/* History Button */}
          <Tooltip label="Chat History" placement="bottom" openDelay={500}>
            <IconButton
              aria-label="Chat History"
              icon={<Icon as={FiClock} />}
              size="sm"
              variant="ghost"
              onClick={onHistoryClick}
              color={actionButtonColor}
              _hover={{
                bg: actionButtonHoverBg,
              }}
            />
          </Tooltip>
          
          {/* New Chat Button */}
          <Tooltip label="New Chat" placement="bottom" openDelay={500}>
            <IconButton
              aria-label="New Chat"
              icon={<Icon as={FiPlus} />}
              size="sm"
              variant="ghost"
              onClick={onNewChatClick}
              color={actionButtonColor}
              _hover={{
                bg: actionButtonHoverBg,
              }}
            />
          </Tooltip>
          
          {/* Debug Button - Only visible when developer mode is enabled */}
          {developerMode && onDebugClick && (
            <Tooltip 
              label={isDebugViewOpen ? 'Switch to Chat view' : 'Switch to Debug view'} 
              placement="bottom" 
              openDelay={500}
            >
              <IconButton
                aria-label={isDebugViewOpen ? 'Switch to Chat view' : 'Switch to Debug view'}
                icon={<Icon as={FaBug} />}
                size="sm"
                variant="ghost"
                onClick={onDebugClick}
                color={isDebugViewOpen 
                  ? debugButtonActiveColor
                  : actionButtonColor
                }
                _hover={{
                  bg: isDebugViewOpen 
                    ? debugButtonActiveHoverBg
                    : actionButtonHoverBg,
                }}
              />
            </Tooltip>
          )}
          
          {/* Settings Button */}
          {onSettingsClick && (
            <Tooltip label="Settings" placement="bottom" openDelay={500}>
              <IconButton
                aria-label="Settings"
                icon={<SettingsIcon />}
                size="sm"
                variant="ghost"
                onClick={onSettingsClick}
                color={actionButtonColor}
                _hover={{
                  bg: actionButtonHoverBg,
                }}
              />
            </Tooltip>
          )}
        </HStack>
      </HStack>
    </Box>
  );
};

export default DomainStatus;
