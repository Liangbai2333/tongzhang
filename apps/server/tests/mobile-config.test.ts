import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { expect, it } from 'vitest';

const config = fileURLToPath(new URL('../../mobile/app.config.ts', import.meta.url));
it.each(['', 'http://localhost:3300', 'https://user:secret@example.com', 'not-a-url'])(
  'rejects an invalid release API URL (%s)',
  (url) => {
    const result = spawnSync(process.execPath, [config], {
      env: { ...process.env, APP_VARIANT: 'production', EXPO_PUBLIC_API_BASE_URL: url },
      encoding: 'utf8',
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain('EXPO_PUBLIC_API_BASE_URL');
    expect(result.stderr).not.toContain('user:secret');
  },
);
it('accepts an explicit HTTPS release address and a local development address', () => {
  for (const [variant, url] of [
    ['production', 'https://api.example.com'],
    ['development', 'http://localhost:3300'],
  ]) {
    expect(
      spawnSync(process.execPath, [config], {
        env: { ...process.env, APP_VARIANT: variant, EXPO_PUBLIC_API_BASE_URL: url },
      }).status,
    ).toBe(0);
  }
});
