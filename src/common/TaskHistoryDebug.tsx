/**
 * Task History Debug View Component for Thin Client Architecture
 * 
 * Full technical debug view showing all details: tokens, parsed action JSON,
 * raw LLM thoughts/reasoning, execution timestamps, error stack traces.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md Part 2 §1.2 (Task 1: Task History Refactor)
 * Reference: DEBUG_VIEW_IMPROVEMENTS.md §2.3 (Task History Refactor - Debug View)
 */

import React from 'react';
import {
  VStack,
  HStack,
  Box,
  Accordion,
  AccordionItem,
  Heading,
  AccordionButton,
  AccordionPanel,
  AccordionIcon,
  Spacer,
  ColorProps,
  BackgroundProps,
  Text,
  useColorModeValue,
  Code,
  Badge,
} from '@chakra-ui/react';
import { useAppState } from '../state/store';
import { DisplayHistoryEntry } from '../state/currentTask';
import CopyButton from './CopyButton';

type TaskHistoryItemProps = {
  index: number;
  entry: DisplayHistoryEntry;
};

const CollapsibleComponent = (props: {
  title: string;
  subtitle?: string;
  text: string;
}) => {
  const bgColor = useColorModeValue('white', 'gray.800');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const subtitleColor = useColorModeValue('gray.500', 'gray.400');
  
  return (
    <AccordionItem bg={bgColor} _dark={{ bg: 'gray.800' }}>
      <Heading as="h4" size="xs">
        <AccordionButton>
          <HStack flex="1">
            <Box color={textColor}>{props.title}</Box>
            <CopyButton text={props.text} /> <Spacer />
            {props.subtitle && (
              <Box as="span" fontSize="xs" color={subtitleColor} mr={4}>
                {props.subtitle}
              </Box>
            )}
          </HStack>
          <AccordionIcon />
        </AccordionButton>
      </Heading>
      <AccordionPanel>
        <Box
          fontSize="xs"
          color={textColor}
          fontFamily="mono"
          whiteSpace="pre-wrap"
        >
          {props.text}
        </Box>
      </AccordionPanel>
    </AccordionItem>
  );
};

