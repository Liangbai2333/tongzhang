import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { existsSync, writeFileSync } from 'node:fs';
if (['/tmp/tz60-postgres.env', '/tmp/tz60-runtime.json'].some(existsSync))
  throw new Error(
    'Existing Issue60 private configuration must be preserved; use a fresh task namespace.',
  );
const password = randomBytes(24).toString('hex');
writeFileSync(
  '/tmp/tz60-postgres.env',
  `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=tongzhang_60_test\n`,
  { mode: 0o600 },
);
execFileSync('docker', [
  'run',
  '-d',
  '--name',
  'tongzhang-60-postgres',
  '--env-file',
  '/tmp/tz60-postgres.env',
  '-p',
  '127.0.0.1::5432',
  'postgres:17-alpine',
]);
const port = execFileSync('docker', ['port', 'tongzhang-60-postgres', '5432/tcp'], {
  encoding: 'utf8',
})
  .trim()
  .split(':')
  .at(-1);
writeFileSync(
  '/tmp/tz60-runtime.json',
  JSON.stringify({
    PGHOST: '127.0.0.1',
    PGPORT: port,
    PGUSER: 'postgres',
    PGPASSWORD: password,
    PGDATABASE: 'tongzhang_60_test',
    AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/tongzhang_60_test`,
  }),
  { mode: 0o600 },
);
console.log('Dedicated PostgreSQL container created at localhost:' + port);
