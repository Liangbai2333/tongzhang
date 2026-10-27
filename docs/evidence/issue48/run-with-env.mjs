import { readFileSync } from 'node:fs';
import { spawn } from 'node:child_process';
const config = JSON.parse(
  readFileSync(process.env.ISSUE48_RUNTIME ?? '/tmp/tz48-runtime.json', 'utf8'),
);
const p = spawn('pnpm', process.argv.slice(2), {
  stdio: 'inherit',
  env: { ...process.env, ...config, PGDATABASE: process.env.PGDATABASE ?? config.PGDATABASE },
});
p.on('exit', (c) => process.exit(c ?? 1));
