/**
 * ChatTurn Component - Message bubble architecture
 *
 * - User messages: Right-aligned, blue/primary bubble.
 * - Agent messages: Left-aligned, gray/muted with structured sections:
 *   Thought (collapsible/italic), Action (code-like/badge), Observation (success/fail).
 */

import React, { useState, useMemo } from 'react';
import {
  Box,
  Text,
  VStack,
  HStack,
  useColorModeValue,
  Icon,
  Collapse,
  Badge,
} from '@chakra-ui/react';
import { FiLoader, FiChevronDown, FiChevronRight } from 'react-icons/fi';
// Import type with alias to avoid naming conflict with component
import type { ChatTurn as ChatTurnType } from '../helpers/groupHistoryIntoTurns';
import ActionCard from './ActionCard';
import ExecutionDetails from './ExecutionDetails';
import ReasoningBadge from './ReasoningBadge';
import UserInputPrompt from './UserInputPrompt';
import EvidenceIndicator from './EvidenceIndicator';
import type { ChatMessage } from '../types/chatMessage';
import type { DisplayHistoryEntry } from '../state/currentTask';
import { useAppState } from '../state/store';

function formatSeconds(seconds: number | null): string {
  if (seconds === null || !Number.isFinite(seconds) || seconds < 0) return '—';
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}

function formatNumber(n: number | null): string {
  if (n === null || !Number.isFinite(n) || n < 0) return '—';
  if (n === 0) return '—';
  if (n < 1000) return String(Math.round(n));
  return `${(n / 1000).toFixed(1)}k`;
}

interface ChatTurnProps {
  turn: ChatTurnType | null | undefined;
  isActive?: boolean;
  isProcessing?: boolean;
}

