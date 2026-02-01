/** Jest config (JS) so Jest can run without ts-node. See jest.config.ts for full config. */
module.exports = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  transform: {
    '\\.[jt]sx?$': 'babel-jest',
  },
  // Transform ESM modules that Jest can't handle natively
  transformIgnorePatterns: [
    '/node_modules/(?!(query-selector-shadow-dom)/)',
  ],
  // Setup files for test environment
  setupFilesAfterEnv: ['<rootDir>/src/test/setupTests.ts'],
};
