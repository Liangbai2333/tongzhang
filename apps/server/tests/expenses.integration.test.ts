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

  it.each(['EQUAL', 'SHARES'] as const)(
    'persists stable %s remainders at both amount boundaries regardless of request order',
    async (splitMode) => {
      const s = await seed();
      const members = [s.ownerMember, s.friendMember].sort();
      for (const amountCents of ['1', '999999999']) {
        // Independent expected values, without calling the production allocation helper.
        const amounts = amountCents === '1' ? ['1', '0'] : ['500000000', '499999999'];
        for (const order of [members, [...members].reverse()]) {
          const response = await post(
            s.owner.accessToken,
            bodyFor(s, {
              amountCents,
              splitMode,
              splits: order.map((memberId) =>
                splitMode === 'SHARES' ? { memberId, shares: 10000 } : { memberId },
              ),
            }),
          );
          expect(response.statusCode).toBe(201);
          const expected = members.map((memberId, i) => ({ memberId, amountCents: amounts[i] }));
          expect(response.json().data.splits).toMatchObject(expected);
          const saved = await fixture.db.orm
            .select({ memberId: expenseSplits.memberId, amountCents: expenseSplits.amountCents })
            .from(expenseSplits)
            .where(eq(expenseSplits.expenseId, response.json().data.id))
            .orderBy(expenseSplits.memberId);
          expect(saved).toEqual(
            expected.map((row) => ({ ...row, amountCents: BigInt(row.amountCents!) })),
          );
          expect(saved.reduce((sum, row) => sum + row.amountCents, 0n)).toBe(BigInt(amountCents));
        }
      }
    },
  );

  it('persists and replays exact AMOUNT splits when the payer is outside the split', async () => {
    const s = await seed();
    const third = await fixture.register();
    const [member] = await fixture.db.orm
      .insert(ledgerMembers)
      .values({ ledgerId: ledgerId!, userId: third.user.id })
      .returning();
    const splits = [
      { memberId: s.friendMember, amountCents: '0' },
      { memberId: member!.id, amountCents: '999999999' },
    ];
    const body = bodyFor(s, { amountCents: '999999999', splitMode: 'AMOUNT', splits });
    const key = randomUUID();
    const first = await post(s.friend.accessToken, body, key);
    expect(first.statusCode).toBe(201);
    expect(first.json().data).toMatchObject({
      amountCents: '999999999',
      payerMemberId: s.ownerMember,
      recorderMemberId: s.friendMember,
      splitMode: 'AMOUNT',
    });
    const expected = [...splits].sort((a, b) => a.memberId.localeCompare(b.memberId));
    expect(first.json().data.splits).toMatchObject(expected);
    const replay = await post(s.friend.accessToken, body, key);
    expect(replay.statusCode).toBe(201);
    expect(replay.json()).toEqual(first.json());
    const rows = await fixture.db.orm
      .select()
      .from(expenses)
      .where(eq(expenses.ledgerId, ledgerId!));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.amountCents).toBe(999999999n);
    const saved = await fixture.db.orm
      .select({ memberId: expenseSplits.memberId, amountCents: expenseSplits.amountCents })
      .from(expenseSplits)
      .where(eq(expenseSplits.expenseId, rows[0]!.id))
      .orderBy(expenseSplits.memberId);
    expect(saved).toEqual(
      expected.map((row) => ({ ...row, amountCents: BigInt(row.amountCents) })),
    );
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
        .where(eq(idempotencyKeys.userId, s.friend.user.id)),
    ).toHaveLength(1);
    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
    expect(ledger!.version).toBe(2);
  });

  it('rejects invalid integer-cent totals and manual splits over HTTP without any write effects', async () => {
    const s = await seed();
    const invalid = [
      ...['0', '-1', '1.5', '01', '1000000000', '9223372036854775808', 100].map((amountCents) => ({
        amountCents,
      })),
      ...['-1', '1.5', '9223372036854775808'].map((amountCents) => ({
        splitMode: 'AMOUNT',
        splits: [{ memberId: s.ownerMember, amountCents }],
      })),
    ];
    for (const input of invalid) {
      const response = await post(s.owner.accessToken, bodyFor(s, input));
      expect(response.statusCode).toBe(400);
      expect(response.json().error.code).toBe('VALIDATION_ERROR');
      for (const table of [expenses, expenseSplits, operationLogs])
        expect(
          await fixture.db.orm.select().from(table).where(eq(table.ledgerId, ledgerId!)),
        ).toHaveLength(0);
      expect(
        await fixture.db.orm
          .select()
          .from(idempotencyKeys)
          .where(eq(idempotencyKeys.userId, s.owner.user.id)),
      ).toHaveLength(0);
      const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
      expect(ledger!.version).toBe(1);
    }
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

  it('accepts uppercase and mixed-case member UUIDs and stores canonical lowercase IDs', async () => {
    const s = await seed();
    const upperPayer = await post(
      s.owner.accessToken,
      bodyFor(s, { payerMemberId: s.ownerMember.toUpperCase() }),
    );
    expect(upperPayer.statusCode).toBe(201);
    expect(upperPayer.json().data.payerMemberId).toBe(s.ownerMember);
    const mixed = await post(
      s.owner.accessToken,
      bodyFor(s, {
        splits: [
          { memberId: s.ownerMember.toUpperCase() },
          { memberId: s.friendMember.replace(/^(.{4})/, (m) => m.toUpperCase()) },
        ],
      }),
    );
    expect(mixed.statusCode).toBe(201);
    expect(
      mixed
        .json()
        .data.splits.map((x: { memberId: string }) => x.memberId)
        .sort(),
    ).toEqual([s.ownerMember, s.friendMember].sort());
    const sharesUpper = await post(
      s.owner.accessToken,
      bodyFor(s, {
        splitMode: 'SHARES',
        splits: [
          { memberId: s.ownerMember.toUpperCase(), shares: 1 },
          { memberId: s.friendMember.toUpperCase(), shares: 1 },
        ],
      }),
    );
    expect(sharesUpper.statusCode).toBe(201);
    expect(sharesUpper.json().data.splits.map((x: { shares: number }) => x.shares)).toEqual([1, 1]);
  });

  it('rejects the same member repeated in different cases without partial rows', async () => {
    const s = await seed();
    const res = await post(
      s.owner.accessToken,
      bodyFor(s, {
        splits: [{ memberId: s.ownerMember }, { memberId: s.ownerMember.toUpperCase() }],
      }),
    );
    expect(res.statusCode).toBe(400);
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

  it('rejects a missing receipt without leaving a partial expense', async () => {
    const s = await seed();
    const res = await post(s.owner.accessToken, bodyFor(s, { receiptImageId: randomUUID() }));
    expect(res.statusCode).toBe(403);
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId!)),
    ).toHaveLength(0);
  });
});

