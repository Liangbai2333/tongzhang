import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { expect, it } from 'vitest';

it.each(['missing-file', 'missing-key', 'empty-key', 'configured-key'])(
  'initializes a local signing secret without overwriting configured values (%s)',
  (mode) => {
    const root = mkdtempSync(join(tmpdir(), 'tongzhang-setup-test-'));
    try {
      mkdirSync(join(root, 'scripts'));
      for (const name of ['server', 'mobile']) {
        mkdirSync(join(root, 'apps', name), { recursive: true });
        writeFileSync(
          join(root, 'apps', name, '.env.example'),
          name === 'server' ? 'PGPORT=35432\nAUTH_JWT_SECRET=\n' : 'APP_VARIANT=development\n',
        );
      }
      copyFileSync(
        new URL('../setup-env.mjs', import.meta.url),
        join(root, 'scripts', 'setup-env.mjs'),
      );
      const destination = join(root, 'apps', 'server', '.env');
      if (mode !== 'missing-file') {
        const setting =
          mode === 'missing-key'
            ? ''
            : `AUTH_JWT_SECRET=${mode === 'configured-key' ? 'ab'.repeat(32) : ''}\n`;
        writeFileSync(destination, `PGPORT=34567\n${setting}`);
      }
      const run = () =>
        spawnSync(process.execPath, [join(root, 'scripts', 'setup-env.mjs')], { encoding: 'utf8' });
      const first = run();
      expect(first.status).toBe(0);
      const content = readFileSync(destination, 'utf8');
      const key = /^AUTH_JWT_SECRET=([0-9a-f]{64})$/m.exec(content)?.[1];
      expect(key).toBeDefined();
      expect(first.stdout).not.toContain(key);
      expect(content).toContain(mode === 'missing-file' ? 'PGPORT=35432' : 'PGPORT=34567');
      if (mode === 'configured-key') expect(key).toBe('ab'.repeat(32));
      expect(run().status).toBe(0);
      expect(readFileSync(destination, 'utf8')).toBe(content);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  },
);
