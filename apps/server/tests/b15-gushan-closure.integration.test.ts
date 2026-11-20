import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type { z } from 'zod';
import { endpoints, errorResponseSchema } from '@tongzhang/contracts';
import { expenseImages, idempotencyKeys, imageAssets, ledgers } from '../src/db/schema/index.js';
import { integrationFixture } from './fixtures/integration.js';
import {
  createExpense,
  deleteExpenseRequest,
  expenseBody,
  raceExpenseWrites,
  readExpenseRow,
  readSoftDeletedExpenses,
  seedMultiMemberLedger,
  updateExpenseRequest,
  type SeededMember,
} from './fixtures/expenses.js';
import { imageBytes, imageMultipart } from './fixtures/images.js';

type Response = { statusCode: number; json: () => unknown };
let fixture: Awaited<ReturnType<typeof integrationFixture>>;

beforeEach(async () => {
  fixture = await integrationFixture();
});

afterEach(async () => {
  await fixture.close();
});

function parseOk<T>(res: Response, schema: z.ZodType<T>, status = 200): T {
  expect(res.statusCode).toBe(status);
  return schema.parse(res.json());
}

function expectErr(res: Response, status: number, code: string) {
  expect(res.statusCode).toBe(status);
  expect(errorResponseSchema.parse(res.json()).error.code).toBe(code);
}

const bearer = (member: SeededMember, key?: string) => ({
  authorization: `Bearer ${member.account.accessToken}`,
  ...(key === undefined ? {} : { 'idempotency-key': key }),
});

const ledgerVersion = async (ledgerId: string) =>
  (await fixture.db.orm.select().from(ledgers).where(eq(ledgers.id, ledgerId)))[0]!.version;

async function uploadReceipt(actor: SeededMember, ledgerId: string) {
  const bytes = await imageBytes('png');
  const multipart = imageMultipart(bytes, 'image/png', [
    ['kind', 'RECEIPT'],
    ['ledgerId', ledgerId],
  ]);
  const res = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/images',
    headers: {
      authorization: `Bearer ${actor.account.accessToken}`,
      ...multipart.headers,
    },
    payload: multipart.payload,
  });
  return parseOk(res, endpoints.uploadImage.response, 201).data.imageId;
}

