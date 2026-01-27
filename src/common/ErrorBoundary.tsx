/**
 * Error Boundary Component
 * 
 * Catches React rendering errors and displays a fallback UI instead of a blank screen.
 * Prevents the entire app from crashing when a component throws an error.
 * 
 * Reference: React Error Boundaries - https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */

import React, { Component, ErrorInfo, ReactNode } from 'react';
import {
  Box,
  VStack,
  Heading,
  Text,
  Button,
  Code,
  useColorModeValue,
  Alert,
  AlertIcon,
} from '@chakra-ui/react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Log error to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo);
    
    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Call optional error handler
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error UI
      return <ErrorFallback error={this.state.error} errorInfo={this.state.errorInfo} onReset={this.handleReset} />;
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  errorInfo: ErrorInfo | null;
  onReset: () => void;
}

const ErrorFallback: React.FC<ErrorFallbackProps> = ({ error, errorInfo, onReset }) => {
  const bgColor = useColorModeValue('white', 'gray.900');
  const borderColor = useColorModeValue('gray.200', 'gray.700');
  const textColor = useColorModeValue('gray.900', 'gray.100');
  const descColor = useColorModeValue('gray.600', 'gray.400');
  const codeBg = useColorModeValue('gray.50', 'gray.800');
  const codeText = useColorModeValue('gray.900', 'gray.200');

  return (
    <Box
      p={6}
      bg={bgColor}
      borderWidth="1px"
      borderColor={borderColor}
      borderRadius="md"
      minH="200px"
    >
      <VStack align="stretch" spacing={4}>
        <Alert status="error" borderRadius="md">
          <AlertIcon />
          <Box>
            <Heading size="sm" mb={1}>
              Something went wrong
            </Heading>
            <Text fontSize="sm">
              An error occurred while rendering this component. The app is still functional - try refreshing or navigating away.
            </Text>
          </Box>
        </Alert>

        {error && (
          <Box>
            <Text fontSize="sm" fontWeight="semibold" color={textColor} mb={2}>
              Error Message:
            </Text>
            <Code
              p={3}
              fontSize="xs"
              display="block"
              whiteSpace="pre-wrap"
              bg={codeBg}
              color={codeText}
              borderRadius="md"
              maxH="200px"
              overflowY="auto"
            >
              {error.toString()}
            </Code>
          </Box>
        )}

        {errorInfo && errorInfo.componentStack && (
          <Box>
            <Text fontSize="sm" fontWeight="semibold" color={textColor} mb={2}>
              Component Stack:
            </Text>
            <Code
              p={3}
              fontSize="xs"
              display="block"
              whiteSpace="pre-wrap"
              bg={codeBg}
              color={codeText}
              borderRadius="md"
              maxH="200px"
              overflowY="auto"
            >
              {errorInfo.componentStack}
            </Code>
          </Box>
        )}

        <Button onClick={onReset} colorScheme="blue" size="sm" w="fit-content">
          Try Again
        </Button>

        <Text fontSize="xs" color={descColor}>
          If this error persists, please check the browser console for more details.
        </Text>
      </VStack>
    </Box>
  );
};

export default ErrorBoundary;
