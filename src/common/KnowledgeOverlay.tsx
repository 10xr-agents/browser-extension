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
  useColorModeValue,
} from '@chakra-ui/react';
import { apiClient, type ResolveKnowledgeResponse } from '../api/client';

interface KnowledgeOverlayProps {
  url: string;
}

export const KnowledgeOverlay: React.FC<KnowledgeOverlayProps> = ({ url }) => {
  const [knowledge, setKnowledge] = useState<ResolveKnowledgeResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchKnowledge = async () => {
      if (!url) return;
      
      setLoading(true);
      setError(null);
      
      try {
        const response = await apiClient.knowledgeResolve(url);
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
  }, [url]);

  const loadingTextColor = useColorModeValue('gray.600', 'gray.300');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const labelColor = useColorModeValue('gray.700', 'gray.300');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const citationBg = useColorModeValue('gray.50', 'gray.800');

  if (loading) {
    return (
      <Box p={4}>
        <VStack spacing={2}>
          <Spinner size="md" />
          <Text fontSize="sm" color={loadingTextColor}>
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

  // If no org knowledge and no context, return null (banner in App.tsx handles messaging)
  if (!knowledge.hasOrgKnowledge && knowledge.context.length === 0) {
    return null;
  }

  // If no context but hasOrgKnowledge is true (empty results), return null
  if (knowledge.context.length === 0) {
    return null;
  }

  return (
    <Box p={4} maxH="500px" overflowY="auto">
      <VStack spacing={4} align="stretch">
        <Box>
          <Heading size="sm" mb={2} color={headingColor}>
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
          <Text fontSize="xs" color={descColor} mt={1}>
            Domain: {knowledge.domain}
          </Text>
        </Box>

        <Divider />

        <Accordion allowToggle>
          {knowledge.context.map((chunk, index) => (
            <AccordionItem key={chunk.id || index} borderWidth={1} borderRadius="md" mb={2} borderColor={borderColor}>
              <AccordionButton>
                <Box flex="1" textAlign="left">
                  <Text fontSize="sm" fontWeight="bold" color={headingColor}>
                    {chunk.documentTitle}
                  </Text>
                </Box>
                <AccordionIcon />
              </AccordionButton>
              <AccordionPanel pb={4}>
                <Text fontSize="sm" whiteSpace="pre-wrap" color={headingColor}>
                  {chunk.content}
                </Text>
                {chunk.metadata && Object.keys(chunk.metadata).length > 0 && (
                  <Box mt={2} pt={2} borderTopWidth={1} borderColor={borderColor}>
                    <Text fontSize="xs" color={descColor} fontStyle="italic">
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
              <Text fontSize="sm" fontWeight="bold" mb={2} color={headingColor}>
                Sources
              </Text>
              <VStack spacing={1} align="stretch">
                {knowledge.citations.map((citation, index) => (
                  <Box key={index} p={2} bg={citationBg} borderRadius="md">
                    <Text fontSize="xs" fontWeight="medium" color={headingColor}>
                      {citation.documentTitle}
                    </Text>
                    {citation.section && (
                      <Text fontSize="xs" color={descColor}>
                        Section: {citation.section}
                      </Text>
                    )}
                    {citation.page !== undefined && (
                      <Text fontSize="xs" color={descColor}>
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
