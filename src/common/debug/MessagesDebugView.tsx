/**
 * Messages Debug View
 * 
 * Shows message flow between extension and backend, including
 * message content, timestamps, sequence numbers, and status.
 * 
 * Reference: ChatMessage type in types/chatMessage.ts
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Badge,
  Code,
  Input,
  Button,
  useColorModeValue,
  Icon,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Tooltip,
  IconButton,
  Spacer,
} from '@chakra-ui/react';
import { FiUser, FiCpu, FiCopy, FiSearch, FiX, FiArrowDown, FiArrowUp } from 'react-icons/fi';
import { useAppState } from '../../state/store';
import type { ChatMessage } from '../../types/chatMessage';
import CopyButton from '../CopyButton';

const MessagesDebugView: React.FC = () => {
  const messages = useAppState((state) => state.currentTask.messages);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortAsc, setSortAsc] = useState(false);

  // Colors
  const cardBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const codeBg = useColorModeValue('gray.50', 'gray.900');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const userBg = useColorModeValue('blue.50', 'blue.900/20');
  const assistantBg = useColorModeValue('gray.50', 'gray.700');

  // Filter and sort messages
  const filteredMessages = useMemo(() => {
    let result = [...messages];
    
    // Filter by search term
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      result = result.filter((msg) => 
        msg.content.toLowerCase().includes(term) ||
        msg.role.toLowerCase().includes(term) ||
        msg.id.toLowerCase().includes(term)
      );
    }
    
    // Sort by timestamp
    result.sort((a, b) => {
      const timeA = new Date(a.timestamp).getTime();
      const timeB = new Date(b.timestamp).getTime();
      return sortAsc ? timeA - timeB : timeB - timeA;
    });
    
    return result;
  }, [messages, searchTerm, sortAsc]);

  const getMessageStatusColor = (status: ChatMessage['status']) => {
    switch (status) {
      case 'sending': return 'yellow';
      case 'sent': return 'blue';
      case 'delivered': return 'green';
      case 'failed': return 'red';
      default: return 'gray';
    }
  };

  const getRoleConfig = (role: ChatMessage['role']) => {
    switch (role) {
      case 'user':
        return { icon: FiUser, label: 'User', color: 'blue', bg: userBg };
      case 'assistant':
        return { icon: FiCpu, label: 'Assistant', color: 'green', bg: assistantBg };
      case 'system':
        return { icon: FiCpu, label: 'System', color: 'purple', bg: assistantBg };
      default:
        return { icon: FiCpu, label: role, color: 'gray', bg: assistantBg };
    }
  };

  const formatTimestamp = (timestamp: Date | string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  return (
    <VStack align="stretch" spacing={4}>
      {/* Header with search and controls */}
      <Box p={4} borderWidth="1px" borderRadius="lg" bg={cardBg} borderColor={borderColor}>
        <HStack spacing={3} mb={3}>
          <Text fontSize="sm" fontWeight="semibold" color={headingColor}>
            Messages
          </Text>
          <Badge colorScheme="gray" fontSize="xs">{messages.length} total</Badge>
          <Spacer />
          <CopyButton text={JSON.stringify(messages, null, 2)} />
        </HStack>
        
        <HStack spacing={2}>
          <Input
            placeholder="Search messages..."
            size="sm"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            flex="1"
          />
          {searchTerm && (
            <IconButton
              aria-label="Clear search"
              icon={<Icon as={FiX} />}
              size="sm"
              variant="ghost"
              onClick={() => setSearchTerm('')}
            />
          )}
          <Tooltip label={sortAsc ? 'Oldest first' : 'Newest first'}>
            <IconButton
              aria-label="Toggle sort order"
              icon={<Icon as={sortAsc ? FiArrowUp : FiArrowDown} />}
              size="sm"
              variant="outline"
              onClick={() => setSortAsc(!sortAsc)}
            />
          </Tooltip>
        </HStack>
      </Box>

      {/* Messages List */}
      <Box p={4} borderWidth="1px" borderRadius="lg" bg={cardBg} borderColor={borderColor} maxH="500px" overflowY="auto">
        {filteredMessages.length === 0 ? (
          <Text fontSize="sm" color={mutedColor} fontStyle="italic" textAlign="center" py={4}>
            {searchTerm ? `No messages matching "${searchTerm}"` : 'No messages yet'}
          </Text>
        ) : (
          <Accordion allowMultiple defaultIndex={[0]}>
            {filteredMessages.slice(0, 50).map((msg, index) => {
              const roleConfig = getRoleConfig(msg.role);
              
              return (
                <AccordionItem key={msg.id || index} border="none" mb={2}>
                  <AccordionButton 
                    bg={roleConfig.bg}
                    borderRadius="md"
                    _hover={{ opacity: 0.8 }}
                  >
                    <HStack flex="1" spacing={2} minW="0">
                      <Icon as={roleConfig.icon} boxSize={4} color={`${roleConfig.color}.500`} flexShrink={0} />
                      <Badge colorScheme={roleConfig.color} fontSize="xs" flexShrink={0}>
                        {roleConfig.label}
                      </Badge>
                      <Text 
                        fontSize="xs" 
                        color={textColor} 
                        flex="1" 
                        textAlign="left"
                        isTruncated
                      >
                        {msg.content.slice(0, 80)}{msg.content.length > 80 ? '...' : ''}
                      </Text>
                      <Text fontSize="xs" color={mutedColor} flexShrink={0}>
                        {formatTimestamp(msg.timestamp)}
                      </Text>
                      {msg.status && (
                        <Badge colorScheme={getMessageStatusColor(msg.status)} fontSize="xs" flexShrink={0}>
                          {msg.status}
                        </Badge>
                      )}
                    </HStack>
                    <AccordionIcon />
                  </AccordionButton>
                  <AccordionPanel pb={4}>
                    <VStack align="stretch" spacing={3} fontSize="xs">
                      {/* Message Content */}
                      <Box>
                        <Text fontWeight="semibold" color={headingColor} mb={1}>Content:</Text>
                        <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={codeBg} maxH="200px" overflowY="auto">
                          {msg.content}
                        </Code>
                      </Box>

                      {/* Metadata */}
                      <Box>
                        <Text fontWeight="semibold" color={headingColor} mb={1}>Metadata:</Text>
                        <VStack align="stretch" spacing={1}>
                          <HStack justify="space-between">
                            <Text color={mutedColor}>ID:</Text>
                            <Code fontSize="xs" bg={codeBg}>{msg.id}</Code>
                          </HStack>
                          <HStack justify="space-between">
                            <Text color={mutedColor}>Role:</Text>
                            <Badge colorScheme={roleConfig.color} fontSize="xs">{msg.role}</Badge>
                          </HStack>
                          <HStack justify="space-between">
                            <Text color={mutedColor}>Status:</Text>
                            <Badge colorScheme={getMessageStatusColor(msg.status)} fontSize="xs">
                              {msg.status || 'unknown'}
                            </Badge>
                          </HStack>
                          <HStack justify="space-between">
                            <Text color={mutedColor}>Timestamp:</Text>
                            <Code fontSize="xs" bg={codeBg}>{new Date(msg.timestamp).toISOString()}</Code>
                          </HStack>
                          {msg.sequenceNumber !== undefined && (
                            <HStack justify="space-between">
                              <Text color={mutedColor}>Sequence:</Text>
                              <Code fontSize="xs" bg={codeBg}>{msg.sequenceNumber}</Code>
                            </HStack>
                          )}
                        </VStack>
                      </Box>

                      {/* Action Payload */}
                      {msg.actionPayload && (
                        <Box>
                          <Text fontWeight="semibold" color={headingColor} mb={1}>Action Payload:</Text>
                          <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={codeBg}>
                            {JSON.stringify(msg.actionPayload, null, 2)}
                          </Code>
                        </Box>
                      )}

                      {/* Error */}
                      {msg.error && (
                        <Box>
                          <Text fontWeight="semibold" color="red.500" mb={1}>Error:</Text>
                          <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={useColorModeValue('red.50', 'red.900/20')} color="red.500">
                            {JSON.stringify(msg.error, null, 2)}
                          </Code>
                        </Box>
                      )}
                    </VStack>
                  </AccordionPanel>
                </AccordionItem>
              );
            })}
          </Accordion>
        )}

        {filteredMessages.length > 50 && (
          <Text fontSize="xs" color={mutedColor} textAlign="center" mt={2}>
            Showing 50 of {filteredMessages.length} messages
          </Text>
        )}
      </Box>
    </VStack>
  );
};

export default MessagesDebugView;
