import { randomUUID } from 'node:crypto';
import { decodeJwt } from 'jose';
import { afterAll, beforeAll, beforeEach, afterEach, describe, expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { createDatabase } from '../src/db/client.js';
import { testEnv } from './fixtures/env.js';
import { authResultSchema, tokenPairSchema } from '@tongzhang/contracts';
import { createAccessTokens } from '../src/modules/auth/tokens.js';
import { digestToken } from '../src/modules/auth/credentials.js';
const url = process.env.TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith('_test'))
  throw new Error('Use TEST_DATABASE_URL pointing to a dedicated database ending in _test.');
const db = createDatabase(url);
let app: Awaited<ReturnType<typeof buildApp>>;
const userIds: string[] = [];
const password = 'correct-password-123';
async function register() {
  const email = `${randomUUID()}@example.test`;
  const response = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: {
      username: '认证测试',
      email,
      password,
      acceptTerms: true,
    },
  });
  expect(response.statusCode).toBe(201);
  const result = authResultSchema.parse(response.json().data);
  userIds.push(result.user.id);
  return result;
}
const refresh = (refreshToken: string) =>
  app.inject({ method: 'POST', url: '/api/v1/auth/refresh', payload: { refreshToken } });
const getMe = (accessToken: string) =>
  app.inject({ url: '/api/v1/me', headers: { authorization: `Bearer ${accessToken}` } });
