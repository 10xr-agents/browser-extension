/**
 * Accessibility Tree View Component for Thin Client Architecture
 * 
 * Displays accessibility tree structure in an expandable tree view.
 * Used for validation and debugging of accessibility tree extraction.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §5.1 (Task 4: Basic Accessibility Tree Extraction)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §3.6.5 (Implementation Plan)
 */

import React, { useState } from 'react';
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
} from '@chakra-ui/react';
import type { AccessibilityTree, AXNode } from '../types/accessibility';
import CopyButton from './CopyButton';

interface AccessibilityTreeViewProps {
  tree: AccessibilityTree | null;
}

interface TreeNodeProps {
  node: AXNode;
  allNodes: AXNode[];
  level: number;
}

const TreeNode: React.FC<TreeNodeProps> = ({ node, allNodes, level }) => {
  const [isExpanded, setIsExpanded] = useState(level < 2); // Auto-expand first 2 levels

  const children = node.childIds
    ? allNodes.filter((n) => node.childIds?.includes(n.nodeId))
    : [];

  const role = node.role?.value || node.chromeRole?.value || 'unknown';
  const name = node.name?.value || '';
  const description = node.description?.value || '';
  const value = node.value?.value || '';
  const isIgnored = node.ignored === true;

  return (
    <Box pl={level * 4} borderLeftWidth={level > 0 ? 1 : 0} borderColor="gray.200">
      <AccordionItem border="none" mb={1}>
        <AccordionButton
          p={2}
          bg={isIgnored ? 'gray.50' : 'white'}
          borderRadius="md"
          _hover={{ bg: isIgnored ? 'gray.100' : 'gray.50' }}
        >
          <HStack flex="1" align="start" spacing={2}>
            <Box>
              <HStack spacing={2}>
                <Badge
                  colorScheme={isIgnored ? 'gray' : 'blue'}
                  fontSize="xs"
                  fontWeight="bold"
                >
                  {role}
                </Badge>
                {isIgnored && (
                  <Badge colorScheme="gray" fontSize="xs">
                    ignored
                  </Badge>
                )}
              </HStack>
              {name && (
                <Text fontSize="sm" fontWeight="medium" mt={1}>
                  {name}
                </Text>
              )}
              {description && (
                <Text fontSize="xs" color="gray.600" mt={0.5}>
                  {description}
                </Text>
              )}
              {value && (
                <Text fontSize="xs" color="gray.500" fontStyle="italic" mt={0.5}>
                  Value: {value}
                </Text>
              )}
            </Box>
            <Spacer />
            {children.length > 0 && (
              <Text fontSize="xs" color="gray.500">
                {children.length} child{children.length !== 1 ? 'ren' : ''}
              </Text>
            )}
          </HStack>
          {children.length > 0 && <AccordionIcon />}
        </AccordionButton>
        {children.length > 0 && (
          <AccordionPanel pb={2} pl={4}>
            <VStack align="stretch" spacing={1}>
              {children.map((child) => (
                <TreeNode
                  key={child.nodeId}
                  node={child}
                  allNodes={allNodes}
                  level={level + 1}
                />
              ))}
            </VStack>
          </AccordionPanel>
        )}
      </AccordionItem>
    </Box>
  );
};

const AccessibilityTreeView: React.FC<AccessibilityTreeViewProps> = ({ tree }) => {
  if (!tree || !tree.nodes || tree.nodes.length === 0) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg="gray.50">
        <Text fontSize="sm" color="gray.600">
          No accessibility tree available. Using DOM fallback.
        </Text>
      </Box>
    );
  }

  const rootNode = tree.rootNodeId
    ? tree.nodes.find((n) => n.nodeId === tree.rootNodeId)
    : tree.nodes.find((n) => !n.parentId);

  if (!rootNode) {
    return (
      <Box p={4} borderWidth={1} borderRadius="md" bg="yellow.50">
        <Text fontSize="sm" color="yellow.800">
          Accessibility tree has no root node.
        </Text>
      </Box>
    );
  }

  return (
    <Box p={4} borderWidth={1} borderRadius="md" bg="white" maxH="600px" overflowY="auto">
      <VStack align="stretch" spacing={4}>
        <HStack>
          <Heading size="sm">Accessibility Tree</Heading>
          <Spacer />
          <Badge colorScheme="green" fontSize="xs">
            {tree.nodes.length} nodes
          </Badge>
          <CopyButton text={JSON.stringify(tree, null, 2)} />
        </HStack>
        <Divider />
        <Text fontSize="xs" color="gray.600">
          Expandable tree view of accessibility nodes. Used for validation and debugging.
        </Text>
        <Accordion allowMultiple allowToggle defaultIndex={[0]}>
          <TreeNode node={rootNode} allNodes={tree.nodes} level={0} />
        </Accordion>
      </VStack>
    </Box>
  );
};

export default AccessibilityTreeView;