const ChatTurnComponent: React.FC<ChatTurnProps> = ({ turn, isActive = false, isProcessing = false }) => {
  // Color definitions - ALL at component top level (before any conditional returns)
  const dividerColor = useColorModeValue('gray.100', 'gray.800');
  const userBubbleBg = useColorModeValue('blue.500', 'blue.600');
  const userBubbleText = useColorModeValue('white', 'white');
  const agentBubbleBg = useColorModeValue('gray.50', 'gray.800');
  const focusHeaderBg = useColorModeValue('whiteAlpha.900', 'blackAlpha.400');
  const focusHeaderBorder = useColorModeValue('gray.200', 'gray.700');
  const focusHeaderText = useColorModeValue('gray.900', 'gray.100');
  const aiTextColor = useColorModeValue('gray.700', 'gray.300');
  const thoughtLabelColor = useColorModeValue('gray.500', 'gray.400');
  const mutedColor = useColorModeValue('gray.500', 'gray.500');
  const errorTextColor = useColorModeValue('red.600', 'red.400');
  const processingColor = useColorModeValue('blue.500', 'blue.400');
  const actionBadgeBg = useColorModeValue('gray.200', 'gray.600');
  const actionBadgeText = useColorModeValue('gray.800', 'gray.100');
  const errorBorderColor = useColorModeValue('red.400', 'red.500');
  const stepBadgeBg = useColorModeValue('blue.50', 'blue.900/25');
  const stepBadgeText = useColorModeValue('blue.700', 'blue.200');

  const plan = useAppState((state) => state.currentTask.plan);
  const currentStep = useAppState((state) => state.currentTask.currentStep);
  const totalSteps = useAppState((state) => state.currentTask.totalSteps);

  const stepSummary = useMemo(() => {
    const stepNum =
      plan?.currentStepIndex != null ? plan.currentStepIndex + 1 : typeof currentStep === 'number' ? currentStep : null;
    const total =
      plan?.steps?.length ?? (typeof totalSteps === 'number' ? totalSteps : null);
    if (stepNum == null || total == null || total <= 0) return null;
    return `Step ${stepNum}/${total}`;
  }, [currentStep, plan, totalSteps]);

  // Completion summary should be tied to the turn (finish action), not global taskStatus.
  // This keeps it visible in history even after the user starts the next task.
  const completionStats = useMemo(() => {
    const ai = Array.isArray(turn?.aiMessages) ? turn?.aiMessages : [];
    const startTime = turn?.userMessage?.timestamp;
    if (!(startTime instanceof Date) || isNaN(startTime.getTime())) return null;

    // Find the last finish() message within this turn
    let finishTime: Date | null = null;
    for (let i = ai.length - 1; i >= 0; i--) {
      const msg = ai[i];
      const actionString = typeof msg?.actionPayload?.action === 'string' ? msg.actionPayload.action : null;
      const parsed = msg?.actionPayload?.parsedAction;
      const parsedName =
        parsed && !('error' in parsed) && parsed.parsedAction && typeof parsed.parsedAction === 'object' && 'name' in parsed.parsedAction
          ? (parsed.parsedAction as { name: unknown }).name
          : null;
      const isFinish =
        actionString?.startsWith('finish') ||
        (typeof parsedName === 'string' && parsedName === 'finish');

      if (isFinish) {
        const ts = msg?.timestamp;
        finishTime = ts instanceof Date && !isNaN(ts.getTime()) ? ts : new Date();
        break;
      }
    }

    if (!finishTime) return null;

    const durationSec = (finishTime.getTime() - startTime.getTime()) / 1000;
    const tokens = ai.reduce((sum, m) => {
      const usage = m?.meta?.usage;
      const prompt = typeof usage?.promptTokens === 'number' ? usage.promptTokens : 0;
      const completion = typeof usage?.completionTokens === 'number' ? usage.completionTokens : 0;
      return sum + prompt + completion;
    }, 0);

    const steps = ai.filter((m) => Boolean(m?.actionPayload)).length || null;

    return { durationSec, tokens: tokens > 0 ? tokens : null, steps };
  }, [turn]);

  // CRITICAL SAFETY CHECKS
  if (!turn) {
    return null;
  }
  
  if (!turn.userMessage) {
    return null;
  }
  
  if (typeof turn.userMessage.id !== 'string' || !turn.userMessage.id) {
    return null;
  }
  
  // Ensure content is always a string
  const userContent = typeof turn.userMessage.content === 'string' 
    ? turn.userMessage.content 
    : String(turn.userMessage.content || '');
  
  // Ensure aiMessages is always an array
  const aiMessages = Array.isArray(turn.aiMessages) ? turn.aiMessages : [];

  // Convert ChatMessage to DisplayHistoryEntry for ActionCard compatibility
  const convertToDisplayEntry = (message: ChatMessage): DisplayHistoryEntry | null => {
    if (!message) return null;
    if (!message.actionPayload) return null;
    if (!message.actionPayload.parsedAction) return null;
    if ('error' in message.actionPayload.parsedAction) return null;

    const nestedParsedAction = message.actionPayload.parsedAction.parsedAction;
    if (!nestedParsedAction || typeof nestedParsedAction !== 'object') return null;
    if (!('name' in nestedParsedAction) || typeof nestedParsedAction.name !== 'string') return null;

    const safeContent = typeof message.content === 'string' ? message.content : String(message.content || '');
    const safeAction = typeof message.actionPayload.action === 'string' 
      ? message.actionPayload.action 
      : String(message.actionPayload.action || '');
    
    return {
      thought: safeContent,
      action: safeAction,
      parsedAction: {
        thought: safeContent,
        action: safeAction,
        parsedAction: nestedParsedAction,
      },
      usage: message.meta?.usage,
    };
  };

  return (
    <Box
      py={1}
      position="relative"
      id={`chat-turn-${turn.userMessage.id}`}
    >
      {/* Blue left border removed - message bubbles should be self-contained */}

      <VStack align="stretch" spacing={3}>
        {/* Focus Mode: while processing, keep current user query sticky as a header */}
        {isActive && isProcessing ? (
          <Box
            position="sticky"
            top={0}
            zIndex={12}
            bg={focusHeaderBg}
            borderWidth="1px"
            borderColor={focusHeaderBorder}
            borderRadius="lg"
            px={4}
            py={3}
            backdropFilter="blur(8px)"
          >
            <Text fontSize="sm" fontWeight="600" color={focusHeaderText} lineHeight="1.45">
              {userContent}
            </Text>
          </Box>
        ) : (
          <Box display="flex" justifyContent="flex-end" w="100%">
            <Box
              maxW="85%"
              px={4}
              py={2}
              borderRadius="lg"
              bg={userBubbleBg}
              color={userBubbleText}
            >
              <Text fontSize="sm" lineHeight="1.5">
                {userContent}
              </Text>
            </Box>
          </Box>
        )}

        {/* Focus mode spacing: keep a calm buffer before logs start */}
        {isActive && isProcessing && aiMessages.length === 0 && <Box height={6} />}

        {/* Agent messages: left-aligned, gray bubble with Thought / Action / Observation */}
        {aiMessages.length > 0 && (
          <VStack align="stretch" spacing={3}>
            {aiMessages.map((aiMessage, aiIndex) => {
              if (!aiMessage || typeof aiMessage !== 'object') return null;
              if (!aiMessage.id) return null;

              const aiMessageKey =
                typeof aiMessage.id === 'string'
                  ? aiMessage.id
                  : `ai-message-${aiIndex}-${Date.now()}`;

              const displayEntry = convertToDisplayEntry(aiMessage);
              const isError = aiMessage.status === 'failure' || aiMessage.status === 'error';
              const isUserInputRequest =
                aiMessage.userQuestion &&
                (aiMessage.status === 'pending' || aiMessage.meta?.reasoning?.source === 'ASK_USER');

              return (
                <Box key={aiMessageKey} w="100%">
                  <Box
                    bg={agentBubbleBg}
                    borderLeftWidth={isError ? '3px' : 0}
                    borderLeftColor={isError ? errorBorderColor : undefined}
                    borderRadius="lg"
                    px={3}
                    py={3}
                    w="100%"
                  >
                    {aiMessage.meta?.reasoning && (
                      <Box mb={2}>
                        <ReasoningBadge
                          source={aiMessage.meta.reasoning.source}
                          confidence={aiMessage.meta.reasoning.confidence}
                          reasoning={aiMessage.meta.reasoning.reasoning}
                          evidence={aiMessage.meta.reasoning.evidence}
                          searchIteration={aiMessage.meta.reasoning.searchIteration}
                        />
                      </Box>
                    )}

                    {aiMessage.meta?.reasoning?.evidence && (
                      <Box mb={2}>
                        <EvidenceIndicator
                          evidence={aiMessage.meta.reasoning.evidence}
                          compact={true}
                        />
                      </Box>
                    )}

                    {isUserInputRequest && aiMessage.userQuestion && (
                      <Box mb={3}>
                        <UserInputPrompt
                          question={
                            typeof aiMessage.userQuestion === 'string'
                              ? aiMessage.userQuestion
                              : String(aiMessage.userQuestion || '')
                          }
                          missingInformation={
                            Array.isArray(aiMessage.missingInformation)
                              ? aiMessage.missingInformation
                              : []
                          }
                          reasoning={aiMessage.meta?.reasoning?.reasoning}
                        />
                      </Box>
                    )}

                    {/* Thought: collapsible, default collapsed; whitespace-preserving */}
                    {aiMessage.content && !isUserInputRequest && (
                      <AgentThoughtSection
                        content={
                          typeof aiMessage.content === 'string'
                            ? aiMessage.content
                            : String(aiMessage.content || '')
                        }
                        // Thought is not a "success" signal. Only errors should be highlighted.
                        color={isError ? errorTextColor : aiTextColor}
                        labelColor={thoughtLabelColor}
                      />
                    )}

                    {/* Action: code-like / badge */}
                    {displayEntry && (
                      <Box mt={2}>
                        <HStack spacing={2} align="center" mb={2}>
                          <Badge
                            bg={actionBadgeBg}
                            color={actionBadgeText}
                            fontFamily="mono"
                            fontSize="xs"
                            px={2}
                            py={1}
                            borderRadius="full"
                          >
                            {typeof displayEntry.action === 'string'
                              ? displayEntry.action
                              : String(displayEntry.action || '')}
                          </Badge>
                          {/* Breadcrumb badge for current step (inline context; only on active turn) */}
                          {isActive && stepSummary && (
                            <Badge
                              bg={stepBadgeBg}
                              color={stepBadgeText}
                              fontSize="xs"
                              px={2}
                              py={1}
                              borderRadius="full"
                            >
                              {stepSummary}
                            </Badge>
                          )}
                        </HStack>
                        <Box mt={2}>
                          <ActionCard entry={displayEntry} compact />
                        </Box>
                      </Box>
                    )}

                    {/* Observation / Result
                        UX: Avoid showing a green "✅ Success" label for reasoning/thought.
                        Success is implicit via the normal (non-error) styling + continued progress.
                        Only explicit failures get a label.
                      */}
                    {isError && (
                      <Box mt={2}>
                        <Text
                          fontSize="xs"
                          color={errorTextColor}
                          fontWeight="medium"
                        >
                          ❌ Failed
                        </Text>
                      </Box>
                    )}
                  </Box>

                  {aiMessage.meta?.steps && aiMessage.meta.steps.length > 0 && (
                    <Box mt={2} pl={2}>
                      <ExecutionDetails
                        steps={aiMessage.meta.steps}
                        messageId={
                          typeof aiMessage.id === 'string'
                            ? aiMessage.id
                            : String(aiMessage.id || aiMessageKey)
                        }
                      />
                    </Box>
                  )}
                </Box>
              );
            })}

            {/* Minimal completion line for this turn (persists in history) */}
            {completionStats && (
              <Box mt={1}>
                <HStack
                  spacing={2}
                  justify="center"
                  color={mutedColor}
                  fontSize="xs"
                  aria-label="Task completed stats"
                >
                  <Text fontWeight="medium">Completed</Text>
                  <Text aria-hidden>·</Text>
                  <Text>{formatSeconds(completionStats.durationSec)}</Text>
                  <Text aria-hidden>·</Text>
                  <Text>{formatNumber(completionStats.tokens)}</Text>
                  <Text aria-hidden>·</Text>
                  <Text>{completionStats.steps ?? '—'}</Text>
                </HStack>
              </Box>
            )}
          </VStack>
        )}

        {/* Processing indicator (aria-busy for screen readers per Chrome a11y) */}
        {isActive && isProcessing && aiMessages.length === 0 && (
          <Box
            role="status"
            aria-live="polite"
            aria-busy="true"
            aria-label="Agent is thinking"
            display="flex"
            justifyContent="flex-start"
            bg={agentBubbleBg}
            borderRadius="lg"
            px={3}
            py={2}
          >
            <HStack spacing={2}>
              <Icon
                as={FiLoader}
                boxSize={3.5}
                color={processingColor}
                aria-hidden
                sx={{
                  animation: 'spin 1s linear infinite',
                  '@keyframes spin': {
                    '0%': { transform: 'rotate(0deg)' },
                    '100%': { transform: 'rotate(360deg)' },
                  },
                }}
              />
              <Text fontSize="sm" color={mutedColor}>
                Thinking...
              </Text>
            </HStack>
          </Box>
        )}
      </VStack>
    </Box>
  );
};

