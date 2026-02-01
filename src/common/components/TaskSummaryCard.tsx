/**
 * TaskSummaryCard - Minimal completion line
 *
 * UX change: Do not show a big "completed" icon/card.
 * Instead, render a single subtle one-line completion row.
 */

import React, { useMemo, useState } from 'react';
import {
  Box,
  HStack,
  Text,
  useColorModeValue,
} from '@chakra-ui/react';
import { FiClock, FiZap, FiLayers } from 'react-icons/fi';
import { Icon } from '@chakra-ui/react';
import { useAppState } from '../../state/store';

function formatSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatNumber(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n < 0) return '—';
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1)}k`;
}

export default function TaskSummaryCard() {
  const taskStatus = useAppState((state) => state.currentTask.status);
  const createdAt = useAppState((state) => state.currentTask.createdAt);
  const plan = useAppState((state) => state.currentTask.plan);
  const totalSteps = useAppState((state) => state.currentTask.totalSteps);
  const messages = useAppState((state) => state.currentTask.messages);
  const displayHistory = useAppState((state) => state.currentTask.displayHistory);

  // Kept for backwards compatibility with prior component shape; no longer used for expand/collapse.
  // (Avoids churn in case other code assumes the state exists.)
  const [open] = useState(false);

  const muted = useColorModeValue('gray.600', 'gray.400');
  const lineBg = useColorModeValue('transparent', 'transparent');
  const lineBorder = useColorModeValue('gray.200', 'gray.700');

  const stats = useMemo(() => {
    const msgArray = Array.isArray(messages) ? messages : [];
    const histArray = Array.isArray(displayHistory) ? displayHistory : [];

    const endTime = (() => {
      const last = msgArray.length > 0 ? msgArray[msgArray.length - 1] : null;
      const ts = last?.timestamp;
      return ts instanceof Date && !isNaN(ts.getTime()) ? ts : new Date();
    })();

    const startTime =
      createdAt instanceof Date && !isNaN(createdAt.getTime()) ? createdAt : null;
    const durationSec =
      startTime ? (endTime.getTime() - startTime.getTime()) / 1000 : null;

    const tokensFromMessages = msgArray.reduce((sum, m) => {
      const usage = m?.meta?.usage;
      const prompt = typeof usage?.promptTokens === 'number' ? usage.promptTokens : 0;
      const completion =
        typeof usage?.completionTokens === 'number' ? usage.completionTokens : 0;
      return sum + prompt + completion;
    }, 0);

    const tokensFromHistory = histArray.reduce((sum, h) => {
      const usage = h?.usage;
      const prompt = typeof usage?.promptTokens === 'number' ? usage.promptTokens : 0;
      const completion =
        typeof usage?.completionTokens === 'number' ? usage.completionTokens : 0;
      return sum + prompt + completion;
    }, 0);

    const tokens = tokensFromMessages > 0 ? tokensFromMessages : tokensFromHistory;
    const steps = plan?.steps?.length ?? (typeof totalSteps === 'number' ? totalSteps : null);

    return {
      durationSec,
      tokens,
      steps,
    };
  }, [createdAt, displayHistory, messages, plan, totalSteps]);

  // IMPORTANT: hooks must run on every render (prevents React error #310)
  if (taskStatus !== 'success') return null;

  return (
    <Box
      mt={6}
      mx="auto"
      width="100%"
      maxW="520px"
      px={3}
      py={2}
      borderRadius="md"
      bg={lineBg}
      borderWidth="1px"
      borderColor={lineBorder}
      role="status"
      aria-live="polite"
      aria-label="Task completed"
    >
      <HStack
        spacing={3}
        justify="center"
        color={muted}
        fontSize="xs"
        aria-label="Task completed stats"
      >
        <Text fontWeight="medium">Completed</Text>
        <Text aria-hidden>·</Text>
        <HStack spacing={1}>
          <Icon as={FiClock} boxSize={3.5} aria-hidden />
          <Text>{formatSeconds(stats.durationSec)}</Text>
        </HStack>
        <Text aria-hidden>·</Text>
        <HStack spacing={1}>
          <Icon as={FiZap} boxSize={3.5} aria-hidden />
          <Text>{formatNumber(stats.tokens)}</Text>
        </HStack>
        <Text aria-hidden>·</Text>
        <HStack spacing={1}>
          <Icon as={FiLayers} boxSize={3.5} aria-hidden />
          <Text>{stats.steps ?? '—'}</Text>
        </HStack>
      </HStack>
    </Box>
  );
}

