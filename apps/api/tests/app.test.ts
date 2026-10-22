import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { readEnv } from '../src/config/env.js';
import { healthResponseSchema, readyResponseSchema } from '@tongzhang/contracts';

const env = readEnv({
  NODE_ENV: 'test',
  DATABASE_URL: 'postgresql://test:test@127.0.0.1:1/test',
  LOG_LEVEL: 'silent',
});
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

describe('HTTP skeleton', () => {
  it('reports liveness without needing PostgreSQL and exports OpenAPI', async () => {
    const app = await buildApp(env);
    apps.push(app);
    const response = await app.inject('/health/live');
    expect(response.statusCode).toBe(200);
    expect(healthResponseSchema.parse(response.json()).data.status).toBe('ok');
    expect((await app.inject('/docs/json')).json().paths).toHaveProperty('/health/ready');
  });
  it('reports database availability, then a safe 503 on failure', async () => {
    const db = createDatabase(env.DATABASE_URL);
    const check = vi.spyOn(db, 'check').mockResolvedValue();
    const app = await buildApp(env, db);
    apps.push(app);
    expect(
      readyResponseSchema.parse((await app.inject('/health/ready')).json()).data.database,
    ).toBe('connected');
    check.mockRejectedValue(new Error('private connection details'));
    const response = await app.inject('/health/ready');
    expect(response.statusCode).toBe(503);
    expect(response.json().error.code).toBe('SERVICE_UNAVAILABLE');
    expect(response.body).not.toContain('private connection details');
  });
  it('uses structured errors and unique request IDs', async () => {
    const app = await buildApp(env);
    apps.push(app);
    const first = await app.inject('/missing');
    const second = await app.inject('/missing');
    expect(first.statusCode).toBe(404);
    expect(first.json().error.code).toBe('NOT_FOUND');
    expect(first.json().requestId).not.toBe(second.json().requestId);
  });
});
