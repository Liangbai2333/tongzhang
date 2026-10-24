import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balancesSchema, settlementPreviewSchema } from '@tongzhang/contracts';
import { eq, inArray } from 'drizzle-orm';
import {
  expenseSplits,
  expenses,
  ledgerMembers,
  ledgers,
  settlementBatches,
  settlementTransfers,
} from '../src/db/schema/index.js';
import { integrationFixture } from './fixtures/integration.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
const ledgerIds: string[] = [];
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  try {
    const ownedLedgers = ledgerIds.splice(0);
    if (ownedLedgers.length) {
      await fixture.db.orm.transaction(async (tx) => {
        await tx
          .delete(settlementTransfers)
          .where(inArray(settlementTransfers.ledgerId, ownedLedgers));
        await tx.delete(settlementBatches).where(inArray(settlementBatches.ledgerId, ownedLedgers));
        await tx.delete(expenseSplits).where(inArray(expenseSplits.ledgerId, ownedLedgers));
        await tx.delete(expenses).where(inArray(expenses.ledgerId, ownedLedgers));
      });
    }
  } finally {
    await fixture.close();
  }
});

async function seed(withExpense = true) {
  const owner = await fixture.register();
  const friend = await fixture.register();
  const outsider = await fixture.register();
  const ledgerId = await fixture.ledger(owner, [friend]);
  ledgerIds.push(ledgerId);
  const rows = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const ownerMember = rows.find((r) => r.userId === owner.user.id)!.id;
  const friendMember = rows.find((r) => r.userId === friend.user.id)!.id;
  if (!withExpense) return { owner, friend, outsider, ledgerId, ownerMember, friendMember };
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
  return { owner, friend, outsider, ledgerId, ownerMember, friendMember };
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
  });

  it('returns all members with zero balances and no transfers for an empty ledger', async () => {
    const s = await seed(false);
    const headers = { authorization: `Bearer ${s.friend.accessToken}` };
    const response = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/balances`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    const balances = balancesSchema.parse(response.json().data);
    expect(balances.expenseTotalCents).toBe('0');
    expect(balances.members).toHaveLength(2);
    for (const member of balances.members) {
      expect(member).toMatchObject({
        paidCents: '0',
        sharedCents: '0',
        netCents: '0',
        remainingNetCents: '0',
      });
    }
    const preview = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/settlement-preview`,
      headers,
    });
    expect(preview.statusCode).toBe(200);
    expect(settlementPreviewSchema.parse(preview.json().data)).toMatchObject({
      expenseTotalCents: '0',
      transferTotalCents: '0',
      transferCount: 0,
      transfers: [],
    });
    expect(
      await fixture.db.orm
        .select()
        .from(settlementBatches)
        .where(eq(settlementBatches.ledgerId, s.ledgerId)),
    ).toHaveLength(0);
    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, s.ledgerId));
    expect(ledger).toMatchObject({ status: 'ACTIVE', version: 1, settledAt: null });
  });

  it('excludes soft-deleted expenses and their splits from balances and preview', async () => {
    const s = await seed();
    const headers = { authorization: `Bearer ${s.owner.accessToken}` };
    await fixture.db.orm
      .update(expenses)
      .set({ deletedAt: new Date() })
      .where(eq(expenses.ledgerId, s.ledgerId));
    const response = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/balances`,
      headers,
    });
    expect(response.statusCode).toBe(200);
    const balances = balancesSchema.parse(response.json().data);
    expect(balances.expenseTotalCents).toBe('0');
    for (const member of balances.members) {
      expect(member).toMatchObject({
        paidCents: '0',
        sharedCents: '0',
        netCents: '0',
        remainingNetCents: '0',
      });
    }
    const preview = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/settlement-preview`,
      headers,
    });
    expect(preview.statusCode).toBe(200);
    expect(settlementPreviewSchema.parse(preview.json().data)).toMatchObject({
      expenseTotalCents: '0',
      transferTotalCents: '0',
      transferCount: 0,
      transfers: [],
    });
  });

  it('counts only paid transfers toward remaining net without changing expense totals', async () => {
    const s = await seed();
    const headers = { authorization: `Bearer ${s.owner.accessToken}` };
    const [batch] = await fixture.db.orm
      .insert(settlementBatches)
      .values({
        ledgerId: s.ledgerId,
        createdByMemberId: s.ownerMember,
        sourceVersion: 1,
        expenseTotalCents: 12000n,
        transferTotalCents: 6000n,
        transferCount: 1,
        netSnapshot: [
          { memberId: s.ownerMember, netCents: '6000' },
          { memberId: s.friendMember, netCents: '-6000' },
        ],
        algorithmVersion: 'zero-sum-dp-v1',
      })
      .returning();
    const [transfer] = await fixture.db.orm
      .insert(settlementTransfers)
      .values({
        ledgerId: s.ledgerId,
        batchId: batch!.id,
        sequence: 1,
        payerMemberId: s.friendMember,
        payeeMemberId: s.ownerMember,
        amountCents: 6000n,
      })
      .returning();
    await fixture.db.orm
      .update(ledgers)
      .set({ status: 'SETTLING' })
      .where(eq(ledgers.id, s.ledgerId));
    const pendingResponse = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/balances`,
      headers,
    });
    expect(pendingResponse.statusCode).toBe(200);
    const pending = balancesSchema.parse(pendingResponse.json().data);
    expect(pending.expenseTotalCents).toBe('12000');
    expect(pending.members.find((m) => m.memberId === s.ownerMember)).toMatchObject({
      netCents: '6000',
      remainingNetCents: '6000',
    });
    expect(pending.members.find((m) => m.memberId === s.friendMember)).toMatchObject({
      netCents: '-6000',
      remainingNetCents: '-6000',
    });
    await fixture.db.orm
      .update(settlementTransfers)
      .set({ status: 'PAID', registeredByMemberId: s.friendMember, registeredAt: new Date() })
      .where(eq(settlementTransfers.id, transfer!.id));
    const paidResponse = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/balances`,
      headers,
    });
    expect(paidResponse.statusCode).toBe(200);
    const paid = balancesSchema.parse(paidResponse.json().data);
    expect(paid.expenseTotalCents).toBe('12000');
    expect(paid.members).toEqual(
      pending.members.map((member) => ({ ...member, remainingNetCents: '0' })),
    );
  });

  it.each(['SETTLING', 'SETTLED'] as const)(
    'rejects preview for a %s ledger without changing it',
    async (status) => {
      const s = await seed();
      const headers = { authorization: `Bearer ${s.owner.accessToken}` };
      await fixture.db.orm
        .update(ledgers)
        .set({ status, settledAt: status === 'SETTLED' ? new Date() : null })
        .where(eq(ledgers.id, s.ledgerId));
      const before = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, s.ledgerId));
      const response = await fixture.app.inject({
        url: `/api/v1/ledgers/${s.ledgerId}/settlement-preview`,
        headers,
      });
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('LEDGER_FROZEN');
      const after = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, s.ledgerId));
      expect(after).toEqual(before);
      expect(
        await fixture.db.orm
          .select()
          .from(settlementBatches)
          .where(eq(settlementBatches.ledgerId, s.ledgerId)),
      ).toHaveLength(0);
      expect(
        (await fixture.app.inject({ url: `/api/v1/ledgers/${s.ledgerId}/balances`, headers }))
          .statusCode,
      ).toBe(200);
    },
  );
});
