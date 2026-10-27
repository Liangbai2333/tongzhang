import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { testEnv } from './fixtures/env.js';
import { authResultSchema } from '@tongzhang/contracts';
import { testDatabaseUrl } from './fixtures/database.js';
const url = testDatabaseUrl();
const db = createDatabase(url);
let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
const password = 'correct-password-123';
async function register(username = '边界回归用户') {
  const email = `${randomUUID()}@example.test`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { username, email, password, acceptTerms: true },
  });
  expect(response.statusCode).toBe(201);
  const result = authResultSchema.parse(response.json().data);
  userIds.push(result.user.id);
  return result;
}
const login = (account: string, usePassword = password) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/login',
    payload: { account, password: usePassword },
  });
beforeAll(async () => {
  await db.check();
});
beforeEach(async () => {
  app = await buildApp(testEnv, createDatabase(url));
});
afterEach(async () => {
  await app.close();
});
afterAll(async () => {
  for (const id of userIds) {
    await db.pool.query('delete from auth_sessions where user_id=$1', [id]);
    await db.pool.query('delete from users where id=$1', [id]);
  }
  await db.close();
});

describe('real PostgreSQL login boundary regressions', () => {
  it('logs in with a unique username and issues an independent second session', async () => {
    const username = `用户-${randomUUID().slice(0, 8)}`;
    const account = await register(username);
    const response = await login(username);
    expect(response.statusCode).toBe(200);
    const replay = authResultSchema.parse(response.json().data);
    expect(replay.user.id).toBe(account.user.id);
    expect(replay).not.toHaveProperty('passwordHash');
    expect(replay.refreshToken).not.toBe(account.refreshToken);
    for (const token of [account.accessToken, replay.accessToken]) {
      const me = await app.inject({
        url: '/api/v1/me',
        headers: { authorization: `Bearer ${token}` },
      });
      expect(me.statusCode).toBe(200);
      expect(me.json().data.id).toBe(account.user.id);
    }
    const sessions = await db.pool.query(
      'select count(*)::int as count from auth_sessions where user_id=$1 and revoked_at is null',
      [account.user.id],
    );
    expect(sessions.rows[0].count).toBe(2);
  });
  it('rejects anonymous logout and getMe with the contract error and no session effects', async () => {
    const anonymous = { method: 'POST' as const, url: '/api/v1/auth/logout' };
    const exited = await app.inject(anonymous);
    expect(exited.statusCode).toBe(401);
    expect(exited.json().error.code).toBe('UNAUTHENTICATED');
    const malformed = await app.inject({
      ...anonymous,
      headers: { authorization: 'Bearer !!!invalid===@' },
    });
    expect(malformed.statusCode).toBe(401);
    expect(malformed.json().error.code).toBe('UNAUTHENTICATED');
    const me = await app.inject({ url: '/api/v1/me' });
    expect(me.statusCode).toBe(401);
    expect(me.json().error.code).toBe('UNAUTHENTICATED');
  });
  it('throttles the eleventh unauthenticated login in the window without creating side effects', async () => {
    const ghost = `${randomUUID()}@example.test`;
    const before = await db.pool.query(
      'select count(*)::int as count from auth_sessions where user_id in (select id from users where email=$1)',
      [ghost],
    );
    const attempts = [] as Awaited<ReturnType<typeof login>>[];
    for (let index = 0; index < 11; index += 1) attempts.push(await login(ghost, 'whatever-1'));
    const statuses = attempts.map((attempt) => attempt.statusCode);
    expect(statuses.slice(0, 10)).toEqual(Array.from({ length: 10 }, () => 401));
    expect(statuses.at(10)).toBe(429);
    expect(attempts.at(10)?.json().error.code).toBe('RATE_LIMITED');
    const after = await db.pool.query(
      'select count(*)::int as count from auth_sessions where user_id in (select id from users where email=$1)',
      [ghost],
    );
    expect(after.rows[0].count).toBe(before.rows[0].count);
  });
});
