/**
 * TaskStatusIndicator - Compact status in chat (icon + optional motion)
 *
 * Shows running / completed / failed / stopped via a small icon and optional
 * Framer Motion animation. Sits inline with the input bar.
 */

import React, { useMemo } from 'react';
import { Box, HStack, Text, Icon, useColorModeValue } from '@chakra-ui/react';
import { motion, AnimatePresence } from 'framer-motion';
import { FiCheckCircle, FiAlertCircle, FiStopCircle } from 'react-icons/fi';
import { useAppState } from '../../state/store';

type ActionStatus =
  | 'idle'
  | 'attaching-debugger'
  | 'pulling-dom'
  | 'transforming-dom'
  | 'performing-query'
  | 'performing-action'
  | 'waiting';

const ACTION_LABELS: Record<ActionStatus, string> = {
  idle: 'Running…',
  'attaching-debugger': 'Connecting…',
  'pulling-dom': 'Reading page…',
  'transforming-dom': 'Processing…',
  'performing-query': 'Thinking…',
  'performing-action': 'Doing…',
  waiting: 'Waiting…',
};

const dotTransition = { duration: 1.2, repeat: Infinity, ease: 'easeInOut' as const };

export default function TaskStatusIndicator() {
  const taskStatus = useAppState((state) => state.currentTask.status);
  const actionStatus = useAppState((state) => state.currentTask.actionStatus);
  const displayHistoryRaw = useAppState((state) => state.currentTask.displayHistory);
  const displayHistory = Array.isArray(displayHistoryRaw) ? displayHistoryRaw : [];

  const lastError = useMemo(() => {
    if (displayHistory.length === 0) return null;
    const last = displayHistory[displayHistory.length - 1];
    if (!last?.parsedAction || !('error' in last.parsedAction)) return null;
    const err = last.parsedAction.error;
    return typeof err === 'string' ? err : String(err ?? '');
  }, [displayHistory]);

  const runningColor = useColorModeValue('blue.500', 'blue.300');
  const successColor = useColorModeValue('green.500', 'green.400');
  const errorColor = useColorModeValue('red.500', 'red.400');
  const stoppedColor = useColorModeValue('orange.500', 'orange.400');
  const textMuted = useColorModeValue('gray.500', 'gray.400');

  const hasContent =
    taskStatus !== 'idle' ||
    (displayHistory.length > 0);
  if (!hasContent || taskStatus === 'idle') return null;

  if (taskStatus === 'running') {
    const label =
      actionStatus !== 'idle'
        ? ACTION_LABELS[actionStatus as ActionStatus]
        : ACTION_LABELS.idle;
    return (
      <HStack spacing={1.5} flexShrink={0} pb={1}>
        <HStack spacing={0.5} as="span" aria-hidden>
          {[0, 1, 2].map((i) => (
            <motion.span
              key={i}
              animate={{
                opacity: [0.4, 1, 0.4],
                scale: [0.85, 1.15, 0.85],
              }}
              transition={{
                ...dotTransition,
                delay: i * 0.15,
              }}
              style={{
                width: 5,
                height: 5,
                borderRadius: '50%',
                backgroundColor: runningColor,
                display: 'inline-block',
              }}
            />
          ))}
        </HStack>
        <Text fontSize="xs" color={textMuted} fontWeight="medium" noOfLines={1}>
          {typeof label === 'string' ? label : String(label || 'Running…')}
        </Text>
      </HStack>
    );
  }

  if (taskStatus === 'success') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <HStack spacing={1.5} flexShrink={0} pb={1} as="span">
            <Icon as={FiCheckCircle} boxSize="4" color={successColor} aria-label="Task completed" />
            <Text fontSize="xs" color={textMuted} fontWeight="medium">
              Done
            </Text>
          </HStack>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (taskStatus === 'error') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <HStack spacing={1.5} flexShrink={0} pb={1} as="span" title={lastError || undefined}>
            <Icon as={FiAlertCircle} boxSize="4" color={errorColor} aria-label="Task failed" />
            <Text fontSize="xs" color={errorColor} fontWeight="medium" noOfLines={1}>
              Failed
            </Text>
          </HStack>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (taskStatus === 'interrupted') {
    return (
      <AnimatePresence>
        <motion.div
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        >
          <HStack spacing={1.5} flexShrink={0} pb={1} as="span">
            <Icon as={FiStopCircle} boxSize="4" color={stoppedColor} aria-label="Task stopped" />
            <Text fontSize="xs" color={textMuted} fontWeight="medium">
              Stopped
            </Text>
          </HStack>
        </motion.div>
      </AnimatePresence>
    );
  }

  return null;
}
