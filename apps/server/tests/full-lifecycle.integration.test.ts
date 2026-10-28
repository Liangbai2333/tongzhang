import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import { endpoints, type EndpointOutput } from '@tongzhang/contracts';
import {
  expenses,
  expenseSplits,
  expenseImages,
  imageAssets,
  ledgerMembers,
  ledgers,
  operationLogs,
  settlementBatches,
  settlementTransfers,
} from '../src/db/schema/index.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';
import { imageBytes, imageMultipart } from './fixtures/images.js';

let fixture: Awaited<ReturnType<typeof integrationFixture>>;
beforeEach(async () => {
  fixture = await integrationFixture();
});
afterEach(async () => fixture.close());

// The existing suites own race/permission/cleanup cases. This test closes the missing
// single-fixture composition gap, using a TCP listener and the production routes.
it('preserves the 12000/6000 lifecycle through cover, receipt, settlement and personal history over TCP HTTP', async () => {
  const origin = await fixture.app.listen({ host: '127.0.0.1', port: 0 });
  const owner = await fixture.register('闭环甲');
  const member = await fixture.register('闭环乙');
  const auth = (account: TestAccount) => ({ authorization: `Bearer ${account.accessToken}` });
  async function json(
    account: TestAccount,
    path: string,
    body?: unknown,
    key?: string,
    status = body === undefined && !key ? 200 : 201,
  ) {
    const response = await fetch(`${origin}/api/v1${path}`, {
      method: key ? 'POST' : 'GET',
      headers: {
        ...auth(account),
        ...(key ? { 'idempotency-key': key } : {}),
        ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: 'error',
    });
    expect(response.status).toBe(status);
    return response.json();
  }
  async function repeat(account: TestAccount, path: string, body: unknown, status: number) {
    const key = randomUUID();
    const first = await json(account, path, body, key, status);
    expect(await json(account, path, body, key, status)).toEqual(first);
    return first;
  }
  const bytes = await imageBytes();
  async function upload(kind: 'COVER' | 'RECEIPT', ledgerId?: string) {
    const multipart = imageMultipart(bytes, 'image/png', [
      ['kind', kind],
      ...(ledgerId ? [['ledgerId', ledgerId] as [string, string]] : []),
    ]);
    const response = await fetch(`${origin}/api/v1/images`, {
      method: 'POST',
      headers: { ...auth(owner), ...multipart.headers },
      body: new Uint8Array(multipart.payload),
      redirect: 'error',
    });
    expect(response.status).toBe(201);
    return endpoints.uploadImage.response.parse(await response.json()).data.imageId;
  }
  const coverId = await upload('COVER');
  const created = endpoints.createLedger.response.parse(
    await repeat(owner, '/ledgers', { name: '完整闭环', coverImageId: coverId }, 201),
  ).data;
  const id = created.ledger.id;
  const path = `/ledgers/${id}`;
  expect(created.ledger).toMatchObject({
    version: 1,
    status: 'ACTIVE',
    expenseTotalCents: '0',
    coverImageId: coverId,
  });
  await repeat(member, '/invitations/join', { code: created.invitation.code }, 200);
  const detail = endpoints.getLedger.response.parse(await json(owner, path)).data;
  const ownerId = detail.myMemberId;
  const memberId = detail.members.find((m) => m.userId === member.user.id)!.id;
  expect(detail).toMatchObject({ version: 2, memberCount: 2 });
  const receiptId = await upload('RECEIPT', id);
  const expense = endpoints.createExpense.response.parse(
    await repeat(
      owner,
      `${path}/expenses`,
      {
        title: '附收据午餐',
        amountCents: '12000',
        category: 'DINING',
        occurredOn: '2026-10-27',
        payerMemberId: ownerId,
        splitMode: 'EQUAL',
        splits: [{ memberId: ownerId }, { memberId }],
        receiptImageId: receiptId,
      },
      201,
    ),
  ).data;
  expect(expense.amountCents).toBe('12000');
  expect(expense.splits.map((s) => s.amountCents)).toEqual(['6000', '6000']);
  const balances = endpoints.getBalances.response.parse(
    await json(member, `${path}/balances`),
  ).data;
  expect(balances.expenseTotalCents).toBe('12000');
  expect(balances.members.find((m) => m.memberId === ownerId)).toMatchObject({
    paidCents: '12000',
    sharedCents: '6000',
    netCents: '6000',
  });
  expect(balances.members.find((m) => m.memberId === memberId)).toMatchObject({
    paidCents: '0',
    sharedCents: '6000',
    netCents: '-6000',
  });
  const preview = endpoints.previewSettlement.response.parse(
    await json(owner, `${path}/settlement-preview`),
  ).data;
  expect(preview).toMatchObject({
    ledgerVersion: 3,
    expenseTotalCents: '12000',
    transferTotalCents: '6000',
    transferCount: 1,
  });
  expect(preview.transfers).toEqual([
    { sequence: 1, payerMemberId: memberId, payeeMemberId: ownerId, amountCents: '6000' },
  ]);
  expect((await json(owner, path)).data).toMatchObject({ status: 'ACTIVE', version: 3 });
  expect(
    await fixture.db.orm.select().from(settlementBatches).where(eq(settlementBatches.ledgerId, id)),
  ).toEqual([]);
  await repeat(owner, `${path}/settlement`, { expectedVersion: 3 }, 201);
  const batch = endpoints.getSettlement.response.parse(
    await json(owner, `${path}/settlement`),
  ).data;
  expect(batch).toMatchObject({
    sourceVersion: 3,
    ledgerStatus: 'SETTLING',
    transferCount: 1,
    expenseTotalCents: '12000',
    transferTotalCents: '6000',
  });
  expect(batch.netSnapshot).toEqual(
    [
      { memberId: ownerId, netCents: '6000' },
      { memberId, netCents: '-6000' },
    ].sort((a, b) => a.memberId.localeCompare(b.memberId)),
  );
  async function immutableRows() {
    return {
      expenses: await fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, id)),
      splits: await fixture.db.orm
        .select()
        .from(expenseSplits)
        .where(eq(expenseSplits.ledgerId, id)),
      batches: await fixture.db.orm
        .select()
        .from(settlementBatches)
        .where(eq(settlementBatches.ledgerId, id)),
      receipts: await fixture.db.orm
        .select()
        .from(expenseImages)
        .where(eq(expenseImages.ledgerId, id)),
      images: await fixture.db.orm
        .select()
        .from(imageAssets)
        .where(eq(imageAssets.ledgerId, id))
        .orderBy(imageAssets.id),
    };
  }
  const frozen = await immutableRows();
  expect(frozen.expenses).toHaveLength(1);
  expect(frozen.expenses[0]!.amountCents).toBe(12000n);
  expect(frozen.splits.map((s) => s.amountCents)).toEqual([6000n, 6000n]);
  expect(frozen.batches).toHaveLength(1);
  expect(frozen.batches[0]).toMatchObject({
    id: batch.id,
    sourceVersion: 3,
    expenseTotalCents: 12000n,
    transferTotalCents: 6000n,
    transferCount: 1,
    netSnapshot: [
      { memberId: ownerId, netCents: '6000' },
      { memberId, netCents: '-6000' },
    ].sort((a, b) => a.memberId.localeCompare(b.memberId)),
  });
  expect(frozen.images).toHaveLength(2);
  for (const image of frozen.images) {
    expect(image.content).toEqual(bytes);
    expect(image.byteSize).toBe(bytes.length);
  }
  const transfer = batch.transfers[0]!;
  expect(transfer).toMatchObject({
    payerMemberId: memberId,
    payeeMemberId: ownerId,
    amountCents: '6000',
    status: 'PENDING',
  });
  const pendingTransfers = await fixture.db.orm
    .select()
    .from(settlementTransfers)
    .where(eq(settlementTransfers.ledgerId, id));
  await repeat(
    member,
    `${path}/settlement/transfers/${transfer.id}/paid`,
    { note: '线下整笔核对' },
    200,
  );
  expect(await immutableRows()).toEqual(frozen);
  const paid: EndpointOutput<'getSettlement'>['data'] = (await json(owner, `${path}/settlement`))
    .data;
  expect(paid).toMatchObject({
    id: batch.id,
    netSnapshot: batch.netSnapshot,
    progress: { paidCount: 1, totalCount: 1, remainingCents: '0' },
  });
  expect(paid.transfers[0]).toMatchObject({
    status: 'PAID',
    registeredByMemberId: memberId,
    registrationNote: '线下整笔核对',
    registeredAt: expect.any(String),
  });
  const paidTransfers = await fixture.db.orm
    .select()
    .from(settlementTransfers)
    .where(eq(settlementTransfers.ledgerId, id));
  // Registration may change only status and registration metadata, never the frozen plan.
  expect(paidTransfers).toEqual([
    {
      ...pendingTransfers[0]!,
      status: 'PAID',
      registeredByMemberId: memberId,
      registeredAt: new Date(paid.transfers[0]!.registeredAt!),
      registrationNote: '线下整笔核对',
    },
  ]);
  await repeat(owner, `${path}/settle`, undefined, 200);
  expect(await immutableRows()).toEqual(frozen);
  const settledTransfers = await fixture.db.orm
    .select()
    .from(settlementTransfers)
    .where(eq(settlementTransfers.ledgerId, id));
  expect(settledTransfers).toEqual(paidTransfers);
  const settledLedger = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, id));
  const archived = await repeat(owner, `${path}/archive`, undefined, 200);
  expect(await immutableRows()).toEqual(frozen);
  expect(
    await fixture.db.orm
      .select()
      .from(settlementTransfers)
      .where(eq(settlementTransfers.ledgerId, id)),
  ).toEqual(settledTransfers);
  const [ledger] = await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, id));
  expect([ledger]).toEqual(settledLedger);
  expect(ledger).toMatchObject({
    status: 'SETTLED',
    version: 5,
    coverImageId: coverId,
    settledAt: expect.any(Date),
  });
  const members = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, id));
  expect(members.find((m) => m.id === ownerId)!.archivedAt?.toISOString()).toBe(
    archived.data.archivedAt,
  );
  expect(members.find((m) => m.id === memberId)!.archivedAt).toBeNull();
  expect((await json(owner, '/ledgers')).data).toEqual([]);
  expect((await json(owner, '/ledgers?archived=true')).data).toHaveLength(1);
  expect((await json(member, '/ledgers?archived=true')).data).toEqual([]);
  expect((await json(member, '/ledgers')).data).toHaveLength(1);
  for (const account of [owner, member]) {
    expect((await json(account, path)).data).toMatchObject({
      id,
      version: 5,
      status: 'SETTLED',
      expenseTotalCents: '12000',
      myRemainingNetCents: '0',
    });
    expect((await json(account, `${path}/expenses/${expense.id}`)).data).toMatchObject({
      receiptImageId: receiptId,
      amountCents: '12000',
      canEdit: false,
    });
    expect((await json(account, `${path}/settlement`)).data).toEqual({
      ...paid,
      ledgerStatus: 'SETTLED',
    });
    for (const imageId of [coverId, receiptId]) {
      const response = await fetch(`${origin}/api/v1/images/${imageId}`, {
        headers: auth(account),
      });
      expect(response.status).toBe(200);
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    }
  }
  const audits = await fixture.db.orm
    .select()
    .from(operationLogs)
    .where(eq(operationLogs.ledgerId, id));
  expect(audits).toHaveLength(7); // create, join, expense, freeze, paid, settle, archive: one each.
  expect(audits.map((audit) => audit.action).sort()).toEqual([
    'EXPENSE_CREATED',
    'LEDGER_ARCHIVED',
    'LEDGER_CREATED',
    'LEDGER_SETTLED',
    'MEMBER_JOINED',
    'SETTLEMENT_STARTED',
    'TRANSFER_PAID',
  ]);
});
