/**
 * FileAttachmentInput Component
 *
 * File picker with drag-and-drop support and upload progress indicator.
 * Supports PDF, CSV, JSON, TXT, MD, DOCX, XML files.
 *
 * Reference: INTERACT_FLOW_WALKTHROUGH.md §7 (File-Based Tasks & Chat-Only Mode)
 */

import React, { useCallback, useRef, useState } from 'react';
import {
  Box,
  HStack,
  VStack,
  Text,
  IconButton,
  Progress,
  useColorModeValue,
  Icon,
  Tooltip,
} from '@chakra-ui/react';
import { AttachmentIcon, CloseIcon } from '@chakra-ui/icons';
import { FiFile, FiUpload } from 'react-icons/fi';

// Supported file types
const ACCEPTED_FILE_TYPES = [
  'application/pdf',
  'text/csv',
  'application/json',
  'text/plain',
  'text/markdown',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/xml',
  'text/xml',
];

const ACCEPTED_EXTENSIONS = '.pdf,.csv,.json,.txt,.md,.docx,.xml';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

interface FileAttachmentInputProps {
  attachment: {
    filename: string;
    mimeType: string;
    size: number;
  } | null;
  uploadProgress: number | null;
  onFileSelect: (file: File) => void;
  onClear: () => void;
  isDisabled?: boolean;
}

/**
 * Format file size for display
 */
const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

/**
 * Get file type icon color based on extension
 */
const getFileTypeColor = (mimeType: string): string => {
  if (mimeType.includes('pdf')) return 'red.500';
  if (mimeType.includes('csv') || mimeType.includes('spreadsheet')) return 'green.500';
  if (mimeType.includes('json')) return 'yellow.500';
  if (mimeType.includes('xml')) return 'orange.500';
  if (mimeType.includes('word') || mimeType.includes('docx')) return 'blue.500';
  return 'gray.500';
};

const FileAttachmentInput: React.FC<FileAttachmentInputProps> = ({
  attachment,
  uploadProgress,
  onFileSelect,
  onClear,
  isDisabled = false,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Colors
  const borderColor = useColorModeValue('gray.300', 'gray.600');
  const hoverBorderColor = useColorModeValue('blue.400', 'blue.400');
  const dragOverBg = useColorModeValue('blue.50', 'blue.900');
  const attachmentBg = useColorModeValue('gray.50', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.200');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');
  const errorColor = useColorModeValue('red.500', 'red.400');

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      const file = event.target.files?.[0];
      if (file) {
        validateAndSelectFile(file);
      }
      // Reset input so same file can be selected again
      event.target.value = '';
    },
    [onFileSelect]
  );

  const validateAndSelectFile = useCallback(
    (file: File) => {
      setError(null);

      // Check file type
      if (!ACCEPTED_FILE_TYPES.includes(file.type) && !file.name.match(/\.(pdf|csv|json|txt|md|docx|xml)$/i)) {
        setError('Unsupported file type. Please use PDF, CSV, JSON, TXT, MD, DOCX, or XML.');
        return;
      }

      // Check file size
      if (file.size > MAX_FILE_SIZE) {
        setError(`File too large. Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`);
        return;
      }

      onFileSelect(file);
    },
    [onFileSelect]
  );

  const handleDragOver = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (!isDisabled) {
      setIsDragOver(true);
    }
  }, [isDisabled]);

  const handleDragLeave = useCallback((event: React.DragEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent) => {
      event.preventDefault();
      event.stopPropagation();
      setIsDragOver(false);

      if (isDisabled) return;

      const file = event.dataTransfer.files?.[0];
      if (file) {
        validateAndSelectFile(file);
      }
    },
    [isDisabled, validateAndSelectFile]
  );

  const handleClick = useCallback(() => {
    if (!isDisabled && fileInputRef.current) {
      fileInputRef.current.click();
    }
  }, [isDisabled]);

  const isUploading = uploadProgress !== null && uploadProgress < 100;

  // Show attached file
  if (attachment) {
    return (
      <Box
        bg={attachmentBg}
        borderRadius="md"
        px={3}
        py={2}
        position="relative"
      >
        <HStack spacing={2} justify="space-between">
          <HStack spacing={2} flex={1} minW={0}>
            <Icon
              as={FiFile}
              boxSize={4}
              color={getFileTypeColor(attachment.mimeType)}
            />
            <VStack align="start" spacing={0} flex={1} minW={0}>
              <Text
                fontSize="xs"
                fontWeight="medium"
                color={textColor}
                noOfLines={1}
              >
                {attachment.filename}
              </Text>
              <Text fontSize="xs" color={mutedColor}>
                {formatFileSize(attachment.size)}
              </Text>
            </VStack>
          </HStack>
          {!isUploading && (
            <Tooltip label="Remove file" placement="top">
              <IconButton
                aria-label="Remove file"
                icon={<CloseIcon />}
                size="xs"
                variant="ghost"
                onClick={onClear}
                isDisabled={isDisabled}
              />
            </Tooltip>
          )}
        </HStack>
        {isUploading && (
          <Progress
            value={uploadProgress}
            size="xs"
            colorScheme="blue"
            borderRadius="full"
            mt={2}
          />
        )}
      </Box>
    );
  }

  // Show file picker / drop zone
  return (
    <Box position="relative">
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPTED_EXTENSIONS}
        onChange={handleFileChange}
        style={{ display: 'none' }}
        disabled={isDisabled}
      />
      <Tooltip label="Attach file (PDF, CSV, JSON, TXT, MD, DOCX, XML)" placement="top">
        <IconButton
          aria-label="Attach file"
          icon={<AttachmentIcon />}
          size="sm"
          variant="ghost"
          onClick={handleClick}
          isDisabled={isDisabled}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          borderWidth={isDragOver ? '2px' : '0'}
          borderColor={isDragOver ? hoverBorderColor : 'transparent'}
          borderStyle="dashed"
          bg={isDragOver ? dragOverBg : 'transparent'}
          _hover={{
            bg: useColorModeValue('gray.100', 'gray.700'),
          }}
        />
      </Tooltip>
      {error && (
        <Text
          fontSize="xs"
          color={errorColor}
          position="absolute"
          top="100%"
          left={0}
          mt={1}
          whiteSpace="nowrap"
        >
          {error}
        </Text>
      )}
    </Box>
  );
};

export default FileAttachmentInput;
