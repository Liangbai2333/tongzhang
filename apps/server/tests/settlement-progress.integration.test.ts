import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq, inArray } from 'drizzle-orm';
import { endpoints } from '@tongzhang/contracts';
import {
  expenses,
  expenseSplits,
  ledgerMembers,
  ledgers,
  settlementBatches,
  settlementTransfers,
  operationLogs,
  idempotencyKeys,
} from '../src/db/schema/index.js';
import { integrationFixture } from './fixtures/integration.js';
import { waitForBlockedQueries } from './fixtures/locks.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
let ledgerId: string;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => fixture.close());
const headers = (token: string, key: string = randomUUID()) => ({
  authorization: `Bearer ${token}`,
  'idempotency-key': key,
});
const get = (token: string, id = ledgerId) =>
  fixture.app.inject({ url: `/api/v1/ledgers/${id}/settlement`, headers: headers(token) });
const paid = (
  token: string,
  transferId: string,
  key: string = randomUUID(),
  note = '已核对',
  id = ledgerId,
) =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${id}/settlement/transfers/${transferId}/paid`,
    headers: headers(token, key),
    payload: { note },
  });
const settle = (token: string, key: string = randomUUID(), id = ledgerId) =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${id}/settle`,
    headers: headers(token, key),
  });

async function seed(withExpenses = true) {
  const accounts = await Promise.all(
    ['小安', '小白', '小陈', '小丁', '外人'].map((n) => fixture.register(n)),
  );
  const [owner, friend, third, fourth, outsider] = accounts;
  ledgerId = await fixture.ledger(owner!, [friend!, third!, fourth!]);
  const members = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const ids = accounts.slice(0, 4).map((a) => members.find((m) => m.userId === a!.user.id)!.id);
  if (withExpenses) {
    for (const [payer, amount, participants] of [
      [ids[0]!, '12000', ids],
      [ids[1]!, '12000', ids],
      [ids[2]!, '6000', [ids[0]!, ids[2]!]],
    ] as const) {
      const response = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses`,
        headers: headers(owner!.accessToken),
        payload: {
          title: '验收消费',
          amountCents: amount,
          category: 'DINING',
          occurredOn: '2026-10-26',
          payerMemberId: payer,
          splitMode: 'EQUAL',
          splits: participants.map((memberId) => ({ memberId })),
        },
      });
      expect(response.statusCode).toBe(201);
    }
  }
  return {
    owner: owner!,
    friend: friend!,
    third: third!,
    fourth: fourth!,
    outsider: outsider!,
    ids,
  };
}
type Seed = Awaited<ReturnType<typeof seed>>;
async function freeze(s: Seed, version = 4) {
  const response = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${ledgerId}/settlement`,
    headers: headers(s.owner.accessToken),
    payload: { expectedVersion: version },
  });
  expect(response.statusCode).toBe(201);
  const started = endpoints.startSettlement.response.parse(response.json()).data.batch;
  const detail = endpoints.getSettlement.response.parse(
    (await get(s.owner.accessToken)).json(),
  ).data;
  expect(detail).toMatchObject(started);
  return detail;
}
async function state() {
  const db = fixture.db.orm;
  const [ledger] = await db.select().from(ledgers).where(eq(ledgers.id, ledgerId));
  const members = await db.select().from(ledgerMembers).where(eq(ledgerMembers.ledgerId, ledgerId));
  return {
    ledger,
    batches: await db
      .select()
      .from(settlementBatches)
      .where(eq(settlementBatches.ledgerId, ledgerId)),
    transfers: await db
      .select()
      .from(settlementTransfers)
      .where(eq(settlementTransfers.ledgerId, ledgerId))
      .orderBy(settlementTransfers.sequence),
    expenses: await db.select().from(expenses).where(eq(expenses.ledgerId, ledgerId)),
    splits: await db.select().from(expenseSplits).where(eq(expenseSplits.ledgerId, ledgerId)),
    audits: await db
      .select()
      .from(operationLogs)
      .where(eq(operationLogs.ledgerId, ledgerId))
      .orderBy(operationLogs.id),
    keys: await db
      .select()
      .from(idempotencyKeys)
      .where(
        inArray(
          idempotencyKeys.userId,
          members.map((m) => m.userId),
        ),
      )
      .orderBy(idempotencyKeys.operation, idempotencyKeys.key),
  };
}
async function payAll(s: Seed, transfers: Awaited<ReturnType<typeof freeze>>['transfers']) {
  for (const transfer of transfers)
    expect((await paid(s.owner.accessToken, transfer.id)).statusCode).toBe(200);
}

