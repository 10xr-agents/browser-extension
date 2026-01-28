/**
 * ChatHistoryDrawer Component
 * 
 * Drawer/overlay that displays past chat sessions in a scrollable list.
 * Enables Cursor-style multi-chat functionality.
 * 
 * **Domain-Aware Sessions:**
 * Sessions are displayed with domain prefix (e.g., "google.com: Search for flights")
 * Users can rename sessions while preserving the domain prefix.
 * 
 * Reference: 
 * - UI Overhaul - Multi-Chat Feature
 * - Domain-Aware Sessions Feature
 */

import React, { useEffect, useState } from 'react';
import {
  Drawer,
  DrawerBody,
  DrawerHeader,
  DrawerOverlay,
  DrawerContent,
  DrawerCloseButton,
  VStack,
  Box,
  Text,
  HStack,
  useColorModeValue,
  Tooltip,
  IconButton,
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  useToast,
  Modal,
  ModalOverlay,
  ModalContent,
  ModalHeader,
  ModalBody,
  ModalFooter,
  ModalCloseButton,
  Input,
  Button,
  Badge,
  useDisclosure,
} from '@chakra-ui/react';
import { FiMoreVertical, FiArchive, FiEdit2 } from 'react-icons/fi';
import { useAppState } from '../state/store';
import type { ChatSession } from '../state/sessions';
import { fromTimestamp } from '../services/sessionService';
import { extractDomainFromTitle, extractTaskDescription } from '../helpers/domainUtils';

interface ChatHistoryDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

