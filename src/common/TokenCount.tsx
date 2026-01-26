import React from 'react';
import { Text, useColorModeValue } from '@chakra-ui/react';
import { countTokens } from '../helpers/countTokens';
import { useAsync } from 'react-use';
import { useAppState } from '../state/store';

const TokenCount = ({ html }: { html: string }) => {
  const selectedModel = useAppState((state) => state.settings.selectedModel);
  const textColor = useColorModeValue('gray.500', 'gray.400');

  const numTokens =
    useAsync(
      () => countTokens(html, selectedModel as string),
      [html, selectedModel]
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
