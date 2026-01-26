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
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Badge,
  Code,
  Spacer,
  Button,
  Input,
  useColorModeValue,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import type { NetworkLogEntry } from '../state/debug';
import CopyButton from './CopyButton';

const NetworkTraceView: React.FC = () => {
  const networkLogs = useAppState((state) => state.debug.networkLogs);
  const clearNetworkLogs = useAppState((state) => state.debug.actions.clearNetworkLogs);
  const [searchTerm, setSearchTerm] = useState('');

  // Terminal aesthetic: darker background for debug components
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const codeBg = useColorModeValue('gray.50', 'gray.900');

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

  if (networkLogs.length === 0) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
        <Text fontSize="sm" color={textColor}>
          No network logs available. API calls will be logged here when they occur.
        </Text>
      </Box>
    );
  }

  return (
    <VStack align="stretch" spacing={4}>
      {/* Header with search and clear */}
      <HStack>
        <Heading size="sm" color={headingColor}>
          Network/API Trace
        </Heading>
        <Spacer />
        <Input
          placeholder="Search logs..."
          size="sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          maxW="200px"
        />
        <Button size="sm" onClick={clearNetworkLogs}>
          Clear Logs
        </Button>
        <CopyButton text={JSON.stringify(filteredLogs, null, 2)} />
      </HStack>

      {/* Logs List */}
      <Accordion allowMultiple allowToggle defaultIndex={[]}>
        {filteredLogs.map((log) => (
          <NetworkLogItem key={log.id} log={log} getStatusColor={getStatusColor} formatDuration={formatDuration} formatTimestamp={formatTimestamp} />
        ))}
      </Accordion>

      {filteredLogs.length === 0 && searchTerm && (
        <Text fontSize="sm" color={textColor} textAlign="center" py={4}>
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
}> = ({ log, getStatusColor, formatDuration, formatTimestamp }) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const codeBg = useColorModeValue('gray.50', 'gray.900');
  const headingColor = useColorModeValue('gray.900', 'gray.100');

  const statusColor = getStatusColor(log.response.status, log.error);
  const statusText = log.error ? 'Error' : `${log.response.status}`;

  return (
    <AccordionItem border="none" mb={2}>
      <AccordionButton
        bg={bgColor}
        borderWidth={1}
        borderColor={borderColor}
        borderRadius="md"
        _hover={{ bg: useColorModeValue('gray.50', 'gray.700') }}
      >
        <HStack flex="1" spacing={3}>
          <Badge colorScheme={statusColor} fontSize="xs">
            {statusText}
          </Badge>
          <Badge colorScheme="blue" fontSize="xs">
            {log.method}
          </Badge>
          <Text fontSize="sm" color={headingColor} flex="1" textAlign="left" isTruncated>
            {log.endpoint}
          </Text>
          <Text fontSize="xs" color={textColor}>
            {formatDuration(log.duration)}
          </Text>
          <Text fontSize="xs" color={textColor}>
            {formatTimestamp(log.timestamp)}
          </Text>
          <AccordionIcon />
        </HStack>
      </AccordionButton>
      <AccordionPanel bg={codeBg} p={4}>
        <VStack align="stretch" spacing={3}>
          {/* Request */}
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
                    <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={bgColor} fontFamily="mono">
                      {JSON.stringify(log.request.headers, null, 2)}
                    </Code>
                </Box>
              )}
              {log.request.body ? (() => {
                const bodyStr: string = typeof log.request.body === 'string'
                  ? log.request.body
                  : JSON.stringify(log.request.body, null, 2);
                return (
                  <Box>
                    <Text fontSize="xs" color={textColor} mb={1}>
                      Body:
                    </Text>
                    <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={bgColor} maxH="200px" overflowY="auto" fontFamily="mono">
                      {bodyStr}
                    </Code>
                  </Box>
                );
              })() : null}
            </VStack>
          </Box>

          {/* Response */}
          <Box>
            <Heading as="h5" size="xs" color={headingColor} mb={2}>
              Response
            </Heading>
            <VStack align="stretch" spacing={2}>
              <HStack>
                <Text fontSize="xs" color={textColor}>
                  Status: {log.response.status}
                </Text>
                {log.response.headers && Object.keys(log.response.headers).length > 0 && (
                  <>
                    <Text fontSize="xs" color={textColor}>
                      Headers:
                    </Text>
                    <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={bgColor} fontFamily="mono">
                      {JSON.stringify(log.response.headers, null, 2)}
                    </Code>
                  </>
                )}
              </HStack>
              {log.response.body ? (() => {
                const bodyStr: string = typeof log.response.body === 'string'
                  ? log.response.body
                  : JSON.stringify(log.response.body, null, 2);
                return (
                  <Box>
                    <Text fontSize="xs" color={textColor} mb={1}>
                      Body:
                    </Text>
                    <Code p={2} fontSize="xs" display="block" whiteSpace="pre-wrap" bg={bgColor} maxH="200px" overflowY="auto" fontFamily="mono">
                      {bodyStr}
                    </Code>
                  </Box>
                );
              })() : null}
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

          {/* Metadata */}
          <Box>
            <Text fontSize="xs" color={textColor}>
              Duration: {formatDuration(log.duration)} | Timestamp: {formatTimestamp(log.timestamp)}
            </Text>
          </Box>
        </VStack>
      </AccordionPanel>
    </AccordionItem>
  );
};

export default NetworkTraceView;
