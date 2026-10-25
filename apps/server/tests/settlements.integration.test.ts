import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { endpoints, settlementPreviewSchema } from '@tongzhang/contracts';
import {
  expenseSplits,
  expenses,
  idempotencyKeys,
  ledgerMembers,
  ledgers,
  operationLogs,
  settlementBatches,
  settlementTransfers,
} from '../src/db/schema/index.js';
import { integrationFixture } from './fixtures/integration.js';
import { waitForBlockedQueries } from './fixtures/locks.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
let ledgerId: string;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  try {
    if (ledgerId) {
      await fixture.db.orm
        .delete(settlementTransfers)
        .where(eq(settlementTransfers.ledgerId, ledgerId));
      await fixture.db.orm
        .delete(settlementBatches)
        .where(eq(settlementBatches.ledgerId, ledgerId));
    }
  } finally {
    await fixture.close();
  }
});

async function seed(withExpense = true) {
  const owner = await fixture.register();
  const friend = await fixture.register();
  const outsider = await fixture.register();
  ledgerId = await fixture.ledger(owner, [friend]);
  const members = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledgerId));
  const s = {
    owner,
    friend,
    outsider,
    ownerMember: members.find((m) => m.userId === owner.user.id)!.id,
    friendMember: members.find((m) => m.userId === friend.user.id)!.id,
  };
  if (withExpense) expect((await expense(s)).statusCode).toBe(201);
  return s;
}
type Seed = Awaited<ReturnType<typeof seed>>;
const headers = (token: string, key: string = randomUUID()) => ({
  authorization: `Bearer ${token}`,
  'idempotency-key': key,
});
const expense = (s: Seed, extra: object = {}, key: string = randomUUID()) =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${ledgerId}/expenses`,
    headers: headers(s.owner.accessToken, key),
    payload: {
      title: '晚餐',
      amountCents: '12000',
      category: 'DINING',
      occurredOn: '2026-10-25',
      payerMemberId: s.ownerMember,
      splitMode: 'EQUAL',
      splits: [{ memberId: s.ownerMember }, { memberId: s.friendMember }],
      ...extra,
    },
  });
const start = (token: string, expectedVersion = 2, key: string = randomUUID(), id = ledgerId) =>
  fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${id}/settlement`,
    headers: headers(token, key),
    payload: { expectedVersion },
  });
const preview = (token: string) =>
  fixture.app.inject({
    url: `/api/v1/ledgers/${ledgerId}/settlement-preview`,
    headers: headers(token),
  });
async function state() {
  const db = fixture.db.orm;
  const [ledger] = await db.select().from(ledgers).where(eq(ledgers.id, ledgerId));
  return {
    ledger,
    batches: await db
      .select()
      .from(settlementBatches)
      .where(eq(settlementBatches.ledgerId, ledgerId)),
    transfers: await db
      .select()
      .from(settlementTransfers)
      .where(eq(settlementTransfers.ledgerId, ledgerId)),
    expenses: await db.select().from(expenses).where(eq(expenses.ledgerId, ledgerId)),
    splits: await db.select().from(expenseSplits).where(eq(expenseSplits.ledgerId, ledgerId)),
    audits: await db.select().from(operationLogs).where(eq(operationLogs.ledgerId, ledgerId)),
    keys: await db
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.operation, `POST /api/v1/ledgers/${ledgerId}/settlement`)),
  };
}