const logout = (accessToken: string) =>
  app.inject({
    method: 'POST',
    url: '/api/v1/auth/logout',
    headers: { authorization: `Bearer ${accessToken}` },
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

describe('real PostgreSQL dual-token authentication', () => {
  it('registers, logs in, rotates without extending the session, and immediately revokes on logout', async () => {
    const account = await register();
    expect((await getMe(account.accessToken)).json().data.id).toBe(account.user.id);
    expect(account).not.toHaveProperty('passwordHash');
    const response = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { account: account.user.email, password },
    });
    expect(response.statusCode).toBe(200);
    const login = authResultSchema.parse(response.json().data);
    const rotatedResponse = await refresh(login.refreshToken);
    expect(rotatedResponse.statusCode).toBe(200);
    expect(rotatedResponse.headers['cache-control']).toBe('no-store');
    const rotated = tokenPairSchema.parse(rotatedResponse.json().data);
    expect(rotated.refreshToken).not.toBe(login.refreshToken);
    expect(rotated.refreshTokenExpiresAt).toBe(login.refreshTokenExpiresAt);
    expect((await getMe(rotated.accessToken)).statusCode).toBe(200);
    // Rotation does not revoke still-valid access tokens for the same session.
    expect((await getMe(login.accessToken)).statusCode).toBe(200);
    expect((await logout(rotated.accessToken)).statusCode).toBe(200);
    expect((await getMe(login.accessToken)).statusCode).toBe(401);
    expect((await getMe(rotated.accessToken)).statusCode).toBe(401);
    expect((await refresh(rotated.refreshToken)).statusCode).toBe(401);
    // The other device/session remains usable.
    expect((await getMe(account.accessToken)).statusCode).toBe(200);
    const hashes = await db.pool.query(
      'select token_hash from auth_refresh_tokens where session_id=$1',
      [decodeJwt(login.accessToken).sid],
    );
    expect(hashes.rows.map((row) => row.token_hash)).toEqual(
      expect.arrayContaining([digestToken(login.refreshToken), digestToken(rotated.refreshToken)]),
    );
    expect(JSON.stringify(hashes.rows)).not.toContain(login.refreshToken);
  });
  it('commits revocation on refresh replay, invalidating the replacement pair', async () => {
    const account = await register();
    const rotated = tokenPairSchema.parse((await refresh(account.refreshToken)).json().data);
    expect((await refresh(account.refreshToken)).statusCode).toBe(401);
    expect((await getMe(rotated.accessToken)).statusCode).toBe(401);
    expect((await refresh(rotated.refreshToken)).statusCode).toBe(401);
    const state = await db.pool.query('select revoked_at from auth_sessions where id=$1', [
      decodeJwt(account.accessToken).sid,
    ]);
    expect(state.rows[0].revoked_at).not.toBeNull();
  });
  it('serializes duplicate refreshes and treats the duplicate as replay', async () => {
    const account = await register();
    const responses = await Promise.all([
      refresh(account.refreshToken),
      refresh(account.refreshToken),
    ]);
    expect(responses.map((response) => response.statusCode).sort()).toEqual([200, 401]);
    const success = tokenPairSchema.parse(
      responses.find((response) => response.statusCode === 200)!.json().data,
    );
    expect((await getMe(success.accessToken)).statusCode).toBe(401);
    const count = await db.pool.query(
      'select count(*)::int as count from auth_refresh_tokens where session_id=$1',
      [decodeJwt(account.accessToken).sid],
    );
    expect(count.rows[0].count).toBe(2);
  });
  it('serializes refresh and logout so the final state is revoked', async () => {
    const account = await register();
    const [rotated, exited] = await Promise.all([
      refresh(account.refreshToken),
      logout(account.accessToken),
    ]);
    expect(exited.statusCode).toBe(200);
    expect([200, 401]).toContain(rotated.statusCode);
    expect((await getMe(account.accessToken)).statusCode).toBe(401);
    if (rotated.statusCode === 200) {
      const pair = tokenPairSchema.parse(rotated.json().data);
      expect((await getMe(pair.accessToken)).statusCode).toBe(401);
      expect((await refresh(pair.refreshToken)).statusCode).toBe(401);
    }
  });
  it('rejects expired access but allows refresh until the absolute session expiry', async () => {
    const account = await register();
    const sessionId = String(decodeJwt(account.accessToken).sid);
    const expired = await createAccessTokens(testEnv.AUTH_JWT_SECRET).issue(
      { userId: account.user.id, sessionId },
      new Date(account.refreshTokenExpiresAt),
      new Date(Date.now() - 16 * 60_000),
    );
    expect((await getMe(expired.accessToken)).statusCode).toBe(401);
    const rotatedResponse = await refresh(account.refreshToken);
    expect(rotatedResponse.statusCode).toBe(200);
    const rotated = tokenPairSchema.parse(rotatedResponse.json().data);
    await db.pool.query(
      "update auth_sessions set created_at=now()-interval '31 days', expires_at=now()-interval '1 day' where id=$1",
      [sessionId],
    );
    expect((await getMe(account.accessToken)).statusCode).toBe(401);
    expect((await refresh(rotated.refreshToken)).statusCode).toBe(401);
  });
  it('rejects malformed, unknown and wrong-purpose credentials without revoking a valid session', async () => {
    const account = await register();
    expect((await refresh('malformed')).statusCode).toBe(400);
    expect((await refresh('A'.repeat(43))).statusCode).toBe(401);
    expect((await refresh(account.accessToken)).statusCode).toBe(400);
    expect((await getMe(account.refreshToken)).statusCode).toBe(401);
    const wrongIdentity = await createAccessTokens(testEnv.AUTH_JWT_SECRET).issue(
      { userId: randomUUID(), sessionId: String(decodeJwt(account.accessToken).sid) },
      new Date(account.refreshTokenExpiresAt),
    );
    expect((await getMe(wrongIdentity.accessToken)).statusCode).toBe(401);
    expect((await getMe(account.accessToken)).statusCode).toBe(200);
  });
  it('preserves credential errors and registration uniqueness without creating extra sessions', async () => {
    const account = await register();
    const badLogin = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { account: account.user.email, password: 'incorrect' },
    });
    expect(badLogin.statusCode).toBe(401);
    expect(badLogin.json().error.code).toBe('INVALID_CREDENTIALS');
    const duplicate = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { username: '重复注册', email: account.user.email, password, acceptTerms: true },
    });
    expect(duplicate.statusCode).toBe(409);
    const count = await db.pool.query(
      'select count(*)::int as count from auth_sessions where user_id=$1',
      [account.user.id],
    );
    expect(count.rows[0].count).toBe(1);
  });
});
