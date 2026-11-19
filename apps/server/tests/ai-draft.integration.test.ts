import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { expenseDraftSchema } from '@tongzhang/contracts';
import {
  expenseSplits,
  expenses,
  imageAssets,
  ledgerMembers,
  ledgers,
} from '../src/db/schema/index.js';
import type { AiDraftParseRequest, AiDraftProvider } from '../src/modules/expenses/index.js';
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
) {
  const bytes = await imageBytes('png');
  const form = imageMultipart(bytes, 'image/png', [['kind', kind]]);
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

  it('returns controlled 503 when unconfigured and controlled 502 on upstream failure', async () => {
    const unconfiguredFixture = await openFixture();
    const owner = await unconfiguredFixture.register('小安');
    const ledgerId = await unconfiguredFixture.ledger(owner);

    const unconfiguredRes = await unconfiguredFixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner.accessToken}` },
      payload: { text: '晚餐 80 元' },
    });
    expect(unconfiguredRes.statusCode).toBe(503);
    expect(unconfiguredRes.json().error.code).toBe('AI_DRAFT_UNAVAILABLE');

    const failingFixture = await openFixture({
      async parse() {
        throw new Error('upstream-secret-token-should-not-leak');
      },
    });
    const owner2 = await failingFixture.register('小白');
    const ledgerId2 = await failingFixture.ledger(owner2);

    const failingRes = await failingFixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledgerId2}/expenses/ai-draft`,
      headers: { authorization: `Bearer ${owner2.accessToken}` },
      payload: { text: '打车 45 元' },
    });
    expect(failingRes.statusCode).toBe(502);
    expect(failingRes.json().error.code).toBe('AI_DRAFT_UPSTREAM_ERROR');
    expect(failingRes.body).not.toContain('upstream-secret-token-should-not-leak');
  });
});
