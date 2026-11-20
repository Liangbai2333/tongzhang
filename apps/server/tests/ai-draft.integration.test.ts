import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import {
  MAX_AI_DRAFT_TEXT_LENGTH,
  MAX_AI_DRAFT_WARNINGS,
  expenseDraftSchema,
} from '@tongzhang/contracts';
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
import {
  createOpenAiCompatibleAiDraftProvider,
  type AiDraftParseRequest,
  type AiDraftProvider,
} from '../src/modules/expenses/index.js';
import { integrationFixture, type TestAccount } from './fixtures/integration.js';
import { imageBytes, imageMultipart } from './fixtures/images.js';

const fixtures: Awaited<ReturnType<typeof integrationFixture>>[] = [];

afterEach(async () => {
  await Promise.all(fixtures.splice(0).map((f) => f.close()));
});

async function openFixture(aiDraftProvider?: AiDraftProvider) {
  const fixture = await integrationFixture(aiDraftProvider ? { aiDraftProvider } : undefined);
  fixtures.push(fixture);
  return fixture;
}

async function uploadImage(
  fixture: Awaited<ReturnType<typeof integrationFixture>>,
  account: TestAccount,
  kind: 'RECEIPT' | 'COVER' = 'RECEIPT',
  format: 'png' | 'jpeg' = 'png',
) {
  const bytes = await imageBytes(format);
  const mimeType = format === 'jpeg' ? 'image/jpeg' : 'image/png';
  const form = imageMultipart(bytes, mimeType, [['kind', kind]]);
  const response = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/images',
    headers: { authorization: `Bearer ${account.accessToken}`, ...form.headers },
    payload: form.payload,
  });
  expect(response.statusCode).toBe(201);
  return response.json().data.imageId as string;
}

