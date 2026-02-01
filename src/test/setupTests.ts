/**
 * Jest Test Setup
 *
 * This file runs before all tests and sets up:
 * - Mock for query-selector-shadow-dom (ESM module)
 * - Mock for Chrome extension APIs
 * - Any global test utilities
 */

// ============================================================================
// MOCK: query-selector-shadow-dom
// ============================================================================

// Mock the Shadow DOM query functions since they're ESM and can be problematic
// Note: We use a simple mock that defers to the actual DOM in the test environment
jest.mock('query-selector-shadow-dom', () => {
  // Create mock functions that will be replaced in beforeEach
  const mockQuerySelectorAllDeep = jest.fn();
  const mockQuerySelectorDeep = jest.fn();

  return {
    querySelectorAllDeep: mockQuerySelectorAllDeep,
    querySelectorDeep: mockQuerySelectorDeep,
    // Allow tests to access the mocks
    __mocks: {
      querySelectorAllDeep: mockQuerySelectorAllDeep,
      querySelectorDeep: mockQuerySelectorDeep,
    },
  };
});

// After mocks are set up, configure the actual behavior
beforeEach(() => {
  // Get the mocked module
  const mockModule = jest.requireMock('query-selector-shadow-dom') as {
    querySelectorAllDeep: jest.Mock;
    querySelectorDeep: jest.Mock;
  };

  // Configure querySelectorAllDeep to use native querySelectorAll
  mockModule.querySelectorAllDeep.mockImplementation(
    (selector: string, root?: Element | null) => {
      const rootEl = root || document.body;
      if (!rootEl) return [];
      try {
        return Array.from(rootEl.querySelectorAll(selector));
      } catch {
        return [];
      }
    }
  );

  // Configure querySelectorDeep to use native querySelector
  mockModule.querySelectorDeep.mockImplementation(
    (selector: string, root?: Element | null) => {
      const rootEl = root || document.body;
      if (!rootEl) return null;
      try {
        return rootEl.querySelector(selector);
      } catch {
        return null;
      }
    }
  );
});

// ============================================================================
// MOCK: Chrome Extension APIs
// ============================================================================

const mockChrome = {
  runtime: {
    sendMessage: jest.fn(),
    onMessage: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
    getURL: (path: string) => `chrome-extension://mock-id/${path}`,
    lastError: null,
  },
  storage: {
    local: {
      get: jest.fn().mockImplementation(() => Promise.resolve({})),
      set: jest.fn().mockImplementation(() => Promise.resolve()),
      remove: jest.fn().mockImplementation(() => Promise.resolve()),
    },
    sync: {
      get: jest.fn().mockImplementation(() => Promise.resolve({})),
      set: jest.fn().mockImplementation(() => Promise.resolve()),
    },
  },
  tabs: {
    query: jest.fn().mockImplementation(() =>
      Promise.resolve([{ id: 1, url: 'https://example.com' }])
    ),
    sendMessage: jest.fn(),
  },
  debugger: {
    attach: jest.fn(),
    detach: jest.fn(),
    sendCommand: jest.fn(),
    onEvent: {
      addListener: jest.fn(),
      removeListener: jest.fn(),
    },
  },
};

// Set up global chrome object
Object.defineProperty(global, 'chrome', {
  value: mockChrome,
  writable: true,
});

// ============================================================================
// WINDOW/DOCUMENT PROPERTIES
// ============================================================================

// Ensure window dimensions are set
Object.defineProperty(window, 'innerWidth', { value: 1920, writable: true });
Object.defineProperty(window, 'innerHeight', { value: 1080, writable: true });
Object.defineProperty(window, 'scrollY', { value: 0, writable: true });

// Mock scrollHeight for viewport calculations
Object.defineProperty(document.documentElement, 'scrollHeight', {
  value: 2000,
  writable: true,
});

// ============================================================================
// CLEANUP HELPERS
// ============================================================================

// Reset DOM after each test
afterEach(() => {
  document.body.innerHTML = '';
});
