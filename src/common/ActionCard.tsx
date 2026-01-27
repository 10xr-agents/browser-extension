/**
 * ActionCard Component (Cursor/Manus Style)
 * 
 * Minimal inline action display - no cards, no shadows, no borders.
 * Uses HStack layout: Icon | Action Description | Spacer | Status Icon
 * 
 * Reference: Cursor/Manus minimalist design aesthetic
 */

import React from 'react';
import {
  HStack,
  Text,
  Icon,
  Spacer,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiMousePointer, FiType, FiCheck, FiX, FiChevronRight } from 'react-icons/fi';
import { DisplayHistoryEntry } from '../state/currentTask';

interface ActionCardProps {
  entry: DisplayHistoryEntry;
  compact?: boolean; // For timeline view (even more minimal)
}

const ActionCard: React.FC<ActionCardProps> = ({ entry, compact = false }) => {
  // Color definitions - ALL at component top level
  const textColor = useColorModeValue('gray.600', 'gray.400');
  const iconColor = useColorModeValue('gray.400', 'gray.500');
  const successColor = useColorModeValue('green.500', 'green.400');
  const errorColor = useColorModeValue('red.500', 'red.400');
  const hoverBg = useColorModeValue('gray.50', 'gray.800');
  const descriptionColor = useColorModeValue('gray.500', 'gray.500');

  // CRITICAL SAFETY CHECKS
  if (!entry) {
    return null;
  }
  
  if (!entry.parsedAction) {
    return null;
  }
  
  if (!('parsedAction' in entry.parsedAction)) {
    return null;
  }

  const action = entry.parsedAction.parsedAction;
  
  if (!action || typeof action !== 'object') {
    return null;
  }
  
  if (!('name' in action) || typeof action.name !== 'string') {
    return null;
  }

  /**
   * Extract semantic element name from thought string
   */
  const extractElementNameFromThought = (thought: string | undefined): string | null => {
    if (!thought) return null;
    
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
        const semanticName = extractElementNameFromThought(entry.thought);
        
        let description: string;
        if (semanticName) {
          description = `Clicked '${semanticName}'`;
        } else if (elementId !== null && elementId !== undefined) {
          description = `Clicked element #${elementId}`;
        } else {
          description = 'Clicked element';
        }
        
        return { icon: FiMousePointer, description };
      }
      case 'setValue': {
        const value = action.args && 'value' in action.args ? action.args.value : null;
        const elementId = action.args && 'elementId' in action.args ? action.args.elementId : null;
        
        const fieldNamePattern = /(?:in|into|on|for)\s+(?:the\s+)?['"`]([^'"`]+)['"`]\s+(?:field|input|box)/i;
        const fieldMatch = entry.thought?.match(fieldNamePattern);
        const fieldName = fieldMatch && fieldMatch[1] ? fieldMatch[1].trim() : null;
        
        const valueStr = typeof value === 'string' 
          ? (value.length > 20 ? `${value.substring(0, 20)}...` : value)
          : value !== null && value !== undefined 
            ? String(value)
            : null;
        
        let description: string;
        if (fieldName && valueStr) {
          description = `Typed "${valueStr}" in '${fieldName}'`;
        } else if (valueStr) {
          description = `Typed "${valueStr}"`;
        } else if (fieldName) {
          description = `Typed in '${fieldName}'`;
        } else if (elementId !== null && elementId !== undefined) {
          description = `Typed in element #${elementId}`;
        } else {
          description = 'Typed text';
        }
        
        return { icon: FiType, description };
      }
      case 'finish':
        return { icon: FiCheck, description: 'Task completed' };
      case 'fail':
        return { icon: FiX, description: 'Task failed' };
      default:
        return { 
          icon: FiChevronRight, 
          description: action.args 
            ? `${action.name}(${JSON.stringify(action.args).slice(0, 30)}...)` 
            : action.name 
        };
    }
  };

  const { icon: ActionIcon, description } = getActionInfo();
  const isSuccess = action.name === 'finish';
  const isError = action.name === 'fail';

  const safeDescription = typeof description === 'string' ? description : String(description || '');

  return (
    <HStack
      spacing={2}
      py={compact ? 0.5 : 1}
      px={compact ? 0 : 1}
      borderRadius="sm"
      transition="background 0.15s ease"
      _hover={{ bg: compact ? 'transparent' : hoverBg }}
      cursor="default"
      w="100%"
    >
      {/* Action Icon */}
      <Icon 
        as={ActionIcon} 
        boxSize={compact ? 3 : 3.5} 
        color={isSuccess ? successColor : isError ? errorColor : iconColor}
        flexShrink={0}
      />
      
      {/* Action Description */}
      <Text 
        fontSize={compact ? 'xs' : 'sm'} 
        color={isSuccess ? successColor : isError ? errorColor : textColor}
        noOfLines={1}
        flex="1"
      >
        {safeDescription}
      </Text>
      
      <Spacer />
      
      {/* Status Icon */}
      {!isError && !isSuccess && (
        <Icon 
          as={FiCheck} 
          boxSize={compact ? 3 : 3.5} 
          color={successColor}
          flexShrink={0}
        />
      )}
    </HStack>
  );
};

export default ActionCard;
