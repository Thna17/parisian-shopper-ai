const base = require('./jest.base.cjs');

module.exports = {
  ...base,
  displayName: 'integration',
  testMatch: ['<rootDir>/{apps,packages}/**/test/integration/**/*.integration-spec.ts'],
  testTimeout: 120000,
};
