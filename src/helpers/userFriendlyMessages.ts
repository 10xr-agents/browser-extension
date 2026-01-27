/**
 * User-Friendly Message Transformation
 * 
 * Transforms developer-centric messages (e.g., "DOM structure", "element ID", "verification failed")
 * into user-friendly messages that are easier to understand for end users.
 * 
 * Reference: User request - Make reasoning messages user-centric
 */

/**
 * Transforms a developer-centric message into a user-friendly message
 */
export function transformToUserFriendly(thought: string): string {
  if (!thought || !thought.trim()) {
    return thought;
  }

  let transformed = thought;

  // Replace technical terms with user-friendly equivalents
  const replacements: Array<[RegExp, string]> = [
    // DOM and element references
    [/DOM structure/gi, 'page structure'],
    [/element ID (\d+)/gi, 'element #$1'],
    [/element with id='(\d+)'/gi, 'element #$1'],
    [/element ID '(\d+)'/gi, 'element #$1'],
    [/id='(\d+)'/gi, 'element #$1'],
    [/element (\d+)/gi, 'element #$1'],
    [/clicking element #(\d+)/gi, 'clicking on the element'],
    [/clicking '([^']+)'/gi, "clicking on '$1'"],
    [/Clicking '([^']+)'/gi, "Clicking on '$1'"],
    
    // Verification and correction terms
    [/verification failed/gi, 'the action did not work as expected'],
    [/failed verification/gi, 'did not work as expected'],
    [/verification.*success/gi, 'action completed successfully'],
    [/Previous action failed verification/gi, 'The previous action did not work as expected'],
    [/Previous action failed/gi, 'The previous action did not work'],
    [/Retrying with corrected approach/gi, 'Trying a different approach'],
    [/Retrying with/gi, 'Trying'],
    [/correction strategy/gi, 'different approach'],
    [/self-correction/gi, 'adjusting approach'],
    
    // Technical action descriptions
    [/navigate to/gi, 'go to'],
    [/navigating to/gi, 'going to'],
    [/extracting DOM/gi, 'analyzing the page'],
    [/simplified DOM/gi, 'page content'],
    [/accessibility tree/gi, 'page elements'],
    [/accessibility elements/gi, 'interactive elements'],
    [/accessibility-derived/gi, ''],
    [/interactive elements/gi, 'clickable elements'],
    
    // Status and state messages
    [/step (\d+)/gi, 'step $1'],
    [/Step (\d+) verification/gi, 'Checking step $1'],
    [/confidence.*%/gi, 'confidence'],
    [/expected outcome/gi, 'expected result'],
    [/actual state/gi, 'what happened'],
    [/expected state/gi, 'what was expected'],
    
    // Error messages
    [/Error: /gi, ''],
    [/Failed to/gi, 'Unable to'],
    [/could not/gi, 'could not'],
    
    // Action descriptions
    [/setValue\(/gi, 'entering text into'],
    [/click\(/gi, 'clicking'],
    [/scroll\(/gi, 'scrolling'],
    [/wait\(/gi, 'waiting'],
    
    // Remove overly technical phrases
    [/Given the .* structure/gi, 'Based on the page'],
    [/In this case/gi, ''],
    [/This strategy was chosen because/gi, ''],
    [/which may lead to/gi, 'which should lead to'],
    [/seems to be the right/gi, 'appears to be the correct'],
    [/likely related to/gi, 'related to'],
    
    // Clean up multiple spaces
    [/\s+/g, ' '],
  ];

  // Apply all replacements
  for (const [pattern, replacement] of replacements) {
    transformed = transformed.replace(pattern, replacement);
  }

  // Capitalize first letter
  if (transformed.length > 0) {
    transformed = transformed.charAt(0).toUpperCase() + transformed.slice(1);
  }

  // Clean up any remaining technical artifacts
  transformed = transformed
    .replace(/\(element #\d+\)/g, '')
    .replace(/element #\d+/g, 'the element')
    .replace(/\s+/g, ' ')
    .trim();

  return transformed;
}

/**
 * Transforms a thought message while preserving important context
 */
export function transformThought(thought: string, preserveTechnicalDetails: boolean = false): string {
  if (!thought || !thought.trim()) {
    return thought;
  }

  // If we want to preserve technical details (for debug mode), return as-is
  if (preserveTechnicalDetails) {
    return thought;
  }

  return transformToUserFriendly(thought);
}