/** Collapsible "View Reasoning" section; default collapsed to keep chat clean (keyboard + a11y) */
function AgentThoughtSection({
  content,
  color,
  labelColor,
}: {
  content: string;
  color: string;
  labelColor: string;
}) {
  // Feedback: show reasoning by default (transparency-first)
  const [open, setOpen] = useState(true);
  const displayContent = content.trim() ? content : '—';
  const toggle = () => setOpen((o) => !o);
  return (
    <Box mb={2}>
      <HStack
        as="button"
        type="button"
        spacing={1}
        cursor="pointer"
        onClick={toggle}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            toggle();
          }
        }}
        userSelect="none"
        aria-expanded={open}
        aria-label={open ? 'Collapse reasoning' : 'View reasoning'}
        textAlign="left"
        bg="transparent"
        border="none"
        p={0}
        _focusVisible={{ boxShadow: 'outline' }}
      >
        <Icon as={open ? FiChevronDown : FiChevronRight} boxSize={3} color={labelColor} aria-hidden />
        <Text fontSize="xs" color={labelColor} fontStyle="italic">
          {open ? 'Thinking…' : 'View Reasoning'}
        </Text>
      </HStack>
      <Collapse in={open}>
        <Text
          fontSize="sm"
          lineHeight="1.6"
          color={color}
          fontStyle="italic"
          pl={4}
          pt={1}
          whiteSpace="pre-wrap"
        >
          {displayContent}
        </Text>
      </Collapse>
    </Box>
  );
}

export default ChatTurnComponent;
