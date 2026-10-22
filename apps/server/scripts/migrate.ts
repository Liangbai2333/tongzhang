import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { databaseConfig, loadLocalEnv, readEnv } from '../src/config/env.ts';

loadLocalEnv();
const env = readEnv();
const migrationsFolder = fileURLToPath(new URL('../drizzle', import.meta.url));
if (!existsSync(`${migrationsFolder}/meta/_journal.json`))
  throw new Error('缺少已提交的数据库迁移，停止执行。');
const pool = new pg.Pool({ ...databaseConfig(env), connectionTimeoutMillis: 5000 });
try {
  const client = await pool.connect();
  try {
    // Serialize release jobs; API processes never run migrations themselves.
    await client.query("set lock_timeout = '30s'");
    await client.query('select pg_advisory_lock(734251, 1)');
    await migrate(drizzle(client), { migrationsFolder });
    console.log('数据库迁移完成。');
  } finally {
    client.release(true);
  }
} finally {
  await pool.end();
}