const ChatHistoryDrawer: React.FC<ChatHistoryDrawerProps> = ({ isOpen, onClose }) => {
  const sessions = useAppState((state) => state.sessions.sessions);
  const currentSessionId = useAppState((state) => state.sessions.currentSessionId);
  const loadSessions = useAppState((state) => state.sessions.actions.loadSessions);
  const archiveSession = useAppState((state) => state.sessions.actions.archiveSession);
  const renameSession = useAppState((state) => state.sessions.actions.renameSession);
  const switchSession = useAppState((state) => state.sessions.actions.switchSession);
  const setInstructions = useAppState((state) => state.ui.actions.setInstructions);
  const interruptTask = useAppState((state) => state.currentTask.actions.interrupt);
  const taskStatus = useAppState((state) => state.currentTask.status);
  const toast = useToast();
  
  // Rename modal state
  const { isOpen: isRenameOpen, onOpen: onRenameOpen, onClose: onRenameClose } = useDisclosure();
  const [renameSessionId, setRenameSessionId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [isRenaming, setIsRenaming] = useState(false);

  // Load sessions when drawer opens (always exclude archived)
  useEffect(() => {
    if (isOpen) {
      loadSessions({
        status: 'active',
        includeArchived: false,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]); // loadSessions is stable from Zustand, no need in deps

  // Color definitions - ALL at component top level
  const bgColor = useColorModeValue('white', 'gray.900');
  const headerBg = useColorModeValue('gray.50', 'gray.800');
  const headerText = useColorModeValue('gray.900', 'gray.100');
  const itemBg = useColorModeValue('white', 'gray.800');
  const itemHoverBg = useColorModeValue('gray.50', 'gray.700');
  const itemActiveBg = useColorModeValue('blue.50', 'blue.900/20');
  const itemActiveBorder = useColorModeValue('blue.500', 'blue.400');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const domainBadgeBg = useColorModeValue('gray.100', 'gray.700');
  const domainBadgeColor = useColorModeValue('gray.700', 'gray.300');

  // Format relative time from timestamp
  const formatRelativeTime = (timestamp: number): string => {
    const now = Date.now();
    const diffMs = now - timestamp;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return fromTimestamp(timestamp).toLocaleDateString();
  };

  const handleSessionClick = async (session: ChatSession) => {
    // Stop current task if running
    if (taskStatus === 'running') {
      interruptTask();
      // Wait a bit for task to stop
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    // Switch to this session (loads messages and updates state)
    await switchSession(session.sessionId);
    
    // Extract title from first user message if available
    // Use getState() safely (it's not a hook, it's a Zustand store method)
    const state = useAppState.getState();
    const messages = state.currentTask.messages;
    
    // SAFETY CHECK: Ensure messages is an array before calling .find()
    // This prevents crashes during race conditions when switching sessions
    if (!Array.isArray(messages)) {
      console.warn('ChatHistoryDrawer: messages is not an array after switchSession');
      onClose();
      return;
    }
    
    const firstUserMessage = messages.find(m => m && m.role === 'user');
    if (firstUserMessage) {
      // Ensure content is a string before using it
      const contentStr = typeof firstUserMessage.content === 'string' 
        ? firstUserMessage.content 
        : String(firstUserMessage.content || '');
      
      if (contentStr !== session.title) {
        // Update session title if it differs
        const newTitle = contentStr.length > 50 
          ? contentStr.substring(0, 50) + '...' 
          : contentStr;
        await state.sessions.actions.updateSession(session.sessionId, {
          title: newTitle,
        });
      }
    }

    // Clear instructions
    setInstructions('');

    // Close drawer
    onClose();
  };

  const handleArchiveSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering session click
    
    try {
      await archiveSession(sessionId);
      toast({
        title: 'Session archived',
        description: 'The session has been archived and will no longer appear in active chats.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      
      // Reload sessions to refresh the list (archived sessions excluded)
      await loadSessions({
        status: 'active',
        includeArchived: false,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Failed to archive session',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    }
  };

  const handleRenameClick = (session: ChatSession, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent triggering session click
    setRenameSessionId(session.sessionId);
    // Extract just the task description (without domain prefix) for editing
    const currentTitle = typeof session.title === 'string' ? session.title : String(session.title || '');
    setRenameValue(extractTaskDescription(currentTitle));
    onRenameOpen();
  };

  const handleRenameSubmit = async () => {
    if (!renameSessionId || !renameValue.trim()) {
      toast({
        title: 'Invalid title',
        description: 'Please enter a valid title for the session.',
        status: 'warning',
        duration: 3000,
        isClosable: true,
      });
      return;
    }

    setIsRenaming(true);
    try {
      await renameSession(renameSessionId, renameValue.trim());
      toast({
        title: 'Session renamed',
        description: 'The session has been renamed successfully.',
        status: 'success',
        duration: 3000,
        isClosable: true,
      });
      onRenameClose();
      
      // Reload sessions to refresh titles
      await loadSessions({
        status: 'active',
        includeArchived: false,
      });
    } catch (error: unknown) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      toast({
        title: 'Failed to rename session',
        description: errorMessage,
        status: 'error',
        duration: 5000,
        isClosable: true,
      });
    } finally {
      setIsRenaming(false);
    }
  };

  // Parse session title to extract domain and description
  const parseSessionTitle = (session: ChatSession): { domain: string | null; description: string } => {
    const title = typeof session.title === 'string' ? session.title : String(session.title || 'Untitled Chat');
    const domain = session.domain || extractDomainFromTitle(title);
    const description = extractTaskDescription(title);
    return { domain, description };
  };

  return (
    <>
      <Drawer isOpen={isOpen} placement="left" onClose={onClose} size="sm">
        <DrawerOverlay />
        <DrawerContent bg={bgColor}>
          <DrawerCloseButton />
          <DrawerHeader bg={headerBg} borderBottomWidth="1px" borderColor={borderColor}>
            <Text fontSize="md" fontWeight="semibold" color={headerText}>
              Chat History
            </Text>
          </DrawerHeader>
          <DrawerBody p={0}>
            {sessions.length === 0 ? (
              <Box p={4} textAlign="center">
                <Text fontSize="sm" color={descColor}>
                  No chat history yet. Start a conversation to see it here.
                </Text>
              </Box>
            ) : (
              <VStack align="stretch" spacing={0}>
                {sessions
                  .filter((session) => session.status !== 'archived') // Filter out archived sessions
                  .map((session) => {
                    const isActive = session.sessionId === currentSessionId;
                    const { domain, description } = parseSessionTitle(session);
                    
                    return (
                      <Tooltip
                        key={session.sessionId}
                        label={typeof session.title === 'string' ? session.title : String(session.title || 'Untitled Chat')}
                        placement="right"
                        openDelay={500}
                      >
                        <HStack
                          px={4}
                          py={3}
                          bg={isActive ? itemActiveBg : itemBg}
                          borderLeftWidth={isActive ? '3px' : '0'}
                          borderLeftColor={isActive ? itemActiveBorder : 'transparent'}
                          borderBottomWidth="1px"
                          borderBottomColor={borderColor}
                          cursor="pointer"
                          _hover={{ bg: itemHoverBg }}
                          onClick={() => handleSessionClick(session)}
                          spacing={2}
                        >
                          <VStack align="stretch" spacing={1} flex={1}>
                            {/* Domain badge */}
                            {domain && (
                              <Badge 
                                fontSize="2xs" 
                                px={1.5} 
                                py={0.5}
                                borderRadius="sm"
                                bg={domainBadgeBg}
                                color={domainBadgeColor}
                                fontWeight="medium"
                                textTransform="lowercase"
                                w="fit-content"
                              >
                                {domain}
                              </Badge>
                            )}
                            <Text
                              fontSize="sm"
                              fontWeight={isActive ? 'semibold' : 'medium'}
                              color={textColor}
                              noOfLines={2}
                            >
                              {/* SAFETY: Ensure description is always a string to prevent React error #130 */}
                              {description || 'Untitled Chat'}
                            </Text>
                            <HStack spacing={2} justify="space-between">
                              <Text fontSize="xs" color={descColor}>
                                {formatRelativeTime(session.updatedAt || session.createdAt)}
                              </Text>
                              {(session.messageCount || 0) > 0 && (
                                <Text fontSize="xs" color={descColor}>
                                  {session.messageCount} messages
                                </Text>
                              )}
                            </HStack>
                          </VStack>
                          <Menu>
                            <MenuButton
                              as={IconButton}
                              icon={<FiMoreVertical />}
                              variant="ghost"
                              size="sm"
                              onClick={(e) => e.stopPropagation()}
                              aria-label="Session options"
                            />
                            <MenuList>
                              <MenuItem
                                icon={<FiEdit2 />}
                                onClick={(e) => handleRenameClick(session, e)}
                              >
                                Rename
                              </MenuItem>
                              <MenuItem
                                icon={<FiArchive />}
                                onClick={(e) => handleArchiveSession(session.sessionId, e)}
                              >
                                Archive
                              </MenuItem>
                            </MenuList>
                          </Menu>
                        </HStack>
                      </Tooltip>
                    );
                  })}
              </VStack>
            )}
          </DrawerBody>
        </DrawerContent>
      </Drawer>

      {/* Rename Modal */}
      <Modal isOpen={isRenameOpen} onClose={onRenameClose} isCentered>
        <ModalOverlay />
        <ModalContent bg={bgColor}>
          <ModalHeader color={textColor}>Rename Session</ModalHeader>
          <ModalCloseButton />
          <ModalBody>
            <Text fontSize="sm" color={descColor} mb={3}>
              Enter a new name for this session. The domain prefix will be preserved.
            </Text>
            <Input
              value={renameValue}
              onChange={(e) => setRenameValue(e.target.value)}
              placeholder="e.g., Search for flights"
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !isRenaming) {
                  handleRenameSubmit();
                }
              }}
              autoFocus
            />
          </ModalBody>
          <ModalFooter>
            <Button variant="ghost" mr={3} onClick={onRenameClose}>
              Cancel
            </Button>
            <Button
              colorScheme="blue"
              onClick={handleRenameSubmit}
              isLoading={isRenaming}
              isDisabled={!renameValue.trim()}
            >
              Rename
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </>
  );
};

export default ChatHistoryDrawer;
