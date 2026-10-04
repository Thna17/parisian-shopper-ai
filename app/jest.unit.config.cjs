const base = require('./jest.base.cjs');

module.exports = {
  ...base,
  displayName: 'unit',
  testMatch: ['<rootDir>/{apps,packages}/**/*.spec.ts'],
  testPathIgnorePatterns: ['/test/integration/', '/test/e2e/'],
};
