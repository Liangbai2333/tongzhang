import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globalSetup: ['apps/server/tests/fixtures/migrate-database.ts'],
    include: ['apps/server/tests/**/*.integration.test.ts'],
  },
});
