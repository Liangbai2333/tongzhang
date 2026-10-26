import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { eq, inArray, sql } from 'drizzle-orm';
import {
  expenseImages,
  expenseSplits,
  expenses,
  idempotencyKeys,
  imageAssets,
  invitations,
  ledgerMembers,
  ledgers,
  operationLogs,
} from '../src/db/schema/index.js';
import { createLedgersService } from '../src/modules/ledgers/index.js';
import { cleanupTemporaryImages, IMAGE_CLEANUP_BATCH_SIZE } from '../src/modules/images/cleanup.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';
import { imageBytes, imageMultipart } from './fixtures/images.js';
import { waitForBlockedQueries } from './fixtures/locks.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => {
  await fixture.close();
});
const auth = (account: TestAccount) => ({ authorization: `Bearer ${account.accessToken}` });
const post = (account: TestAccount, url: string, payload: object, key: string = randomUUID()) =>
  fixture.app.inject({
    method: 'POST',
    url,
    payload,
    headers: { ...auth(account), 'idempotency-key': key },
  });
const get = (account: TestAccount, url: string) =>
  fixture.app.inject({ url, headers: auth(account) });
async function upload(account: TestAccount, kind = 'COVER') {
  const request = imageMultipart(await imageBytes(), 'image/png', [['kind', kind]]);
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/images',
    ...request,
    headers: { ...request.headers, ...auth(account) },
  });
  expect(response.statusCode).toBe(201);
  return response.json().data.imageId as string;
}
const create = (account: TestAccount, imageId: string, key?: string) =>
  post(account, '/api/v1/ledgers', { name: '双账号自定义封面', coverImageId: imageId }, key);
const asset = async (id: string) =>
  (await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, id)))[0];
const age = (ids: string[]) =>
  fixture.db.orm
    .update(imageAssets)
    .set({ createdAt: sql`now() - interval '25 hours'` })
    .where(inArray(imageAssets.id, ids));
async function assertNoLedger(userId: string) {
  expect(
    await fixture.db.orm.select().from(ledgers).where(eq(ledgers.createdByUserId, userId)),
  ).toHaveLength(0);
  expect(
    await fixture.db.orm.select().from(ledgerMembers).where(eq(ledgerMembers.userId, userId)),
  ).toHaveLength(0);
  expect(
    await fixture.db.orm
      .select()
      .from(invitations)
      .innerJoin(ledgers, eq(ledgers.id, invitations.ledgerId))
      .where(eq(ledgers.createdByUserId, userId)),
  ).toHaveLength(0);
  expect(
    await fixture.db.orm.select().from(operationLogs).where(eq(operationLogs.actorUserId, userId)),
  ).toHaveLength(0);
  expect(
    await fixture.db.orm.select().from(idempotencyKeys).where(eq(idempotencyKeys.userId, userId)),
  ).toHaveLength(0);
}