const get = (token: string, suffix = '', query = '') =>
  fixture.app.inject({
    url: `/api/v1/ledgers/${ledgerId}/expenses${suffix}${query}`,
    headers: { authorization: `Bearer ${token}` },
  });

describe('expense queries', () => {
  it('reads the real two-person expense and server allocation from either member, with one record after replay', async () => {
    const s = await seed();
    const key = randomUUID();
    const created = await post(s.owner.accessToken, bodyFor(s, { note: '保留备注' }), key);
    await post(s.owner.accessToken, bodyFor(s, { note: '保留备注' }), key);
    const id = created.json().data.id;
    for (const account of [s.owner, s.friend]) {
      const list = await get(account.accessToken);
      expect(list.statusCode).toBe(200);
      expect(list.headers['cache-control']).toBe('no-store');
      expect(list.json().data).toHaveLength(1);
      expect(list.json().data[0]).toMatchObject({
        id,
        amountCents: '12000',
        payerMemberId: s.ownerMember,
      });
      const detail = await get(account.accessToken, `/${id}`);
      expect(detail.statusCode).toBe(200);
      expect(detail.json().data).toMatchObject({
        id,
        note: '保留备注',
        receiptImageId: null,
        recorderMemberId: s.ownerMember,
        canEdit: account === s.owner,
      });
      expect(detail.json().data.splits.map((x: { amountCents: string }) => x.amountCents)).toEqual([
        '6000',
        '6000',
      ]);
    }
    await fixture.db.orm
      .update(ledgers)
      .set({ status: 'SETTLING' })
      .where(eq(ledgers.id, ledgerId!));
    expect((await get(s.owner.accessToken, `/${id}`)).json().data.canEdit).toBe(false);
  });

  it('only recorder or creator can edit; payer identity alone does not grant permission', async () => {
    const s = await seed();
    const third = await fixture.register();
    await fixture.db.orm
      .insert(ledgerMembers)
      .values({ ledgerId: ledgerId!, userId: third.user.id });
    const created = await post(s.friend.accessToken, bodyFor(s));
    for (const account of [s.owner, s.friend, third]) {
      expect(
        (await get(account.accessToken, `/${created.json().data.id}`)).json().data.canEdit,
      ).toBe(account !== third);
    }
  });

  it('denies anonymous and nonmember list/detail reads, including missing ledgers', async () => {
    const s = await seed();
    const created = await post(s.owner.accessToken, bodyFor(s));
    for (const suffix of ['', `/${created.json().data.id}`, `/${randomUUID()}`]) {
      expect(
        (await fixture.app.inject(`/api/v1/ledgers/${ledgerId}/expenses${suffix}`)).statusCode,
      ).toBe(401);
      expect((await get(s.outsider.accessToken, suffix)).statusCode).toBe(403);
      const missingLedger = await fixture.app.inject({
        url: `/api/v1/ledgers/${randomUUID()}/expenses${suffix}`,
        headers: { authorization: `Bearer ${s.owner.accessToken}` },
      });
      expect(missingLedger.statusCode).toBe(403);
    }
    const otherLedger = await fixture.ledger(s.owner);
    const crossLedger = await fixture.app.inject({
      url: `/api/v1/ledgers/${otherLedger}/expenses/${created.json().data.id}`,
      headers: { authorization: `Bearer ${s.owner.accessToken}` },
    });
    expect(crossLedger.statusCode).toBe(404);
    expect((await get(s.owner.accessToken, `/${randomUUID()}`)).statusCode).toBe(404);
  });

  it('combines inclusive date, payer and category filters and excludes deleted rows', async () => {
    const s = await seed();
    const target = await post(s.owner.accessToken, bodyFor(s));
    await post(s.owner.accessToken, bodyFor(s, { category: 'OTHER' }));
    await post(s.owner.accessToken, bodyFor(s, { payerMemberId: s.friendMember }));
    await post(s.owner.accessToken, bodyFor(s, { occurredOn: '2026-10-23' }));
    const removed = await post(s.owner.accessToken, bodyFor(s));
    await fixture.db.orm
      .update(expenses)
      .set({ deletedAt: new Date() })
      .where(eq(expenses.id, removed.json().data.id));
    const result = await get(
      s.friend.accessToken,
      '',
      `?from=2026-10-24&to=2026-10-24&payerMemberId=${s.ownerMember.toUpperCase()}&category=DINING`,
    );
    expect(result.statusCode).toBe(200);
    expect(result.json().data.map((x: { id: string }) => x.id)).toEqual([target.json().data.id]);
    expect((await get(s.owner.accessToken, `/${removed.json().data.id}`)).statusCode).toBe(404);
    expect((await get(s.owner.accessToken, '', '?from=2026-10-25&to=2026-10-24')).statusCode).toBe(
      400,
    );
  });

  it('paginates same-day ties by descending id without duplicates and rejects malformed cursors', async () => {
    const s = await seed();
    const ids: string[] = [];
    for (let i = 0; i < 4; i++)
      ids.push((await post(s.owner.accessToken, bodyFor(s))).json().data.id);
    const older = (await post(s.owner.accessToken, bodyFor(s, { occurredOn: '2026-10-23' }))).json()
      .data.id;
    const collected: string[] = [];
    let cursor: string | null = null;
    do {
      const page = await get(
        s.friend.accessToken,
        '',
        `?limit=2${cursor ? `&cursor=${cursor}` : ''}`,
      );
      expect(page.statusCode).toBe(200);
      collected.push(...page.json().data.map((x: { id: string }) => x.id));
      cursor = page.json().page.nextCursor;
    } while (cursor);
    expect(collected).toEqual([...ids.sort().reverse(), older]);
    for (const cursor of [
      'not_base64',
      '!!!',
      Buffer.from(JSON.stringify(['2026-02-30', randomUUID()])).toString('base64url'),
      Buffer.from(JSON.stringify(['2026-10-24', 'bad-id'])).toString('base64url'),
    ]) {
      expect(
        (await get(s.owner.accessToken, '', `?cursor=${encodeURIComponent(cursor)}`)).statusCode,
      ).toBe(400);
    }
    expect((await get(s.owner.accessToken, '', '?limit=51')).statusCode).toBe(400);
  });
});
