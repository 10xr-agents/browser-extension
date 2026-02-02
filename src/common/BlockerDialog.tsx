/**
 * BlockerDialog Component
 *
 * Displays blocker information and resolution options when task is paused.
 * Supports different blocker types: login, MFA, CAPTCHA, rate limit, etc.
 *
 * Reference: INTERACT_FLOW_WALKTHROUGH.md §H (Blocker Detection & Task Pause/Resume System)
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  Box,
  VStack,
  HStack,
  Text,
  Button,
  Input,
  FormControl,
  FormLabel,
  useColorModeValue,
  Icon,
  Divider,
  InputGroup,
  InputRightElement,
  IconButton,
  Progress,
} from '@chakra-ui/react';
import {
  WarningIcon,
  LockIcon,
  TimeIcon,
  ViewIcon,
  ViewOffIcon,
  CheckIcon,
  RepeatIcon,
} from '@chakra-ui/icons';
import type {
  BlockerInfo,
  BlockerType,
  BlockerRequiredField,
} from '../api/client';

interface BlockerDialogProps {
  blockerInfo: BlockerInfo;
  onSubmitCredentials: (data: Record<string, unknown>) => void;
  onResolvedOnWebsite: () => void;
  onRetry?: () => void;
  onCancel?: () => void;
  isLoading?: boolean;
}

/**
 * Get icon for blocker type
 */
const getBlockerIcon = (type: BlockerType) => {
  switch (type) {
    case 'login_failure':
    case 'mfa_required':
    case 'session_expired':
      return LockIcon;
    case 'rate_limit':
      return TimeIcon;
    case 'captcha':
    case 'cookie_consent':
    case 'access_denied':
    case 'page_error':
    default:
      return WarningIcon;
  }
};

/**
 * Get title for blocker type
 */
const getBlockerTitle = (type: BlockerType): string => {
  switch (type) {
    case 'login_failure':
      return 'Login Required';
    case 'mfa_required':
      return 'Verification Required';
    case 'captcha':
      return 'CAPTCHA Required';
    case 'cookie_consent':
      return 'Cookie Consent Required';
    case 'rate_limit':
      return 'Rate Limited';
    case 'session_expired':
      return 'Session Expired';
    case 'access_denied':
      return 'Access Denied';
    case 'page_error':
      return 'Page Error';
    default:
      return 'Action Required';
  }
};

