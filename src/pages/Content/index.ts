// console.log('Content script loaded..');

import { watchForRPCRequests } from '../../helpers/pageRPC';

// Only set up the listener once, even if script is injected multiple times
// Check if listener is already set up by checking for a marker on window
if (!(window as any).__spadeworksContentScriptLoaded) {
  watchForRPCRequests();
  (window as any).__spadeworksContentScriptLoaded = true;
}
