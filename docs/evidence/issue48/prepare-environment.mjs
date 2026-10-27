import { execFileSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { writeFileSync } from 'node:fs';
const password = randomBytes(24).toString('hex');
writeFileSync(
  '/tmp/tz48-postgres.env',
  `POSTGRES_PASSWORD=${password}\nPOSTGRES_DB=tongzhang_48_test\n`,
  { mode: 0o600 },
);
execFileSync('docker', [
  'run',
  '-d',
  '--name',
  'tongzhang-48-postgres',
  '--env-file',
  '/tmp/tz48-postgres.env',
  '-p',
  '127.0.0.1::5432',
  'postgres:17-alpine',
]);
const port = execFileSync('docker', ['port', 'tongzhang-48-postgres', '5432/tcp'], {
  encoding: 'utf8',
})
  .trim()
  .split(':')
  .at(-1);
writeFileSync(
  '/tmp/tz48-runtime.json',
  JSON.stringify({
    PGHOST: '127.0.0.1',
    PGPORT: port,
    PGUSER: 'postgres',
    PGPASSWORD: password,
    PGDATABASE: 'tongzhang_48_test',
    AUTH_JWT_SECRET: randomBytes(32).toString('hex'),
    TEST_DATABASE_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/tongzhang_48_test`,
  }),
  { mode: 0o600 },
);
console.log('Dedicated PostgreSQL container created at localhost:' + port);
