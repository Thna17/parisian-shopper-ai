const path = require('node:path');

module.exports = {
  rootDir: __dirname,
  moduleNameMapper: {
    '^@parisian-shopper/(.+)$': '<rootDir>/packages/$1/src',
    '^@valkey/valkey-glide$': '<rootDir>/packages/jobs/node_modules/@valkey/valkey-glide',
    '^bullmq$': '<rootDir>/packages/jobs/node_modules/bullmq',
    '^sharp$': '<rootDir>/packages/application/node_modules/sharp',
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
