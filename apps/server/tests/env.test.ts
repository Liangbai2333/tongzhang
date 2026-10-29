import { afterEach, expect, it, vi } from 'vitest';
import { databaseConfig, loadLocalEnv, readEnv } from '../src/config/env.js';

const source = {
  NODE_ENV: 'development',
  PGHOST: '127.0.0.1',
  PGPORT: '35432',
  AUTH_JWT_SECRET: 'ab'.repeat(32),
  PGUSER: 'tongzhang',
  PGPASSWORD: 'p@ss:$word/#?%',
  PGDATABASE: 'tongzhang',
};
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it('passes passwords literally to PostgreSQL without URL escaping', () => {
  expect(databaseConfig(readEnv(source))).toEqual({
    host: '127.0.0.1',
    port: 35432,
    user: 'tongzhang',
    password: source.PGPASSWORD,
    database: 'tongzhang',
  });
});
it('fails closed on missing settings, bad ports and unrestricted proxy trust without leaking input', () => {
  expect(() => readEnv({ ...source, PGPASSWORD: '' })).toThrow('PGPASSWORD');
  expect(() => readEnv({ ...source, PGPORT: '0' })).toThrow('PGPORT');
  expect(() => readEnv({ ...source, TRUST_PROXY: 'true' })).toThrow('TRUST_PROXY');
  expect(() => readEnv({ ...source, PGPORT: source.PGPASSWORD })).not.toThrow(source.PGPASSWORD);
  expect(readEnv({ ...source, TRUST_PROXY: '172.30.0.0/28' }).TRUST_PROXY).toBe('172.30.0.0/28');
});
it.each(['production', 'test'])('does not read a local .env in %s', (mode) => {
  vi.stubEnv('NODE_ENV', mode);
  const load = vi.spyOn(process, 'loadEnvFile');
  loadLocalEnv('/does-not-exist');
  expect(load).not.toHaveBeenCalled();
});
it('does not load local credentials in CI and uses an explicit local path otherwise', () => {
  vi.stubEnv('NODE_ENV', 'development');
  vi.stubEnv('CI', 'true');
  const load = vi.spyOn(process, 'loadEnvFile').mockImplementation(() => undefined);
  loadLocalEnv('/local/.env');
  expect(load).not.toHaveBeenCalled();
  vi.stubEnv('CI', '');
  loadLocalEnv('/local/.env');
  expect(load).toHaveBeenCalledWith('/local/.env');
});

it('requires a 256-bit hex signing secret without exposing its value', () => {
  for (const secret of [undefined, '', 'short', 'z'.repeat(64)]) {
    expect(() => readEnv({ ...source, AUTH_JWT_SECRET: secret })).toThrow('AUTH_JWT_SECRET');
  }
  const privateValue = 'private-invalid-signing-secret';
  try {
    readEnv({ ...source, AUTH_JWT_SECRET: privateValue });
    throw new Error('Expected validation failure');
  } catch (error) {
    expect(String(error)).not.toContain(privateValue);
    expect(String(error)).toContain('AUTH_JWT_SECRET');
  }
});
