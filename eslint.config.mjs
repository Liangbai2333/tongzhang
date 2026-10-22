import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.expo/**',
      '**/expo-env.d.ts',
      '**/android/**',
      '**/ios/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mjs}'],
    languageOptions: {
      globals: {
        process: 'readonly',
        console: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        AbortController: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        __DEV__: 'readonly',
      },
    },
    rules: { '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }] },
  },
  {
    files: ['packages/*/src/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                'node:*',
                'react-native',
                'expo*',
                'fastify',
                'fastify/*',
                'drizzle-orm',
                'drizzle-orm/*',
                'pg',
                '**/apps/**',
              ],
              message: '共享包只能依赖跨端基础库，不能导入应用或平台实现。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/mobile/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '@tongzhang/server',
                '@tongzhang/server/*',
                '**/server/src/**',
                'drizzle-orm',
                'drizzle-orm/*',
                'pg',
              ],
              message: '移动端只能通过contracts/domain和HTTP访问服务端。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/server/src/{config,db,http}/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/modules/**'],
              message: 'config/db/http是基础层，不能依赖业务模块；需要的能力由模块注入。',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['apps/server/src/modules/*/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              regex: '^\\.\\./(?!\\.)[^/]+/(?!index\\.js$)',
              message: '跨模块只能导入对方的index.js出口。',
            },
          ],
        },
      ],
    },
  },
];