describe('settlement progress, registration and closing on real PostgreSQL', () => {
  it('reads the saved snapshot, registers both payments, and closes without changing expense totals', async () => {
    const s = await seed();
    const batch = await freeze(s);
    const frozen = await state();
    const response = await get(s.friend.accessToken);
    expect(response.statusCode).toBe(200);
    expect(response.headers['cache-control']).toBe('no-store');
    expect(endpoints.getSettlement.response.parse(response.json()).data).toEqual(batch);
    expect(batch.netSnapshot).toEqual(
      s.ids
        .map((memberId, i) => ({ memberId, netCents: ['3000', '6000', '-3000', '-6000'][i] }))
        .sort((a, b) => a.memberId.localeCompare(b.memberId)),
    );
    expect(await state()).toEqual(frozen);
    const t = batch.transfers.find((t) => t.payerMemberId === s.ids[2])!;
    const paidKey = randomUUID();
    const first = await paid(s.third.accessToken, t.id, paidKey);
    expect(first.statusCode).toBe(200);
    expect(endpoints.markTransferPaid.response.parse(first.json()).data).toMatchObject({
      transfer: {
        id: t.id,
        status: 'PAID',
        registeredByMemberId: s.ids[2],
        registrationNote: '已核对',
      },
      progress: { paidCount: 1, totalCount: 2, remainingCents: '6000' },
    });
    expect((await get(s.fourth.accessToken)).json().data.progress).toEqual({
      paidCount: 1,
      totalCount: 2,
      remainingCents: '6000',
    });
    expect((await state()).ledger!.status).toBe('SETTLING');
    const other = batch.transfers.find((transfer) => transfer.id !== t.id)!;
    expect((await paid(s.owner.accessToken, other.id)).statusCode).toBe(200);
    const allPaid = await get(s.third.accessToken);
    expect(allPaid.json().data).toMatchObject({
      ledgerStatus: 'SETTLING',
      progress: { paidCount: 2, totalCount: 2, remainingCents: '0' },
    });
    const key = randomUUID();
    const closed = await settle(s.owner.accessToken, key);
    expect(closed.statusCode).toBe(200);
    const result = endpoints.settleLedger.response.parse(closed.json()).data;
    const settled = await state();
    expect((await paid(s.third.accessToken, t.id, paidKey)).json()).toEqual(first.json());
    expect(settled.ledger).toMatchObject({
      status: 'SETTLED',
      version: 6,
      settledAt: new Date(result.settledAt),
    });
    expect((await settle(s.owner.accessToken, key)).json()).toEqual(closed.json());
    expect((await settle(s.owner.accessToken)).json()).toEqual(closed.json());
    expect(
      (await paid(s.third.accessToken, t.id, randomUUID(), '忽略新备注')).json().data.transfer,
    ).toEqual(first.json().data.transfer);
    expect((await state()).ledger).toEqual(settled.ledger);
    expect(settled.expenses).toEqual(frozen.expenses);
    expect(settled.splits).toEqual(frozen.splits);
    expect(settled.batches).toEqual(frozen.batches);
    expect(settled.audits.filter((a) => a.action === 'TRANSFER_PAID')).toHaveLength(2);
    expect(settled.audits.filter((a) => a.action === 'LEDGER_SETTLED')).toHaveLength(1);
    const final = (await get(s.friend.accessToken)).json().data;
    expect(final).toMatchObject({
      ...batch,
      ledgerStatus: 'SETTLED',
      transfers: expect.any(Array),
      progress: { paidCount: 2, totalCount: 2, remainingCents: '0' },
    });
    const balances = await fixture.app.inject({
      url: `/api/v1/ledgers/${ledgerId}/balances`,
      headers: headers(s.owner.accessToken),
    });
    expect(balances.statusCode).toBe(200);
    expect(balances.json().data.expenseTotalCents).toBe('30000');
    expect(
      balances
        .json()
        .data.members.every((m: { remainingNetCents: string }) => m.remainingNetCents === '0'),
    ).toBe(true);
  });

  it('keeps the formal settlement readable after personal archive in the real closing flow', async () => {
    const s = await seed();
    const batch = await freeze(s);
    const archive = () =>
      fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/archive`,
        headers: headers(s.third.accessToken),
      });
    expect((await archive()).statusCode).toBe(409);
    await payAll(s, batch.transfers);
    expect((await archive()).statusCode).toBe(409);
    expect((await settle(s.owner.accessToken)).statusCode).toBe(200);
    const before = await state();
    const detail = (await get(s.third.accessToken)).json();
    expect((await archive()).statusCode).toBe(200);
    expect((await get(s.third.accessToken)).json()).toEqual(detail);
    expect((await get(s.owner.accessToken)).json()).toEqual(detail);
    const after = await state();
    expect(after.ledger).toEqual(before.ledger);
    expect(after.expenses).toEqual(before.expenses);
    expect(after.splits).toEqual(before.splits);
    expect(after.batches).toEqual(before.batches);
    expect(after.transfers).toEqual(before.transfers);
    const history = await fixture.app.inject({
      url: '/api/v1/ledgers?archived=true',
      headers: headers(s.third.accessToken),
    });
    expect(history.statusCode).toBe(200);
    expect(history.json().data).toEqual([
      expect.objectContaining({ id: ledgerId, status: 'SETTLED', expenseTotalCents: '30000' }),
    ]);
    const members = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, ledgerId));
    expect(members.find((m) => m.userId === s.third.user.id)!.archivedAt).toBeInstanceOf(Date);
    expect(
      members.filter((m) => m.userId !== s.third.user.id).every((m) => m.archivedAt === null),
    ).toBe(true);
  });

  it('returns explicit missing errors and rejects anonymous, nonmembers, cross-ledger transfers and invalid writes', async () => {
    const s = await seed();
    const active = await state();
    const missing = await get(s.friend.accessToken);
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error.code).toBe('SETTLEMENT_NOT_FOUND');
    expect(missing.json()).not.toHaveProperty('data');
    expect((await settle(s.owner.accessToken)).json().error.code).toBe('LEDGER_STATE_INVALID');
    expect(await state()).toEqual(active);
    const batch = await freeze(s);
    const t = batch.transfers[0]!;
    const before = await state();
    for (const [method, path, payload] of [
      ['GET', 'settlement', undefined],
      ['POST', `settlement/transfers/${t.id}/paid`, {}],
      ['POST', 'settle', undefined],
    ] as const) {
      const url = `/api/v1/ledgers/${ledgerId}/${path}`;
      expect(
        (
          await fixture.app.inject({
            method,
            url,
            headers: { 'idempotency-key': randomUUID() },
            payload,
          })
        ).statusCode,
      ).toBe(401);
      expect(
        (
          await fixture.app.inject({
            method,
            url,
            headers: headers(s.outsider.accessToken),
            payload,
          })
        ).statusCode,
      ).toBe(403);
    }
    expect((await get(s.owner.accessToken, randomUUID())).statusCode).toBe(403);
    expect((await paid(s.owner.accessToken, randomUUID())).statusCode).toBe(404);
    const otherLedger = await fixture.ledger(s.owner, [s.third]);
    expect(
      (await paid(s.third.accessToken, t.id, randomUUID(), '跨账本', otherLedger)).statusCode,
    ).toBe(404);
    for (const path of [`settlement/transfers/${t.id}/paid`, 'settle']) {
      expect(
        (
          await fixture.app.inject({
            method: 'POST',
            url: `/api/v1/ledgers/${ledgerId}/${path}`,
            headers: { authorization: `Bearer ${s.owner.accessToken}` },
            ...(path === 'settle' ? {} : { payload: {} }),
          })
        ).statusCode,
      ).toBe(400);
    }
    expect((await paid(s.owner.accessToken, t.id, 'invalid')).statusCode).toBe(400);
    expect((await paid(s.owner.accessToken, t.id, randomUUID(), '长'.repeat(201))).statusCode).toBe(
      400,
    );
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: `/api/v1/ledgers/${ledgerId}/settlement/transfers/${t.id}/paid`,
          headers: headers(s.owner.accessToken),
          payload: { amountCents: '1' },
        })
      ).statusCode,
    ).toBe(400);
    expect(
      (
        await fixture.app.inject({
          method: 'POST',
          url: `/api/v1/ledgers/${ledgerId}/settle`,
          headers: headers(s.owner.accessToken),
          payload: {},
        })
      ).statusCode,
    ).toBe(400);
    // The other ledger creation does not write idempotency/audit rows for this ledger.
    expect(await state()).toEqual(before);
  });

  it('allows only the payer or creator and never treats payee or other members as registrars', async () => {
    const s = await seed();
    const batch = await freeze(s);
    const t = batch.transfers.find((t) => t.payerMemberId === s.ids[3])!;
    const before = await state();
    for (const token of [s.friend.accessToken, s.third.accessToken]) {
      const denied = await paid(token, t.id);
      expect(denied.statusCode).toBe(403);
      expect(denied.json().error.code).toBe('FORBIDDEN');
    }
    expect((await settle(s.fourth.accessToken)).statusCode).toBe(403);
    expect(await state()).toEqual(before);
    expect((await paid(s.fourth.accessToken, t.id)).statusCode).toBe(200);
    const key = randomUUID();
    const early = await settle(s.owner.accessToken, key);
    expect(early.statusCode).toBe(409);
    expect(early.json().error.code).toBe('SETTLEMENT_INCOMPLETE');
    expect((await state()).keys.some((k) => k.key === key)).toBe(false);
    expect((await state()).ledger!.status).toBe('SETTLING');
  });

  it('serializes same-key and different-key duplicate registration, preserving the original registration', async () => {
    const s = await seed();
    const batch = await freeze(s);
    const t = batch.transfers.find((t) => t.payerMemberId === s.ids[2])!;
    const key = randomUUID();
    const responses = await Promise.all([
      paid(s.third.accessToken, t.id, key),
      paid(
        s.third.accessToken,
        t.id.toUpperCase(),
        key.toUpperCase(),
        '已核对',
        ledgerId.toUpperCase(),
      ),
      paid(s.third.accessToken, t.id, key),
    ]);
    for (const res of responses) {
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(responses[0]!.json());
    }
    const original = responses[0]!.json();
    const duplicates = await Promise.all([
      paid(s.owner.accessToken, t.id, randomUUID(), '新的备注'),
      paid(s.third.accessToken, t.id, randomUUID(), '另一个备注'),
    ]);
    for (const res of duplicates) {
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(original);
    }
    const conflict = await paid(s.third.accessToken, t.id, key, '不同内容');
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    const saved = await state();
    expect(saved.audits.filter((a) => a.action === 'TRANSFER_PAID')).toHaveLength(1);
    expect(saved.keys.filter((k) => k.key === key)).toHaveLength(1);
    expect(
      saved.transfers.find((transfer) => transfer.id === t.id)!.registeredAt!.toISOString(),
    ).toBe(original.data.transfer.registeredAt);
  });

  it('serializes independent transfer registrations and concurrent creator confirmations', async () => {
    const s = await seed();
    const batch = await freeze(s);
    const responses = await Promise.all(
      batch.transfers.map((t) => paid(s.owner.accessToken, t.id)),
    );
    expect(responses.every((r) => r.statusCode === 200)).toBe(true);
    expect(responses.map((r) => r.json().data.progress.paidCount).sort()).toEqual([1, 2]);
    const key = randomUUID();
    const confirmations = await Promise.all([
      settle(s.owner.accessToken, key),
      settle(s.owner.accessToken, key),
      settle(s.owner.accessToken),
    ]);
    for (const response of confirmations) {
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(confirmations[0]!.json());
    }
    const saved = await state();
    expect(saved.ledger).toMatchObject({ status: 'SETTLED', version: 6 });
    expect(saved.audits.filter((a) => a.action === 'LEDGER_SETTLED')).toHaveLength(1);
  });

  it('refuses closing even with every transfer paid when any member has a nonzero remaining net', async () => {
    const s = await seed();
    const batch = await freeze(s);
    await payAll(s, batch.transfers);
    // Simulate inconsistent persisted transfer data: global remaining sum is still zero.
    await fixture.db.orm
      .update(settlementTransfers)
      .set({ amountCents: BigInt(batch.transfers[0]!.amountCents) + 1n })
      .where(eq(settlementTransfers.id, batch.transfers[0]!.id));
    const before = await state();
    const res = await settle(s.owner.accessToken);
    expect(res.statusCode).toBe(409);
    expect(res.json().error.code).toBe('SETTLEMENT_INCOMPLETE');
    expect(await state()).toEqual(before);
  });

  it('reads and confirms a previously directly settled zero-transfer batch without changing its timestamp', async () => {
    const s = await seed(false);
    const batch = await freeze(s, 1);
    expect(batch).toMatchObject({
      ledgerStatus: 'SETTLED',
      transfers: [],
      progress: { paidCount: 0, totalCount: 0, remainingCents: '0' },
    });
    expect((await get(s.third.accessToken)).json().data).toEqual(batch);
    const before = await state();
    expect((await settle(s.friend.accessToken)).statusCode).toBe(403);
    const res = await settle(s.owner.accessToken);
    expect(res.statusCode).toBe(200);
    expect(res.json().data.settledAt).toBe(before.ledger!.settledAt!.toISOString());
    const after = await state();
    expect(after.ledger).toEqual(before.ledger);
    expect(after.audits).toEqual(before.audits);
  });

  it.each(['paid', 'settle'] as const)(
    'rolls back all effects of %s on a late idempotency failure and permits manual retry',
    async (operation) => {
      const s = await seed();
      const batch = await freeze(s);
      if (operation === 'settle') await payAll(s, batch.transfers);
      const key = randomUUID();
      const before = await state();
      const constraint = `test_progress_${key.replaceAll('-', '')}`;
      const act = () =>
        operation === 'paid'
          ? paid(s.owner.accessToken, batch.transfers[0]!.id, key)
          : settle(s.owner.accessToken, key);
      try {
        await fixture.db.pool.query(
          `ALTER TABLE idempotency_keys ADD CONSTRAINT ${constraint} CHECK (key <> '${key}'::uuid) NOT VALID`,
        );
        expect((await act()).statusCode).toBe(500);
        expect(await state()).toEqual(before);
      } finally {
        await fixture.db.pool.query(
          `ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS ${constraint}`,
        );
      }
      expect((await act()).statusCode).toBe(200);
    },
  );

  it('rechecks registrar role and creator permission before replaying stored results', async () => {
    const s = await seed();
    const batch = await freeze(s);
    const t = batch.transfers.find((t) => t.payerMemberId === s.ids[2])!;
    const paidKey = randomUUID();
    expect((await paid(s.owner.accessToken, t.id, paidKey)).statusCode).toBe(200);
    await payAll(s, batch.transfers);
    const settleKey = randomUUID();
    expect((await settle(s.owner.accessToken, settleKey)).statusCode).toBe(200);
    await fixture.db.orm
      .update(ledgers)
      .set({ createdByUserId: s.friend.user.id })
      .where(eq(ledgers.id, ledgerId));
    const before = await state();
    expect((await paid(s.owner.accessToken, t.id, paidKey)).statusCode).toBe(403);
    expect((await settle(s.owner.accessToken, settleKey)).statusCode).toBe(403);
    expect(await state()).toEqual(before);
    // Change a fixture membership owner to prove that payer replays also recheck live membership.
    const payerKey = randomUUID();
    expect((await paid(s.third.accessToken, t.id, payerKey)).statusCode).toBe(200);
    await fixture.db.orm
      .update(ledgerMembers)
      .set({ userId: s.outsider.user.id })
      .where(eq(ledgerMembers.id, s.ids[2]!));
    expect((await paid(s.third.accessToken, t.id, payerKey)).statusCode).toBe(403);
    expect((await get(s.third.accessToken)).statusCode).toBe(403);
  });

  it.each(['paid-first', 'settle-first'] as const)(
    'orders the last registration against closing and reads only committed progress: %s',
    async (order) => {
      const s = await seed();
      const batch = await freeze(s);
      expect((await paid(s.owner.accessToken, batch.transfers[0]!.id)).statusCode).toBe(200);
      const blocker = await fixture.db.pool.connect();
      const pending: Array<Promise<Awaited<ReturnType<typeof paid>>>> = [];
      const settleKey = randomUUID();
      try {
        await blocker.query('begin');
        const pid = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('select id from ledgers where id=$1 for update', [ledgerId]);
        const register = () => paid(s.owner.accessToken, batch.transfers[1]!.id).then((r) => r);
        const close = () => settle(s.owner.accessToken, settleKey).then((r) => r);
        pending.push(order === 'paid-first' ? register() : close());
        await waitForBlockedQueries(fixture.db.pool, pid.rows[0]!.pid, 1);
        pending.push(order === 'paid-first' ? close() : register());
        await waitForBlockedQueries(fixture.db.pool, pid.rows[0]!.pid, 2);
        const reading = await get(s.friend.accessToken);
        const committed = endpoints.getSettlement.response.parse(reading.json()).data;
        expect(committed.ledgerStatus).toBe('SETTLING');
        expect(committed.progress.paidCount).toBe(1);
        expect(committed.transfers.filter((t) => t.status === 'PAID')).toHaveLength(1);
        expect(committed.progress.remainingCents).toBe(
          committed.transfers.find((t) => t.status === 'PENDING')!.amountCents,
        );
        await blocker.query('commit');
        const responses = await Promise.all(pending);
        expect(responses.map((r) => r.statusCode)).toEqual(
          order === 'paid-first' ? [200, 200] : [409, 200],
        );
        if (order === 'settle-first') {
          expect(responses[0]!.json().error.code).toBe('SETTLEMENT_INCOMPLETE');
          expect((await state()).keys.some((k) => k.key === settleKey)).toBe(false);
          expect((await state()).ledger!.status).toBe('SETTLING');
          expect((await settle(s.owner.accessToken, settleKey)).statusCode).toBe(200);
        }
        expect((await get(s.fourth.accessToken)).json().data).toMatchObject({
          ledgerStatus: 'SETTLED',
          progress: { paidCount: 2, totalCount: 2, remainingCents: '0' },
        });
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await Promise.allSettled(pending);
      }
    },
  );

  it.each(['paid', 'settle'] as const)(
    'rechecks creator permission after %s waits for the ledger lock',
    async (operation) => {
      const s = await seed();
      const batch = await freeze(s);
      if (operation === 'settle') await payAll(s, batch.transfers);
      const blocker = await fixture.db.pool.connect();
      let pending: Promise<Awaited<ReturnType<typeof paid>>> | undefined;
      try {
        await blocker.query('begin');
        const pid = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('select id from ledgers where id=$1 for update', [ledgerId]);
        pending = (
          operation === 'paid'
            ? paid(s.owner.accessToken, batch.transfers[0]!.id)
            : settle(s.owner.accessToken)
        ).then((r) => r);
        await waitForBlockedQueries(fixture.db.pool, pid.rows[0]!.pid, 1);
        await blocker.query('update ledgers set created_by_user_id=$1 where id=$2', [
          s.friend.user.id,
          ledgerId,
        ]);
        await blocker.query('commit');
        expect((await pending).statusCode).toBe(403);
        const saved = await state();
        expect(saved.ledger!.status).toBe('SETTLING');
        expect(
          saved.audits.filter(
            (a) => a.action === (operation === 'paid' ? 'TRANSFER_PAID' : 'LEDGER_SETTLED'),
          ),
        ).toHaveLength(0);
      } finally {
        await blocker.query('rollback');
        blocker.release();
        if (pending) await Promise.allSettled([pending]);
      }
    },
  );
});
