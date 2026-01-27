/**
 * RAG Context View Component for Thin Client Architecture
 * 
 * Displays RAG (Retrieval-Augmented Generation) context and decision logic.
 * Shows why org-specific vs public-only knowledge was used.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md Part 2 §3.2 (Task 3: RAG Context Debugger)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §4.2 (RAG & Knowledge Context Debugger)
 */

import React from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Heading,
  Badge,
  Divider,
  Tooltip,
  useColorModeValue,
  Spacer,
  Code,
} from '@chakra-ui/react';
import { InfoIcon } from '@chakra-ui/icons';
import { useAppState } from '../state/store';
import CopyButton from './CopyButton';

const RAGContextView: React.FC = () => {
  const ragContext = useAppState((state) => state.debug.ragContext);
  const hasOrgKnowledge = useAppState((state) => state.currentTask.hasOrgKnowledge);

  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const infoBg = useColorModeValue('blue.50', 'blue.900/30');
  const infoText = useColorModeValue('blue.800', 'blue.200');

  // Use ragContext if available, otherwise fall back to hasOrgKnowledge from currentTask
  const context = ragContext || (hasOrgKnowledge !== null
    ? {
        hasOrgKnowledge,
        activeDomain: null,
        domainMatch: null,
        ragMode: hasOrgKnowledge ? 'org_specific' : 'public_only',
        reason: hasOrgKnowledge
          ? 'Organization-specific knowledge available'
          : 'No organization-specific knowledge. Using public knowledge only.',
        chunkCount: null,
        lastUpdated: null,
      }
    : null);

  if (!context) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
        <Text fontSize="sm" color={textColor}>
          No RAG context available. RAG context will be displayed here when knowledge is resolved.
        </Text>
      </Box>
    );
  }

  const ragModeColor = context.ragMode === 'org_specific' ? 'green' : 'yellow';
  const ragModeText = context.ragMode === 'org_specific' ? 'Organization-Specific' : 'Public Only';

  return (
    <VStack align="stretch" spacing={4}>
      <HStack>
        <Heading size="sm" color={headingColor}>
          RAG Context
        </Heading>
        <Spacer />
        <CopyButton text={JSON.stringify(context, null, 2)} />
      </HStack>
      <Divider />

      {/* RAG Mode Indicator */}
      <Box p={3} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
        <HStack spacing={2} mb={2}>
          <Badge colorScheme={ragModeColor} fontSize="sm" px={2} py={1}>
            {ragModeText}
          </Badge>
          {context.hasOrgKnowledge === true && (
            <Badge colorScheme="green" fontSize="xs">
              Org Knowledge Available
            </Badge>
          )}
          {context.hasOrgKnowledge === false && (
            <Badge colorScheme="yellow" fontSize="xs">
              Public Knowledge Only
            </Badge>
          )}
        </HStack>
        {context.reason && (
          <Text fontSize="sm" color={textColor} mt={2}>
            {context.reason}
          </Text>
        )}
      </Box>

      {/* Domain Information */}
      {context.activeDomain && (
        <Box p={3} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
          <VStack align="stretch" spacing={2}>
            <HStack>
              <Text fontSize="sm" fontWeight="bold" color={headingColor}>
                Active Domain:
              </Text>
              <Code fontSize="sm" bg={useColorModeValue('gray.100', 'gray.700')} fontFamily="mono">
                {context.activeDomain}
              </Code>
            </HStack>
            {context.domainMatch !== null && (
              <HStack>
                <Text fontSize="sm" color={textColor}>
                  Domain Match:
                </Text>
                <Badge colorScheme={context.domainMatch ? 'green' : 'yellow'} fontSize="xs">
                  {context.domainMatch ? 'Matched' : 'Not Matched'}
                </Badge>
              </HStack>
            )}
          </VStack>
        </Box>
      )}

      {/* Chunk Count */}
      {context.chunkCount !== null && (
        <Box p={3} borderWidth={1} borderRadius="md" bg={bgColor} borderColor={borderColor}>
          <HStack>
            <Text fontSize="sm" color={textColor}>
              Knowledge Chunks Retrieved:
            </Text>
            <Badge colorScheme="blue" fontSize="sm">
              {context.chunkCount}
            </Badge>
          </HStack>
        </Box>
      )}

      {/* Info Box */}
      <Box p={3} bg={infoBg} borderRadius="md" borderWidth={1} borderColor={borderColor}>
        <HStack spacing={2} mb={1}>
          <InfoIcon color={infoText} boxSize={4} />
          <Text fontSize="xs" fontWeight="bold" color={infoText}>
            RAG Decision Logic
          </Text>
        </HStack>
        <Text fontSize="xs" color={infoText} lineHeight="1.5">
          {context.ragMode === 'org_specific'
            ? 'Organization-specific knowledge is used when the active domain matches allowed_domains patterns and org-specific chunks are available for that domain.'
            : 'Public knowledge is used when the domain does not match allowed_domains, or when no org-specific chunks are available for the matched domain.'}
        </Text>
      </Box>

      {/* Last Updated */}
      {context.lastUpdated && (
        <Text fontSize="xs" color={descColor} textAlign="right">
          Last updated: {new Date(context.lastUpdated).toLocaleString()}
        </Text>
      )}
    </VStack>
  );
};

export default RAGContextView;
