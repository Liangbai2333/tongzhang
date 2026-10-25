import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorResponseSchema } from '@tongzhang/contracts';
import { requireLedgerMember, requireCreator } from '../src/modules/ledgers/index.js';
import { integrationFixture } from './fixtures/integration.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  await fixture.close();
});
describe('real HTTP ledger access foundations', () => {
  it('returns contract 401/403 errors for anonymous and nonmember requests without leaking the ledger', async () => {
    const owner = await fixture.register();
    const outsider = await fixture.register();
    const ledgerId = await fixture.ledger(owner);
    for (const suffix of ['', '/members']) {
      const anonymous = await fixture.app.inject(`/api/v1/ledgers/${ledgerId}${suffix}`);
      expect(anonymous.statusCode).toBe(401);
      expect(errorResponseSchema.parse(anonymous.json()).error.code).toBe('UNAUTHENTICATED');
      for (const id of [ledgerId, randomUUID()]) {
        const denied = await fixture.app.inject({
          url: `/api/v1/ledgers/${id}${suffix}`,
          headers: { authorization: `Bearer ${outsider.accessToken}` },
        });
        expect(denied.statusCode).toBe(403);
        expect(errorResponseSchema.parse(denied.json()).error.code).toBe('FORBIDDEN');
        expect(denied.body).not.toContain('隔离测试账本');
      }
    }
  });
  it('resolves creator/member roles from the real database while unfinished endpoints remain explicit', async () => {
    const owner = await fixture.register();
    const member = await fixture.register();
    const ledgerId = await fixture.ledger(owner, [member]);
    const creatorAccess = await requireLedgerMember(fixture.db.orm, ledgerId, owner.user.id);
    const memberAccess = await requireLedgerMember(fixture.db.orm, ledgerId, member.user.id);
    expect(creatorAccess).toMatchObject({ status: 'ACTIVE', isCreator: true });
    expect(memberAccess).toMatchObject({ status: 'ACTIVE', isCreator: false });
    expect(() => requireCreator(memberAccess)).toThrow(
      expect.objectContaining({ statusCode: 403 }),
    );
    const response = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/archive`,
      headers: { authorization: `Bearer ${member.accessToken}`, 'idempotency-key': randomUUID() },
    });
    expect(response.statusCode).toBe(501);
    expect(response.json().error.code).toBe('FEATURE_NOT_READY');
  });
});
