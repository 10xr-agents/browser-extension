/**
 * Network Trace View Component for Thin Client Architecture
 * 
 * Displays API request/response logs for debugging.
 * Shows request, response, headers, duration, and status for each API call.
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §3.1 (Task 3: Network/API Trace Inspector)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §4.1 (API & Network Trace Inspector)
 */

import React, { useMemo, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Badge,
  Code,
  Spacer,
  Button,
  Input,
  useColorModeValue,
  Flex,
  Tooltip,
  IconButton,
  Collapse,
} from '@chakra-ui/react';
import { CopyIcon } from '@chakra-ui/icons';
import { useAppState } from '../state/store';
import type { NetworkLogEntry } from '../state/debug';
import { callRPC } from '../helpers/pageRPC';

const NetworkTraceView: React.FC = () => {
  const networkLogs = useAppState((state) => state.debug.networkLogs);
  const clearNetworkLogs = useAppState((state) => state.debug.actions.clearNetworkLogs);
  const [searchTerm, setSearchTerm] = useState('');

  // Dark mode colors - defined at component top level
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const codeBg = useColorModeValue('gray.50', 'gray.900');
  const rowBg = useColorModeValue('white', 'gray.800');
  const rowHoverBg = useColorModeValue('gray.50', 'gray.700');
  const rowBorder = useColorModeValue('gray.200', 'gray.700');

  // Filter logs by search term
  const filteredLogs = useMemo(() => {
    if (!searchTerm) return networkLogs;
    const term = searchTerm.toLowerCase();
    return networkLogs.filter(
      (log) =>
        log.endpoint.toLowerCase().includes(term) ||
        log.method.toLowerCase().includes(term) ||
        (log.error && log.error.toLowerCase().includes(term)) ||
        String(log.response.status).includes(term)
    );
  }, [networkLogs, searchTerm]);

  const getStatusColor = (status: number, error?: string) => {
    if (error) return 'red';
    if (status >= 200 && status < 300) return 'green';
    if (status >= 300 && status < 400) return 'yellow';
    if (status >= 400) return 'red';
    return 'gray';
  };

  const formatDuration = (ms: number) => {
    if (ms < 1000) return `${ms}ms`;
    return `${(ms / 1000).toFixed(2)}s`;
  };

  const formatTimestamp = (date: Date) => {
    return new Date(date).toLocaleTimeString();
  };

  const handleCopyAll = async () => {
    try {
      await callRPC('copyToClipboard', [JSON.stringify(filteredLogs, null, 2)]);
    } catch (error) {
      console.error('Failed to copy logs:', error);
    }
  };

  if (networkLogs.length === 0) {
    return (
      <Text fontSize="sm" color={textColor} fontStyle="italic">
        No network logs available. API calls will be logged here when they occur.
      </Text>
    );
  }

  return (
    <VStack align="stretch" spacing={4}>
      {/* Header with search and clear */}
      <HStack>
        <Spacer />
        <Input
          placeholder="Search logs..."
          size="sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          maxW="200px"
        />
        <Button size="sm" onClick={clearNetworkLogs} variant="outline">
          Clear Logs
        </Button>
        <Tooltip label="Copy all logs as JSON">
          <IconButton
            aria-label="Copy all logs"
            icon={<CopyIcon />}
            size="sm"
            variant="outline"
            onClick={handleCopyAll}
          />
        </Tooltip>
      </HStack>

      {/* Logs List - Scrollable container */}
      <Box
        maxH="300px"
        overflowY="auto"
        borderWidth="1px"
        borderColor={borderColor}
        borderRadius="md"
      >
        <VStack align="stretch" spacing={0} divider={<Box borderColor={rowBorder} />}>
          {filteredLogs.map((log, index) => (
            <NetworkLogItem 
              key={log.id} 
              log={log} 
              getStatusColor={getStatusColor} 
              formatDuration={formatDuration} 
              formatTimestamp={formatTimestamp}
              rowBg={rowBg}
              rowHoverBg={rowHoverBg}
              rowBorder={rowBorder}
              isEven={index % 2 === 0}
            />
          ))}
        </VStack>
      </Box>

      {filteredLogs.length === 0 && searchTerm && (
        <Text fontSize="sm" color={textColor} textAlign="center" py={4} fontStyle="italic">
          No logs match "{searchTerm}"
        </Text>
      )}
    </VStack>
  );
};

