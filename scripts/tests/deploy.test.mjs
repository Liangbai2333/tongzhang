import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  existsSync,
  rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.each([false, true])(
  'gates service updates on migration success (failure=%s)',
  (failMigration) => {
    const dir = mkdtempSync(join(tmpdir(), 'tongzhang-deploy-test-'));
    try {
      const bin = join(dir, 'bin');
      mkdirSync(bin);
      copyFileSync(new URL('../../infra/deploy.sh', import.meta.url), join(dir, 'deploy.sh'));
      writeFileSync(join(dir, '.env'), '# Test fixture; never contacts a real deployment.\n');
      writeFileSync(
        join(bin, 'docker'),
        `#!/usr/bin/env node
const fs = require('node:fs');
const args = process.argv.slice(2).join(' ');
fs.appendFileSync(process.env.PROBE_LOG, args + '\\n');
if (args.includes('pg_dump')) console.log('test-backup');
if (args.includes('run --rm migrate') && process.env.FAIL_MIGRATION === '1') process.exit(1);
if (args.includes('printenv API_DOMAIN')) console.log('api.example.com');
if (args.includes('images -q server')) console.log('sha256:test');
`,
        { mode: 0o755 },
      );
      writeFileSync(join(bin, 'curl'), '#!/bin/sh\nprintf "https-check\\n" >> "$PROBE_LOG"\n', {
        mode: 0o755,
      });
      const log = join(dir, 'calls.log');
      const result = spawnSync('bash', [join(dir, 'deploy.sh')], {
        env: {
          ...process.env,
          PATH: `${bin}:${process.env.PATH}`,
          PROBE_LOG: log,
          FAIL_MIGRATION: failMigration ? '1' : '0',
        },
        encoding: 'utf8',
      });
      const calls = readFileSync(log, 'utf8');
      expect(calls.indexOf('pg_dump')).toBeLessThan(calls.indexOf('run --rm migrate'));
      expect(existsSync(join(dir, '.deploy.lock'))).toBe(false);
      if (failMigration) {
        expect(result.status).not.toBe(0);
        expect(calls).not.toContain('120 server caddy');
        expect(calls).not.toContain('https-check');
        expect(existsSync(join(dir, '.deployments.log'))).toBe(false);
      } else {
        expect(result.status).toBe(0);
        expect(calls.indexOf('run --rm migrate')).toBeLessThan(calls.indexOf('120 server caddy'));
        expect(calls).toContain('https-check');
        expect(readFileSync(join(dir, '.deployments.log'), 'utf8')).toContain('image=sha256:test');
      }
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  },
);
