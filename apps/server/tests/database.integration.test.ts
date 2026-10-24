import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { testEnv } from './fixtures/env.js';
import { createDatabase } from '../src/db/client.js';
import { testDatabaseUrl } from './fixtures/database.js';

it('connects the API to a real PostgreSQL database', async () => {
  const app = await buildApp(testEnv, createDatabase(testDatabaseUrl()));
  try {
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(200);
    expect(response.json().data.database).toBe('connected');
  } finally {
    await app.close();
  }
});
