/**
 * ReportDownloadMenu Component
 *
 * Dropdown menu to download task reports in various formats after task completion.
 *
 * Reference: INTERACT_FLOW_WALKTHROUGH.md §7 (File-Based Tasks & Chat-Only Mode)
 */

import React, { useCallback, useState } from 'react';
import {
  Menu,
  MenuButton,
  MenuList,
  MenuItem,
  IconButton,
  Text,
  HStack,
  useColorModeValue,
  useToast,
  Tooltip,
  Spinner,
} from '@chakra-ui/react';
import { DownloadIcon } from '@chakra-ui/icons';
import { FiFileText, FiDatabase, FiCode } from 'react-icons/fi';
import type { ReportFormat } from '../api/client';

interface ReportDownloadMenuProps {
  onDownload: (format: ReportFormat) => Promise<void>;
  isDisabled?: boolean;
  size?: 'xs' | 'sm' | 'md';
}

const ReportDownloadMenu: React.FC<ReportDownloadMenuProps> = ({
  onDownload,
  isDisabled = false,
  size = 'sm',
}) => {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingFormat, setLoadingFormat] = useState<ReportFormat | null>(null);
  const toast = useToast();

  // Colors
  const menuBg = useColorModeValue('white', 'gray.800');
  const menuBorderColor = useColorModeValue('gray.200', 'gray.600');
  const hoverBg = useColorModeValue('gray.100', 'gray.700');
  const textColor = useColorModeValue('gray.700', 'gray.200');
  const mutedColor = useColorModeValue('gray.500', 'gray.400');

  const handleDownload = useCallback(
    async (format: ReportFormat) => {
      if (isLoading) return;

      setIsLoading(true);
      setLoadingFormat(format);

      try {
        await onDownload(format);
        toast({
          title: 'Report downloaded',
          description: `Downloaded report as ${format.toUpperCase()}`,
          status: 'success',
          duration: 3000,
          isClosable: true,
        });
      } catch (error) {
        console.error('Report download failed:', error);
        toast({
          title: 'Download failed',
          description: error instanceof Error ? error.message : 'Failed to download report',
          status: 'error',
          duration: 5000,
          isClosable: true,
        });
      } finally {
        setIsLoading(false);
        setLoadingFormat(null);
      }
    },
    [onDownload, isLoading, toast]
  );

  const formatOptions: Array<{
    format: ReportFormat;
    label: string;
    description: string;
    icon: React.ElementType;
  }> = [
    {
      format: 'json',
      label: 'JSON',
      description: 'Full structured data',
      icon: FiCode,
    },
    {
      format: 'csv',
      label: 'CSV',
      description: 'Spreadsheet compatible',
      icon: FiDatabase,
    },
    {
      format: 'markdown',
      label: 'Markdown',
      description: 'Human readable',
      icon: FiFileText,
    },
  ];

  return (
    <Menu>
      <Tooltip label="Download report" placement="top">
        <MenuButton
          as={IconButton}
          aria-label="Download report"
          icon={isLoading ? <Spinner size="xs" /> : <DownloadIcon />}
          size={size}
          variant="ghost"
          isDisabled={isDisabled || isLoading}
        />
      </Tooltip>
      <MenuList
        bg={menuBg}
        borderColor={menuBorderColor}
        boxShadow="lg"
        minW="180px"
      >
        {formatOptions.map(({ format, label, description, icon: FormatIcon }) => (
          <MenuItem
            key={format}
            onClick={() => handleDownload(format)}
            isDisabled={isLoading}
            _hover={{ bg: hoverBg }}
          >
            <HStack spacing={3} w="100%">
              <FormatIcon size={16} />
              <HStack justify="space-between" flex={1}>
                <Text fontSize="sm" color={textColor} fontWeight="medium">
                  {label}
                </Text>
                {loadingFormat === format ? (
                  <Spinner size="xs" />
                ) : (
                  <Text fontSize="xs" color={mutedColor}>
                    {description}
                  </Text>
                )}
              </HStack>
            </HStack>
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
};

export default ReportDownloadMenu;
