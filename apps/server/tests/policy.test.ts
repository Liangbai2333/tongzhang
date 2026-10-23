import { expect, it } from 'vitest';
import { requireExpenseEditor, requireTransferRegistrar } from '../src/modules/ledgers/policy.js';
import {
  hashPassword,
  verifyPassword,
  issueSessionToken,
  digestToken,
} from '../src/modules/auth/credentials.js';
it('allows creator overrides but rejects unrelated members and frozen edits', () => {
  expect(() =>
    requireExpenseEditor({ status: 'ACTIVE', memberId: 'a', isCreator: true }, 'b'),
  ).not.toThrow();
  expect(() =>
    requireExpenseEditor({ status: 'ACTIVE', memberId: 'a', isCreator: false }, 'b'),
  ).toThrow();
  expect(() =>
    requireExpenseEditor({ status: 'SETTLING', memberId: 'a', isCreator: true }, 'a'),
  ).toThrow();
  expect(() =>
    requireTransferRegistrar({ status: 'SETTLING', memberId: 'a', isCreator: true }, 'b'),
  ).not.toThrow();
  expect(() =>
    requireTransferRegistrar({ status: 'SETTLING', memberId: 'a', isCreator: false }, 'b'),
  ).toThrow();
});
it('hashes passwords and produces expiring, digest-only session storage material', async () => {
  const hash = await hashPassword('secret-password');
  expect(hash).toMatch(/^\$argon2id\$/);
  expect(await verifyPassword(hash, 'secret-password')).toBe(true);
  expect(await verifyPassword(hash, 'wrong-password')).toBe(false);
  const issued = issueSessionToken(new Date('2026-10-22T00:00:00Z'));
  expect(issued.tokenHash).toBe(digestToken(issued.token));
  expect(issued.tokenHash).not.toBe(issued.token);
  expect(issued.expiresAt.toISOString()).toBe('2026-11-21T00:00:00.000Z');
});