describe('A31 AI expense draft (POST /api/v1/ledgers/:ledgerId/expenses/ai-draft)', () => {
  it('enforces auth, membership, ACTIVE status, and receipt ownership before invoking provider', async () => {
    const parseSpy = vi.fn<AiDraftProvider['parse']>(async () => ({
      title: '食堂',
      amountYuan: '120.00',
      category: 'DINING',
    }));
    const fixture = await openFixture({ parse: parseSpy });
    const owner = await fixture.register('小安');
    const friend = await fixture.register('小白');
    const outsider = await fixture.register('路人');
    const ledgerId = await fixture.ledger(owner, [friend]);
    const rows = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, ledgerId));
    const ownerMemberId = rows.find((r) => r.userId === owner.user.id)!.id;

    // 1. Unauthenticated -> 401
    const unauth = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      payload: { text: '食堂 120 元' },
    });
    expect(unauth.statusCode).toBe(401);

    // 2. Non-member and missing ledger -> 403
    const outsiderRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${outsider.accessToken}` },
      payload: { text: '食堂 120 元' },
    });
    expect(outsiderRes.statusCode).toBe(403);
    expect(outsiderRes.json().error.code).toBe('FORBIDDEN');

    const missingLedgerRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${randomUUID()}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { text: '食堂 120 元' },
    });
    expect(missingLedgerRes.statusCode).toBe(403);

    // 3. Cross-user receiptImageId, missing receiptImageId, COVER image, and bound RECEIPT image
    const friendReceiptId = await uploadImage(fixture, friend, 'RECEIPT');
    const crossUserRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { receiptImageId: friendReceiptId },
    });
    expect(crossUserRes.statusCode).toBe(403);
    expect(crossUserRes.json().error.code).toBe('FORBIDDEN');

    const missingImageRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { receiptImageId: randomUUID() },
    });
    expect(missingImageRes.statusCode).toBe(403);

    const coverImageId = await uploadImage(fixture, owner, 'COVER');
    const coverRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { receiptImageId: coverImageId },
    });
    expect(coverRes.statusCode).toBe(400);
    expect(coverRes.json().error.code).toBe('IMAGE_INVALID');

    const boundReceiptId = await uploadImage(fixture, owner, 'RECEIPT');
    const createRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses`,
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: {
        title: '已绑定收据的消费',
        amountCents: '5000',
        category: 'DINING',
        occurredOn: '2026-11-18',
        payerMemberId: ownerMemberId,
        splitMode: 'EQUAL',
        splits: [{ memberId: ownerMemberId }],
        receiptImageId: boundReceiptId,
      },
    });
    expect(createRes.statusCode).toBe(201);

    const boundRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { receiptImageId: boundReceiptId },
    });
    expect(boundRes.statusCode).toBe(400);
    expect(boundRes.json().error.code).toBe('IMAGE_INVALID');

    // Soft-deleted expense's receipt remains bound to ledgerId and must still be rejected.
    const createdExpenseId = createRes.json().data.id as string;
    const deleteRes = await fixture.app.inject({
      method: 'DELETE',
      url: `/api/v1/ledgers/${ledgerId}/expenses/${createdExpenseId}?version=1`,
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        'idempotency-key': randomUUID(),
      },
    });
    expect(deleteRes.statusCode).toBe(200);
    const deletedBoundRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { receiptImageId: boundReceiptId },
    });
    expect(deletedBoundRes.statusCode).toBe(400);
    expect(deletedBoundRes.json().error.code).toBe('IMAGE_INVALID');

    // Receipt uploaded by outsider -> 403 FORBIDDEN; receipt bound to another ledger -> 400 IMAGE_INVALID.
    const outsiderReceiptId = await uploadImage(fixture, outsider, 'RECEIPT');
    const outsiderReceiptRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { receiptImageId: outsiderReceiptId },
    });
    expect(outsiderReceiptRes.statusCode).toBe(403);
    expect(outsiderReceiptRes.json().error.code).toBe('FORBIDDEN');

    const otherLedgerId = await fixture.ledger(owner);
    const [otherMember] = await fixture.db.orm
      .select()
      .from(ledgerMembers)
      .where(eq(ledgerMembers.ledgerId, otherLedgerId));
    const otherLedgerReceiptId = await uploadImage(fixture, owner, 'RECEIPT');
    const otherCreateRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${otherLedgerId}/expenses`,
      headers: {
        authorization: `Bearer ${owner.accessToken}`,
        'idempotency-key': randomUUID(),
      },
      payload: {
        title: '另一账本收据消费',
        amountCents: '3000',
        category: 'DINING',
        occurredOn: '2026-11-19',
        payerMemberId: otherMember!.id,
        splitMode: 'EQUAL',
        splits: [{ memberId: otherMember!.id }],
        receiptImageId: otherLedgerReceiptId,
      },
    });
    expect(otherCreateRes.statusCode).toBe(201);
    const crossLedgerBoundRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { receiptImageId: otherLedgerReceiptId },
    });
    expect(crossLedgerBoundRes.statusCode).toBe(400);
    expect(crossLedgerBoundRes.json().error.code).toBe('IMAGE_INVALID');

    // Invalid request bodies -> 400 VALIDATION_ERROR before invoking provider.
    for (const badBody of [
      {},
      { text: '   ' },
      { referenceDate: '2026-11-19' },
      { text: 'x'.repeat(MAX_AI_DRAFT_TEXT_LENGTH + 1) },
      { text: '午饭 50 元', unexpected: true },
    ]) {
      const badRes = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: badBody,
      });
      expect(badRes.statusCode).toBe(400);
      expect(badRes.json().error.code).toBe('VALIDATION_ERROR');
    }

    // 4. Frozen ledger (SETTLING / SETTLED) -> 409 LEDGER_FROZEN
    for (const status of ['SETTLING', 'SETTLED'] as const) {
      await fixture.db.orm
        .update(ledgers)
        .set({ status, settledAt: status === 'SETTLED' ? new Date() : null })
        .where(eq(ledgers.id, ledgerId));
      const frozenRes = await fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
        headers: { authorization: `Bearer ${owner.accessToken}` },
        payload: { text: '冻结态测试 100 元' },
      });
      expect(frozenRes.statusCode).toBe(409);
      expect(frozenRes.json().error.code).toBe('LEDGER_FROZEN');
    }

    expect(parseSpy).not.toHaveBeenCalled();
  });

  it('returns validated draft with zero DB writes, unchanged ledger version, and unbound receipt', async () => {
    let capturedRequest: AiDraftParseRequest | undefined;
    const fixture = await openFixture({
      async parse(request) {
        capturedRequest = request;
        return {
          title: '鼓山食堂午饭',
          amountYuan: '120.00',
          category: 'DINING',
          occurredOn: '2026-11-18',
          payerName: '小安',
          splitMode: 'EQUAL',
          splits: [
            ...request.members.map((m) => ({ memberId: m.memberId })),
            { memberId: randomUUID() },
          ],
          note: '四人均分',
          receiptImageId: randomUUID(),
          warnings: [],
        };
      },
    });

    const an = await fixture.register('小安');
    const bai = await fixture.register('小白');
    const chen = await fixture.register('小陈');
    const ding = await fixture.register('小丁');
    const ledgerId = await fixture.ledger(an, [bai, chen, ding]);
    const receiptId = await uploadImage(fixture, an, 'RECEIPT');

    const [beforeLedger] = await fixture.db.orm
      .select({ version: ledgers.version })
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId));
    const beforeExpenses = await fixture.db.orm
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.ledgerId, ledgerId));
    const beforeSplits = await fixture.db.orm
      .select({ memberId: expenseSplits.memberId })
      .from(expenseSplits)
      .where(eq(expenseSplits.ledgerId, ledgerId));

    const response = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${an.accessToken}` },
      payload: {
        text: '小安付了鼓山食堂午饭 120 元，四人均分',
        receiptImageId: receiptId,
        referenceDate: '2026-11-18',
      },
    });
    expect(response.statusCode).toBe(200);

    const parsed = expenseDraftSchema.parse(response.json().data);
    expect(parsed.title).toBe('鼓山食堂午饭');
    expect(parsed.amountCents).toBe('12000');
    expect(parsed.category).toBe('DINING');
    expect(parsed.occurredOn).toBe('2026-11-18');
    expect(parsed.splitMode).toBe('EQUAL');
    expect(parsed.splits).toHaveLength(4);
    expect(parsed.receiptImageId).toBe(receiptId);
    expect(parsed.warnings).toContain('已过滤非本账本或重复的分摊成员，请核对');
    expect(capturedRequest?.receiptImage?.imageId).toBe(receiptId);
    expect(capturedRequest?.receiptImage?.mimeType).toBe('image/png');

    // Verify zero writes to expenses, expense_splits, ledgers.version, and image_assets.ledgerId
    const [afterLedger] = await fixture.db.orm
      .select({ version: ledgers.version })
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId));
    const afterExpenses = await fixture.db.orm
      .select({ id: expenses.id })
      .from(expenses)
      .where(eq(expenses.ledgerId, ledgerId));
    const afterSplits = await fixture.db.orm
      .select({ memberId: expenseSplits.memberId })
      .from(expenseSplits)
      .where(eq(expenseSplits.ledgerId, ledgerId));
    const [receiptRow] = await fixture.db.orm
      .select({ ledgerId: imageAssets.ledgerId })
      .from(imageAssets)
      .where(eq(imageAssets.id, receiptId));

    expect(afterLedger!.version).toBe(beforeLedger!.version);
    expect(afterExpenses).toEqual(beforeExpenses);
    expect(afterSplits).toEqual(beforeSplits);
    expect(receiptRow!.ledgerId).toBeNull();
  });

  it('handles JPEG receipt-only, text-only degraded AMOUNT, and multi-member SHARES with zero DB writes', async () => {
    const requests: AiDraftParseRequest[] = [];
    let callIndex = 0;
    const fixture = await openFixture({
      async parse(request) {
        requests.push(request);
        callIndex += 1;
        const [m0, m1, m2, m3] = request.members;
        if (callIndex === 1) {
          // Receipt-only JPEG -> conserved 4-member AMOUNT draft (spoofed receiptImageId must be ignored)
          return {
            title: '鼓山门票收据',
            amountYuan: '120.00',
            category: 'TICKET',
            occurredOn: '2026-11-19',
            payerMemberId: m1!.memberId,
            splitMode: 'AMOUNT',
            splits: [
              { memberId: m0!.memberId, amountYuan: '30.00' },
              { memberId: m1!.memberId, amountYuan: '30.00' },
              { memberId: m2!.memberId, amountYuan: '30.00' },
              { memberId: m3!.memberId, amountYuan: '30.00' },
            ],
            note: null,
            receiptImageId: randomUUID(),
            warnings: [],
          };
        }
        if (callIndex === 2) {
          // Text-only -> unconserved AMOUNT + outsider + warning flood -> degrades to EQUAL
          return {
            title: 't'.repeat(75),
            amountCents: '10000',
            category: 'UNKNOWN',
            occurredOn: '2026-02-30',
            payerMemberId: randomUUID(),
            splitMode: 'AMOUNT',
            splits: [
              { memberId: m0!.memberId, amountCents: '3333' },
              { memberId: m1!.memberId, amountCents: '3333' },
              { memberId: randomUUID(), amountCents: '3334' },
            ],
            note: 'n'.repeat(550),
            warnings: Array.from({ length: 12 }, (_, i) => `上游提示${i}`),
          };
        }
        // Text + PNG receipt -> valid SHARES draft
        return {
          title: '包车费用',
          amountCents: '6000',
          category: 'TRANSPORT',
          occurredOn: '2026-11-19',
          payerName: '小陈',
          splitMode: 'SHARES',
          splits: [
            { memberId: m0!.memberId, shares: 1 },
            { memberId: m2!.memberId, shares: 2 },
          ],
          note: '按份分摊',
          warnings: [],
        };
      },
    });

    const an = await fixture.register('小安');
    const bai = await fixture.register('小白');
    const chen = await fixture.register('小陈');
    const ding = await fixture.register('小丁');
    const ledgerId = await fixture.ledger(an, [bai, chen, ding]);
    const baiJpegReceipt = await uploadImage(fixture, bai, 'RECEIPT', 'jpeg');
    const chenPngReceipt = await uploadImage(fixture, chen, 'RECEIPT', 'png');

    const [beforeLedger] = await fixture.db.orm
      .select({ version: ledgers.version })
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId));

    // 1. Non-creator ACTIVE member calls A31 with JPEG receipt-only (no text)
    const receiptOnlyRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${bai.accessToken}` },
      payload: { receiptImageId: baiJpegReceipt },
    });
    expect(receiptOnlyRes.statusCode).toBe(200);
    const receiptOnlyDraft = expenseDraftSchema.parse(receiptOnlyRes.json().data);
    expect(receiptOnlyDraft.amountCents).toBe('12000');
    expect(receiptOnlyDraft.splitMode).toBe('AMOUNT');
    expect(receiptOnlyDraft.receiptImageId).toBe(baiJpegReceipt);
    if (receiptOnlyDraft.splitMode === 'AMOUNT') {
      const sum = receiptOnlyDraft.splits.reduce((acc, s) => acc + BigInt(s.amountCents), 0n);
      expect(sum).toBe(12000n);
    }
    expect(requests[0]?.text).toBeUndefined();
    expect(requests[0]?.receiptImage?.mimeType).toBe('image/jpeg');

    // 2. Text-only call with degraded unconserved AMOUNT + warning flood
    const degradedRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${an.accessToken}` },
      payload: { text: '晚餐 100 元，三人分摊', referenceDate: '2026-11-19' },
    });
    expect(degradedRes.statusCode).toBe(200);
    const degradedDraft = expenseDraftSchema.parse(degradedRes.json().data);
    expect(degradedDraft.title?.length).toBe(60);
    expect(degradedDraft.note?.length).toBe(500);
    expect(degradedDraft.category).toBe('OTHER');
    expect(degradedDraft.occurredOn).toBe('2026-11-19');
    expect(degradedDraft.payerMemberId).toBeNull();
    expect(degradedDraft.splitMode).toBe('EQUAL');
    expect(degradedDraft.splits).toHaveLength(2);
    expect(degradedDraft.receiptImageId).toBeNull();
    expect(degradedDraft.warnings).toHaveLength(MAX_AI_DRAFT_WARNINGS);
    expect(degradedDraft.warnings).toContain('按金额分摊合计与总金额不一致，已切换为均分，请核对');
    expect(degradedDraft.warnings).toContain('已过滤非本账本或重复的分摊成员，请核对');

    // 3. Text + PNG receipt call returning valid SHARES draft
    const sharesRes = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${chen.accessToken}` },
      payload: {
        text: '小陈付包车 60 元，小安 1 份小陈 2 份',
        receiptImageId: chenPngReceipt,
        referenceDate: '2026-11-19',
      },
    });
    expect(sharesRes.statusCode).toBe(200);
    const sharesDraft = expenseDraftSchema.parse(sharesRes.json().data);
    expect(sharesDraft.splitMode).toBe('SHARES');
    expect(sharesDraft.receiptImageId).toBe(chenPngReceipt);
    expect(sharesDraft.splits).toHaveLength(2);

    // Verify ZERO writes across all business tables and unchanged ledger version & unbound receipts.
    const [afterLedger] = await fixture.db.orm
      .select({ version: ledgers.version })
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId));
    const [expRows, splitRows, bindingRows, logRows, idemRows, [jpegRow], [pngRow]] =
      await Promise.all([
        fixture.db.orm.select().from(expenses).where(eq(expenses.ledgerId, ledgerId)),
        fixture.db.orm.select().from(expenseSplits).where(eq(expenseSplits.ledgerId, ledgerId)),
        fixture.db.orm.select().from(expenseImages).where(eq(expenseImages.ledgerId, ledgerId)),
        fixture.db.orm.select().from(operationLogs).where(eq(operationLogs.ledgerId, ledgerId)),
        fixture.db.orm.select().from(idempotencyKeys).where(eq(idempotencyKeys.userId, an.user.id)),
        fixture.db.orm
          .select({ ledgerId: imageAssets.ledgerId })
          .from(imageAssets)
          .where(eq(imageAssets.id, baiJpegReceipt)),
        fixture.db.orm
          .select({ ledgerId: imageAssets.ledgerId })
          .from(imageAssets)
          .where(eq(imageAssets.id, chenPngReceipt)),
      ]);
    expect(afterLedger!.version).toBe(beforeLedger!.version);
    expect(expRows).toHaveLength(0);
    expect(splitRows).toHaveLength(0);
    expect(bindingRows).toHaveLength(0);
    expect(logRows).toHaveLength(0);
    expect(idemRows).toHaveLength(0);
    expect(jpegRow!.ledgerId).toBeNull();
    expect(pngRow!.ledgerId).toBeNull();
  });

  it('returns controlled 503 when unconfigured and controlled 502 on upstream failure without leaking credentials', async () => {
    const unconfiguredFixture = await openFixture();
    const owner = await unconfiguredFixture.register('小安');
    const ledgerId = await unconfiguredFixture.ledger(owner);
    const [beforeUnconfiguredLedger] = await unconfiguredFixture.db.orm
      .select({ version: ledgers.version })
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId));

    const unconfiguredRes = await unconfiguredFixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { text: '晚餐 80 元' },
    });
    expect(unconfiguredRes.statusCode).toBe(503);
    expect(unconfiguredRes.json().error.code).toBe('AI_DRAFT_UNAVAILABLE');
    const [afterUnconfiguredLedger] = await unconfiguredFixture.db.orm
      .select({ version: ledgers.version })
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId));
    expect(afterUnconfiguredLedger!.version).toBe(beforeUnconfiguredLedger!.version);

    const secretKey = 'sk-server-only-secret-never-expose';
    const openAiFailingProvider = createOpenAiCompatibleAiDraftProvider(
      {
        apiBaseUrl: 'https://llm.invalid/v1',
        apiKey: secretKey,
        model: 'test-model',
        timeoutMs: 2000,
      },
      async () => new Response(`upstream failed with ${secretKey}`, { status: 500 }),
    );
    const failingFixture = await openFixture(openAiFailingProvider);
    const owner2 = await failingFixture.register('小白');
    const ledgerId2 = await failingFixture.ledger(owner2);
    const [beforeFailingLedger] = await failingFixture.db.orm
      .select({ version: ledgers.version })
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId2));

    const failingRes = await failingFixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId2}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner2.accessToken}` },
      payload: { text: '打车 45 元' },
    });
    expect(failingRes.statusCode).toBe(502);
    expect(failingRes.json().error.code).toBe('AI_DRAFT_UPSTREAM_ERROR');
    expect(failingRes.body).not.toContain(secretKey);

    const systemInfoRes = await failingFixture.app.inject({
      method: 'GET',
      url: '/api/v1/system/info',
    });
    expect(systemInfoRes.statusCode).toBe(200);
    expect(systemInfoRes.body).not.toContain(secretKey);

    const [afterFailingLedger] = await failingFixture.db.orm
      .select({ version: ledgers.version })
      .from(ledgers)
      .where(eq(ledgers.id, ledgerId2));
    const failingExpenses = await failingFixture.db.orm
      .select()
      .from(expenses)
      .where(eq(expenses.ledgerId, ledgerId2));
    expect(afterFailingLedger!.version).toBe(beforeFailingLedger!.version);
    expect(failingExpenses).toHaveLength(0);
  });
});
