import React from 'react';
import { Text, useColorModeValue } from '@chakra-ui/react';
import { countTokens } from '../helpers/countTokens';
import { useAsync } from 'react-use';
import { useAppState } from '../state/store';

const TokenCount = ({ html }: { html: string }) => {
  // Note: selectedModel was removed from settings (model selection is server-side now)
  // Using default model 'gpt-4o-mini' for token counting
  const textColor = useColorModeValue('gray.500', 'gray.400');

  const numTokens =
    useAsync(
      () => countTokens(html, 'gpt-4o-mini'),
      [html]
    ).value || null;

  let displayedCount = null;
  if (!html) {
    displayedCount = 'Waiting for HTML';
  } else if (numTokens === null) {
    displayedCount = 'Counting...';
  } else {
    displayedCount = numTokens + ' tokens';
  }

  return (
    <>
      <Text as="span" fontSize="sm" color={textColor}>
        {displayedCount}
      </Text>
    </>
  );
};

export default TokenCount;
