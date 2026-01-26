/**
 * Hybrid Element View Component for Thin Client Architecture
 * 
 * Displays hybrid element composition (accessibility + DOM sources) in debug view.
 * Shows which elements are hybrid, their data sources, and combined properties.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §8.1 (Task 7: Hybrid Element Representation)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan, Task 4)
 */

import React from 'react';
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
  Divider,
  Spacer,
  useColorModeValue,
} from '@chakra-ui/react';
import type { HybridElement } from '../types/hybridElement';
import CopyButton from './CopyButton';

interface HybridElementViewProps {
  hybridElements: HybridElement[] | null;
}

const HybridElementItem: React.FC<{ element: HybridElement; index: number }> = ({
  element,
  index,
}) => {
  const sourceColorScheme =
    element.source === 'hybrid' ? 'purple' :
    element.source === 'accessibility' ? 'blue' :
    'gray';

  const itemBg = useColorModeValue('white', 'gray.800');
  const hoverBg = useColorModeValue('gray.50', 'gray.700');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const valueColor = useColorModeValue('gray.500', 'gray.500');
  const labelColor = useColorModeValue('gray.700', 'gray.300');

  return (
    <AccordionItem border="none" mb={2}>
      <AccordionButton
        p={3}
        bg={itemBg}
        borderRadius="md"
        borderWidth={1}
        borderColor={borderColor}
        _hover={{ bg: hoverBg }}
      >
        <HStack flex="1" align="start" spacing={3}>
          <Box>
            <HStack spacing={2} mb={1}>
              <Badge colorScheme={sourceColorScheme} fontSize="xs" fontWeight="bold">
                {element.source}
              </Badge>
              <Badge colorScheme="green" fontSize="xs">
                ID: {element.id}
              </Badge>
              {element.role && (
                <Badge colorScheme="orange" fontSize="xs">
                  {element.role}
                </Badge>
              )}
            </HStack>
            {element.name && (
              <Text fontSize="sm" fontWeight="medium" mt={1} color={textColor}>
                {element.name}
              </Text>
            )}
            {element.description && (
              <Text fontSize="xs" color={descColor} mt={0.5}>
                {element.description}
              </Text>
            )}
            {element.value && (
              <Text fontSize="xs" color={valueColor} fontStyle="italic" mt={0.5}>
                Value: {element.value}
              </Text>
            )}
          </Box>
          <Spacer />
          <Text fontSize="xs" color={valueColor}>
            #{index + 1}
          </Text>
        </HStack>
        <AccordionIcon />
      </AccordionButton>
      <AccordionPanel pb={3} pl={4}>
        <VStack align="stretch" spacing={2}>
          <Box>
            <Text fontSize="xs" fontWeight="bold" color={labelColor} mb={1}>
              Data Sources:
            </Text>
            <HStack spacing={2}>
              {element.axElement && (
                <Badge colorScheme="blue" fontSize="xs">
                  ✓ Accessibility
                </Badge>
              )}
              {element.domElement && (
                <Badge colorScheme="gray" fontSize="xs">
                  ✓ DOM
                </Badge>
              )}
              {!element.axElement && !element.domElement && (
                <Text fontSize="xs" color={valueColor}>
                  No source data
                </Text>
              )}
            </HStack>
          </Box>
          {element.axElement && (
            <Box>
              <Text fontSize="xs" fontWeight="bold" color={labelColor} mb={1}>
                Accessibility Node ID:
              </Text>
              <Text fontSize="xs" color={descColor} fontFamily="mono">
                {element.axElement.axNodeId}
              </Text>
            </Box>
          )}
          {element.backendDOMNodeId !== undefined && (
            <Box>
              <Text fontSize="xs" fontWeight="bold" color={labelColor} mb={1}>
                Backend DOM Node ID:
              </Text>
              <Text fontSize="xs" color={descColor} fontFamily="mono">
                {element.backendDOMNodeId}
              </Text>
            </Box>
          )}
          <Box>
            <Text fontSize="xs" fontWeight="bold" color={labelColor} mb={1}>
              Attributes:
            </Text>
            <Text fontSize="xs" color={descColor} fontFamily="mono" whiteSpace="pre-wrap">
              {JSON.stringify(element.attributes, null, 2)}
            </Text>
          </Box>
        </VStack>
      </AccordionPanel>
    </AccordionItem>
  );
};

const HybridElementView: React.FC<HybridElementViewProps> = ({ hybridElements }) => {
  const emptyBg = useColorModeValue('gray.50', 'gray.800');
  const emptyTextColor = useColorModeValue('gray.600', 'gray.300');
  const containerBg = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');

  if (!hybridElements || hybridElements.length === 0) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg={emptyBg} borderColor={borderColor}>
        <Text fontSize="sm" color={emptyTextColor}>
          No hybrid elements available. Using DOM-only approach.
        </Text>
      </Box>
    );
  }

  const hybridCount = hybridElements.filter((e) => e.source === 'hybrid').length;
  const accessibilityOnlyCount = hybridElements.filter((e) => e.source === 'accessibility').length;
  const domOnlyCount = hybridElements.filter((e) => e.source === 'dom').length;

  return (
    <Box p={4} borderWidth={1} borderRadius="md" bg={containerBg} borderColor={borderColor} maxH="600px" overflowY="auto">
      <VStack align="stretch" spacing={4}>
        <HStack>
          <Heading size="sm" color={headingColor}>Element Sources</Heading>
          <Spacer />
          <Badge colorScheme="purple" fontSize="xs">
            {hybridElements.length} total
          </Badge>
          <Badge colorScheme="blue" fontSize="xs">
            {hybridCount} hybrid
          </Badge>
          <Badge colorScheme="green" fontSize="xs">
            {accessibilityOnlyCount} accessibility-only
          </Badge>
          {domOnlyCount > 0 && (
            <Badge colorScheme="gray" fontSize="xs">
              {domOnlyCount} DOM-only
            </Badge>
          )}
          <CopyButton text={JSON.stringify(hybridElements, null, 2)} />
        </HStack>
        <Divider />
        <Text fontSize="xs" color={descColor}>
          Unified element representation combining accessibility tree and DOM data.
          Prefers accessibility data when available, supplements with DOM when needed.
        </Text>
        <Accordion allowMultiple allowToggle defaultIndex={[]}>
          {hybridElements.map((element, index) => (
            <HybridElementItem key={element.id} element={element} index={index} />
          ))}
        </Accordion>
      </VStack>
    </Box>
  );
};

export default HybridElementView;
