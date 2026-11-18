import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import {
  expenseImages,
  expenseSplits,
  expenses,
  idempotencyKeys,
  imageAssets,
  ledgerMembers,
  ledgers,
  operationLogs,
} from '../src/db/schema/index.js';
import { createExpensesService } from '../src/modules/expenses/index.js';
import { cleanupTemporaryImages } from '../src/modules/images/cleanup.js';
import { receiptBinder } from '../src/modules/images/index.js';
import { integrationFixture } from './fixtures/integration.js';
import { imageBytes, imageMultipart } from './fixtures/images.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
let ledgerId: string | undefined;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  if (ledgerId) {
    await fixture.db.orm.delete(operationLogs).where(eq(operationLogs.ledgerId, ledgerId));
    await fixture.db.orm.delete(expenseImages).where(eq(expenseImages.ledgerId, ledgerId));
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

const patch = (
  token: string,
  expenseId: string,
  payload: object,
  key: string = randomUUID(),
  targetLedgerId: string = ledgerId!,
) =>
  fixture.app.inject({
    method: 'PATCH',
    url: `/api/v1/ledgers/${targetLedgerId}/expenses/${expenseId}`,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
    payload,
  });

const del = (
  token: string,
  expenseId: string,
  query = '?version=1',
  key: string = randomUUID(),
  targetLedgerId: string = ledgerId!,
) =>
  fixture.app.inject({
    method: 'DELETE',
    url: `/api/v1/ledgers/${targetLedgerId}/expenses/${expenseId}${query}`,
    headers: { authorization: `Bearer ${token}`, 'idempotency-key': key },
  });

async function uploadReceipt(token: string, kind: 'RECEIPT' | 'COVER' = 'RECEIPT') {
  const request = imageMultipart(await imageBytes(), 'image/png', [['kind', kind]]);
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/images',
    ...request,
    headers: { ...request.headers, authorization: `Bearer ${token}` },
  });
  expect(response.statusCode).toBe(201);
  return response.json().data.imageId as string;
}

