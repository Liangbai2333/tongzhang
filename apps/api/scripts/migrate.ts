import { existsSync } from 'node:fs';
import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { loadLocalEnv, readEnv } from '../src/config/env.ts';

loadLocalEnv();
const env = readEnv();
const pool = new pg.Pool({ connectionString: env.DATABASE_URL, connectionTimeoutMillis: 5000 });
try {
  await pool.query('select 1');
  if (!existsSync('drizzle/meta/_journal.json')) {
    console.log('数据库连接正常；工程骨架尚无业务表迁移。添加表定义后运行 pnpm db:generate。');
  } else {
    await migrate(drizzle(pool), { migrationsFolder: 'drizzle' });
    console.log('数据库迁移完成。');
  }
} finally {
  await pool.end();
}
