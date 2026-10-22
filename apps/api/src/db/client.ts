import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';

export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: 3000,
    idleTimeoutMillis: 30_000,
    statement_timeout: 5000,
  });
  return {
    orm: drizzle(pool),
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
