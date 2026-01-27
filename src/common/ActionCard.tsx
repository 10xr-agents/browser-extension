/**
 * ActionCard Component
 * 
 * Displays browser actions (click, setValue, etc.) as user-friendly cards
 * instead of raw code strings.
 * 
 * Reference: UX Refactor - User-Centric Chat Design
 */

import React from 'react';
import {
  Box,
  HStack,
  Text,
  Icon,
  useColorModeValue,
} from '@chakra-ui/react';
import { FaMousePointer, FaKeyboard } from 'react-icons/fa';
import { DisplayHistoryEntry } from '../state/currentTask';

interface ActionCardProps {
  entry: DisplayHistoryEntry;
}

const ActionCard: React.FC<ActionCardProps> = ({ entry }) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.300');
  const iconColor = useColorModeValue('blue.500', 'blue.400');
  const descriptionColor = useColorModeValue('gray.600', 'gray.400');

  if (!entry.parsedAction || !('parsedAction' in entry.parsedAction)) {
    return null;
  }

  const action = entry.parsedAction.parsedAction;

  /**
   * Extract semantic element name from thought string
   * Looks for patterns like "click the 'Save' button" or "clicking 'Patient'"
   * Returns the quoted string if found, otherwise null
   */
  const extractElementNameFromThought = (thought: string | undefined): string | null => {
    if (!thought) return null;
    
    // Try to find quoted strings after action verbs
    // Patterns: "click the 'Button'", "clicking 'Button'", "click on 'Button'", etc.
    const patterns = [
      /(?:click|clicking|select|selecting|press|pressing)\s+(?:the|on|on the)?\s*['"`]([^'"`]+)['"`]/i,
      /['"`]([^'"`]+)['"`]\s+(?:button|link|element|field|input|tab|menu)/i,
    ];
    
    for (const pattern of patterns) {
      const match = thought.match(pattern);
      if (match && match[1]) {
        return match[1].trim();
      }
    }
    
    return null;
  };

  // Get action icon and description
  const getActionInfo = () => {
    switch (action.name) {
      case 'click': {
        const elementId = action.args && 'elementId' in action.args ? action.args.elementId : null;
        // Try to extract semantic name from thought
        const semanticName = extractElementNameFromThought(entry.thought);
        
        let description: string;
        if (semanticName) {
          // Use semantic name if found
          description = `'${semanticName}'`;
        } else if (elementId !== null && elementId !== undefined) {
          // Fall back to element ID
          description = `element #${elementId}`;
        } else {
          description = 'element';
        }
        
        return {
          icon: FaMousePointer,
          label: 'Clicking',
          description,
        };
      }
      case 'setValue': {
        const value = action.args && 'value' in action.args ? action.args.value : null;
        const elementId = action.args && 'elementId' in action.args ? action.args.elementId : null;
        
        // Try to extract field name from thought (e.g., "entering 'Jaswanth' in the 'Name' field")
        const fieldNamePattern = /(?:in|into|on|for)\s+(?:the\s+)?['"`]([^'"`]+)['"`]\s+(?:field|input|box)/i;
        const fieldMatch = entry.thought?.match(fieldNamePattern);
        const fieldName = fieldMatch && fieldMatch[1] ? fieldMatch[1].trim() : null;
        
        const valueStr = typeof value === 'string' 
          ? (value.length > 30 ? `${value.substring(0, 30)}...` : value)
          : value !== null && value !== undefined 
            ? String(value)
            : null;
        
        let description: string;
        if (fieldName && valueStr) {
          description = `"${valueStr}" in '${fieldName}'`;
        } else if (fieldName) {
          description = `in '${fieldName}'`;
        } else if (valueStr) {
          description = `"${valueStr}"`;
        } else if (elementId !== null && elementId !== undefined) {
          description = `in element #${elementId}`;
        } else {
          description = 'text';
        }
        
        return {
          icon: FaKeyboard,
          label: 'Typing',
          description,
        };
      }
      case 'finish':
        return {
          icon: null,
          label: 'Task completed',
          description: '',
        };
      case 'fail':
        return {
          icon: null,
          label: 'Task failed',
          description: '',
        };
      default:
        return {
          icon: null,
          label: action.name,
          description: action.args ? JSON.stringify(action.args) : '',
        };
    }
  };

  const { icon: ActionIcon, label, description } = getActionInfo();

  return (
    <Box
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="md"
      bg={bgColor}
      p={2}
      shadow="sm"
      w="fit-content"
      maxW="100%"
    >
      <HStack spacing={2} align="center">
        {ActionIcon && (
          <Icon as={ActionIcon} color={iconColor} boxSize={3.5} />
        )}
        <Text fontSize="xs" color={textColor} fontWeight="medium">
          {label}
        </Text>
        {description && (
          <Text fontSize="xs" color={descriptionColor}>
            {description}
          </Text>
        )}
      </HStack>
    </Box>
  );
};

export default ActionCard;