describe('updateExpense (A16)', () => {
  it('recomputes splits in bigint cents, increments both versions, preserves recorder and updates preview version', async () => {
    const s = await seed();
    const created = await post(s.friend.accessToken, bodyFor(s, { note: '初始备注' }));
    expect(created.statusCode).toBe(201);
    const expenseId = created.json().data.id as string;

    const previewBefore = await fixture.app.inject({
      url: `/api/v1/ledgers/${ledgerId}/settlement-preview`,
      headers: { authorization: `Bearer ${s.owner.accessToken}` },
    });
    expect(previewBefore.statusCode).toBe(200);
    expect(previewBefore.json().data.ledgerVersion).toBe(2);

    // Creator edits an expense originally recorded by friend: recorderMemberId must stay friendMember.
    const updated = await patch(
      s.owner.accessToken,
      expenseId,
      bodyFor(s, {
        title: '更正为按份晚餐',
        amountCents: '10000',
        category: 'SHOPPING',
        occurredOn: '2026-10-25',
        payerMemberId: s.friendMember,
        splitMode: 'SHARES',
        splits: [
          { memberId: s.ownerMember, shares: 1 },
          { memberId: s.friendMember, shares: 2 },
        ],
        note: '创建者协助更正',
        version: 1,
      }),
    );
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data).toMatchObject({
      id: expenseId,
      title: '更正为按份晚餐',
      amountCents: '10000',
      category: 'SHOPPING',
      occurredOn: '2026-10-25',
      payerMemberId: s.friendMember,
      recorderMemberId: s.friendMember,
      recorderName: s.friend.user.username,
      splitMode: 'SHARES',
      note: '创建者协助更正',
      version: 2,
      canEdit: true,
    });
    const byMember = Object.fromEntries(
      updated
        .json()
        .data.splits.map((x: { memberId: string; amountCents: string; shares: number }) => [
          x.memberId,
          { amountCents: x.amountCents, shares: x.shares },
        ]),
    );
    expect(byMember[s.ownerMember]).toEqual({ amountCents: '3333', shares: 1 });
    expect(byMember[s.friendMember]).toEqual({ amountCents: '6667', shares: 2 });

    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
    expect(ledger!.version).toBe(3);

    // Previous settlement preview version (2) is invalidated by the edit.
    const staleStart = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/settlement`,
      headers: {
        authorization: `Bearer ${s.owner.accessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: { expectedVersion: 2 },
    });
    expect(staleStart.statusCode).toBe(409);
    expect(staleStart.json().error.code).toBe('VERSION_CONFLICT');

    const previewAfter = await fixture.app.inject({
      url: `/api/v1/ledgers/${ledgerId}/settlement-preview`,
      headers: { authorization: `Bearer ${s.owner.accessToken}` },
    });
    expect(previewAfter.json().data).toMatchObject({
      ledgerVersion: 3,
      expenseTotalCents: '10000',
      transferTotalCents: '3333',
    });

    const logs = await fixture.db.orm
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.ledgerId, ledgerId!));
    expect(logs.map((l) => l.action)).toEqual(['EXPENSE_CREATED', 'EXPENSE_UPDATED']);
  });

  it('enforces 401/403/404 and rejects SETTLING or SETTLED ledgers with 409 LEDGER_FROZEN', async () => {
    const s = await seed();
    const third = await fixture.register('普通成员丙');
    const [thirdMember] = await fixture.db.orm
      .insert(ledgerMembers)
      .values({ ledgerId: ledgerId!, userId: third.user.id })
      .returning();

    // Friend records an expense where thirdMember is the payer: payer role alone must not grant edit access.
    const created = await post(
      s.friend.accessToken,
      bodyFor(s, { payerMemberId: thirdMember!.id }),
    );
    const expenseId = created.json().data.id as string;
    const updatePayload = bodyFor(s, { title: '试图越权修改', version: 1 });

    const anon = await fixture.app.inject({
      method: 'PATCH',
      url: `/api/v1/ledgers/${ledgerId}/expenses/${expenseId}`,
      headers: { 'idempotency-key': randomUUID() },
      payload: updatePayload,
    });
    expect(anon.statusCode).toBe(401);

    const outsiderRes = await patch(s.outsider.accessToken, expenseId, updatePayload);
    expect(outsiderRes.statusCode).toBe(403);
    expect(outsiderRes.json().error.code).toBe('FORBIDDEN');

    const payerButNotEditor = await patch(third.accessToken, expenseId, updatePayload);
    expect(payerButNotEditor.statusCode).toBe(403);
    expect(payerButNotEditor.json().error.code).toBe('FORBIDDEN');

    const missing = await patch(s.owner.accessToken, randomUUID(), updatePayload);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('NOT_FOUND');

    const otherLedger = await fixture.ledger(s.owner);
    const crossLedger = await patch(
      s.owner.accessToken,
      expenseId,
      updatePayload,
      randomUUID(),
      otherLedger,
    );
    expect(crossLedger.statusCode).toBe(404);

    for (const [status, settledAt] of [
      ['SETTLING', null],
      ['SETTLED', new Date()],
    ] as const) {
      await fixture.db.orm
        .update(ledgers)
        .set({ status, settledAt })
        .where(eq(ledgers.id, ledgerId!));
      for (const actor of [s.owner, s.friend]) {
        const frozen = await patch(actor.accessToken, expenseId, updatePayload);
        expect(frozen.statusCode).toBe(409);
        expect(frozen.json().error.code).toBe('LEDGER_FROZEN');
      }
    }

    const [row] = await fixture.db.orm.select().from(expenses).where(eq(expenses.id, expenseId));
    expect(row!.title).toBe('晚餐');
    expect(row!.version).toBe(1);
  });

  it('rejects stale versions and concurrent conflicting edits with 409 VERSION_CONFLICT', async () => {
    const s = await seed();
    const created = await post(s.owner.accessToken, bodyFor(s));
    const expenseId = created.json().data.id as string;

    const wrongVersion = await patch(s.owner.accessToken, expenseId, bodyFor(s, { version: 2 }));
    expect(wrongVersion.statusCode).toBe(409);
    expect(wrongVersion.json().error.code).toBe('VERSION_CONFLICT');

    const [r1, r2] = await Promise.all([
      patch(
        s.owner.accessToken,
        expenseId,
        bodyFor(s, { title: '并发修改A', amountCents: '8000', version: 1 }),
      ),
      patch(
        s.owner.accessToken,
        expenseId,
        bodyFor(s, { title: '并发修改B', amountCents: '9000', version: 1 }),
      ),
    ]);
    expect([r1.statusCode, r2.statusCode].sort()).toEqual([200, 409]);
    const loser = r1.statusCode === 409 ? r1 : r2;
    expect(loser.json().error.code).toBe('VERSION_CONFLICT');

    const [saved] = await fixture.db.orm.select().from(expenses).where(eq(expenses.id, expenseId));
    expect(saved!.version).toBe(2);
    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
    expect(ledger!.version).toBe(3);
  });

  it('retains existing receipts, swaps or clears receipts atomically, and rolls back failed swaps', async () => {
    const s = await seed();
    const receipt1 = await uploadReceipt(s.friend.accessToken);
    const created = await post(
      s.friend.accessToken,
      bodyFor(s, { receiptImageId: receipt1, note: '附第一张收据' }),
    );
    expect(created.statusCode).toBe(201);
    const expenseId = created.json().data.id as string;

    // Creator (different from receipt1 uploader) edits title while retaining the existing receipt1.
    const retained = await patch(
      s.owner.accessToken,
      expenseId,
      bodyFor(s, { title: '保留原收据', receiptImageId: receipt1, version: 1 }),
    );
    expect(retained.statusCode).toBe(200);
    expect(retained.json().data.receiptImageId).toBe(receipt1);

    // Swapping to an invalid image (another user's unbound upload, cover, missing, or another expense's receipt) rolls back everything.
    const otherExpenseReceipt = await uploadReceipt(s.friend.accessToken);
    const secondExpense = await post(
      s.friend.accessToken,
      bodyFor(s, { title: '另一笔消费', receiptImageId: otherExpenseReceipt }),
    );
    expect(secondExpense.statusCode).toBe(201);
    const foreignUnbound = await uploadReceipt(s.owner.accessToken);
    const wrongKind = await uploadReceipt(s.friend.accessToken, 'COVER');

    for (const [badId, expectedStatus, expectedCode] of [
      [otherExpenseReceipt, 400, 'IMAGE_INVALID'],
      [foreignUnbound, 403, 'FORBIDDEN'],
      [wrongKind, 400, 'IMAGE_INVALID'],
      [randomUUID(), 403, 'FORBIDDEN'],
    ] as const) {
      const failed = await patch(
        s.friend.accessToken,
        expenseId,
        bodyFor(s, {
          title: '不应落库的修改',
          amountCents: '20000',
          receiptImageId: badId,
          version: 2,
        }),
      );
      expect(failed.statusCode).toBe(expectedStatus);
      expect(failed.json().error.code).toBe(expectedCode);
    }

    // Verify full rollback: expense still at version 2 with receipt1 and original 12000 amount.
    const unchanged = await get(s.owner.accessToken, `/${expenseId}`);
    expect(unchanged.json().data).toMatchObject({
      title: '保留原收据',
      amountCents: '12000',
      version: 2,
      receiptImageId: receipt1,
    });

    // Injected failure after receiptBinder.bind rolls back old receipt detachment, new receipt binding and version bumps.
    const receipt2 = await uploadReceipt(s.friend.accessToken);
    const failingService = createExpensesService(fixture.db.orm, {
      bind: async (tx, input) => {
        await receiptBinder.bind(tx, input);
        throw new Error('injected failure after receipt swap');
      },
    });
    const swapKey = randomUUID();
    await expect(
      failingService.updateExpense(
        {
          params: { ledgerId: ledgerId!, expenseId },
          query: {},
          body: {
            title: '回滚换绑',
            amountCents: '16000',
            category: 'DINING' as const,
            occurredOn: '2026-10-24',
            payerMemberId: s.ownerMember,
            splitMode: 'EQUAL' as const,
            splits: [{ memberId: s.ownerMember }, { memberId: s.friendMember }],
            receiptImageId: receipt2,
            version: 2,
          },
        },
        {
          principal: { userId: s.friend.user.id, sessionId: randomUUID() },
          requestId: randomUUID(),
          idempotencyKey: swapKey,
        },
      ),
    ).rejects.toThrow('injected failure after receipt swap');

    const [receipt2RowBefore] = await fixture.db.orm
      .select()
      .from(imageAssets)
      .where(eq(imageAssets.id, receipt2));
    expect(receipt2RowBefore!.ledgerId).toBeNull();
    expect((await get(s.owner.accessToken, `/${expenseId}`)).json().data.receiptImageId).toBe(
      receipt1,
    );

    // Retry with the same key and receipt2 succeeds atomically.
    const swapped = await patch(
      s.friend.accessToken,
      expenseId,
      bodyFor(s, {
        title: '换绑第二张收据',
        amountCents: '16000',
        receiptImageId: receipt2,
        version: 2,
      }),
      swapKey,
    );
    expect(swapped.statusCode).toBe(200);
    expect(swapped.json().data).toMatchObject({
      title: '换绑第二张收据',
      amountCents: '16000',
      version: 3,
      receiptImageId: receipt2,
    });

    // The replaced receipt1 is deleted in the same transaction: no orphaned bytea row is left behind.
    expect(
      await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, receipt1)),
    ).toHaveLength(0);
    expect(
      (
        await fixture.app.inject({
          method: 'GET',
          url: `/api/v1/images/${receipt1}`,
          headers: { authorization: `Bearer ${s.friend.accessToken}` },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (await post(s.friend.accessToken, bodyFor(s, { receiptImageId: receipt1 }))).statusCode,
    ).toBe(403);

    // Clearing receipt (null) detaches expense_images cleanly.
    const cleared = await patch(
      s.friend.accessToken,
      expenseId,
      bodyFor(s, { title: '移除收据', receiptImageId: null, version: 3 }),
    );
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().data.receiptImageId).toBeNull();
    expect(
      await fixture.db.orm
        .select()
        .from(expenseImages)
        .where(eq(expenseImages.expenseId, expenseId)),
    ).toHaveLength(0);
    expect(
      await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, receipt2)),
    ).toHaveLength(0);
  });

  it('replays identical idempotent updates (even after freeze) and rejects payload changes with 409 IDEMPOTENCY_CONFLICT', async () => {
    const s = await seed();
    const created = await post(s.owner.accessToken, bodyFor(s));
    const expenseId = created.json().data.id as string;

    const key = randomUUID();
    const updateBody = bodyFor(s, { title: '幂等更新', amountCents: '18000', version: 1 });
    const first = await patch(s.owner.accessToken, expenseId, updateBody, key);
    expect(first.statusCode).toBe(200);

    const replayActive = await patch(s.owner.accessToken, expenseId, updateBody, key);
    expect(replayActive.statusCode).toBe(200);
    expect(replayActive.json()).toEqual(first.json());

    const conflict = await patch(
      s.owner.accessToken,
      expenseId,
      bodyFor(s, { title: '篡改同键内容', amountCents: '18000', version: 1 }),
      key,
    );
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');

    await fixture.db.orm
      .update(ledgers)
      .set({ status: 'SETTLING' })
      .where(eq(ledgers.id, ledgerId!));
    const replayAfterFreeze = await patch(s.owner.accessToken, expenseId, updateBody, key);
    expect(replayAfterFreeze.statusCode).toBe(200);
    expect(replayAfterFreeze.json()).toEqual(first.json());

    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
    expect(ledger!.version).toBe(3);
  });
});

