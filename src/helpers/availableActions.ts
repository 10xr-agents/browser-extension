/**
 * Available Actions for Browser Automation
 * 
 * Complete list of all actions that can be executed by the LLM.
 * Each action defines its name, description, and argument types.
 * 
 * Reference: CHROME_TAB_ACTIONS.md
 */

export const availableActions = [
  // ============================================================================
  // NAVIGATION & BROWSER CONTROL
  // ============================================================================
  {
    name: 'navigate',
    description: 'Navigate to a specific URL',
    args: [
      { name: 'url', type: 'string' },
      { name: 'newTab', type: 'boolean', optional: true },
    ],
  },
  {
    name: 'goBack',
    description: 'Navigate back in browser history',
    args: [],
  },
  {
    name: 'goForward',
    description: 'Navigate forward in browser history',
    args: [],
  },
  {
    name: 'wait',
    description: 'Wait for specified duration (max 30 seconds)',
    args: [
      { name: 'seconds', type: 'number', optional: true },
    ],
  },
  {
    name: 'waitForElement',
    description: 'Wait for an element to appear on the page (useful after clicking buttons that open dropdowns/menus)',
    args: [
      { name: 'text', type: 'string', optional: true },
      { name: 'role', type: 'string', optional: true },
      { name: 'timeout', type: 'number', optional: true },
    ],
  },
  {
    name: 'search',
    description: 'Search queries on search engines (DuckDuckGo, Google, Bing)',
    args: [
      { name: 'query', type: 'string' },
      { name: 'engine', type: 'string', optional: true },
    ],
  },

  // ============================================================================
  // PAGE INTERACTION
  // ============================================================================
  {
    name: 'click',
    description: 'Clicks on an element',
    args: [
      { name: 'elementId', type: 'number' },
    ],
  },
  {
    name: 'setValue',
    description: 'Focuses on and sets the value of an input element',
    args: [
      { name: 'elementId', type: 'number' },
      { name: 'value', type: 'string' },
    ],
  },
  {
    name: 'scroll',
    description: 'Scroll the page up/down by pages',
    args: [
      { name: 'down', type: 'boolean', optional: true },
      { name: 'pages', type: 'number', optional: true },
      { name: 'index', type: 'number', optional: true },
    ],
  },
  {
    name: 'findText',
    description: 'Scroll to specific text on the page',
    args: [
      { name: 'text', type: 'string' },
    ],
  },

  // ============================================================================
  // MOUSE & TOUCH ACTIONS
  // ============================================================================
  {
    name: 'hover',
    description: 'Hover mouse over an element',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'doubleClick',
    description: 'Double-click an element',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'dblclick',
    description: 'Double-click an element (alias)',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'rightClick',
    description: 'Right-click an element (opens context menu)',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'contextMenu',
    description: 'Right-click an element (alias)',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'dragAndDrop',
    description: 'Drag an element and drop it on another element',
    args: [
      { name: 'sourceIndex', type: 'number' },
      { name: 'targetIndex', type: 'number' },
    ],
  },

  // ============================================================================
  // KEYBOARD ACTIONS
  // ============================================================================
  {
    name: 'press',
    description: 'Press a single key or key combination',
    args: [
      { name: 'key', type: 'string' },
      { name: 'modifiers', type: 'string', optional: true, array: true },
    ],
  },
  {
    name: 'pressKey',
    description: 'Press a single key (alias)',
    args: [
      { name: 'key', type: 'string' },
      { name: 'modifiers', type: 'string', optional: true, array: true },
    ],
  },
  {
    name: 'type',
    description: 'Type text character by character (simulates real typing)',
    args: [
      { name: 'text', type: 'string' },
      { name: 'delay', type: 'number', optional: true },
    ],
  },
  {
    name: 'typeText',
    description: 'Type text character by character (alias)',
    args: [
      { name: 'text', type: 'string' },
      { name: 'delay', type: 'number', optional: true },
    ],
  },
  {
    name: 'focus',
    description: 'Focus an element',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'blur',
    description: 'Remove focus from an element',
    args: [
      { name: 'index', type: 'number' },
    ],
  },

  // ============================================================================
  // JAVASCRIPT EXECUTION
  // ============================================================================
  {
    name: 'evaluate',
    description: 'Execute custom JavaScript code on the page',
    args: [
      { name: 'code', type: 'string' },
    ],
  },

  // ============================================================================
  // TAB MANAGEMENT
  // ============================================================================
  {
    name: 'createTab',
    description: 'Create a new browser tab',
    args: [
      { name: 'url', type: 'string', optional: true },
      { name: 'active', type: 'boolean', optional: true },
    ],
  },
  {
    name: 'switch',
    description: 'Switch between browser tabs',
    args: [
      { name: 'tabId', type: 'string' },
    ],
  },
  {
    name: 'switchTab',
    description: 'Switch between browser tabs (alias)',
    args: [
      { name: 'tabId', type: 'string' },
    ],
  },
  {
    name: 'close',
    description: 'Close browser tabs',
    args: [
      { name: 'tabId', type: 'string' },
    ],
  },
  {
    name: 'closeTab',
    description: 'Close browser tabs (alias)',
    args: [
      { name: 'tabId', type: 'string' },
    ],
  },
  {
    name: 'getTabs',
    description: 'Get list of all open tabs',
    args: [
      { name: 'windowId', type: 'number', optional: true },
      { name: 'activeOnly', type: 'boolean', optional: true },
    ],
  },
  {
    name: 'listTabs',
    description: 'Get list of all open tabs (alias)',
    args: [
      { name: 'windowId', type: 'number', optional: true },
      { name: 'activeOnly', type: 'boolean', optional: true },
    ],
  },

  // ============================================================================
  // FORM CONTROLS
  // ============================================================================
  {
    name: 'check',
    description: 'Check a checkbox or radio button',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'uncheck',
    description: 'Uncheck a checkbox or radio button',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'dropdownOptions',
    description: 'Get all options from a native dropdown or ARIA menu',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'selectDropdown',
    description: 'Select dropdown option by text or value',
    args: [
      { name: 'index', type: 'number' },
      { name: 'value', type: 'string', optional: true },
      { name: 'text', type: 'string', optional: true },
      { name: 'multiple', type: 'boolean', optional: true },
    ],
  },
  {
    name: 'selectOption',
    description: 'Select dropdown option (alias)',
    args: [
      { name: 'index', type: 'number' },
      { name: 'value', type: 'string', optional: true },
      { name: 'text', type: 'string', optional: true },
      { name: 'multiple', type: 'boolean', optional: true },
    ],
  },

  // ============================================================================
  // ELEMENT QUERIES
  // ============================================================================
  {
    name: 'getText',
    description: 'Get text content from an element',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'getAttribute',
    description: 'Get attribute value from an element',
    args: [
      { name: 'index', type: 'number' },
      { name: 'attribute', type: 'string' },
    ],
  },
  {
    name: 'getBoundingBox',
    description: 'Get element position and size (bounding box)',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'isVisible',
    description: 'Check if element is visible on the page',
    args: [
      { name: 'index', type: 'number' },
    ],
  },
  {
    name: 'isEnabled',
    description: 'Check if element is enabled (not disabled)',
    args: [
      { name: 'index', type: 'number' },
    ],
  },

  // ============================================================================
  // VISUAL ACTIONS
  // ============================================================================
  {
    name: 'screenshot',
    description: 'Capture a screenshot of the page or element',
    args: [
      { name: 'fullPage', type: 'boolean', optional: true },
      { name: 'elementIndex', type: 'number', optional: true },
      { name: 'format', type: 'string', optional: true },
      { name: 'quality', type: 'number', optional: true },
    ],
  },
  {
    name: 'generatePdf',
    description: 'Generate PDF from the current page',
    args: [
      { name: 'format', type: 'string', optional: true },
      { name: 'landscape', type: 'boolean', optional: true },
      { name: 'margin', type: 'string', optional: true }, // JSON string
      { name: 'printBackground', type: 'boolean', optional: true },
    ],
  },

  // ============================================================================
  // DIALOG HANDLING
  // ============================================================================
  {
    name: 'acceptDialog',
    description: 'Accept or dismiss browser dialogs (alert, confirm, prompt)',
    args: [
      { name: 'text', type: 'string', optional: true },
    ],
  },
  {
    name: 'accept_dialog',
    description: 'Accept or dismiss browser dialogs (alias)',
    args: [
      { name: 'text', type: 'string', optional: true },
    ],
  },
  {
    name: 'dismissDialog',
    description: 'Dismiss browser dialogs',
    args: [],
  },
  {
    name: 'dismiss_dialog',
    description: 'Dismiss browser dialogs (alias)',
    args: [],
  },
  {
    name: 'waitForDialog',
    description: 'Wait for a dialog to appear and optionally handle it',
    args: [
      { name: 'timeout', type: 'number', optional: true },
      { name: 'autoAccept', type: 'boolean', optional: true },
    ],
  },
  {
    name: 'wait_for_dialog',
    description: 'Wait for a dialog to appear (alias)',
    args: [
      { name: 'timeout', type: 'number', optional: true },
      { name: 'autoAccept', type: 'boolean', optional: true },
    ],
  },

  // ============================================================================
  // NETWORK CONTROL
  // ============================================================================
  {
    name: 'interceptRequest',
    description: 'Intercept and modify network requests',
    args: [
      { name: 'urlPattern', type: 'string' },
      { name: 'action', type: 'string' },
      { name: 'modifications', type: 'string', optional: true },
    ],
  },
  {
    name: 'intercept_request',
    description: 'Intercept and modify network requests (alias)',
    args: [
      { name: 'urlPattern', type: 'string' },
      { name: 'action', type: 'string' },
      { name: 'modifications', type: 'string', optional: true },
    ],
  },
  {
    name: 'mockResponse',
    description: 'Mock network responses for specific URLs',
    args: [
      { name: 'urlPattern', type: 'string' },
      { name: 'response', type: 'string' },
    ],
  },
  {
    name: 'mock_response',
    description: 'Mock network responses (alias)',
    args: [
      { name: 'urlPattern', type: 'string' },
      { name: 'response', type: 'string' },
    ],
  },

  // ============================================================================
  // STORAGE & COOKIES
  // ============================================================================
  {
    name: 'getCookies',
    description: 'Get cookies for the page or domain',
    args: [
      { name: 'url', type: 'string', optional: true },
    ],
  },
  {
    name: 'get_cookies',
    description: 'Get cookies (alias)',
    args: [
      { name: 'url', type: 'string', optional: true },
    ],
  },
  {
    name: 'setCookie',
    description: 'Set a cookie for the page',
    args: [
      { name: 'name', type: 'string' },
      { name: 'value', type: 'string' },
      { name: 'domain', type: 'string', optional: true },
      { name: 'path', type: 'string', optional: true },
      { name: 'expires', type: 'number', optional: true },
      { name: 'httpOnly', type: 'boolean', optional: true },
      { name: 'secure', type: 'boolean', optional: true },
      { name: 'sameSite', type: 'string', optional: true },
    ],
  },
  {
    name: 'set_cookie',
    description: 'Set a cookie (alias)',
    args: [
      { name: 'name', type: 'string' },
      { name: 'value', type: 'string' },
      { name: 'domain', type: 'string', optional: true },
      { name: 'path', type: 'string', optional: true },
      { name: 'expires', type: 'number', optional: true },
      { name: 'httpOnly', type: 'boolean', optional: true },
      { name: 'secure', type: 'boolean', optional: true },
      { name: 'sameSite', type: 'string', optional: true },
    ],
  },
  {
    name: 'clearCookies',
    description: 'Clear all cookies for the page or domain',
    args: [
      { name: 'url', type: 'string', optional: true },
    ],
  },
  {
    name: 'clear_cookies',
    description: 'Clear cookies (alias)',
    args: [
      { name: 'url', type: 'string', optional: true },
    ],
  },
  {
    name: 'getLocalStorage',
    description: 'Get localStorage values',
    args: [
      { name: 'key', type: 'string', optional: true },
    ],
  },
  {
    name: 'get_local_storage',
    description: 'Get localStorage (alias)',
    args: [
      { name: 'key', type: 'string', optional: true },
    ],
  },
  {
    name: 'setLocalStorage',
    description: 'Set localStorage value',
    args: [
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
  },
  {
    name: 'set_local_storage',
    description: 'Set localStorage (alias)',
    args: [
      { name: 'key', type: 'string' },
      { name: 'value', type: 'string' },
    ],
  },
  {
    name: 'clearStorage',
    description: 'Clear localStorage, sessionStorage, or IndexedDB',
    args: [
      { name: 'storageType', type: 'string' },
    ],
  },
  {
    name: 'clear_storage',
    description: 'Clear storage (alias)',
    args: [
      { name: 'storageType', type: 'string' },
    ],
  },

  // ============================================================================
  // PERFORMANCE & TRACING
  // ============================================================================
  {
    name: 'startTracing',
    description: 'Start performance tracing',
    args: [
      { name: 'categories', type: 'string', optional: true },
      { name: 'options', type: 'string', optional: true },
    ],
  },
  {
    name: 'start_tracing',
    description: 'Start tracing (alias)',
    args: [
      { name: 'categories', type: 'string', optional: true },
      { name: 'options', type: 'string', optional: true },
    ],
  },
  {
    name: 'stopTracing',
    description: 'Stop tracing and get trace data',
    args: [],
  },
  {
    name: 'stop_tracing',
    description: 'Stop tracing (alias)',
    args: [],
  },
  {
    name: 'getMetrics',
    description: 'Get performance metrics (load time, paint metrics, etc.)',
    args: [],
  },
  {
    name: 'get_metrics',
    description: 'Get metrics (alias)',
    args: [],
  },

  // ============================================================================
  // TASK COMPLETION
  // ============================================================================
  {
    name: 'finish',
    description: 'Indicates the task is finished',
    args: [],
  },
  {
    name: 'fail',
    description: 'Indicates that you are unable to complete the task',
    args: [],
  },
] as const;

type AvailableAction = (typeof availableActions)[number];

type ArgsToObject<T extends ReadonlyArray<{ name: string; type: string; optional?: boolean; array?: boolean }>> = {
  [K in T[number]['name']]: Extract<T[number], { name: K }>['optional'] extends true
    ? Extract<T[number], { name: K }>['type'] extends 'number'
      ? number | undefined
      : Extract<T[number], { name: K }>['type'] extends 'boolean'
      ? boolean | undefined
      : Extract<T[number], { name: K }>['array'] extends true
      ? string[] | undefined
      : string | undefined
    : Extract<T[number], { name: K }>['type'] extends 'number'
    ? number
    : Extract<T[number], { name: K }>['type'] extends 'boolean'
    ? boolean
    : Extract<T[number], { name: K }>['array'] extends true
    ? string[]
    : string;
};

export type ActionShape<
  T extends {
    name: string;
    args: ReadonlyArray<{ name: string; type: string; optional?: boolean; array?: boolean }>;
  }
> = {
  name: T['name'];
  args: ArgsToObject<T['args']>;
};

export type ActionPayload = {
  [K in AvailableAction['name']]: ActionShape<
    Extract<AvailableAction, { name: K }>
  >;
}[AvailableAction['name']];