describe('Issue #29 cover transaction and real two-account acceptance', () => {
  it('uploads, creates, joins and reads a cover, then saves/replays/queries 12000 cents with 6000 each', async () => {
    const owner = await fixture.register('封面创建者');
    const friend = await fixture.register('真实加入成员');
    const outsider = await fixture.register('非成员');
    const cover = await upload(owner);
    expect((await get(friend, `/api/v1/images/${cover}`)).statusCode).toBe(403);
    const key = randomUUID();
    const created = await create(owner, cover.toUpperCase(), key);
    expect(created.statusCode).toBe(201);
    expect((await create(owner, cover.toUpperCase(), key)).json()).toEqual(created.json());
    const { ledger, invitation } = created.json().data;
    expect(ledger).toMatchObject({ coverKey: null, coverImageId: cover, expenseTotalCents: '0' });
    expect((await asset(cover))!.ledgerId).toBe(ledger.id);
    expect(
      (await post(friend, '/api/v1/invitations/join', { code: invitation.code })).statusCode,
    ).toBe(200);
    const detail = (await get(owner, `/api/v1/ledgers/${ledger.id}`)).json().data;
    const friendDetail = (await get(friend, `/api/v1/ledgers/${ledger.id}`)).json().data;
    expect(friendDetail.coverImageId).toBe(cover);
    const listed = (await get(friend, '/api/v1/ledgers')).json().data;
    expect(listed[0].coverImageId).toBe(cover);
    for (const account of [owner, friend]) {
      const read = await get(account, `/api/v1/images/${cover}`);
      expect(read.statusCode).toBe(200);
      expect(read.rawPayload).toEqual(await imageBytes());
      expect(read.headers['cache-control']).toBe('no-store');
    }
    expect((await get(outsider, `/api/v1/images/${cover}`)).statusCode).toBe(403);
    const receipt = await upload(owner, 'RECEIPT');
    const body = {
      title: '双人晚餐',
      amountCents: '12000',
      category: 'DINING',
      occurredOn: '2026-10-26',
      payerMemberId: detail.myMemberId,
      splitMode: 'EQUAL',
      splits: detail.members.map((m: { id: string }) => ({ memberId: m.id })),
      receiptImageId: receipt,
    };
    const expenseKey = randomUUID();
    const saved = await post(owner, `/api/v1/ledgers/${ledger.id}/expenses`, body, expenseKey);
    expect(saved.statusCode).toBe(201);
    expect(saved.json().data.amountCents).toBe('12000');
    expect(saved.json().data.splits.map((s: { amountCents: string }) => s.amountCents)).toEqual([
      '6000',
      '6000',
    ]);
    expect(
      (await post(owner, `/api/v1/ledgers/${ledger.id}/expenses`, body, expenseKey)).json(),
    ).toEqual(saved.json());
    const queried = await get(
      friend,
      `/api/v1/ledgers/${ledger.id}/expenses/${saved.json().data.id}`,
    );
    expect(queried.statusCode).toBe(200);
    expect(queried.json().data).toMatchObject({ amountCents: '12000', receiptImageId: receipt });
    expect(queried.json().data.splits).toEqual(saved.json().data.splits);
    const list = (await get(friend, `/api/v1/ledgers/${ledger.id}/expenses`)).json().data;
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: saved.json().data.id, amountCents: '12000' });
    expect(
      await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledger.id)),
    ).toHaveLength(1);
    expect(
      await fixture.db.orm
        .select()
        .from(expenseSplits)
        .where(eq(expenseSplits.ledgerId, ledger.id)),
    ).toHaveLength(2);
    expect(
      await fixture.db.orm.select().from(expenseImages).where(eq(expenseImages.imageId, receipt)),
    ).toHaveLength(1);
    expect((await get(friend, `/api/v1/ledgers/${ledger.id}`)).json().data).toMatchObject({
      expenseTotalCents: '12000',
      mySharedCents: '6000',
      myNetCents: '-6000',
    });
  });

  it('rejects foreign, missing, wrong-kind and already-bound images without partial creation', async () => {
    const owner = await fixture.register();
    const other = await fixture.register();
    const foreign = await upload(other);
    const receipt = await upload(owner, 'RECEIPT');
    for (const [id, status, code] of [
      [foreign, 403, 'FORBIDDEN'],
      [randomUUID(), 403, 'FORBIDDEN'],
      [receipt, 400, 'IMAGE_INVALID'],
    ] as const) {
      const response = await create(owner, id);
      expect(response.statusCode).toBe(status);
      expect(response.json().error.code).toBe(code);
      await assertNoLedger(owner.user.id);
    }
    const cover = await upload(owner);
    const first = await create(owner, cover);
    expect(first.statusCode).toBe(201);
    expect((await create(owner, cover)).json().error.code).toBe('IMAGE_INVALID');
    expect(
      await fixture.db.orm.select().from(ledgers).where(eq(ledgers.createdByUserId, owner.user.id)),
    ).toHaveLength(1);
    expect((await asset(cover))!.ledgerId).toBe(first.json().data.ledger.id);
    expect((await asset(foreign))!.ledgerId).toBeNull();
    expect((await asset(receipt))!.ledgerId).toBeNull();
  });

  it('rolls back cover, ledger, member, invitation, audit and idempotency when the final audit fails', async () => {
    const owner = await fixture.register();
    const cover = await upload(owner);
    const key = randomUUID();
    await expect(
      createLedgersService(fixture.db.orm).createLedger(
        { params: {}, query: {}, body: { name: '失败回滚', coverImageId: cover } },
        {
          principal: { userId: owner.user.id, sessionId: randomUUID() },
          requestId: 'invalid-audit-uuid',
          idempotencyKey: key,
        },
      ),
    ).rejects.toThrow();
    await assertNoLedger(owner.user.id);
    expect((await asset(cover))!.ledgerId).toBeNull();
    expect((await create(owner, cover, key)).statusCode).toBe(201);
  });

  it('serializes different keys competing for one cover and leaves only the winner', async () => {
    const owner = await fixture.register();
    const cover = await upload(owner);
    const responses = await Promise.all([create(owner, cover), create(owner, cover)]);
    expect(responses.map((r) => r.statusCode).sort()).toEqual([201, 400]);
    const winner = responses.find((r) => r.statusCode === 201)!.json().data.ledger.id;
    expect((await asset(cover))!.ledgerId).toBe(winner);
    expect(
      await fixture.db.orm.select().from(ledgers).where(eq(ledgers.createdByUserId, owner.user.id)),
    ).toHaveLength(1);
    expect(
      await fixture.db.orm
        .select()
        .from(ledgerMembers)
        .where(eq(ledgerMembers.userId, owner.user.id)),
    ).toHaveLength(1);
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, owner.user.id)),
    ).toHaveLength(1);
  });
});