describe('formal settlement on real PostgreSQL', () => {
  it('keeps preview read-only, persists the server plan and freezes subsequent expense writes', async () => {
    const s = await seed();
    const before = await state();
    const p = await preview(s.friend.accessToken);
    expect(p.statusCode).toBe(200);
    const plan = settlementPreviewSchema.parse(p.json().data);
    expect(await state()).toEqual(before);
    const response = await start(s.owner.accessToken, plan.ledgerVersion);
    expect(response.statusCode).toBe(201);
    expect(response.headers['cache-control']).toBe('no-store');
    const data = endpoints.startSettlement.response.parse(response.json()).data;
    expect(data).toMatchObject({
      ledgerStatus: 'SETTLING',
      batch: {
        ledgerId,
        sourceVersion: 2,
        ledgerStatus: 'SETTLING',
        expenseTotalCents: '12000',
        transferTotalCents: '6000',
        transferCount: 1,
        algorithmVersion: plan.algorithmVersion,
        progress: { paidCount: 0, totalCount: 1, remainingCents: '6000' },
      },
    });
    expect(data.batch.transfers).toEqual([
      expect.objectContaining({
        ...plan.transfers[0],
        status: 'PENDING',
        registeredByMemberId: null,
        registeredAt: null,
        registrationNote: null,
      }),
    ]);
    const frozen = await state();
    expect(frozen.ledger).toMatchObject({ status: 'SETTLING', version: 3, settledAt: null });
    expect(frozen.batches).toHaveLength(1);
    expect(frozen.transfers).toHaveLength(1);
    expect(frozen.batches[0]).toMatchObject({
      id: data.batch.id,
      createdByMemberId: s.ownerMember,
      netSnapshot: expect.arrayContaining([
        { memberId: s.ownerMember, netCents: '6000' },
        { memberId: s.friendMember, netCents: '-6000' },
      ]),
    });
    expect(frozen.audits).toHaveLength(2);
    expect(frozen.audits.find((a) => a.action === 'SETTLEMENT_STARTED')).toMatchObject({
      targetId: data.batch.id,
    });
    expect(frozen.keys).toHaveLength(1);
    for (const response of [
      await expense(s),
      await preview(s.owner.accessToken),
      await start(s.owner.accessToken, 3),
    ]) {
      expect(response.statusCode).toBe(409);
      expect(response.json().error.code).toBe('LEDGER_FROZEN');
    }
    expect(await state()).toEqual(frozen);
  });

  it('saves the four-member acceptance ledger as one batch with two ordered transfer snapshots', async () => {
    const s = await seed(false);
    const third = await fixture.register();
    const fourth = await fixture.register();
    const added = await fixture.db.orm
      .insert(ledgerMembers)
      .values([
        { ledgerId, userId: third.user.id },
        { ledgerId, userId: fourth.user.id },
      ])
      .returning();
    const thirdMember = added.find((m) => m.userId === third.user.id)!.id;
    const fourthMember = added.find((m) => m.userId === fourth.user.id)!.id;
    const splits = [s.ownerMember, s.friendMember, thirdMember, fourthMember].map((memberId) => ({
      memberId,
    }));
    expect((await expense(s, { splits })).statusCode).toBe(201);
    expect((await expense(s, { splits, payerMemberId: s.friendMember })).statusCode).toBe(201);
    expect(
      (
        await expense(s, {
          amountCents: '6000',
          payerMemberId: thirdMember,
          splits: [{ memberId: s.ownerMember }, { memberId: thirdMember }],
        })
      ).statusCode,
    ).toBe(201);
    const response = await start(s.owner.accessToken, 4);
    expect(response.statusCode).toBe(201);
    const batch = endpoints.startSettlement.response.parse(response.json()).data.batch;
    expect(batch).toMatchObject({
      sourceVersion: 4,
      expenseTotalCents: '30000',
      transferTotalCents: '9000',
      transferCount: 2,
    });
    expect(batch.transfers.map((t) => t.sequence)).toEqual([1, 2]);
    expect(batch.transfers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          payerMemberId: thirdMember,
          payeeMemberId: s.ownerMember,
          amountCents: '3000',
        }),
        expect.objectContaining({
          payerMemberId: fourthMember,
          payeeMemberId: s.friendMember,
          amountCents: '6000',
        }),
      ]),
    );
    const saved = await state();
    expect(saved.batches).toHaveLength(1);
    expect(saved.batches[0]!.netSnapshot).toEqual(
      expect.arrayContaining([
        { memberId: s.ownerMember, netCents: '3000' },
        { memberId: s.friendMember, netCents: '6000' },
        { memberId: thirdMember, netCents: '-3000' },
        { memberId: fourthMember, netCents: '-6000' },
      ]),
    );
    expect(saved.transfers).toHaveLength(2);
    expect(saved.transfers.every((t) => t.batchId === batch.id && t.status === 'PENDING')).toBe(
      true,
    );
    expect(saved.ledger).toMatchObject({ status: 'SETTLING', version: 5 });
  });

  it.each([false, true])(
    'directly settles a zero-transfer ledger (has balanced expenses: %s)',
    async (balancedExpenses) => {
      const s = await seed(balancedExpenses);
      if (balancedExpenses)
        expect((await expense(s, { payerMemberId: s.friendMember })).statusCode).toBe(201);
      const version = balancedExpenses ? 3 : 1;
      const key = randomUUID();
      const response = await start(s.owner.accessToken, version, key);
      expect(response.statusCode).toBe(201);
      expect(response.json().data).toMatchObject({
        ledgerStatus: 'SETTLED',
        batch: {
          sourceVersion: version,
          expenseTotalCents: balancedExpenses ? '24000' : '0',
          transferTotalCents: '0',
          transferCount: 0,
          transfers: [],
          ledgerStatus: 'SETTLED',
          progress: { paidCount: 0, totalCount: 0, remainingCents: '0' },
        },
      });
      const settled = await state();
      expect(settled.ledger).toMatchObject({ status: 'SETTLED', version: version + 1 });
      expect(settled.ledger!.settledAt).toBeInstanceOf(Date);
      expect(settled.batches).toHaveLength(1);
      expect(settled.transfers).toHaveLength(0);
      expect((await start(s.owner.accessToken, version, key)).json()).toEqual(response.json());
      expect((await expense(s)).json().error.code).toBe('LEDGER_FROZEN');
      expect(await state()).toEqual(settled);
    },
  );

  it('denies anonymous, outsider, noncreator, missing ledger and invalid input with no effects', async () => {
    const s = await seed();
    const before = await state();
    const anonymous = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/settlement`,
      headers: { 'idempotency-key': randomUUID() },
      payload: { expectedVersion: 2 },
    });
    expect(anonymous.statusCode).toBe(401);
    for (const response of [
      await start(s.friend.accessToken),
      await start(s.outsider.accessToken),
      await start(s.owner.accessToken, 2, randomUUID(), randomUUID()),
    ]) {
      expect(response.statusCode).toBe(403);
      expect(response.json().error.code).toBe('FORBIDDEN');
    }
    for (const payload of [{ expectedVersion: 0 }, { expectedVersion: 2, transfers: [] }]) {
      const res = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/settlement`,
        headers: headers(s.owner.accessToken),
        payload,
      });
      expect(res.statusCode).toBe(400);
    }
    expect((await start(s.owner.accessToken, 2, 'invalid-key')).statusCode).toBe(400);
    const missingKey = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/settlement`,
      headers: { authorization: `Bearer ${s.owner.accessToken}` },
      payload: { expectedVersion: 2 },
    });
    expect(missingKey.statusCode).toBe(400);
    expect(await state()).toEqual(before);
  });

  it('rejects stale versions, recomputes the latest plan, and excludes deleted expenses', async () => {
    const s = await seed();
    const old = await preview(s.owner.accessToken);
    const removed = await expense(s, { amountCents: '200' });
    expect(removed.statusCode).toBe(201);
    // Test fixture soft deletion also follows the ledger lock/version protocol.
    await fixture.db.orm.transaction(async (tx) => {
      await tx.select().from(ledgers).where(eq(ledgers.id, ledgerId)).for('update');
      await tx
        .update(expenses)
        .set({ deletedAt: new Date() })
        .where(eq(expenses.id, removed.json().data.id));
      await tx.update(ledgers).set({ version: 4 }).where(eq(ledgers.id, ledgerId));
    });
    expect((await expense(s, { amountCents: '400' })).statusCode).toBe(201);
    const before = await state();
    const conflict = await start(s.owner.accessToken, old.json().data.ledgerVersion);
    expect(conflict.statusCode).toBe(409);
    expect(conflict.json().error.code).toBe('VERSION_CONFLICT');
    expect(await state()).toEqual(before);
    const fresh = await start(s.owner.accessToken, 5);
    expect(fresh.statusCode).toBe(201);
    expect(fresh.json().data.batch).toMatchObject({
      sourceVersion: 5,
      expenseTotalCents: '12400',
      transferTotalCents: '6200',
    });
  });

  it('serializes concurrent duplicate requests including uppercase UUIDs into one batch and exact replay', async () => {
    const s = await seed();
    const key = randomUUID();
    const responses = await Promise.all([
      start(s.owner.accessToken, 2, key),
      start(s.owner.accessToken, 2, key.toUpperCase(), ledgerId.toUpperCase()),
      start(s.owner.accessToken, 2, key),
    ]);
    for (const response of responses) {
      expect(response.statusCode).toBe(201);
      expect(response.json()).toEqual(responses[0]!.json());
    }
    const frozen = await state();
    expect(frozen.batches).toHaveLength(1);
    expect(frozen.transfers).toHaveLength(1);
    expect(frozen.keys).toHaveLength(1);
    expect(frozen.audits.filter((a) => a.action === 'SETTLEMENT_STARTED')).toHaveLength(1);
    const reused = await start(s.owner.accessToken, 3, key);
    expect(reused.statusCode).toBe(409);
    expect(reused.json().error.code).toBe('IDEMPOTENCY_CONFLICT');
    expect(await state()).toEqual(frozen);
  });

  it('allows one winner when different keys race to freeze the same ledger', async () => {
    const s = await seed();
    const responses = await Promise.all([start(s.owner.accessToken), start(s.owner.accessToken)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 409]);
    expect(responses.find((r) => r.statusCode === 409)!.json().error.code).toBe('LEDGER_FROZEN');
    const frozen = await state();
    expect(frozen.batches).toHaveLength(1);
    expect(frozen.keys).toHaveLength(1);
    expect(frozen.ledger!.version).toBe(3);
  });

  it('rechecks creator permission before replaying a stored result', async () => {
    const s = await seed();
    const key = randomUUID();
    expect((await start(s.owner.accessToken, 2, key)).statusCode).toBe(201);
    await fixture.db.orm
      .update(ledgers)
      .set({ createdByUserId: s.friend.user.id })
      .where(eq(ledgers.id, ledgerId));
    const before = await state();
    const denied = await start(s.owner.accessToken, 2, key);
    expect(denied.statusCode).toBe(403);
    expect(denied.json()).not.toHaveProperty('data');
    expect(await state()).toEqual(before);
  });

  it('rolls back batches, transfers, state, audit and key on a late database failure, then permits manual retry', async () => {
    const s = await seed();
    const key = randomUUID();
    const before = await state();
    // Fail only this request at the final idempotency insert, after all business writes.
    // The database guard above restricts this fixture to an explicitly named _test database.
    const constraint = `test_settlement_${key.replaceAll('-', '')}`;
    try {
      await fixture.db.pool.query(
        `ALTER TABLE idempotency_keys ADD CONSTRAINT ${constraint} CHECK (key <> '${key}'::uuid) NOT VALID`,
      );
      expect((await start(s.owner.accessToken, 2, key)).statusCode).toBe(500);
      expect(await state()).toEqual(before);
    } finally {
      await fixture.db.pool.query(
        `ALTER TABLE idempotency_keys DROP CONSTRAINT IF EXISTS ${constraint}`,
      );
    }
    expect((await start(s.owner.accessToken, 2, key)).statusCode).toBe(201);
    expect((await state()).batches).toHaveLength(1);
  });

  it.each(['settlement-first', 'expense-first'] as const)(
    'serializes a real expense/freeze race: %s',
    async (order) => {
      const s = await seed();
      const blocker = await fixture.db.pool.connect();
      const pending: Array<Promise<Awaited<ReturnType<typeof start>>>> = [];
      try {
        await blocker.query('begin');
        const pid = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
        await blocker.query('select id from ledgers where id=$1 for update', [ledgerId]);
        const freeze = () => start(s.owner.accessToken).then((r) => r);
        const write = () => expense(s, { amountCents: '400' }).then((r) => r);
        pending.push(order === 'settlement-first' ? freeze() : write());
        await waitForBlockedQueries(fixture.db.pool, pid.rows[0]!.pid, 1);
        pending.push(order === 'settlement-first' ? write() : freeze());
        await waitForBlockedQueries(fixture.db.pool, pid.rows[0]!.pid, 2);
        // A preview can still read the committed ACTIVE snapshot while both writes wait.
        const p = await preview(s.friend.accessToken);
        expect(p.statusCode).toBe(200);
        expect(p.json().data).toMatchObject({ ledgerVersion: 2, expenseTotalCents: '12000' });
        await blocker.query('commit');
        const [first, second] = await Promise.all(pending);
        expect(first!.statusCode).toBe(201);
        expect(second!.statusCode).toBe(409);
        if (order === 'settlement-first') {
          expect(second!.json().error.code).toBe('LEDGER_FROZEN');
          const frozen = await state();
          expect(frozen.expenses).toHaveLength(1);
          expect(frozen.splits).toHaveLength(2);
          expect(frozen.batches[0]).toMatchObject({ sourceVersion: 2, expenseTotalCents: 12000n });
          expect(frozen.ledger).toMatchObject({ status: 'SETTLING', version: 3 });
        } else {
          expect(second!.json().error.code).toBe('VERSION_CONFLICT');
          const active = await state();
          expect(active.ledger).toMatchObject({ status: 'ACTIVE', version: 3 });
          expect(active.batches).toHaveLength(0);
          expect(active.transfers).toHaveLength(0);
          expect(active.keys).toHaveLength(0);
          const retried = await start(s.owner.accessToken, 3);
          expect(retried.statusCode).toBe(201);
          expect(retried.json().data.batch).toMatchObject({
            sourceVersion: 3,
            expenseTotalCents: '12400',
            transferTotalCents: '6200',
          });
        }
      } finally {
        await blocker.query('rollback');
        blocker.release();
        await Promise.allSettled(pending);
      }
    },
  );

  it('rechecks creator permission after waiting for the ledger lock', async () => {
    const s = await seed();
    const blocker = await fixture.db.pool.connect();
    let pending: Promise<Awaited<ReturnType<typeof start>>> | undefined;
    try {
      await blocker.query('begin');
      const pid = await blocker.query<{ pid: number }>('select pg_backend_pid() as pid');
      await blocker.query('select id from ledgers where id=$1 for update', [ledgerId]);
      pending = start(s.owner.accessToken).then((r) => r);
      await waitForBlockedQueries(fixture.db.pool, pid.rows[0]!.pid, 1);
      await blocker.query('update ledgers set created_by_user_id=$1 where id=$2', [
        s.friend.user.id,
        ledgerId,
      ]);
      await blocker.query('commit');
      expect((await pending).statusCode).toBe(403);
      const active = await state();
      expect(active.batches).toHaveLength(0);
      expect(active.keys).toHaveLength(0);
      expect(active.ledger).toMatchObject({ status: 'ACTIVE', version: 2 });
    } finally {
      await blocker.query('rollback');
      blocker.release();
      if (pending) await Promise.allSettled([pending]);
    }
  });
});
