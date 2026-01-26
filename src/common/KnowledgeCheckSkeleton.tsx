/**
 * Knowledge Check Skeleton Component
 * 
 * Loading skeleton for knowledge availability check.
 */

import { Alert, AlertIcon, Skeleton, SkeletonText } from '@chakra-ui/react';
import React from 'react';

export const KnowledgeCheckSkeleton: React.FC = () => {
  return (
    <Alert
      status="info"
      variant="subtle"
      borderRadius="md"
      bg="blue.50"
      _dark={{ bg: 'blue.900/20' }}
      mb={6}
    >
      <AlertIcon boxSize={4} />
      <SkeletonText noOfLines={1} spacing={2} flex={1} />
    </Alert>
  );
};
