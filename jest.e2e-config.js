const config = require('./jest.config.js');
module.exports = {
  ...config,
  testRegex: '\\.(e2e-)?spec\\.ts$',
  globalSetup: '<rootDir>/test/jest-e2e-setup.ts',
  globalTeardown: '<rootDir>/test/jest-e2e-teardown.ts',
  testSequencer: '<rootDir>/test/custom-sequencer.js',
  testTimeout: 300000, // 5 minutes timeout for e2e tests with containers
};
