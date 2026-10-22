import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { testEnv } from './fixtures/env.js';
import { createDatabase } from '../src/db/client.js';

it('connects the API to a real PostgreSQL database', async () => {
  if (!process.env.TEST_DATABASE_URL)
    throw new Error('Set TEST_DATABASE_URL to a dedicated test database.');
  const app = await buildApp(testEnv, createDatabase(process.env.TEST_DATABASE_URL));
  try {
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json().data.database).toBe('connected');
  } finally {
    await app.close();
  }
});
