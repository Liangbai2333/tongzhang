import pg from 'pg';
import { databaseConfig, loadLocalEnv, readEnv } from '../src/config/env.ts';

loadLocalEnv();
const pool = new pg.Pool({ ...databaseConfig(readEnv()), connectionTimeoutMillis: 3000 });
try {
  await pool.query('select 1');
  console.log('开发数据库连接正常。');
} catch {
  console.error('数据库不可用，请检查服务端 .env 并执行 pnpm up:db。');
  process.exitCode = 1;
} finally {
  await pool.end();
}
