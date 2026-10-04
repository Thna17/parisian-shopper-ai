import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';

const infrastructureImports = [
  '@prisma/client',
  'bullmq',
  '@valkey/valkey-glide',
  'express',
  'grammy',
  'openai',
  '@parisian-shopper/database',
  '@parisian-shopper/jobs',
  '@parisian-shopper/logger',
];

export default tseslint.config(
  {
    ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**'],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.cjs'],
    languageOptions: {
      globals: {
        __dirname: 'readonly',
        module: 'readonly',
        process: 'readonly',
        require: 'readonly',
      },
    },
  },
  ...tseslint.configs.recommendedTypeChecked.map((configuration) => ({
    ...configuration,
    files: ['**/*.ts'],
  })),
  {
    files: ['**/*.ts'],
    languageOptions: {
      parserOptions: {
        project: ['./tsconfig.test.json', './apps/*/tsconfig.json', './packages/*/tsconfig.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    files: ['packages/common/src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            '@nestjs/*',
            '@prisma/*',
            'bullmq',
            '@valkey/*',
            'express',
            'grammy',
            'openai',
            '@parisian-shopper/database',
            '@parisian-shopper/jobs',
            '@parisian-shopper/logger',
          ],
        },
      ],
    },
  },
  {
    files: ['packages/application/src/**/*.ts'],
    rules: {
      'no-restricted-imports': ['error', { paths: infrastructureImports }],
    },
  },
  {
    files: ['apps/api/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: ['@prisma/client', 'bullmq', '@valkey/valkey-glide'],
        },
      ],
    },
  },
);
