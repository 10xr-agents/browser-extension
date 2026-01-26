/**
 * TaskHistory Component for Thin Client Architecture
 * 
 * Displays display-only history (thought, action, usage) for UI.
 * Server owns canonical action history used for prompts.
 * 
 * Reference: THIN_CLIENT_ROADMAP.md §4.1 (Task 3: Server-Side Action Loop)
 * Reference: ENTERPRISE_PLATFORM_SPECIFICATION.md §5.7.3.8 (UI Changes)
 */

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
} from '@chakra-ui/react';
import React from 'react';
import { DisplayHistoryEntry } from '../state/currentTask';
import { useAppState } from '../state/store';
import CopyButton from './CopyButton';

type TaskHistoryItemProps = {
  index: number;
  entry: DisplayHistoryEntry;
};

const CollapsibleComponent = (props: {
  title: string;
  subtitle?: string;
  text: string;
}) => (
  <AccordionItem backgroundColor="white">
    <Heading as="h4" size="xs">
      <AccordionButton>
        <HStack flex="1">
          <Box>{props.title}</Box>
          <CopyButton text={props.text} /> <Spacer />
          {props.subtitle && (
            <Box as="span" fontSize="xs" color="gray.500" mr={4}>
              {props.subtitle}
            </Box>
          )}
        </HStack>
        <AccordionIcon />
      </AccordionButton>
    </Heading>
    <AccordionPanel>
      {props.text.split('\n').map((line, index) => (
        <Box key={index} fontSize="xs">
          {line}
          <br />
        </Box>
      ))}
    </AccordionPanel>
  </AccordionItem>
);

const TaskHistoryItem = ({ index, entry }: TaskHistoryItemProps) => {
  // Get title from thought
  const itemTitle = entry.thought || 'No thought provided';

  // Determine colors based on action type
  const colors: {
    text: ColorProps['textColor'];
    bg: BackgroundProps['bgColor'];
  } = {
    text: undefined,
    bg: undefined,
  };

  if ('error' in entry.parsedAction) {
    colors.text = 'red.800';
    colors.bg = 'red.100';
  } else if (entry.parsedAction.parsedAction.name === 'fail') {
    colors.text = 'red.800';
    colors.bg = 'red.100';
  } else if (entry.parsedAction.parsedAction.name === 'finish') {
    colors.text = 'green.800';
    colors.bg = 'green.100';
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
      <AccordionPanel backgroundColor="gray.100" p="2">
        <Accordion allowMultiple allowToggle w="full" defaultIndex={1}>
          <CollapsibleComponent
            title="Thought"
            text={entry.thought}
          />
          <CollapsibleComponent
            title="Action"
            subtitle={entry.usage ? `${totalTokens} tokens (${promptTokens} prompt + ${completionTokens} completion)` : undefined}
            text={entry.action}
          />
          {entry.usage && (
            <CollapsibleComponent
              title="Usage"
              text={JSON.stringify(entry.usage, null, 2)}
            />
          )}
          <CollapsibleComponent
            title="Parsed Action"
            text={JSON.stringify(entry.parsedAction, null, 2)}
          />
        </Accordion>
      </AccordionPanel>
    </AccordionItem>
  );
};

export default function TaskHistory() {
  const { taskHistory, taskStatus } = useAppState((state) => ({
    taskStatus: state.currentTask.status,
    taskHistory: state.currentTask.displayHistory, // Updated to use displayHistory
  }));

  if (taskHistory.length === 0 && taskStatus !== 'running') return null;

  return (
    <VStack mt={8}>
      <HStack w="full">
        <Heading as="h3" size="md">
          Action History
        </Heading>
        <Spacer />
        <Text fontSize="xs" color="gray.500">
          Display-only history. Server owns canonical history.
        </Text>
        <CopyButton text={JSON.stringify(taskHistory, null, 2)} />
      </HStack>
      <Accordion allowMultiple w="full" pb="4">
        {taskHistory.map((entry, index) => (
          <TaskHistoryItem key={index} index={index} entry={entry} />
        ))}
      </Accordion>
    </VStack>
  );
}
