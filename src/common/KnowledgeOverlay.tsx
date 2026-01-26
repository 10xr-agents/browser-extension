/**
 * Knowledge Overlay Component for Thin Client Architecture
 * 
 * Displays knowledge context and citations from GET /api/knowledge/resolve.
 * Shows context chunks, citations, and handles error states.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §3.1 (Task 2: Runtime Knowledge Resolution)
 * Reference: SERVER_SIDE_AGENT_ARCH.md §5 (GET /api/knowledge/resolve)
 */

import React, { useEffect, useState } from 'react';
import {
  Box,
  VStack,
  Text,
  Heading,
  Divider,
  Badge,
  Alert,
  AlertIcon,
  Spinner,
  Accordion,
  AccordionItem,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
} from '@chakra-ui/react';
import { apiClient, type ResolveKnowledgeResponse } from '../api/client';

interface KnowledgeOverlayProps {
  url: string;
  query?: string;
}

export const KnowledgeOverlay: React.FC<KnowledgeOverlayProps> = ({ url, query }) => {
  const [knowledge, setKnowledge] = useState<ResolveKnowledgeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchKnowledge = async () => {
      if (!url) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await apiClient.knowledgeResolve(url, query);
        setKnowledge(response);
      } catch (err) {
        if (err instanceof Error) {
          if (err.message === 'DOMAIN_NOT_ALLOWED') {
            setError('This domain is not in your organization\'s allowed list.');
          } else if (err.message === 'UNAUTHORIZED') {
            setError('Please log in to view knowledge for this page.');
          } else {
            setError(`Failed to load knowledge: ${err.message}`);
          }
        } else {
          setError('Failed to load knowledge for this page.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchKnowledge();
  }, [url, query]);

  if (loading) {
    return (
      <Box p={4}>
        <VStack spacing={2}>
          <Spinner size="md" />
          <Text fontSize="sm" color="gray.600">
            Loading knowledge...
          </Text>
        </VStack>
      </Box>
    );
  }

  if (error) {
    return (
      <Alert status="warning" borderRadius="md">
        <AlertIcon />
        <Text fontSize="sm">{error}</Text>
      </Alert>
    );
  }

  if (!knowledge) {
    return null;
  }

  // Show message if no org knowledge (public-only)
  if (!knowledge.hasOrgKnowledge && knowledge.context.length === 0) {
    return (
      <Box p={4}>
        <Alert status="info" borderRadius="md">
          <AlertIcon />
          <VStack align="start" spacing={1}>
            <Text fontSize="sm" fontWeight="bold">
              No knowledge available for this website
            </Text>
            <Text fontSize="xs" color="gray.600">
              All suggestions are based on publicly available information only.
            </Text>
          </VStack>
        </Alert>
      </Box>
    );
  }

  // Show message if no context but hasOrgKnowledge is true (empty results)
  if (knowledge.context.length === 0) {
    return (
      <Box p={4}>
        <Text fontSize="sm" color="gray.600">
          No knowledge available for this page.
        </Text>
      </Box>
    );
  }

  return (
    <Box p={4} maxH="500px" overflowY="auto">
      <VStack spacing={4} align="stretch">
        <Box>
          <Heading size="sm" mb={2}>
            Relevant Knowledge
          </Heading>
          {knowledge.hasOrgKnowledge ? (
            <Badge colorScheme="green" fontSize="xs">
              Organization Knowledge
            </Badge>
          ) : (
            <Badge colorScheme="blue" fontSize="xs">
              Public Knowledge
            </Badge>
          )}
          <Text fontSize="xs" color="gray.600" mt={1}>
            Domain: {knowledge.domain}
          </Text>
        </Box>

        <Divider />

        <Accordion allowToggle>
          {knowledge.context.map((chunk, index) => (
            <AccordionItem key={chunk.id || index} borderWidth={1} borderRadius="md" mb={2}>
              <AccordionButton>
                <Box flex="1" textAlign="left">
                  <Text fontSize="sm" fontWeight="bold">
                    {chunk.documentTitle}
                  </Text>
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4}>
                <Text fontSize="sm" whiteSpace="pre-wrap">
                  {chunk.content}
                </Text>
                {chunk.metadata && Object.keys(chunk.metadata).length > 0 && (
                  <Box mt={2} pt={2} borderTopWidth={1}>
                    <Text fontSize="xs" color="gray.600" fontStyle="italic">
                      Metadata: {JSON.stringify(chunk.metadata, null, 2)}
                    </Text>
                  </Box>
                )}
              </AccordionPanel>
            </AccordionItem>
          ))}
        </Accordion>

        {knowledge.citations && knowledge.citations.length > 0 && (
          <>
            <Divider />
            <Box>
              <Text fontSize="sm" fontWeight="bold" mb={2}>
                Sources
              </Text>
              <VStack spacing={1} align="stretch">
                {knowledge.citations.map((citation, index) => (
                  <Box key={index} p={2} bg="gray.50" borderRadius="md">
                    <Text fontSize="xs" fontWeight="medium">
                      {citation.documentTitle}
                    </Text>
                    {citation.section && (
                      <Text fontSize="xs" color="gray.600">
                        Section: {citation.section}
                      </Text>
                    )}
                    {citation.page !== undefined && (
                      <Text fontSize="xs" color="gray.600">
                        Page: {citation.page}
                      </Text>
                    )}
                  </Box>
                ))}
              </VStack>
            </Box>
          </>
        )}
      </VStack>
    </Box>
  );
};

export default KnowledgeOverlay;