describe('deleteExpense (A17)', () => {
  it('soft-deletes with version check, replays idempotently, preserves receipts and restores Gushan 4-member conservation', async () => {
    const an = await fixture.register('小安');
    const bai = await fixture.register('小白');
    const chen = await fixture.register('小陈');
    const ding = await fixture.register('小丁');
    ledgerId = await fixture.ledger(an, [bai, chen, ding]);
    const rows = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, ledgerId));
    const mAn = rows.find((r) => r.userId === an.user.id)!.id;
    const mBai = rows.find((r) => r.userId === bai.user.id)!.id;
    const mChen = rows.find((r) => r.userId === chen.user.id)!.id;
    const mDing = rows.find((r) => r.userId === ding.user.id)!.id;
    const allFour = [
      { memberId: mAn },
      { memberId: mBai },
      { memberId: mChen },
      { memberId: mDing },
    ];

    // 1. 小安付食堂 12000（初始误填 10000，编辑修正为 12000）
    const canteen = await post(an.accessToken, {
      title: '食堂',
      amountCents: '10000',
      category: 'DINING',
      occurredOn: '2026-11-16',
      payerMemberId: mAn,
      splitMode: 'EQUAL',
      splits: allFour,
    });
    const fixedCanteen = await patch(an.accessToken, canteen.json().data.id, {
      title: '食堂',
      amountCents: '12000',
      category: 'DINING',
      occurredOn: '2026-11-16',
      payerMemberId: mAn,
      splitMode: 'EQUAL',
      splits: allFour,
      version: 1,
    });
    expect(fixedCanteen.statusCode).toBe(200);

    // 2. 小白付门票 12000，四人均分
    expect(
      (
        await post(bai.accessToken, {
          title: '门票',
          amountCents: '12000',
          category: 'TICKET',
          occurredOn: '2026-11-16',
          payerMemberId: mBai,
          splitMode: 'EQUAL',
          splits: allFour,
        })
      ).statusCode,
    ).toBe(201);

    // 3. 小陈付车费 6000，小安/小陈均分
    expect(
      (
        await post(chen.accessToken, {
          title: '车费',
          amountCents: '6000',
          category: 'TRANSPORT',
          occurredOn: '2026-11-16',
          payerMemberId: mChen,
          splitMode: 'EQUAL',
          splits: [{ memberId: mAn }, { memberId: mChen }],
        })
      ).statusCode,
    ).toBe(201);

    // 4. 小丁误记一笔带收据消费 5000，再由创建者小安软删除恢复“鼓山一日”基准账
    const dingReceipt = await uploadReceipt(ding.accessToken);
    const mistake = await post(ding.accessToken, {
      title: '误记零食',
      amountCents: '5000',
      category: 'DINING',
      occurredOn: '2026-11-16',
      payerMemberId: mDing,
      splitMode: 'EQUAL',
      splits: allFour,
      receiptImageId: dingReceipt,
    });
    const mistakeId = mistake.json().data.id as string;

    const [ledgerBeforeDelete] = await fixture.db.orm
      .select()
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId));

    const deleteKey = randomUUID();
    const deleted = await del(an.accessToken, mistakeId, '?version=1', deleteKey);
    expect(deleted.statusCode).toBe(200);
    expect(deleted.json()).toEqual({ data: { deletedId: mistakeId } });

    // Idempotent replay returns 200 without bumping ledger version a second time; altered version on same key returns 409.
    const replay = await del(an.accessToken, mistakeId, '?version=1', deleteKey);
    expect(replay.statusCode).toBe(200);
    expect(replay.json()).toEqual({ data: { deletedId: mistakeId } });
    const keyConflict = await del(an.accessToken, mistakeId, '?version=2', deleteKey);
    expect(keyConflict.statusCode).toBe(409);
    expect(keyConflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');

    // Fresh delete or update on soft-deleted row returns 404 NOT_FOUND.
    expect((await del(an.accessToken, mistakeId, '?version=1')).statusCode).toBe(404);
    expect(
      (
        await patch(an.accessToken, mistakeId, {
          title: '已删除不可改',
          amountCents: '5000',
          category: 'DINING',
          occurredOn: '2026-11-16',
          payerMemberId: mDing,
          splitMode: 'EQUAL',
          splits: allFour,
          version: 1,
        })
      ).statusCode,
    ).toBe(404);
    expect((await get(an.accessToken, `/${mistakeId}`)).statusCode).toBe(404);

    const [deletedRow] = await fixture.db.orm
      .select()
      .from(expenses)
      .where(eq(expenses.id, mistakeId));
    expect(deletedRow!.deletedAt).not.toBeNull();
    expect(deletedRow!.version).toBe(1);

    const [ledgerAfterDelete] = await fixture.db.orm
      .select()
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId));
    expect(ledgerAfterDelete!.version).toBe(ledgerBeforeDelete!.version + 1);

    // Soft-deleted expense receipt remains preserved against temporary image cleanup.
    await fixture.db.orm
      .update(imageAssets)
      .set({ createdAt: sql`now() - interval '25 hours'` })
      .where(eq(imageAssets.id, dingReceipt));
    expect(await cleanupTemporaryImages(fixture.db.orm)).toBe(0);

    // Verify Gushan 4-person benchmark: total 30000, nets +3000/+6000/-3000/-6000, 2 transfers totaling 9000.
    const list = await get(an.accessToken);
    expect(list.json().data).toHaveLength(3);

    const balances = await fixture.app.inject({
      url: `/api/v1/ledgers/${ledgerId}/balances`,
      headers: { authorization: `Bearer ${an.accessToken}` },
    });
    expect(balances.statusCode).toBe(200);
    expect(balances.json().data.expenseTotalCents).toBe('30000');
    const netByMember = Object.fromEntries(
      balances
        .json()
        .data.members.map((m: { memberId: string; netCents: string }) => [m.memberId, m.netCents]),
    );
    expect(netByMember).toEqual({
      [mAn]: '3000',
      [mBai]: '6000',
      [mChen]: '-3000',
      [mDing]: '-6000',
    });

    const preview = await fixture.app.inject({
      url: `/api/v1/ledgers/${ledgerId}/settlement-preview`,
      headers: { authorization: `Bearer ${an.accessToken}` },
    });
    expect(preview.statusCode).toBe(200);
    expect(preview.json().data).toMatchObject({
      ledgerVersion: ledgerAfterDelete!.version,
      expenseTotalCents: '30000',
      transferTotalCents: '9000',
      transferCount: 2,
    });
    expect(preview.json().data.transfers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payerMemberId: mChen,
          payeeMemberId: mAn,
          amountCents: '3000',
        }),
        expect.objectContaining({
          payerMemberId: mDing,
          payeeMemberId: mBai,
          amountCents: '6000',
        }),
      ]),
    );
  });

  it('enforces permissions, frozen ledger rejection, version conflicts, invalid query params and rollback atomicity', async () => {
    const s = await seed();
    const third = await fixture.register('普通成员丙');
    const [thirdMember] = await fixture.db.orm
      .insert(ledgerMembers)
      .values({ ledgerId: ledgerId!, userId: third.user.id })
      .returning();

    const created = await post(
      s.friend.accessToken,
      bodyFor(s, { payerMemberId: thirdMember!.id }),
    );
    const expenseId = created.json().data.id as string;

    expect(
      (
        await fixture.app.inject({
          method: 'DELETE',
          url: `/api/v1/ledgers/${ledgerId}/expenses/${expenseId}?version=1`,
          headers: { 'idempotency-key': randomUUID() },
        })
      ).statusCode,
    ).toBe(401);
    expect((await del(s.outsider.accessToken, expenseId)).statusCode).toBe(403);
    expect((await del(third.accessToken, expenseId)).statusCode).toBe(403);
    expect((await del(s.owner.accessToken, randomUUID())).statusCode).toBe(404);

    for (const badQuery of [
      '',
      '?version=0',
      '?version=-1',
      '?version=abc',
      '?version=2147483648',
    ]) {
      const bad = await del(s.owner.accessToken, expenseId, badQuery);
      expect(bad.statusCode).toBe(400);
      expect(bad.json().error.code).toBe('VALIDATION_ERROR');
    }

    const wrongVersion = await del(s.friend.accessToken, expenseId, '?version=2');
    expect(wrongVersion.statusCode).toBe(409);
    expect(wrongVersion.json().error.code).toBe('VERSION_CONFLICT');

    // Audit failure rolls back soft-delete and ledger version increment.
    const rollbackKey = randomUUID();
    await expect(
      createExpensesService(fixture.db.orm).deleteExpense(
        {
          params: { ledgerId: ledgerId!, expenseId },
          query: { version: 1 },
          body: undefined,
        },
        {
          principal: { userId: s.friend.user.id, sessionId: randomUUID() },
          requestId: 'invalid-audit-uuid',
          idempotencyKey: rollbackKey,
        },
      ),
    ).rejects.toThrow();

    const [stillActive] = await fixture.db.orm
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId));
    expect(stillActive!.deletedAt).toBeNull();
    const [ledgerUnchanged] = await fixture.db.orm
      .select()
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId!));
    expect(ledgerUnchanged!.version).toBe(2);

    for (const [status, settledAt] of [
      ['SETTLING', null],
      ['SETTLED', new Date()],
    ] as const) {
      await fixture.db.orm
        .update(ledgers)
        .set({ status, settledAt })
        .where(eq(ledgers.id, ledgerId!));
      const frozen = await del(s.owner.accessToken, expenseId, '?version=1');
      expect(frozen.statusCode).toBe(409);
      expect(frozen.json().error.code).toBe('LEDGER_FROZEN');
    }
  });

  it('serializes settlement freeze against concurrent expense edit/delete on the ledger lock', async () => {
    const s = await seed();
    const created = await post(s.friend.accessToken, bodyFor(s));
    const expenseId = created.json().data.id as string;

    // expectedVersion is 2 right now; racing startSettlement(2) against deleteExpense(1) must serialize cleanly.
    const [freezeRes, deleteRes] = await Promise.all([
      fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/settlement`,
        headers: {
          authorization: `Bearer ${s.owner.accessToken}`,
          'idempotency-key': randomUUID(),
        },
        payload: { expectedVersion: 2 },
      }),
      del(s.friend.accessToken, expenseId, '?version=1'),
    ]);

    if (freezeRes.statusCode === 201) {
      expect(deleteRes.statusCode).toBe(409);
      expect(deleteRes.json().error.code).toBe('LEDGER_FROZEN');
    } else {
      expect(deleteRes.statusCode).toBe(200);
      expect(freezeRes.statusCode).toBe(409);
      expect(freezeRes.json().error.code).toBe('VERSION_CONFLICT');
    }
  });
});

describe('A16/A17 route-level Idempotency-Key guards (issue 106)', () => {
  const keylessPatch = (token: string, expenseId: string, payload: object, key?: string) =>
    fixture.app.inject({
      method: 'PATCH',
      url: `/api/v1/ledgers/${ledgerId}/expenses/${expenseId}`,
      headers: {
        authorization: `Bearer ${token}`,
        ...(key === undefined ? {} : { 'idempotency-key': key }),
      },
      payload,
    });
  const keylessDelete = (token: string, expenseId: string, key?: string) =>
    fixture.app.inject({
      method: 'DELETE',
      url: `/api/v1/ledgers/${ledgerId}/expenses/${expenseId}?version=1`,
      headers: {
        authorization: `Bearer ${token}`,
        ...(key === undefined ? {} : { 'idempotency-key': key }),
      },
    });

  it('rejects missing or malformed keys on A16/A17 with 400 VALIDATION_ERROR and leaves no trace', async () => {
    const s = await seed();
    const created = await post(s.owner.accessToken, bodyFor(s));
    const expenseId = created.json().data.id as string;
    const updateBody = bodyFor(s, { title: '缺键改写', amountCents: '18000', version: 1 });

    const keyRowsBefore = await fixture.db.orm
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.userId, s.owner.user.id));

    for (const badKey of [undefined, '', 'not-a-uuid', '1234']) {
      const edit = await keylessPatch(s.owner.accessToken, expenseId, updateBody, badKey);
      expect(edit.statusCode).toBe(400);
      expect(edit.json().error.code).toBe('VALIDATION_ERROR');
      const remove = await keylessDelete(s.owner.accessToken, expenseId, badKey);
      expect(remove.statusCode).toBe(400);
      expect(remove.json().error.code).toBe('VALIDATION_ERROR');
    }

    const [expense] = await fixture.db.orm
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId));
    expect(expense!.title).toBe('晚餐');
    expect(expense!.version).toBe(1);
    expect(expense!.deletedAt).toBeNull();
    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
    expect(ledger!.version).toBe(2);
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, s.owner.user.id)),
    ).toHaveLength(keyRowsBefore.length);
  });

  it('authenticates before checking the key, so anonymous keyless requests get 401 not 400', async () => {
    const s = await seed();
    const created = await post(s.owner.accessToken, bodyFor(s));
    const expenseId = created.json().data.id as string;
    const edit = await fixture.app.inject({
      method: 'PATCH',
      url: `/api/v1/ledgers/${ledgerId}/expenses/${expenseId}`,
      payload: bodyFor(s, { version: 1 }),
    });
    expect(edit.statusCode).toBe(401);
    const remove = await fixture.app.inject({
      method: 'DELETE',
      url: `/api/v1/ledgers/${ledgerId}/expenses/${expenseId}?version=1`,
    });
    expect(remove.statusCode).toBe(401);
  });

  it('scopes keys by user and operation: a stolen key never replays another user result, and A16/A17 do not share a key', async () => {
    const s = await seed();
    const created = await post(s.owner.accessToken, bodyFor(s));
    const expenseId = created.json().data.id as string;
    const key = randomUUID();
    const updateBody = bodyFor(s, { title: '同键隔离', amountCents: '18000', version: 1 });

    const first = await patch(s.owner.accessToken, expenseId, updateBody, key);
    expect(first.statusCode).toBe(200);

    // Replay still re-checks permission: the friend is neither recorder nor creator.
    const stolen = await patch(s.friend.accessToken, expenseId, updateBody, key);
    expect(stolen.statusCode).toBe(403);

    // The same key on the DELETE route is a different operation scope and runs for real.
    const removed = await del(s.owner.accessToken, expenseId, '?version=2', key);
    expect(removed.statusCode).toBe(200);
    const [expense] = await fixture.db.orm
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId));
    expect(expense!.deletedAt).not.toBeNull();
    // A17 only stamps deleted_at: the expense version stays at the A16 result, the ledger version advances.
    expect(expense!.version).toBe(2);
    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
    expect(ledger!.version).toBe(4);
  });

  it('rolls back A16 edits, split recomputation and ledger version when the audit write fails', async () => {
    const s = await seed();
    const created = await post(s.owner.accessToken, bodyFor(s));
    const expenseId = created.json().data.id as string;
    const rollbackKey = randomUUID();

    await expect(
      createExpensesService(fixture.db.orm).updateExpense(
        {
          params: { ledgerId: ledgerId!, expenseId },
          query: {},
          body: {
            title: '审计失败回滚',
            amountCents: '30000',
            category: 'DINING' as const,
            occurredOn: '2026-10-25',
            payerMemberId: s.friendMember,
            splitMode: 'EQUAL' as const,
            splits: [{ memberId: s.ownerMember }, { memberId: s.friendMember }],
            version: 1,
          },
        },
        {
          principal: { userId: s.owner.user.id, sessionId: randomUUID() },
          requestId: 'invalid-audit-uuid',
          idempotencyKey: rollbackKey,
        },
      ),
    ).rejects.toThrow();

    const [expense] = await fixture.db.orm
      .select()
      .from(expenses)
      .where(eq(expenses.id, expenseId));
    expect(expense!.title).toBe('晚餐');
    expect(expense!.amountCents).toBe(12000n);
    expect(expense!.version).toBe(1);
    const splits = await fixture.db.orm
      .select()
      .from(expenseSplits)
      .where(eq(expenseSplits.expenseId, expenseId));
    expect(splits.map((row) => row.amountCents).sort()).toEqual([6000n, 6000n]);
    const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId!));
    expect(ledger!.version).toBe(2);
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.key, rollbackKey)),
    ).toHaveLength(0);
  });
});
