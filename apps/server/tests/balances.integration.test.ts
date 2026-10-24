import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balancesSchema, settlementPreviewSchema } from '@tongzhang/contracts';
import { eq } from 'drizzle-orm';
import {
  expenseSplits,
  expenses,
  ledgerMembers,
  ledgers,
  settlementBatches,
} from '../src/db/schema/index.js';
import { integrationFixture } from './fixtures/integration.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  // fixture.close deletes members/ledgers; remove expense rows first.
  await fixture.close();
});

async function seed() {
  const owner = await fixture.register();
  const friend = await fixture.register();
  const outsider = await fixture.register();
  const ledgerId = await fixture.ledger(owner, [friend]);
  const rows = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const ownerMember = rows.find((r) => r.userId === owner.user.id)!.id;
  const friendMember = rows.find((r) => r.userId === friend.user.id)!.id;
  const [expense] = await fixture.db.orm
    .insert(expenses)
    .values({
      ledgerId,
      recorderMemberId: ownerMember,
      payerMemberId: ownerMember,
      title: '晚餐',
      amountCents: 12000n,
      category: 'DINING',
      occurredOn: '2026-10-24',
      splitMode: 'EQUAL',
    })
    .returning();
  await fixture.db.orm.insert(expenseSplits).values([
    { expenseId: expense!.id, memberId: ownerMember, ledgerId, amountCents: 6000n },
    { expenseId: expense!.id, memberId: friendMember, ledgerId, amountCents: 6000n },
  ]);
  return { owner, friend, outsider, ledgerId, ownerMember, friendMember, expenseId: expense!.id };
}

describe('balances and read-only settlement preview', () => {
  it('returns integer-string balances summing to zero and a single 6000 transfer', async () => {
    const s = await seed();
    const headers = { authorization: `Bearer ${s.friend.accessToken}` };
    const balances = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/balances`,
      headers,
    });
    expect(balances.statusCode).toBe(200);
    const b = balancesSchema.parse(balances.json().data);
    expect(b.members.reduce((sum, m) => sum + BigInt(m.netCents), 0n)).toBe(0n);
    expect(b.members.find((m) => m.memberId === s.ownerMember)).toMatchObject({
      paidCents: '12000',
      sharedCents: '6000',
      netCents: '6000',
    });
    const before = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, s.ledgerId));
    const preview = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/settlement-preview`,
      headers,
    });
    expect(preview.statusCode).toBe(200);
    const p = settlementPreviewSchema.parse(preview.json().data);
    expect(p.transfers).toEqual([
      {
        sequence: 1,
        payerMemberId: s.friendMember,
        payeeMemberId: s.ownerMember,
        amountCents: '6000',
      },
    ]);
    const after = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, s.ledgerId));
    expect(after[0]).toMatchObject({
      status: 'ACTIVE',
      version: before[0]!.version,
      updatedAt: before[0]!.updatedAt,
    });
    expect(
      await fixture.db.orm
        .select()
        .from(settlementBatches)
        .where(eq(settlementBatches.ledgerId, s.ledgerId)),
    ).toHaveLength(0);
    // cleanup owned rows
    await fixture.db.orm.delete(expenseSplits).where(eq(expenseSplits.ledgerId, s.ledgerId));
    await fixture.db.orm.delete(expenses).where(eq(expenses.ledgerId, s.ledgerId));
  });
  it('rejects anonymous and nonmember access', async () => {
    const s = await seed();
    for (const path of ['balances', 'settlement-preview']) {
      const url = `/api/v1/ledgers/${s.ledgerId}/${path}`;
      expect((await fixture.app.inject(url)).statusCode).toBe(401);
      const denied = await fixture.app.inject({
        url,
        headers: { authorization: `Bearer ${s.outsider.accessToken}` },
      });
      expect(denied.statusCode).toBe(403);
    }
    await fixture.db.orm.delete(expenseSplits).where(eq(expenseSplits.ledgerId, s.ledgerId));
    await fixture.db.orm.delete(expenses).where(eq(expenses.ledgerId, s.ledgerId));
  });
});