const NetworkLogItem: React.FC<{
  log: NetworkLogEntry;
  getStatusColor: (status: number, error?: string) => string;
  formatDuration: (ms: number) => string;
  formatTimestamp: (date: Date) => string;
  rowBg: string;
  rowHoverBg: string;
  rowBorder: string;
  isEven: boolean;
}> = ({ log, getStatusColor, formatDuration, formatTimestamp, rowBg, rowHoverBg, rowBorder, isEven }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  // Dark mode colors - defined at component top level
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const codeBg = useColorModeValue('gray.50', 'gray.900');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const bgColor = useColorModeValue('white', 'gray.800');
  const oddRowBg = useColorModeValue('white', 'gray.800');
  const evenRowBg = useColorModeValue('gray.50', 'gray.700');

  const statusColor = getStatusColor(log.response.status, log.error);
  const statusText = log.error ? 'Error' : `${log.response.status}`;

  const handleCopyUrl = async () => {
    try {
      await callRPC('copyToClipboard', [log.endpoint]);
    } catch (error) {
      console.error('Failed to copy URL:', error);
    }
  };

  return (
    <Box
      bg={isEven ? evenRowBg : oddRowBg}
      borderBottomWidth="1px"
      borderColor={rowBorder}
      _hover={{ bg: rowHoverBg }}
      transition="background-color 0.2s"
    >
      {/* Row Header - Always Visible */}
      <Flex
        align="center"
        px={3}
        py={2}
        cursor="pointer"
        onClick={() => setIsExpanded(!isExpanded)}
        minW="0"
      >
        <HStack spacing={2} flex="1" minW="0">
          <Badge colorScheme={statusColor} fontSize="xs" flexShrink={0}>
            {statusText}
          </Badge>
          <Badge colorScheme="blue" fontSize="xs" flexShrink={0}>
            {log.method}
          </Badge>
          <Tooltip label={log.endpoint}>
            <Text 
              fontSize="sm" 
              color={headingColor} 
              flex="1" 
              minW="0"
              isTruncated
              noOfLines={1}
            >
              {log.endpoint}
            </Text>
          </Tooltip>
          <Tooltip label="Copy URL">
            <IconButton
              aria-label="Copy URL"
              icon={<CopyIcon />}
              size="xs"
              variant="ghost"
              onClick={(e) => {
                e.stopPropagation();
                handleCopyUrl();
              }}
              flexShrink={0}
            />
          </Tooltip>
          <Text fontSize="xs" color={textColor} flexShrink={0} minW="60px" textAlign="right">
            {formatDuration(log.duration)}
          </Text>
          <Text fontSize="xs" color={textColor} flexShrink={0} minW="80px" textAlign="right">
            {formatTimestamp(log.timestamp)}
          </Text>
        </HStack>
      </Flex>

      {/* Expandable Details */}
      <Collapse in={isExpanded} animateOpacity>
        <Box px={3} pb={3} pt={2} bg={codeBg}>
          <VStack align="stretch" spacing={3}>
            {/* Request */}
            {(log.request.headers || log.request.body) && (
              <Box>
                <Heading as="h5" size="xs" color={headingColor} mb={2}>
                  Request
                </Heading>
                <VStack align="stretch" spacing={2}>
                  {log.request.headers && (
                    <Box>
                      <Text fontSize="xs" color={textColor} mb={1}>
                        Headers:
                      </Text>
                      <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={bgColor} fontFamily="mono" maxH="150px" overflowY="auto">
                        {JSON.stringify(log.request.headers, null, 2)}
                      </Code>
                    </Box>
                  )}
                  {log.request.body && (() => {
                    const bodyStr: string = typeof log.request.body === 'string'
                      ? log.request.body
                      : JSON.stringify(log.request.body, null, 2);
                    return (
                      <Box>
                        <Text fontSize="xs" color={textColor} mb={1}>
                          Body:
                        </Text>
                        <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={bgColor} maxH="150px" overflowY="auto" fontFamily="mono">
                          {bodyStr}
                        </Code>
                      </Box>
                    );
                  })()}
                </VStack>
              </Box>
            )}

            {/* Response */}
            <Box>
              <Heading as="h5" size="xs" color={headingColor} mb={2}>
                Response
              </Heading>
              <VStack align="stretch" spacing={2}>
                <Text fontSize="xs" color={textColor}>
                  Status: {log.response.status}
                </Text>
                {log.response.headers && Object.keys(log.response.headers).length > 0 && (
                  <Box>
                    <Text fontSize="xs" color={textColor} mb={1}>
                      Headers:
                    </Text>
                    <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={bgColor} fontFamily="mono" maxH="150px" overflowY="auto">
                      {JSON.stringify(log.response.headers, null, 2)}
                    </Code>
                  </Box>
                )}
                {log.response.body && (() => {
                  const bodyStr: string = typeof log.response.body === 'string'
                    ? log.response.body
                    : JSON.stringify(log.response.body, null, 2);
                  return (
                    <Box>
                      <Text fontSize="xs" color={textColor} mb={1}>
                        Body:
                      </Text>
                      <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={bgColor} maxH="150px" overflowY="auto" fontFamily="mono">
                        {bodyStr}
                      </Code>
                    </Box>
                  );
                })()}
              </VStack>
            </Box>

            {/* Error */}
            {log.error && (
              <Box>
                <Heading as="h5" size="xs" color="red.500" mb={2}>
                  Error
                </Heading>
                <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={bgColor} color="red.500" fontFamily="mono">
                  {log.error}
                </Code>
              </Box>
            )}
          </VStack>
        </Box>
      </Collapse>
    </Box>
  );
};

export default NetworkTraceView;
