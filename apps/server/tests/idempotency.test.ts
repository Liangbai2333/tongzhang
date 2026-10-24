import { describe, expect, it } from 'vitest';
import { hashIdempotencyRequest } from '../src/db/idempotency.js';
import { testDatabaseUrl } from './fixtures/database.js';

describe('canonical idempotency request fingerprints', () => {
  it('ignores object property order recursively, but preserves array order and scalar types', () => {
    expect(hashIdempotencyRequest({ b: [1, { d: 2, c: '3' }], a: true })).toBe(
      hashIdempotencyRequest({ a: true, b: [1, { c: '3', d: 2 }] }),
    );
    expect(hashIdempotencyRequest({ a: 1 })).not.toBe(hashIdempotencyRequest({ a: '1' }));
    expect(hashIdempotencyRequest([1, 2])).not.toBe(hashIdempotencyRequest([2, 1]));
    expect(hashIdempotencyRequest({ a: 1, absent: undefined })).toBe(
      hashIdempotencyRequest({ a: 1 }),
    );
  });
  it.each([undefined, 1n, NaN, Infinity, new Date(), [undefined]])(
    'rejects non-JSON input (%s)',
    (input) => {
      expect(() => hashIdempotencyRequest(input)).toThrow();
    },
  );
  it('rejects circular input without rejecting shared JSON subobjects', () => {
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => hashIdempotencyRequest(cyclic)).toThrow();
    const child = { value: 'ok' };
    expect(hashIdempotencyRequest([child, child])).toBe(
      hashIdempotencyRequest([{ value: 'ok' }, { value: 'ok' }]),
    );
  });
});
describe('dedicated database guard', () => {
  it.each([
    '',
    'postgresql://user:private-password@localhost/tongzhang',
    'postgresql://localhost/postgres',
    'file:///tmp/tongzhang_test',
    'not-a-url',
  ])('rejects unsafe targets without exposing credentials (%s)', (target) => {
    expect(() => testDatabaseUrl(target)).toThrow('dedicated PostgreSQL database');
    try {
      testDatabaseUrl(target);
    } catch (error) {
      expect(String(error)).not.toContain('private-password');
    }
  });
  it('accepts an explicitly named PostgreSQL test database', () => {
    const target = 'postgresql://localhost/tongzhang_auth_test';
    expect(testDatabaseUrl(target)).toBe(target);
  });
});