const BlockerDialog: React.FC<BlockerDialogProps> = ({
  blockerInfo,
  onSubmitCredentials,
  onResolvedOnWebsite,
  onRetry,
  onCancel,
  isLoading = false,
}) => {
  // Color definitions at component top level
  const bgColor = useColorModeValue('white', 'gray.800');
  const borderColor = useColorModeValue('orange.200', 'orange.700');
  const headerBgColor = useColorModeValue('orange.50', 'orange.900');
  const headerTextColor = useColorModeValue('orange.800', 'orange.200');
  const textColor = useColorModeValue('gray.700', 'gray.200');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const inputBgColor = useColorModeValue('white', 'gray.700');
  const inputBorderColor = useColorModeValue('gray.300', 'gray.600');
  const progressTrackColor = useColorModeValue('gray.200', 'gray.700');

  // Form state
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [showPasswords, setShowPasswords] = useState<Record<string, boolean>>(
    {}
  );

  // Countdown state for rate limits
  const [countdown, setCountdown] = useState<number | null>(
    blockerInfo.retryAfterSeconds || null
  );

  // Initialize form data from required fields
  useEffect(() => {
    if (blockerInfo.requiredFields) {
      const initialData: Record<string, string> = {};
      blockerInfo.requiredFields.forEach((field) => {
        initialData[field.name] = '';
      });
      setFormData(initialData);
    }
  }, [blockerInfo.requiredFields]);

  // Countdown timer for rate limits
  useEffect(() => {
    if (
      blockerInfo.type === 'rate_limit' &&
      blockerInfo.retryAfterSeconds &&
      countdown !== null &&
      countdown > 0
    ) {
      const timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev === null || prev <= 1) {
            clearInterval(timer);
            // Auto-retry when countdown reaches 0
            if (onRetry) {
              onRetry();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => clearInterval(timer);
    }
  }, [blockerInfo.type, blockerInfo.retryAfterSeconds, onRetry, countdown]);

  const handleInputChange = useCallback(
    (fieldName: string, value: string) => {
      setFormData((prev) => ({ ...prev, [fieldName]: value }));
    },
    []
  );

  const togglePasswordVisibility = useCallback((fieldName: string) => {
    setShowPasswords((prev) => ({ ...prev, [fieldName]: !prev[fieldName] }));
  }, []);

  const handleSubmit = useCallback(() => {
    onSubmitCredentials(formData);
  }, [formData, onSubmitCredentials]);

  const canSubmit =
    blockerInfo.requiredFields?.every(
      (field) => formData[field.name]?.trim().length > 0
    ) ?? false;

  const showCredentialForm =
    blockerInfo.resolutionMethods.includes('provide_in_chat') &&
    blockerInfo.requiredFields &&
    blockerInfo.requiredFields.length > 0;

  const showWebsiteButton =
    blockerInfo.resolutionMethods.includes('user_action_on_web');

  const showRetryButton =
    blockerInfo.resolutionMethods.includes('auto_retry') && onRetry;

  const BlockerIcon = getBlockerIcon(blockerInfo.type);
  const title = getBlockerTitle(blockerInfo.type);

  return (
    <Box
      bg={bgColor}
      borderRadius="lg"
      border="1px solid"
      borderColor={borderColor}
      overflow="hidden"
      shadow="md"
      w="100%"
    >
      {/* Header */}
      <HStack bg={headerBgColor} px={4} py={3} spacing={3}>
        <Icon as={BlockerIcon} boxSize={5} color={headerTextColor} />
        <Text fontSize="md" fontWeight="semibold" color={headerTextColor}>
          {title}
        </Text>
      </HStack>

      {/* Content */}
      <VStack align="stretch" spacing={4} p={4}>
        {/* User message */}
        <Text fontSize="sm" color={textColor}>
          {typeof blockerInfo.userMessage === 'string'
            ? blockerInfo.userMessage
            : typeof blockerInfo.description === 'string'
            ? blockerInfo.description
            : 'User intervention is required to continue.'}
        </Text>

        {/* Rate limit countdown */}
        {blockerInfo.type === 'rate_limit' && countdown !== null && (
          <Box>
            <HStack justify="space-between" mb={2}>
              <Text fontSize="sm" color={mutedColor}>
                Retry available in:
              </Text>
              <Text fontSize="sm" fontWeight="medium" color={textColor}>
                {countdown}s
              </Text>
            </HStack>
            <Progress
              value={
                ((blockerInfo.retryAfterSeconds || 60) - countdown) /
                (blockerInfo.retryAfterSeconds || 60) *
                100
              }
              size="sm"
              colorScheme="orange"
              borderRadius="full"
              sx={{
                '& > div': {
                  transition: 'width 1s linear',
                },
              }}
              bg={progressTrackColor}
            />
          </Box>
        )}

        {/* Credential form */}
        {showCredentialForm && (
          <>
            <Divider />
            <VStack align="stretch" spacing={3}>
              <Text fontSize="sm" fontWeight="medium" color={textColor}>
                Please provide the following:
              </Text>
              {blockerInfo.requiredFields?.map((field: BlockerRequiredField) => (
                <FormControl key={field.name}>
                  <FormLabel fontSize="sm" color={textColor} mb={1}>
                    {field.label}
                  </FormLabel>
                  {field.type === 'password' ? (
                    <InputGroup size="sm">
                      <Input
                        type={showPasswords[field.name] ? 'text' : 'password'}
                        value={formData[field.name] || ''}
                        onChange={(e) =>
                          handleInputChange(field.name, e.target.value)
                        }
                        placeholder={field.description}
                        bg={inputBgColor}
                        borderColor={inputBorderColor}
                        _placeholder={{ color: mutedColor }}
                        isDisabled={isLoading}
                      />
                      <InputRightElement>
                        <IconButton
                          aria-label={
                            showPasswords[field.name]
                              ? 'Hide password'
                              : 'Show password'
                          }
                          icon={
                            showPasswords[field.name] ? (
                              <ViewOffIcon />
                            ) : (
                              <ViewIcon />
                            )
                          }
                          size="xs"
                          variant="ghost"
                          onClick={() => togglePasswordVisibility(field.name)}
                          isDisabled={isLoading}
                        />
                      </InputRightElement>
                    </InputGroup>
                  ) : (
                    <Input
                      type={field.type}
                      value={formData[field.name] || ''}
                      onChange={(e) =>
                        handleInputChange(field.name, e.target.value)
                      }
                      placeholder={field.description}
                      size="sm"
                      bg={inputBgColor}
                      borderColor={inputBorderColor}
                      _placeholder={{ color: mutedColor }}
                      isDisabled={isLoading}
                    />
                  )}
                </FormControl>
              ))}
            </VStack>
          </>
        )}

        {/* Action buttons */}
        <VStack align="stretch" spacing={2} pt={2}>
          {showCredentialForm && (
            <Button
              colorScheme="blue"
              size="sm"
              onClick={handleSubmit}
              isDisabled={!canSubmit || isLoading}
              isLoading={isLoading}
              leftIcon={<CheckIcon />}
            >
              Submit & Continue
            </Button>
          )}

          {showRetryButton && (
            <Button
              colorScheme="blue"
              size="sm"
              onClick={onRetry}
              isDisabled={
                isLoading ||
                (blockerInfo.type === 'rate_limit' &&
                  countdown !== null &&
                  countdown > 0)
              }
              isLoading={isLoading}
              leftIcon={<RepeatIcon />}
            >
              {countdown !== null && countdown > 0
                ? `Retry in ${countdown}s`
                : 'Retry Now'}
            </Button>
          )}

          {showWebsiteButton && (
            <Button
              variant="outline"
              size="sm"
              onClick={onResolvedOnWebsite}
              isDisabled={isLoading}
            >
              I've resolved this on the website
            </Button>
          )}

          {onCancel && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onCancel}
              isDisabled={isLoading}
              color={mutedColor}
            >
              Cancel
            </Button>
          )}
        </VStack>

        {/* Confidence indicator (subtle) */}
        {blockerInfo.confidence !== undefined && blockerInfo.confidence < 0.8 && (
          <Text fontSize="xs" color={mutedColor} textAlign="center">
            Detection confidence: {Math.round(blockerInfo.confidence * 100)}%
          </Text>
        )}
      </VStack>
    </Box>
  );
};

export default BlockerDialog;
