import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { balancesSchema, statisticsSchema } from '@tongzhang/contracts';
import { eq } from 'drizzle-orm';
import { ledgerMembers, ledgers } from '../src/db/schema/index.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  await fixture.close();
});

const auth = (account: TestAccount) => ({ authorization: `Bearer ${account.accessToken}` });

const createExpense = (account: TestAccount, ledgerId: string, payload: object) =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${ledgerId}/expenses`,
    headers: { ...auth(account), 'idempotency-key': randomUUID() },
    payload,
  });

const getStatistics = (ledgerId: string, account?: TestAccount) =>
  fixture.app.inject({
    url: `/api/v1/ledgers/${ledgerId}/statistics`,
    headers: account ? auth(account) : {},
  });

async function memberIds(ledgerId: string, accounts: TestAccount[]) {
  const rows = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  return accounts.map((a) => rows.find((r) => r.userId === a.user.id)!.id);
}

/** 鼓山一日 four-person benchmark from docs/code-standards.md, created through A15. */
async function seedGushan() {
  const an = await fixture.register('小安');
  const bai = await fixture.register('小白');
  const chen = await fixture.register('小陈');
  const ding = await fixture.register('小丁');
  const ledgerId = await fixture.ledger(an, [bai, chen, ding]);
  const [mAn, mBai, mChen, mDing] = await memberIds(ledgerId, [an, bai, chen, ding]);
  const allFour = [mAn, mBai, mChen, mDing].map((memberId) => ({ memberId }));
  const ids: Record<string, string> = {};
  for (const [account, key, body] of [
    [
      an,
      'canteen',
      {
        title: '食堂',
        amountCents: '12000',
        category: 'DINING',
        occurredOn: '2026-11-15',
        payerMemberId: mAn,
        splits: allFour,
      },
    ],
    [
      bai,
      'ticket',
      {
        title: '鼓山门票',
        amountCents: '12000',
        category: 'TICKET',
        occurredOn: '2026-11-15',
        payerMemberId: mBai,
        splits: allFour,
      },
    ],
    [
      chen,
      'fare',
      {
        title: '车费',
        amountCents: '6000',
        category: 'TRANSPORT',
        occurredOn: '2026-11-16',
        payerMemberId: mChen,
        splits: [{ memberId: mAn }, { memberId: mChen }],
      },
    ],
  ] as const) {
    const res = await createExpense(account, ledgerId, { ...body, splitMode: 'EQUAL' });
    expect(res.statusCode).toBe(201);
    ids[key] = res.json().data.id;
  }
  return {
    an,
    bai,
    chen,
    ding,
    ledgerId,
    mAn: mAn!,
    mBai: mBai!,
    mChen: mChen!,
    mDing: mDing!,
    allFour,
    ids,
  };
}

describe('A21 getStatistics', () => {
  it('aggregates the 鼓山一日 30000-cent ledger and conserves totals against A20', async () => {
    const s = await seedGushan();
    const [before] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, s.ledgerId));

    const res = await getStatistics(s.ledgerId, s.ding);
    expect(res.statusCode).toBe(200);
    const stats = statisticsSchema.parse(res.json().data);

    expect(stats.expenseTotalCents).toBe('30000');
    expect(stats.expenseCount).toBe(3);
    expect(stats.categories).toEqual([
      { category: 'DINING', amountCents: '12000', expenseCount: 1, percentage: '40.0' },
      { category: 'TICKET', amountCents: '12000', expenseCount: 1, percentage: '40.0' },
      { category: 'TRANSPORT', amountCents: '6000', expenseCount: 1, percentage: '20.0' },
    ]);
    expect(stats.dailyTrend).toEqual([
      { date: '2026-11-15', amountCents: '24000', expenseCount: 2 },
      { date: '2026-11-16', amountCents: '6000', expenseCount: 1 },
    ]);
    expect(stats.dailyTrendTruncated).toBe(false);
    // Equal 12000 amounts on the same day tie-break by id ascending.
    const tied = [s.ids.canteen!, s.ids.ticket!].sort();
    expect(stats.topExpenses.map((e) => e.id)).toEqual([...tied, s.ids.fare]);
    expect(stats.topExpenses[2]).toEqual({
      id: s.ids.fare,
      title: '车费',
      amountCents: '6000',
      category: 'TRANSPORT',
      occurredOn: '2026-11-16',
      payerMemberId: s.mChen,
      payerName: '小陈',
    });
    const net = Object.fromEntries(stats.members.map((m) => [m.memberId, m]));
    expect(net[s.mAn]).toMatchObject({ paidCents: '12000', sharedCents: '9000', netCents: '3000' });
    expect(net[s.mBai]).toMatchObject({
      paidCents: '12000',
      sharedCents: '6000',
      netCents: '6000',
    });
    expect(net[s.mChen]).toMatchObject({
      paidCents: '6000',
      sharedCents: '9000',
      netCents: '-3000',
    });
    expect(net[s.mDing]).toMatchObject({ paidCents: '0', sharedCents: '6000', netCents: '-6000' });

    // Conservation against A20 balances on the same data.
    const balancesRes = await fixture.app.inject({
      url: `/api/v1/ledgers/${s.ledgerId}/balances`,
      headers: auth(s.an),
    });
    expect(balancesRes.statusCode).toBe(200);
    const balances = balancesSchema.parse(balancesRes.json().data);
    expect(stats.expenseTotalCents).toBe(balances.expenseTotalCents);
    expect(stats.members).toEqual(
      balances.members.map(({ remainingNetCents: _remaining, ...m }) => m),
    );
    expect(stats.members.reduce((sum, m) => sum + BigInt(m.netCents), 0n)).toBe(0n);

    // Read-only: version and state unchanged.
    const [after] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, s.ledgerId));
    expect(after).toEqual(before);
  });

  it('excludes soft-deleted expenses and other ledgers', async () => {
    const s = await seedGushan();
    const mistake = await createExpense(s.ding, s.ledgerId, {
      title: '误记零食',
      amountCents: '999000',
      category: 'SHOPPING',
      occurredOn: '2026-11-17',
      payerMemberId: s.mDing,
      splitMode: 'EQUAL',
      splits: s.allFour,
    });
    expect(mistake.statusCode).toBe(201);
    const deleted = await fixture.app.inject({
      method: 'DELETE',
      url: `/api/v1/ledgers/${s.ledgerId}/expenses/${mistake.json().data.id}?version=1`,
      headers: { ...auth(s.an), 'idempotency-key': randomUUID() },
    });
    expect(deleted.statusCode).toBe(200);

    // Another ledger shared by the same people, with a large expense.
    const otherLedgerId = await fixture.ledger(s.an, [s.bai]);
    const [otherAn] = await memberIds(otherLedgerId, [s.an]);
    const other = await createExpense(s.an, otherLedgerId, {
      title: '别的账本',
      amountCents: '888000',
      category: 'LODGING',
      occurredOn: '2026-11-18',
      payerMemberId: otherAn,
      splitMode: 'EQUAL',
      splits: [{ memberId: otherAn }],
    });
    expect(other.statusCode).toBe(201);

    const stats = statisticsSchema.parse((await getStatistics(s.ledgerId, s.an)).json().data);
    expect(stats.expenseTotalCents).toBe('30000');
    expect(stats.expenseCount).toBe(3);
    expect(stats.categories.map((c) => c.category)).toEqual(['DINING', 'TICKET', 'TRANSPORT']);
    expect(stats.dailyTrend.map((d) => d.date)).toEqual(['2026-11-15', '2026-11-16']);
    expect(stats.topExpenses).toHaveLength(3);
    expect(stats.topExpenses.some((e) => e.title === '误记零食' || e.title === '别的账本')).toBe(
      false,
    );
    expect(stats.members.find((m) => m.memberId === s.mDing)).toMatchObject({
      paidCents: '0',
      sharedCents: '6000',
    });

    const otherStats = statisticsSchema.parse(
      (await getStatistics(otherLedgerId, s.bai)).json().data,
    );
    expect(otherStats).toMatchObject({ expenseTotalCents: '888000', expenseCount: 1 });
    expect(otherStats.categories).toEqual([
      { category: 'LODGING', amountCents: '888000', expenseCount: 1, percentage: '100.0' },
    ]);
  });

  it('returns a valid empty structure for a ledger without expenses', async () => {
    const owner = await fixture.register();
    const friend = await fixture.register();
    const ledgerId = await fixture.ledger(owner, [friend]);
    const res = await getStatistics(ledgerId, friend);
    expect(res.statusCode).toBe(200);
    const stats = statisticsSchema.parse(res.json().data);
    expect(stats).toMatchObject({
      expenseTotalCents: '0',
      expenseCount: 0,
      categories: [],
      dailyTrend: [],
      dailyTrendTruncated: false,
      topExpenses: [],
    });
    expect(stats.members).toHaveLength(2);
    for (const m of stats.members)
      expect(m).toMatchObject({ paidCents: '0', sharedCents: '0', netCents: '0' });
  });

  it('rejects anonymous with 401 and non-members with 403', async () => {
    const owner = await fixture.register();
    const outsider = await fixture.register();
    const ledgerId = await fixture.ledger(owner);
    expect((await getStatistics(ledgerId)).statusCode).toBe(401);
    const denied = await getStatistics(ledgerId, outsider);
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error.code).toBe('FORBIDDEN');
    expect((await getStatistics(randomUUID(), outsider)).statusCode).toBe(403);
  });
});
