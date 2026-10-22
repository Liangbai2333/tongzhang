import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { readEnv } from '../src/config/env.js';

it('connects the API to a real PostgreSQL database', async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error('Set TEST_DATABASE_URL to a dedicated test database.');
  const app = await buildApp(
    readEnv({ NODE_ENV: 'test', LOG_LEVEL: 'silent', DATABASE_URL: process.env.TEST_DATABASE_URL }),
  );
  try {
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json().data.database).toBe('connected');
  } finally {
    await app.close();
  }
});