describe('temporary image cleanup', () => {
  it('deletes old unbound COVER/RECEIPT only, preserving recent, bound and referenced images', async () => {
    const owner = await fixture.register();
    const oldCover = await upload(owner);
    const oldReceipt = await upload(owner, 'RECEIPT');
    const recent = await upload(owner);
    const nearBoundary = await upload(owner, 'RECEIPT');
    await fixture.db.orm
      .update(imageAssets)
      .set({ createdAt: sql`now() - interval '23 hours 59 minutes'` })
      .where(eq(imageAssets.id, nearBoundary));
    const bound = await upload(owner);
    const result = await create(owner, bound);
    expect(result.statusCode).toBe(201);
    const ledgerId = result.json().data.ledger.id;
    const member = (await get(owner, `/api/v1/ledgers/${ledgerId}`)).json().data.myMemberId;
    const receipt = await upload(owner, 'RECEIPT');
    expect(
      (
        await post(owner, `/api/v1/ledgers/${ledgerId}/expenses`, {
          title: '收据引用',
          amountCents: '1',
          category: 'OTHER',
          occurredOn: '2026-10-26',
          payerMemberId: member,
          splitMode: 'EQUAL',
          splits: [{ memberId: member }],
          receiptImageId: receipt,
        })
      ).statusCode,
    ).toBe(201);
    const boundWithoutReference = await upload(owner, 'RECEIPT');
    await fixture.db.orm
      .update(imageAssets)
      .set({ ledgerId })
      .where(eq(imageAssets.id, boundWithoutReference));
    await age([oldCover, oldReceipt, bound, receipt, boundWithoutReference]);
    expect(await cleanupTemporaryImages(fixture.db.orm)).toBe(2);
    expect(await asset(oldCover)).toBeUndefined();
    expect(await asset(oldReceipt)).toBeUndefined();
    for (const id of [recent, nearBoundary, bound, receipt, boundWithoutReference])
      expect(await asset(id)).toBeDefined();
    expect(await cleanupTemporaryImages(fixture.db.orm)).toBe(0);
  });

  it.each(['COVER', 'RECEIPT'])(
    'skips a locked %s while a real business bind is queued',
    async (kind) => {
      const owner = await fixture.register();
      const id = await upload(owner, kind);
      const ledgerId = kind === 'RECEIPT' ? await fixture.ledger(owner) : undefined;
      const [member] = ledgerId
        ? await fixture.db.orm
            .select()
            .from(ledgerMembers)
            .where(eq(ledgerMembers.ledgerId, ledgerId))
        : [];
      await age([id]);
      const blocker = await fixture.db.pool.connect();
      let pending;
      try {
        await blocker.query('BEGIN');
        const { rows } = await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid');
        await blocker.query('SELECT id FROM image_assets WHERE id = $1 FOR UPDATE', [id]);
        pending = (
          kind === 'COVER'
            ? create(owner, id)
            : post(owner, `/api/v1/ledgers/${ledgerId}/expenses`, {
                title: '并发收据',
                amountCents: '1',
                category: 'OTHER',
                occurredOn: '2026-10-26',
                payerMemberId: member!.id,
                splitMode: 'EQUAL',
                splits: [{ memberId: member!.id }],
                receiptImageId: id,
              })
        ).then((response) => response);
        await waitForBlockedQueries(fixture.db.pool, rows[0]!.pid, 1);
        expect(await cleanupTemporaryImages(fixture.db.orm)).toBe(0);
        await blocker.query('COMMIT');
        expect((await pending).statusCode).toBe(201);
        expect((await asset(id))!.ledgerId).not.toBeNull();
        expect(await cleanupTemporaryImages(fixture.db.orm)).toBe(0);
      } finally {
        await blocker.query('ROLLBACK');
        blocker.release();
        await pending;
      }
    },
  );

  it('keeps lock probes isolated when another fixture joins the same blocking chain', async () => {
    const owner = await fixture.register();
    const id = await upload(owner);
    const blocker = await fixture.db.pool.connect();
    const ownWaiter = await fixture.db.pool.connect();
    const foreignWaiter = await fixture.db.pool.connect();
    const pending: Promise<unknown>[] = [];
    try {
      await blocker.query('BEGIN');
      const blockerPid = (await blocker.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
        .rows[0]!.pid;
      await blocker.query('SELECT id FROM image_assets WHERE id = $1 FOR UPDATE', [id]);
      const ownPid = (await ownWaiter.query<{ pid: number }>('SELECT pg_backend_pid() AS pid'))
        .rows[0]!.pid;
      const foreignPid = (
        await foreignWaiter.query<{ pid: number }>('SELECT pg_backend_pid() AS pid')
      ).rows[0]!.pid;
      await foreignWaiter.query("SET application_name = 'tongzhang-test-other-fixture'");
      pending.push(ownWaiter.query('SELECT id FROM image_assets WHERE id = $1 FOR UPDATE', [id]));
      pending.push(
        foreignWaiter.query('SELECT id FROM image_assets WHERE id = $1 FOR UPDATE', [id]),
      );
      await vi.waitFor(async () => {
        const { rows } = await fixture.db.pool.query<{ count: number }>(
          "SELECT count(*)::integer AS count FROM pg_stat_activity WHERE pid = ANY($1::integer[]) AND wait_event_type = 'Lock'",
          [[ownPid, foreignPid]],
        );
        expect(rows[0]!.count).toBe(2);
      });
      // Both sessions really wait, but only our fixture's waiter belongs to this assertion.
      await waitForBlockedQueries(fixture.db.pool, blockerPid, 1);
    } finally {
      await blocker.query('ROLLBACK');
      await Promise.allSettled(pending);
      blocker.release();
      ownWaiter.release();
      foreignWaiter.release(true);
    }
  });

  it('rejects an explicit bind after cleanup wins without partial ledger data', async () => {
    const owner = await fixture.register();
    const cover = await upload(owner);
    await age([cover]);
    expect(await cleanupTemporaryImages(fixture.db.orm)).toBe(1);
    expect((await create(owner, cover)).statusCode).toBe(403);
    await assertNoLedger(owner.user.id);
  });

  it('limits each batch and supports repeated or concurrent cleaners without duplicate deletion', async () => {
    const owner = await fixture.register();
    const source = (await asset(await upload(owner)))!;
    const values = { ...source, id: undefined };
    await fixture.db.orm.insert(imageAssets).values(
      Array.from({ length: IMAGE_CLEANUP_BATCH_SIZE + 2 }, () => ({
        ...values,
        createdAt: new Date(Date.now() - 25 * 3600_000),
      })),
    );
    const counts = await Promise.all([
      cleanupTemporaryImages(fixture.db.orm),
      cleanupTemporaryImages(fixture.db.orm),
    ]);
    expect(counts.every((count) => count <= IMAGE_CLEANUP_BATCH_SIZE)).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(IMAGE_CLEANUP_BATCH_SIZE + 2);
    expect(await cleanupTemporaryImages(fixture.db.orm)).toBe(0);
    expect(
      await fixture.db.orm
        .select()
        .from(imageAssets)
        .where(eq(imageAssets.uploadedByUserId, owner.user.id)),
    ).toHaveLength(1);
  });
});
