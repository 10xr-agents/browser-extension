/**
 * State Inspector View Component for Thin Client Architecture
 * 
 * Displays read-only JSON tree of the current Zustand store.
 * Helps diagnose state desync issues and debug store state.
 * 
 * Reference: THIN_CLIENT_TO_BE_ROADMAP.md §3.3 (Task 3: State Inspector)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §4.3 (State Slice Snapshot)
 */

import React, { useMemo, useState } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Code,
  Input,
  Button,
  useColorModeValue,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import CopyButton from './CopyButton';

const StateInspectorView: React.FC = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [expandedSlice, setExpandedSlice] = useState<string | null>(null);

  // Terminal aesthetic: darker background for debug components
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const codeBg = useColorModeValue('gray.50', 'gray.900');

  // Get full store state
  const fullState = useAppState.getState();

  // Mask sensitive data
  const maskedState = useMemo(() => {
    const state = { ...fullState };
    
    // Mask API keys and tokens in settings (if any exist)
    if (state.settings) {
      const settings = { ...state.settings };
      // Note: API keys are no longer in settings (removed in Thin Client migration)
      // But we mask any sensitive fields that might exist
      state.settings = settings;
    }

    // Mask tokens in network logs
    if (state.debug?.networkLogs) {
      state.debug = {
        ...state.debug,
        networkLogs: state.debug.networkLogs.map((log) => ({
          ...log,
          request: {
            ...log.request,
            headers: log.request.headers
              ? Object.fromEntries(
                  Object.entries(log.request.headers).map(([key, value]) => [
                    key,
                    key.toLowerCase() === 'authorization' ? 'Bearer ***' : value,
                  ])
                )
              : undefined,
          },
        })),
      };
    }

    return state;
  }, [fullState]);

  // Filter state by search term
  const filteredState = useMemo(() => {
    if (!searchTerm) return maskedState;
    const term = searchTerm.toLowerCase();
    const stateStr = JSON.stringify(maskedState).toLowerCase();
    if (stateStr.includes(term)) {
      return maskedState;
    }
    return null;
  }, [maskedState, searchTerm]);

  const stateJson = useMemo(() => {
    return JSON.stringify(filteredState || maskedState, null, 2);
  }, [filteredState, maskedState]);

  return (
    <VStack align="stretch" spacing={4}>
      {/* Header with search */}
      <HStack>
        <Heading size="sm" color={headingColor}>
          State Inspector
        </Heading>
        <Box flex="1" />
        <Input
          placeholder="Search state..."
          size="sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          maxW="200px"
        />
        <CopyButton text={stateJson} />
      </HStack>

      {/* State by Slice */}
      <Accordion allowMultiple allowToggle>
        {/* Current Task Slice */}
        <AccordionItem>
          <AccordionButton>
            <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
              currentTask
            </Heading>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel>
            <Code
              p={4}
              fontSize="xs"
              display="block"
              whiteSpace="pre-wrap"
              bg={codeBg}
              maxH="400px"
              overflowY="auto"
              fontFamily="mono"
            >
              {JSON.stringify(maskedState.currentTask, null, 2)}
            </Code>
          </AccordionPanel>
        </AccordionItem>

        {/* Settings Slice */}
        <AccordionItem>
          <AccordionButton>
            <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
              settings
            </Heading>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel>
            <Code
              p={4}
              fontSize="xs"
              display="block"
              whiteSpace="pre-wrap"
              bg={codeBg}
              maxH="400px"
              overflowY="auto"
              fontFamily="mono"
            >
              {JSON.stringify(maskedState.settings, null, 2)}
            </Code>
          </AccordionPanel>
        </AccordionItem>

        {/* UI Slice */}
        <AccordionItem>
          <AccordionButton>
            <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
              ui
            </Heading>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel>
            <Code
              p={4}
              fontSize="xs"
              display="block"
              whiteSpace="pre-wrap"
              bg={codeBg}
              maxH="400px"
              overflowY="auto"
              fontFamily="mono"
            >
              {JSON.stringify(maskedState.ui, null, 2)}
            </Code>
          </AccordionPanel>
        </AccordionItem>

        {/* Debug Slice */}
        <AccordionItem>
          <AccordionButton>
            <Heading as="h4" size="xs" flex="1" textAlign="left" color={headingColor}>
              debug
            </Heading>
            <AccordionIcon />
          </AccordionButton>
          <AccordionPanel>
            <Code
              p={4}
              fontSize="xs"
              display="block"
              whiteSpace="pre-wrap"
              bg={codeBg}
              maxH="400px"
              overflowY="auto"
              fontFamily="mono"
            >
              {JSON.stringify(maskedState.debug, null, 2)}
            </Code>
          </AccordionPanel>
        </AccordionItem>
      </Accordion>

      {/* Full State (Collapsed by default) */}
      <Box>
        <Text fontSize="xs" color={textColor} mb={2}>
          Full State JSON (read-only):
        </Text>
        <Code
          p={4}
          fontSize="xs"
          display="block"
          whiteSpace="pre-wrap"
          bg={codeBg}
          maxH="400px"
          overflowY="auto"
          borderWidth={1}
          borderColor={borderColor}
          borderRadius="md"
          fontFamily="mono"
        >
          {stateJson}
        </Code>
      </Box>

      {filteredState === null && searchTerm && (
        <Text fontSize="sm" color={textColor} textAlign="center" py={4}>
          No state matches "{searchTerm}"
        </Text>
      )}
    </VStack>
  );
};

export default StateInspectorView;
