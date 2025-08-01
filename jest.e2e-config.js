const config = require('./jest.config.js');
module.exports = {
  ...config,
  testRegex: '\\.(e2e-)?spec\\.ts$',
};
