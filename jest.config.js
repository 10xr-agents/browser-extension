/** Jest config (JS) so Jest can run without ts-node. See jest.config.ts for full config. */
module.exports = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  transform: {
    '\\.[jt]sx?$': 'babel-jest',
  },
};
