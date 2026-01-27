/**
 * UserInputPrompt Component (Cursor/Manus Style)
 * 
 * Minimal inline prompt for user input.
 * Uses subtle border and clean typography instead of heavy alerts.
 * 
 * Reference: Cursor/Manus minimalist design aesthetic
 */

import React from 'react';
import {
  Box,
  VStack,
  Text,
  HStack,
  useColorModeValue,
  Icon,
} from '@chakra-ui/react';
import { FiHelpCircle } from 'react-icons/fi';

interface UserInputPromptProps {
  question: string;
  missingInformation?: Array<{
    field: string;
    type: 'EXTERNAL_KNOWLEDGE' | 'PRIVATE_DATA';
    description: string;
  }>;
  reasoning?: string;
}

const UserInputPrompt: React.FC<UserInputPromptProps> = ({
  question,
  missingInformation = [],
  reasoning,
}) => {
  // Color definitions - ALL at component top level
  const borderColor = useColorModeValue('yellow.400', 'yellow.600');
  const iconColor = useColorModeValue('yellow.500', 'yellow.400');
  const textColor = useColorModeValue('gray.800', 'gray.200');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const fieldColor = useColorModeValue('gray.700', 'gray.300');
  const tagColor = useColorModeValue('gray.500', 'gray.500');

  const safeQuestion = typeof question === 'string' 
    ? question 
    : String(question || 'I need some additional information.');

  return (
    <Box
      borderLeftWidth="2px"
      borderLeftColor={borderColor}
      pl={3}
      py={2}
    >
      <VStack align="stretch" spacing={2}>
        {/* Header */}
        <HStack spacing={2}>
          <Icon as={FiHelpCircle} boxSize={4} color={iconColor} />
          <Text fontSize="sm" fontWeight="medium" color={textColor}>
            Need your input
          </Text>
        </HStack>
        
        {/* Question */}
        <Text fontSize="sm" color={textColor} lineHeight="1.6">
          {safeQuestion}
        </Text>

        {/* Missing information (minimal list) */}
        {Array.isArray(missingInformation) && missingInformation.length > 0 && (
          <Box>
            <Text fontSize="xs" color={descColor} mb={1}>
              Please provide:
            </Text>
            <VStack align="stretch" spacing={0.5} pl={2}>
              {missingInformation
                .filter((info) => info && typeof info === 'object' && 'field' in info)
                .map((info, index) => {
                  const fieldName = typeof info === 'string' ? info : (info.field || '');
                  const isExternal = info.type === 'EXTERNAL_KNOWLEDGE';
                  
                  return (
                    <HStack key={index} spacing={2}>
                      <Text fontSize="xs" color={fieldColor}>
                        • {fieldName}
                      </Text>
                      {isExternal && (
                        <Text fontSize="xs" color={tagColor} fontStyle="italic">
                          (can search)
                        </Text>
                      )}
                    </HStack>
                  );
                })}
            </VStack>
          </Box>
        )}

        {/* Reasoning (optional, subtle) */}
        {reasoning && typeof reasoning === 'string' && reasoning.trim().length > 0 && (
          <Text fontSize="xs" color={descColor} fontStyle="italic">
            {reasoning}
          </Text>
        )}
      </VStack>
    </Box>
  );
};

export default UserInputPrompt;
