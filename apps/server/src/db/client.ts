import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export function createDatabase(config: string | pg.PoolConfig) {
  const pool = new pg.Pool({
    ...(typeof config === 'string' ? { connectionString: config } : config),
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 5000,
  });
  return {
    orm: drizzle(pool, { schema }),
    pool,
    async check() {
      await pool.query('select 1');
    },
    async close() {
      await pool.end();
    },
  };
}
export type Database = ReturnType<typeof createDatabase>;