describe('B15 closure: A16/A17 idempotency, soft-delete A21 conservation & Gushan 30000-cent benchmark', () => {
  it('replays A16/A17 idempotently (including after freeze) and rejects body/target conflicts with 409 IDEMPOTENCY_CONFLICT', async () => {
    const ledger = await seedMultiMemberLedger(fixture);
    const { 小安: an, 小白: bai, 小陈: chen } = ledger.byName;
    const canteen = await createExpense(fixture, ledger, an!, {
      title: '食堂初稿',
      amountCents: '10000',
      category: 'DINING',
      occurredOn: '2026-11-15',
      payer: an!,
    });
    const mistake = await createExpense(fixture, ledger, chen!, {
      title: '误记饮品',
      amountCents: '4500',
      category: 'SHOPPING',
      occurredOn: '2026-11-16',
      payer: chen!,
    });

    const patch = updateExpenseRequest(fixture, ledger);
    const del = deleteExpenseRequest(fixture, ledger);

    const editKey = randomUUID();
    const editBody = expenseBody(
      ledger,
      {
        title: '食堂',
        amountCents: '12000',
        category: 'DINING',
        occurredOn: '2026-11-15',
        payer: an!,
      },
      1,
    );
    const versionBeforeEdit = await ledgerVersion(ledger.ledgerId);
    const firstEdit = parseOk(
      await patch(an!, canteen.id, editBody, editKey),
      endpoints.updateExpense.response,
    );
    expect(firstEdit.data).toMatchObject({ id: canteen.id, amountCents: '12000', version: 2 });
    expect(await ledgerVersion(ledger.ledgerId)).toBe(versionBeforeEdit + 1);

    // Identical A16 replay returns cached 200 without bumping ledger or expense version.
    const replayEdit = parseOk(
      await patch(an!, canteen.id, editBody, editKey),
      endpoints.updateExpense.response,
    );
    expect(replayEdit).toEqual(firstEdit);
    expect(await ledgerVersion(ledger.ledgerId)).toBe(versionBeforeEdit + 1);
    expect((await readExpenseRow(fixture, canteen.id))!.version).toBe(2);

    // Reusing the same A16 key with a modified payload returns 409 IDEMPOTENCY_CONFLICT.
    expectErr(
      await patch(
        an!,
        canteen.id,
        expenseBody(ledger, { title: '食堂篡改', amountCents: '12500', payer: bai! }, 1),
        editKey,
      ),
      409,
      'IDEMPOTENCY_CONFLICT',
    );
    expect((await readExpenseRow(fixture, canteen.id))!.amountCents).toBe(12000n);

    // Soft-delete with A17 idempotency key: replay succeeds identically; mismatched version conflicts with 409 IDEMPOTENCY_CONFLICT.
    const deleteKey = randomUUID();
    const versionBeforeDelete = await ledgerVersion(ledger.ledgerId);
    const firstDelete = parseOk(
      await del(an!, mistake.id, 1, deleteKey),
      endpoints.deleteExpense.response,
    );
    expect(firstDelete).toEqual({ data: { deletedId: mistake.id } });
    expect(await ledgerVersion(ledger.ledgerId)).toBe(versionBeforeDelete + 1);

    const replayDelete = parseOk(
      await del(an!, mistake.id, 1, deleteKey),
      endpoints.deleteExpense.response,
    );
    expect(replayDelete).toEqual(firstDelete);
    expect(await ledgerVersion(ledger.ledgerId)).toBe(versionBeforeDelete + 1);

    expectErr(await del(an!, mistake.id, 2, deleteKey), 409, 'IDEMPOTENCY_CONFLICT');

    // Freeze ledger into SETTLING: historical keys still replay cached 200; fresh keys fail 409 LEDGER_FROZEN.
    const versionAtFreeze = await ledgerVersion(ledger.ledgerId);
    parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement`,
        headers: bearer(an!, randomUUID()),
        payload: { expectedVersion: versionAtFreeze },
      }),
      endpoints.startSettlement.response,
      201,
    );

    expect(
      parseOk(await patch(an!, canteen.id, editBody, editKey), endpoints.updateExpense.response),
    ).toEqual(firstEdit);
    expect(
      parseOk(await del(an!, mistake.id, 1, deleteKey), endpoints.deleteExpense.response),
    ).toEqual(firstDelete);

    const anKeysBefore = await fixture.db.orm
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.userId, an!.account.user.id));
    expectErr(
      await patch(an!, canteen.id, expenseBody(ledger, { payer: an! }, 2), randomUUID()),
      409,
      'LEDGER_FROZEN',
    );
    expectErr(await del(an!, canteen.id, 2, randomUUID()), 409, 'LEDGER_FROZEN');
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, an!.account.user.id)),
    ).toHaveLength(anKeysBefore.length);
  });

  it('runs the full 4-member 30000-cent Gushan benchmark from A16/A17 through A21 stats, 2-transfer 9000-cent settlement, settle and archive', async () => {
    const ledger = await seedMultiMemberLedger(fixture);
    const { 小安: an, 小白: bai, 小陈: chen, 小丁: ding } = ledger.byName;

    // Seed initial expenses + 1 erroneous expense to be soft-deleted.
    const canteen = await createExpense(fixture, ledger, an!, {
      title: '食堂初稿',
      amountCents: '10000',
      category: 'DINING',
      occurredOn: '2026-11-15',
      payer: an!,
    });
    const ticket = await createExpense(fixture, ledger, bai!, {
      title: '鼓山门票',
      amountCents: '12000',
      category: 'TICKET',
      occurredOn: '2026-11-15',
      payer: bai!,
    });
    const fare = await createExpense(fixture, ledger, chen!, {
      title: '车费',
      amountCents: '6000',
      category: 'TRANSPORT',
      occurredOn: '2026-11-16',
      payer: chen!,
      splitWith: [an!, chen!],
    });
    const mistake = await createExpense(fixture, ledger, ding!, {
      title: '误记纪念品',
      amountCents: '4500',
      category: 'SHOPPING',
      occurredOn: '2026-11-17',
      payer: ding!,
    });

    // Apply A16 edit to bring 食堂 to 12000 cents and A17 soft-delete on 误记纪念品.
    parseOk(
      await updateExpenseRequest(fixture, ledger)(
        an!,
        canteen.id,
        expenseBody(
          ledger,
          {
            title: '食堂',
            amountCents: '12000',
            category: 'DINING',
            occurredOn: '2026-11-15',
            payer: an!,
          },
          1,
        ),
      ),
      endpoints.updateExpense.response,
    );
    parseOk(
      await deleteExpenseRequest(fixture, ledger)(an!, mistake.id, 1),
      endpoints.deleteExpense.response,
    );

    // Soft-deleted row stays in DB with intact splits, but is excluded from A21 & A20.
    const softDeleted = await readSoftDeletedExpenses(fixture, ledger.ledgerId);
    expect(softDeleted.map((row) => row.id)).toEqual([mistake.id]);
    expect(softDeleted[0]!.splits.reduce((sum, s) => sum + s.amountCents, 0n)).toBe(4500n);

    const stats = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/statistics`,
        headers: bearer(ding!),
      }),
      endpoints.getStatistics.response,
    ).data;
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
    expect(stats.topExpenses.map((e) => e.id).sort()).toEqual(
      [canteen.id, ticket.id, fare.id].sort(),
    );
    const byMember = Object.fromEntries(stats.members.map((m) => [m.memberId, m]));
    expect(byMember[an!.memberId]).toMatchObject({
      paidCents: '12000',
      sharedCents: '9000',
      netCents: '3000',
    });
    expect(byMember[bai!.memberId]).toMatchObject({
      paidCents: '12000',
      sharedCents: '6000',
      netCents: '6000',
    });
    expect(byMember[chen!.memberId]).toMatchObject({
      paidCents: '6000',
      sharedCents: '9000',
      netCents: '-3000',
    });
    expect(byMember[ding!.memberId]).toMatchObject({
      paidCents: '0',
      sharedCents: '6000',
      netCents: '-6000',
    });
    expect(stats.members.reduce((sum, m) => sum + BigInt(m.paidCents), 0n)).toBe(30000n);
    expect(stats.members.reduce((sum, m) => sum + BigInt(m.sharedCents), 0n)).toBe(30000n);
    expect(stats.members.reduce((sum, m) => sum + BigInt(m.netCents), 0n)).toBe(0n);

    // A22 settlement preview: strictly read-only, exact minimum 2 transfers totaling 9000 cents.
    const versionBeforePreview = await ledgerVersion(ledger.ledgerId);
    const preview = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement-preview`,
        headers: bearer(an!),
      }),
      endpoints.previewSettlement.response,
    ).data;
    expect(await ledgerVersion(ledger.ledgerId)).toBe(versionBeforePreview);
    expect(preview).toMatchObject({
      expenseTotalCents: '30000',
      transferTotalCents: '9000',
      transferCount: 2,
    });
    expect(
      preview.transfers
        .map((t) => [t.payerMemberId, t.payeeMemberId, t.amountCents])
        .sort((a, b) => a[2]!.localeCompare(b[2]!)),
    ).toEqual([
      [chen!.memberId, an!.memberId, '3000'],
      [ding!.memberId, bai!.memberId, '6000'],
    ]);

    // A23 freeze -> SETTLING -> A25 mark both transfers paid -> A26 settle -> SETTLED.
    const settlement = parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement`,
        headers: bearer(an!, randomUUID()),
        payload: { expectedVersion: preview.ledgerVersion },
      }),
      endpoints.startSettlement.response,
      201,
    ).data;
    expect(settlement.ledgerStatus).toBe('SETTLING');
    expect(settlement.batch).toMatchObject({
      expenseTotalCents: '30000',
      transferTotalCents: '9000',
      transferCount: 2,
      progress: { totalCount: 2, paidCount: 0 },
    });

    for (const transfer of settlement.batch.transfers) {
      parseOk(
        await fixture.app.inject({
          method: 'POST',
          url: `/api/v1/ledgers/${ledger.ledgerId}/settlement/transfers/${transfer.id}/paid`,
          headers: bearer(an!, randomUUID()),
          payload: {},
        }),
        endpoints.markTransferPaid.response,
      );
    }

    const settled = parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/settle`,
        headers: bearer(an!, randomUUID()),
      }),
      endpoints.settleLedger.response,
    ).data;
    expect(settled.status).toBe('SETTLED');

    // After settlement: all remainingNetCents are '0', A16/A17 return 409 LEDGER_FROZEN, A21 stays 30000.
    const balancesAfter = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/balances`,
        headers: bearer(bai!),
      }),
      endpoints.getBalances.response,
    ).data;
    expect(balancesAfter.expenseTotalCents).toBe('30000');
    expect(balancesAfter.members.every((m) => m.remainingNetCents === '0')).toBe(true);
    expect(balancesAfter.members.reduce((sum, m) => sum + BigInt(m.netCents), 0n)).toBe(0n);

    const statsAfter = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/statistics`,
        headers: bearer(bai!),
      }),
      endpoints.getStatistics.response,
    ).data;
    expect(statsAfter).toEqual(stats);

    expectErr(
      await updateExpenseRequest(fixture, ledger)(
        an!,
        canteen.id,
        expenseBody(ledger, { payer: an! }, 2),
      ),
      409,
      'LEDGER_FROZEN',
    );
    expectErr(
      await deleteExpenseRequest(fixture, ledger)(an!, canteen.id, 2),
      409,
      'LEDGER_FROZEN',
    );

    // A27 personal archive affects only the archiver; other members' snapshots remain identical.
    parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/archive`,
        headers: bearer(ding!, randomUUID()),
      }),
      endpoints.archiveLedger.response,
    );
    const statsAfterArchive = parseOk(
      await fixture.app.inject({
        url: `/api/v1/ledgers/${ledger.ledgerId}/statistics`,
        headers: bearer(an!),
      }),
      endpoints.getStatistics.response,
    ).data;
    expect(statsAfterArchive).toEqual(stats);
  });

  it('covers A16 same-tx receipt rebinding across idempotency replay/conflict, concurrent version race, and SETTLING freeze', async () => {
    const ledger = await seedMultiMemberLedger(fixture, ['小安', '小白']);
    const { 小安: an } = ledger.byName;
    const receipt1 = await uploadReceipt(an!, ledger.ledgerId);
    const created = parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/expenses`,
        headers: bearer(an!, randomUUID()),
        payload: {
          ...expenseBody(ledger, { title: '收据初始', amountCents: '8000', payer: an! }),
          receiptImageId: receipt1,
        },
      }),
      endpoints.createExpense.response,
      201,
    ).data;
    expect(created.receiptImageId).toBe(receipt1);
    expect(
      await fixture.db.orm
        .select()
        .from(expenseImages)
        .where(eq(expenseImages.expenseId, created.id)),
    ).toHaveLength(1);
    expect(
      (await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, receipt1)))[0]!
        .ledgerId,
    ).toBe(ledger.ledgerId);

    const patch = updateExpenseRequest(fixture, ledger);
    const receipt2 = await uploadReceipt(an!, ledger.ledgerId);
    const swapKey = randomUUID();
    const swapBody = {
      ...expenseBody(ledger, { title: '收据换绑', amountCents: '9000', payer: an! }, 1),
      receiptImageId: receipt2,
    };
    const swapped = parseOk(
      await patch(an!, created.id, swapBody, swapKey),
      endpoints.updateExpense.response,
    );
    expect(swapped.data).toMatchObject({
      id: created.id,
      version: 2,
      receiptImageId: receipt2,
    });
    expect(
      await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, receipt1)),
    ).toHaveLength(0);
    expect(
      (
        await fixture.db.orm
          .select()
          .from(expenseImages)
          .where(eq(expenseImages.expenseId, created.id))
      ).map((row) => row.imageId),
    ).toEqual([receipt2]);
    expect(
      (await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, receipt2)))[0]!
        .ledgerId,
    ).toBe(ledger.ledgerId);

    // Exact replay returns cached 200 without bumping ledger or expense version.
    const versionAfterSwap = await ledgerVersion(ledger.ledgerId);
    const replayed = parseOk(
      await patch(an!, created.id, swapBody, swapKey),
      endpoints.updateExpense.response,
    );
    expect(replayed).toEqual(swapped);
    expect(await ledgerVersion(ledger.ledgerId)).toBe(versionAfterSwap);
    expect((await readExpenseRow(fixture, created.id))!.version).toBe(2);

    // Same key with a different receiptImageId fails with 409 IDEMPOTENCY_CONFLICT and keeps receipt3 unbound.
    const receipt3 = await uploadReceipt(an!, ledger.ledgerId);
    expectErr(
      await patch(
        an!,
        created.id,
        {
          ...expenseBody(ledger, { title: '收据换绑', amountCents: '9000', payer: an! }, 1),
          receiptImageId: receipt3,
        },
        swapKey,
      ),
      409,
      'IDEMPOTENCY_CONFLICT',
    );
    expect(
      (await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, receipt3)))[0]!
        .ledgerId,
    ).toBeNull();
    expect(
      (
        await fixture.db.orm
          .select()
          .from(expenseImages)
          .where(eq(expenseImages.expenseId, created.id))
      ).map((row) => row.imageId),
    ).toEqual([receipt2]);

    // Concurrent version race on receipt rebinding: exactly one succeeds, replaced receipt2 is deleted, loser receipt stays unbound.
    const raceReceiptA = await uploadReceipt(an!, ledger.ledgerId);
    const raceReceiptB = await uploadReceipt(an!, ledger.ledgerId);
    const [resA, resB] = await raceExpenseWrites(fixture, ledger, [
      () =>
        patch(an!, created.id, {
          ...expenseBody(ledger, { title: '并发换绑A', amountCents: '9100', payer: an! }, 2),
          receiptImageId: raceReceiptA,
        }),
      () =>
        patch(an!, created.id, {
          ...expenseBody(ledger, { title: '并发换绑B', amountCents: '9200', payer: an! }, 2),
          receiptImageId: raceReceiptB,
        }),
    ]);
    expect([resA!.statusCode, resB!.statusCode].sort()).toEqual([200, 409]);
    const winnerRes = resA!.statusCode === 200 ? resA! : resB!;
    const loserRes = resA!.statusCode === 200 ? resB! : resA!;
    expectErr(loserRes, 409, 'VERSION_CONFLICT');
    const winnerDto = parseOk(winnerRes, endpoints.updateExpense.response).data;
    expect(winnerDto.version).toBe(3);
    const winnerReceipt = winnerDto.receiptImageId!;
    const loserReceipt = winnerReceipt === raceReceiptA ? raceReceiptB : raceReceiptA;
    expect([raceReceiptA, raceReceiptB]).toContain(winnerReceipt);
    expect(
      (
        await fixture.db.orm
          .select()
          .from(expenseImages)
          .where(eq(expenseImages.expenseId, created.id))
      ).map((row) => row.imageId),
    ).toEqual([winnerReceipt]);
    expect(
      (await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, winnerReceipt)))[0]!
        .ledgerId,
    ).toBe(ledger.ledgerId);
    expect(
      await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, receipt2)),
    ).toHaveLength(0);
    expect(
      (await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, loserReceipt)))[0]!
        .ledgerId,
    ).toBeNull();

    // Freeze via real A23: fresh A16 rebinding fails with 409 LEDGER_FROZEN, leaves receipt3 unbound, and writes no idempotency key.
    const freezeVersion = await ledgerVersion(ledger.ledgerId);
    parseOk(
      await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.ledgerId}/settlement`,
        headers: bearer(an!, randomUUID()),
        payload: { expectedVersion: freezeVersion },
      }),
      endpoints.startSettlement.response,
      201,
    );
    const anKeysBeforeFreeze = await fixture.db.orm
      .select()
      .from(idempotencyKeys)
      .where(eq(idempotencyKeys.userId, an!.account.user.id));
    expectErr(
      await patch(
        an!,
        created.id,
        {
          ...expenseBody(ledger, { title: '冻结换绑', amountCents: '9500', payer: an! }, 3),
          receiptImageId: receipt3,
        },
        randomUUID(),
      ),
      409,
      'LEDGER_FROZEN',
    );
    expect(
      (await fixture.db.orm.select().from(imageAssets).where(eq(imageAssets.id, receipt3)))[0]!
        .ledgerId,
    ).toBeNull();
    expect(
      (
        await fixture.db.orm
          .select()
          .from(expenseImages)
          .where(eq(expenseImages.expenseId, created.id))
      ).map((row) => row.imageId),
    ).toEqual([winnerReceipt]);
    expect(
      await fixture.db.orm
        .select()
        .from(idempotencyKeys)
        .where(eq(idempotencyKeys.userId, an!.account.user.id)),
    ).toHaveLength(anKeysBeforeFreeze.length);
  });
});
