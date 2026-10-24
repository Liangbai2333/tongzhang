import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  expenseSplits,
  expenses,
  idempotencyKeys,
  ledgerMembers,
  ledgers,
  operationLogs,
} from '../src/db/schema/index.js';
import { integrationFixture } from './fixtures/integration.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
let ledgerId: string | undefined;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  if (ledgerId) {
    await fixture.db.orm.delete(operationLogs).where(eq(operationLogs.ledgerId, ledgerId));
    await fixture.db.orm.delete(expenseSplits).where(eq(expenseSplits.ledgerId, ledgerId));
    await fixture.db.orm.delete(expenses).where(eq(expenses.ledgerId, ledgerId));
  }
  ledgerId = undefined;
  await fixture.close();
});

async function seed() {
  const owner = await fixture.register();
  const friend = await fixture.register();
  const outsider = await fixture.register();
  ledgerId = await fixture.ledger(owner, [friend]);
  const rows = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  return {
    owner,
    friend,
    outsider,
    ownerMember: rows.find((r) => r.userId === owner.user.id)!.id,
    friendMember: rows.find((r) => r.userId === friend.user.id)!.id,
  };
}

const bodyFor = (s: Awaited<ReturnType<typeof seed>>, extra: object = {}) => ({
  title: '晚餐',
  amountCents: '12000',
  category: 'DINING',
  occurredOn: '2026-10-24',
  payerMemberId: s.ownerMember,
  splitMode: 'EQUAL',
  splits: [{ memberId: s.ownerMember }, { memberId: s.friendMember }],
  ...extra,
});

const post = (token: string, payload: object, key: string = randomUUID()) =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${ledgerId}/expenses`,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
    payload,
  });

describe('createExpense', () => {
  it('splits 12000 cents into 6000 + 6000 and commits everything together', async () => {
    const s = await seed();
    const res = await post(s.owner.accessToken, bodyFor(s));
    expect(res.statusCode).toBe(201);
    const data = res.json().data;
    expect(data.splits.map((x: { amountCents: string }) => x.amountCents)).toEqual([
      '6000',
      '6000',
    ]);
    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
    expect(ledger!.version).toBe(2);
    expect(
      await fixture.db.orm
        .select()
        .from(operationLogs)
        .where(eq(operationLogs.ledgerId, ledgerId!)),
    ).toHaveLength(1);
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, s.owner.user.id)),
    ).toHaveLength(1);
  });

  it('ignores client-supplied split amounts for EQUAL mode (strict schema rejects them)', async () => {
    const s = await seed();
    const res = await post(
      s.owner.accessToken,
      bodyFor(s, {
        splits: [
          { memberId: s.ownerMember, amountCents: '11000' },
          { memberId: s.friendMember, amountCents: '1000' },
        ],
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId!)),
    ).toHaveLength(0);
  });

  it('validates payer and split members separately, leaving no partial rows', async () => {
    const s = await seed();
    const stranger = randomUUID();
    const badPayer = await post(s.owner.accessToken, bodyFor(s, { payerMemberId: stranger }));
    expect(badPayer.statusCode).toBe(400);
    const badSplit = await post(
      s.owner.accessToken,
      bodyFor(s, { splits: [{ memberId: s.ownerMember }, { memberId: stranger }] }),
    );
    expect(badSplit.statusCode).toBe(400);
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId!)),
    ).toHaveLength(0);
    expect(
      await fixture.db.orm
        .select()
        .from(expenseSplits)
        .where(eq(expenseSplits.ledgerId, ledgerId!)),
    ).toHaveLength(0);
    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
    expect(ledger!.version).toBe(1);
  });

  it('replays a repeated request without recording twice and rejects key reuse', async () => {
    const s = await seed();
    const key = randomUUID();
    const first = await post(s.owner.accessToken, bodyFor(s), key);
    const second = await post(s.owner.accessToken, bodyFor(s), key);
    expect(second.statusCode).toBe(201);
    expect(second.json().data.id).toBe(first.json().data.id);
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId!)),
    ).toHaveLength(1);
    const reused = await post(s.owner.accessToken, bodyFor(s, { amountCents: '100' }), key);
    expect(reused.statusCode).toBe(409);
  });

  it('rejects concurrent duplicates with a single record', async () => {
    const s = await seed();
    const key = randomUUID();
    const results = await Promise.all([
      post(s.owner.accessToken, bodyFor(s), key),
      post(s.owner.accessToken, bodyFor(s), key),
    ]);
    expect(results.map((r) => r.statusCode)).toEqual([201, 201]);
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId!)),
    ).toHaveLength(1);
  });

  it('rejects anonymous, non-member and frozen-ledger writes', async () => {
    const s = await seed();
    const anon = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses`,
      headers: { 'idempotency-key': randomUUID() },
      payload: bodyFor(s),
    });
    expect(anon.statusCode).toBe(401);
    expect((await post(s.outsider.accessToken, bodyFor(s))).statusCode).toBe(403);
    await fixture.db.orm
      .update(ledgers)
      .set({ status: 'SETTLING' })
      .where(eq(ledgers.id, ledgerId!));
    expect((await post(s.owner.accessToken, bodyFor(s))).statusCode).toBe(409);
  });

  it('recomputes SHARES splits on the server with conserved remainder', async () => {
    const s = await seed();
    const res = await post(
      s.owner.accessToken,
      bodyFor(s, {
        amountCents: '10000',
        splitMode: 'SHARES',
        splits: [
          { memberId: s.ownerMember, shares: 1 },
          { memberId: s.friendMember, shares: 2 },
        ],
      }),
    );
    expect(res.statusCode).toBe(201);
    const amounts = res
      .json()
      .data.splits.map((x: { amountCents: string }) => BigInt(x.amountCents));
    expect(amounts.reduce((a: bigint, b: bigint) => a + b, 0n)).toBe(10000n);
    const byMember = Object.fromEntries(
      res
        .json()
        .data.splits.map((x: { memberId: string; amountCents: string }) => [
          x.memberId,
          x.amountCents,
        ]),
    );
    expect(byMember[s.ownerMember]).toBe('3333');
    expect(byMember[s.friendMember]).toBe('6667');
  });

  it('rejects AMOUNT splits that do not add up to the total', async () => {
    const s = await seed();
    const res = await post(
      s.owner.accessToken,
      bodyFor(s, {
        splitMode: 'AMOUNT',
        splits: [
          { memberId: s.ownerMember, amountCents: '5000' },
          { memberId: s.friendMember, amountCents: '5000' },
        ],
      }),
    );
    expect(res.statusCode).toBe(400);
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId!)),
    ).toHaveLength(0);
  });

  it('blocks receipt binding until the image module is wired', async () => {
    const s = await seed();
    const res = await post(s.owner.accessToken, bodyFor(s, { receiptImageId: randomUUID() }));
    expect(res.statusCode).toBe(501);
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId!)),
    ).toHaveLength(0);
  });
});
