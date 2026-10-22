import { readEnv } from '../../src/config/env.js';

// Tests that need a real database inject a connection using TEST_DATABASE_URL.
export const testEnv = readEnv({
  NODE_ENV: 'test',
  LOG_LEVEL: 'silent',
  PGHOST: '127.0.0.1',
  PGPORT: '1',
  PGUSER: 'test',
  PGPASSWORD: 'test',
  PGDATABASE: 'test',
});
