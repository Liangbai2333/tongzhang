import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../src/db/client.js';
import { testDatabaseUrl } from './fixtures/database.js';
const url = testDatabaseUrl();
const db = createDatabase(url);
beforeAll(async () => {
  await migrate(db.orm, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
});
afterAll(async () => db.close());
it('migrates all 14 tables and 112 columns and can migrate a second time', async () => {
  await migrate(db.orm, {
    migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)),
  });
  const tables = await db.pool.query(
    "select count(*)::int as count from information_schema.tables where table_schema='public' and table_type='BASE TABLE'",
  );
  const columns = await db.pool.query(
    "select count(*)::int as count from information_schema.columns where table_schema='public'",
  );
  expect(tables.rows[0].count).toBe(14);
  expect(columns.rows[0].count).toBe(112);
});
it('enforces constraints and clears balances without changing expense totals', async () => {
  const client = await db.pool.connect();
  try {
    await client.query(
      await readFile(new URL('./fixtures/ledger-lifecycle.sql', import.meta.url), 'utf8'),
    );
  } finally {
    await client.query('ROLLBACK');
    client.release();
  }
});

it('checks real sessions and parses transformed queries exactly once', async () => {
  const { randomUUID } = await import('node:crypto');
  const { buildApp } = await import('../src/app.js');
  const { testEnv } = await import('./fixtures/env.js');
  const { createAccessTokens } = await import('../src/modules/auth/tokens.js');
  const userId = randomUUID();
  const sessionId = randomUUID();
  const issued = await createAccessTokens(testEnv.AUTH_JWT_SECRET).issue(
    { userId, sessionId },
    new Date(Date.now() + 86400000),
  );
  const app = await buildApp(testEnv, createDatabase(url));
  try {
    await db.pool.query(
      "insert into users (id, username, email, password_hash) values ($1,'测试用户',$2,'$argon2id$fixture')",
      [userId, `${userId}@example.test`],
    );
    await db.pool.query('insert into auth_sessions (user_id, id, expires_at) values ($1,$2,$3)', [
      userId,
      sessionId,
      new Date(Date.now() + 86400000),
    ]);
    const response = await app.inject({
      url: '/api/v1/ledgers?archived=false&limit=20',
      headers: { authorization: `Bearer ${issued.accessToken}` },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ data: [], page: { nextCursor: null } });
    await db.pool.query('update auth_sessions set revoked_at=now() where user_id=$1', [userId]);
    expect(
      (
        await app.inject({
          url: '/api/v1/ledgers',
          headers: { authorization: `Bearer ${issued.accessToken}` },
        })
      ).statusCode,
    ).toBe(401);
  } finally {
    await app.close();
    await db.pool.query('delete from auth_sessions where user_id=$1', [userId]);
    await db.pool.query('delete from users where id=$1', [userId]);
  }
});
