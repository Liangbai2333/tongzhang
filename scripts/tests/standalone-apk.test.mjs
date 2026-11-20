import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  computeFileSha256,
  detectJavaMajorVersion,
  formatSha256Sums,
  parseBuildArgs,
  validateStandaloneApkEnv,
} from '../build-android-apk.mjs';

const SCRIPT_PATH = fileURLToPath(new URL('../build-android-apk.mjs', import.meta.url));
const COMPOSE_PROD_PATH = fileURLToPath(new URL('../../infra/compose.prod.yml', import.meta.url));
const INFRA_ENV_EXAMPLE_PATH = fileURLToPath(new URL('../../infra/.env.example', import.meta.url));

describe('standalone Android APK build config & SHA256SUMS', () => {
  it('accepts production variant with a clean public HTTPS API URL', () => {
    const result = validateStandaloneApkEnv({
      APP_VARIANT: 'production',
      EXPO_PUBLIC_API_BASE_URL: 'https://api.tongzhang.example.com/',
    });
    expect(result).toEqual({
      appVariant: 'production',
      apiBaseUrl: 'https://api.tongzhang.example.com',
    });
  });

  it('rejects development variant, HTTP URLs, loopback hosts, query/credentials, and secret EXPO_PUBLIC vars', () => {
    expect(() =>
      validateStandaloneApkEnv({
        APP_VARIANT: 'development',
        EXPO_PUBLIC_API_BASE_URL: 'https://api.tongzhang.example.com',
      }),
    ).toThrow('APP_VARIANT=production');

    expect(() =>
      validateStandaloneApkEnv({
        APP_VARIANT: 'production',
        EXPO_PUBLIC_API_BASE_URL: 'http://api.tongzhang.example.com',
      }),
    ).toThrow('HTTPS');

    expect(() =>
      validateStandaloneApkEnv({
        APP_VARIANT: 'production',
        EXPO_PUBLIC_API_BASE_URL: 'https://localhost:3300',
      }),
    ).toThrow('回环地址');

    expect(() =>
      validateStandaloneApkEnv({
        APP_VARIANT: 'production',
        EXPO_PUBLIC_API_BASE_URL: 'https://10.0.2.2:3300',
      }),
    ).toThrow('回环地址');

    expect(() =>
      validateStandaloneApkEnv({
        APP_VARIANT: 'production',
        EXPO_PUBLIC_API_BASE_URL: 'https://api.tongzhang.example.com?debug=1',
      }),
    ).toThrow('HTTPS');

    expect(() =>
      validateStandaloneApkEnv({
        APP_VARIANT: 'production',
        EXPO_PUBLIC_API_BASE_URL: 'https://api.tongzhang.example.com',
        EXPO_PUBLIC_AI_DRAFT_API_KEY: 'sk-leak',
      }),
    ).toThrow('禁止通过');
  });

  it('requires JDK 17 and rejects JDK 25 or unparseable output', () => {
    expect(detectJavaMajorVersion('openjdk version "17.0.12" 2024-07-16')).toEqual({
      major: 17,
      supported: true,
    });
    expect(detectJavaMajorVersion('openjdk version "25.0.1" 2025-10-21')).toEqual({
      major: 25,
      supported: false,
    });
    expect(detectJavaMajorVersion('java version "1.8.0_401"')).toEqual({
      major: 8,
      supported: false,
    });
    expect(detectJavaMajorVersion('not-java')).toEqual({
      major: null,
      supported: false,
    });
  });

  it('computes deterministic SHA256SUMS.txt output sorted by filename', () => {
    const dir = mkdtempSync(join(tmpdir(), 'tongzhang-apk-hash-'));
    try {
      const sample = join(dir, 'tongzhang-demo-standalone.apk');
      writeFileSync(sample, 'tongzhang-standalone-apk-fixture');
      const digest = computeFileSha256(sample);
      expect(digest).toMatch(/^[0-9a-f]{64}$/);
      const formatted = formatSha256Sums([
        { filename: 'z.apk', sha256: 'b'.repeat(64) },
        { filename: 'a.apk', sha256: digest },
      ]);
      expect(formatted).toBe(`${digest}  a.apk\n${'b'.repeat(64)}  z.apk\n`);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('parses CLI arguments and passes --preflight with a valid HTTPS API URL', () => {
    expect(parseBuildArgs(['--preflight', '--api-url', 'https://api.example.com'])).toMatchObject({
      preflight: true,
      apiUrl: 'https://api.example.com',
    });

    const run = spawnSync(
      process.execPath,
      [SCRIPT_PATH, '--preflight', '--api-url', 'https://api.tongzhang.example.com'],
      { encoding: 'utf8' },
    );
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('preflight passed');
  });
});

describe('production Compose AI draft env passthrough', () => {
  it('exposes optional AI_DRAFT_* server env vars in compose.prod.yml and infra/.env.example', () => {
    const compose = readFileSync(COMPOSE_PROD_PATH, 'utf8');
    const envExample = readFileSync(INFRA_ENV_EXAMPLE_PATH, 'utf8');
    for (const key of [
      'AI_DRAFT_API_BASE_URL',
      'AI_DRAFT_API_KEY',
      'AI_DRAFT_MODEL',
      'AI_DRAFT_TIMEOUT_MS',
    ]) {
      expect(compose).toContain(`${key}:`);
      expect(envExample).toContain(`${key}=`);
    }
  });
});
