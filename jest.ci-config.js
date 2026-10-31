const config = require('./jest.e2e-config.js');

module.exports = {
  ...config,
  testRegex: '\\.test-build/src/.*\\.(e2e-)?spec\\.js$',
  transform: { '^.+\\.js$': 'babel-jest' },
  setupFilesAfterEnv: ['<rootDir>/.test-build/jest.setup.js'],
  globalSetup: '<rootDir>/.test-build/test/jest-e2e-setup.js',
  globalTeardown: '<rootDir>/.test-build/test/jest-e2e-teardown.js',
  collectCoverageFrom: ['<rootDir>/.test-build/src/**/*.js'],
  moduleNameMapper: {
    '^omniboxd/(.*)$': '<rootDir>/.test-build/src/$1',
    '^test/(.*)$': '<rootDir>/.test-build/test/$1',
  },
};
