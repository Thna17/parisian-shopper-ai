const path = require('node:path');

module.exports = {
  rootDir: __dirname,
  moduleNameMapper: {
    '^@parisian-shopper/(.+)$': '<rootDir>/packages/$1/src',
    '^(\\.{1,2}/.*)\\.js$': '$1',
  },
  moduleFileExtensions: ['js', 'json', 'ts'],
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        tsconfig: path.join(__dirname, 'tsconfig.test.json'),
        useESM: true,
      },
    ],
  },
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  setupFiles: ['<rootDir>/test/setup-env.cjs'],
  clearMocks: true,
  restoreMocks: true,
};
