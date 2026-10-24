const base = require('./jest.base.cjs');

module.exports = {
  ...base,
  displayName: 'e2e',
  testMatch: [
    '<rootDir>/apps/**/test/e2e/**/*.e2e-spec.ts',
    '<rootDir>/tests/e2e/**/*.e2e.ts',
    '<rootDir>/tests/e2e/**/*.e2e-spec.ts',
  ],
  testTimeout: 120000,
};
