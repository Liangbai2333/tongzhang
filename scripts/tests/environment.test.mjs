import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readFileSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { inspectEnvironment, validateApiAddress, versionCheck } from '../check-env.mjs';
import { runScript } from '../lib/run-script.mjs';

it('runs workspace scripts from paths containing spaces and preserves a failed exit', () => {
  const root = mkdtempSync(join(tmpdir(), 'tongzhang script test '));
  try {
    writeFileSync(
      join(root, 'package.json'),
      JSON.stringify({ scripts: { probe: 'node probe.cjs', failure: 'node failure.cjs' } }),
    );
    writeFileSync(
      join(root, 'probe.cjs'),
      "require('node:fs').writeFileSync('ran.txt',process.cwd())",
    );
    writeFileSync(join(root, 'failure.cjs'), 'process.exit(7)');
    runScript('probe', { cwd: root });
    expect(readFileSync(join(root, 'ran.txt'), 'utf8')).toBe(realpathSync(root));
    expect(() => runScript('failure', { cwd: root })).toThrow('执行 failure 失败');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it.each([
  'https://user:private-password@example.com',
  'http://localhost:3300?secret=private-password',
  'file:///tmp/api',
  'not-a-url',
])('rejects an unsafe API address without echoing it (%s)', (address) => {
  try {
    validateApiAddress(address);
    throw new Error('Expected rejection');
  } catch (error) {
    expect(String(error)).toContain('EXPO_PUBLIC_API_BASE_URL');
    expect(String(error)).not.toContain('private-password');
  }
});
it('distinguishes a supported Node patch drift from an incompatible major', () => {
  expect(versionCheck('v24.21.0', '24.21.0', true)).toBe('pass');
  expect(versionCheck('v24.22.0', '24.21.0', true)).toBe('warn');
  expect(versionCheck('v22.21.0', '24.21.0', true)).toBe('fail');
  expect(() => validateApiAddress('http://localhost:3300', true)).toThrow();
  expect(validateApiAddress('https://api.example.test/')).toBe('https://api.example.test');
});
it('reports missing tools and connectivity safely without executing setup or writes', async () => {
  const root = mkdtempSync(join(tmpdir(), 'tongzhang-env-test-'));
  try {
    writeFileSync(join(root, '.node-version'), '24.21.0');
    writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager: 'pnpm@12.6.0' }));
    mkdirSync(join(root, 'apps/server'), { recursive: true });
    mkdirSync(join(root, 'apps/mobile'), { recursive: true });
    writeFileSync(
      join(root, 'apps/server/.env'),
      'PGPASSWORD=private-password\nAUTH_JWT_SECRET=private-secret',
    );
    writeFileSync(
      join(root, 'apps/mobile/.env'),
      'EXPO_PUBLIC_API_BASE_URL=https://user:private-password@example.com',
    );
    const run = vi.fn(() => ({
      status: null,
      stdout: '',
      stderr: 'private-password',
      error: { code: 'ETIMEDOUT', message: 'private-secret' },
    }));
    const get = vi.fn();
    const report = await inspectEnvironment({
      root,
      run,
      get,
      environment: {},
      nodeVersion: 'v24.21.0',
    });
    expect(report.ok).toBe(false);
    expect(JSON.stringify(report)).not.toContain('private-password');
    expect(JSON.stringify(report)).not.toContain('private-secret');
    expect(report.checks.find((check) => check.name === 'Compose')?.detail).toContain(
      'probe timed out',
    );
    expect(get).not.toHaveBeenCalled();
    expect(run.mock.calls.map((call) => call[0])).toEqual(['pnpm', 'docker', 'docker']);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
it('keeps tools-only checks independent of local credentials, API and database', async () => {
  const run = vi.fn((command, args) => ({
    status: 0,
    stdout: command === 'pnpm' ? '12.6.0' : args[0] === 'compose' ? '2.39.0' : '28.0.0',
    stderr: '',
  }));
  const get = vi.fn();
  const report = await inspectEnvironment({
    toolsOnly: true,
    run,
    get,
    environment: {},
    nodeVersion: 'v24.21.0',
  });
  expect(report.ok).toBe(true);
  expect(get).not.toHaveBeenCalled();
  expect(run).toHaveBeenCalledTimes(3);
});
it('checks Node and pnpm without Docker when the CI container job owns Compose verification', async () => {
  const run = vi.fn(() => ({ status: 0, stdout: '12.6.0', stderr: '' }));
  const get = vi.fn();
  const report = await inspectEnvironment({
    toolsOnly: true,
    skipDocker: true,
    run,
    get,
    environment: {},
    nodeVersion: 'v24.21.0',
  });
  expect(report.ok).toBe(true);
  expect(report.checks.map((check) => check.name)).toEqual(['Node', 'pnpm']);
  expect(run.mock.calls.map(([command, args]) => [command, args])).toEqual([
    ['pnpm', ['--version']],
  ]);
  expect(get).not.toHaveBeenCalled();
});