const TaskHistoryItem = ({ index, entry }: TaskHistoryItemProps) => {
  // Use hooks at component level, not conditionally
  // NOTE: All hooks MUST be called before any early returns to comply with Rules of Hooks
  const errorTextColor = useColorModeValue('red.800', 'red.300');
  const errorBgColor = useColorModeValue('red.100', 'red.900/30');
  const successTextColor = useColorModeValue('green.800', 'green.300');
  const successBgColor = useColorModeValue('green.100', 'green.900/30');
  const panelBg = useColorModeValue('gray.100', 'gray.800');
  
  // Expected outcome colors (for conditional rendering)
  const expectedOutcomeBg = useColorModeValue('blue.50', 'blue.900/20');
  const expectedOutcomeTextColor = useColorModeValue('blue.800', 'blue.200');
  const expectedOutcomeCodeBg = useColorModeValue('white', 'gray.800');
  const expectedOutcomeCodeColor = useColorModeValue('blue.900', 'blue.200');

  // GUARD CLAUSE: Return null if entry is undefined or null
  // This must come AFTER all hooks are called
  if (!entry) return null;

  // Get title from thought - ensure it's always a string
  const itemTitle = String(entry.thought || 'No thought provided');

  // Determine colors based on action type with dark mode support
  const colors: {
    text: ColorProps['textColor'];
    bg: BackgroundProps['bgColor'];
  } = {
    text: undefined,
    bg: undefined,
  };

  // Check if parsedAction exists before accessing it
  if (entry.parsedAction) {
    if ('error' in entry.parsedAction) {
      colors.text = errorTextColor;
      colors.bg = errorBgColor;
    } else if ('parsedAction' in entry.parsedAction) {
      if (entry.parsedAction.parsedAction.name === 'fail') {
        colors.text = errorTextColor;
        colors.bg = errorBgColor;
      } else if (entry.parsedAction.parsedAction.name === 'finish') {
        colors.text = successTextColor;
        colors.bg = successBgColor;
      }
    }
  }

  // Format usage tokens
  const promptTokens = entry.usage?.promptTokens || 0;
  const completionTokens = entry.usage?.completionTokens || 0;
  const totalTokens = promptTokens + completionTokens;

  return (
    <AccordionItem>
      <Heading as="h3" size="sm" textColor={colors.text} bgColor={colors.bg}>
        <AccordionButton>
          <Box mr="4" fontWeight="bold">
            {index + 1}.
          </Box>
          <Box as="span" textAlign="left" flex="1">
            {itemTitle}
          </Box>
          <AccordionIcon />
        </AccordionButton>
      </Heading>
      <AccordionPanel 
        bg={panelBg} 
        p="2"
      >
        <Accordion allowMultiple w="full" defaultIndex={1}>
          <CollapsibleComponent
            title="Thought"
            text={String(entry.thought || '')}
          />
          <CollapsibleComponent
            title="Action"
            subtitle={entry.usage ? `${totalTokens} tokens (${promptTokens} prompt + ${completionTokens} completion)` : undefined}
            text={String(entry.action || '')}
          />
          {entry.expectedOutcome && (
            <AccordionItem bg={expectedOutcomeBg} _dark={{ bg: 'blue.900/20' }}>
              <Heading as="h4" size="xs">
                <AccordionButton>
                  <HStack flex="1">
                    <Box color={expectedOutcomeTextColor} fontWeight="medium">
                      Expected Outcome
                    </Box>
                    <Badge colorScheme="blue" fontSize="xs">
                      For Verification
                    </Badge>
                    <Spacer />
                  </HStack>
                  <AccordionIcon />
                </AccordionButton>
              </Heading>
              <AccordionPanel>
                <Code
                  p={2}
                  fontSize="xs"
                  display="block"
                  whiteSpace="pre-wrap"
                  bg={expectedOutcomeCodeBg}
                  fontFamily="mono"
                  color={expectedOutcomeCodeColor}
                >
                  {String(entry.expectedOutcome || '')}
                </Code>
              </AccordionPanel>
            </AccordionItem>
          )}
          {entry.usage && (
            <CollapsibleComponent
              title="Usage"
              text={JSON.stringify(entry.usage, null, 2)}
            />
          )}
          <CollapsibleComponent
            title="Parsed Action"
            text={entry.parsedAction ? JSON.stringify(entry.parsedAction, null, 2) : 'No parsed action available'}
          />
        </Accordion>
      </AccordionPanel>
    </AccordionItem>
  );
};

export default function TaskHistoryDebug() {
  // Split selectors to avoid creating new objects on every render (prevents infinite loops)
  const taskHistory = useAppState((state) => state.currentTask.displayHistory);
  const taskStatus = useAppState((state) => state.currentTask.status);
  
  const headingColor = useColorModeValue('gray.900', 'gray.100');
  const subtitleColor = useColorModeValue('gray.500', 'gray.400');

  if (taskHistory.length === 0 && taskStatus !== 'running') return null;

  return (
    <VStack mt={4}>
      <HStack w="full">
        <Heading as="h3" size="md" color={headingColor}>
          Raw Logs
        </Heading>
        <Spacer />
        <Text fontSize="xs" color={subtitleColor}>
          Technical debug information
        </Text>
        <CopyButton text={JSON.stringify(taskHistory, null, 2)} />
      </HStack>
      <Accordion allowMultiple w="full" pb="4">
        {taskHistory.map((entry, index) => {
          // GUARD CLAUSE: Return null if entry is undefined or null
          if (!entry) return null;
          
          return <TaskHistoryItem key={index} index={index} entry={entry} />;
        })}
      </Accordion>
    </VStack>
  );
}
