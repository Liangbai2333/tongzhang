import { describe, expect, it } from 'vitest';
import { MAX_AI_DRAFT_WARNINGS } from '@tongzhang/contracts';
import { AppError } from '../src/http/errors.js';
import {
  createOpenAiCompatibleAiDraftProvider,
  createUnconfiguredAiDraftProvider,
  normalizeAiDraftOutput,
  type AiDraftParseRequest,
} from '../src/modules/expenses/index.js';
import {
  DEFAULT_REMINDER_COOLDOWN_MS,
  assertReminderNotInCooldown,
} from '../src/modules/settlements/remind.js';
import {
  createDeterministicAiDraftDouble,
  createDeterministicOpenAiFetchDouble,
} from './fixtures/ai-draft-double.js';

const m1 = '00000000-0000-4000-8000-000000000011';
const m2 = '00000000-0000-4000-8000-000000000012';
const names = new Map<string, string>([
  [m1, '小安'],
  [m2, '小白'],
]);

const baseRequest: AiDraftParseRequest = {
  text: '鼓山食堂午餐 120 元 AA',
  referenceDate: '2026-11-18',
  currentMemberId: m1,
  members: [
    { memberId: m1, username: '小安' },
    { memberId: m2, username: '小白' },
  ],
};

describe('A31 deterministic AI draft Test Double (no DB, no network)', () => {
  it('returns deterministic normalized drafts for EQUAL, SHARES, and AMOUNT scenarios', async () => {
    const aiDouble = createDeterministicAiDraftDouble('valid-equal');
    aiDouble.enqueueScenario('valid-equal');
    aiDouble.enqueueScenario('valid-shares');
    aiDouble.enqueueScenario('valid-amount');

    const equalRaw = await aiDouble.parse(baseRequest);
    const equalDraft = normalizeAiDraftOutput(equalRaw, {
      names,
      receiptImageId: null,
      referenceDate: '2026-11-18',
    });
    expect(equalDraft.title).toBe('鼓山食堂午餐');
    expect(equalDraft.amountCents).toBe('12000');
    expect(equalDraft.splitMode).toBe('EQUAL');
    expect(equalDraft.splits).toEqual([{ memberId: m1 }, { memberId: m2 }]);

    const sharesRaw = await aiDouble.parse(baseRequest);
    const sharesDraft = normalizeAiDraftOutput(sharesRaw, {
      names,
      receiptImageId: null,
      referenceDate: '2026-11-18',
    });
    expect(sharesDraft.amountCents).toBe('10001');
    expect(sharesDraft.splitMode).toBe('SHARES');
    if (sharesDraft.splitMode === 'SHARES') {
      expect(sharesDraft.splits).toEqual([
        { memberId: m1, shares: 2 },
        { memberId: m2, shares: 1 },
      ]);
    }

    const amountRaw = await aiDouble.parse(baseRequest);
    const amountDraft = normalizeAiDraftOutput(amountRaw, {
      names,
      receiptImageId: null,
      referenceDate: '2026-11-18',
    });
    expect(amountDraft.amountCents).toBe('6000');
    expect(amountDraft.splitMode).toBe('AMOUNT');
    if (amountDraft.splitMode === 'AMOUNT') {
      expect(amountDraft.splits).toEqual([
        { memberId: m1, amountCents: '3500' },
        { memberId: m2, amountCents: '2500' },
      ]);
    }
    expect(aiDouble.calls).toHaveLength(3);
  });

  it('sanitizes dirty-output scenario and surfaces explicit AppError for 502/503 scenarios', async () => {
    const aiDouble = createDeterministicAiDraftDouble();
    aiDouble.enqueueScenario('dirty-output');
    aiDouble.enqueueScenario('upstream-502');
    aiDouble.enqueueScenario('unavailable-503');

    const dirtyRaw = await aiDouble.parse(baseRequest);
    const normalized = normalizeAiDraftOutput(dirtyRaw, {
      names,
      receiptImageId: null,
      referenceDate: '2026-11-18',
    });
    expect(normalized.title!.length).toBeLessThanOrEqual(60);
    expect(normalized.category).toBe('OTHER');
    expect(normalized.occurredOn).toBe('2026-11-18');
    expect(normalized.payerMemberId).toBeNull();
    expect(normalized.warnings.length).toBeGreaterThan(0);

    await expect(aiDouble.parse(baseRequest)).rejects.toMatchObject({
      code: 'AI_DRAFT_UPSTREAM_ERROR',
      statusCode: 502,
    } satisfies Partial<AppError>);
    await expect(aiDouble.parse(baseRequest)).rejects.toMatchObject({
      code: 'AI_DRAFT_UNAVAILABLE',
      statusCode: 503,
    } satisfies Partial<AppError>);
  });

  it('exercises OpenAI-compatible provider with deterministic fetch double for fenced JSON, 502, and abort timeout', async () => {
    const { fetchImpl, requests } = createDeterministicOpenAiFetchDouble([
      {
        kind: 'json-content',
        content: '```json\n{"title":"晚饭","amountYuan":"88.00","category":"DINING"}\n```',
      },
      { kind: 'http-error', status: 500 },
      { kind: 'invalid-json', body: 'not-json' },
      { kind: 'json-content', content: '{"amountCents":' },
      { kind: 'hang-until-abort' },
    ]);

    const provider = createOpenAiCompatibleAiDraftProvider(
      {
        apiBaseUrl: 'https://ai.double.invalid/v1',
        apiKey: 'test-key-never-sent-externally',
        model: 'deterministic-model',
        timeoutMs: 25,
      },
      fetchImpl,
    );

    const parsed = await provider.parse(baseRequest);
    expect(parsed).toEqual({ title: '晚饭', amountYuan: '88.00', category: 'DINING' });
    expect(requests[0]?.url).toBe('https://ai.double.invalid/v1/chat/completions');

    await expect(provider.parse(baseRequest)).rejects.toMatchObject({
      code: 'AI_DRAFT_UPSTREAM_ERROR',
      statusCode: 502,
    });
    await expect(provider.parse(baseRequest)).rejects.toMatchObject({
      code: 'AI_DRAFT_UPSTREAM_ERROR',
      statusCode: 502,
    });
    await expect(provider.parse(baseRequest)).rejects.toMatchObject({
      code: 'AI_DRAFT_UPSTREAM_ERROR',
      statusCode: 502,
    });
    await expect(provider.parse(baseRequest)).rejects.toMatchObject({
      code: 'AI_DRAFT_UPSTREAM_ERROR',
      statusCode: 502,
    });
    expect(requests).toHaveLength(5);
  });

  it('normalizes blank amountCents fallback, case/whitespace splitMode, degraded AMOUNT/SHARES, warning priority, and forged receiptImageId', () => {
    const verifiedReceiptId = '00000000-0000-4000-8000-000000000099';
    const forgedReceiptId = '00000000-0000-4000-8000-0000000000aa';

    // Blank amountCents must fall back to valid amountYuan; splitMode trims/uppercases; forged receiptImageId ignored.
    const blankCentsFallback = normalizeAiDraftOutput(
      {
        title: ' 鼓山索道 ',
        amountCents: '   ',
        amountYuan: '¥120.50元',
        category: ' ticket ',
        occurredOn: '2026-11-19',
        payerName: '小安',
        splitMode: ' shares ',
        splits: [
          { memberId: m1, shares: 2 },
          { username: '小白', shares: 1 },
        ],
        receiptImageId: forgedReceiptId,
        warnings: [],
      },
      { names, receiptImageId: verifiedReceiptId, referenceDate: '2026-11-19' },
    );
    expect(blankCentsFallback.title).toBe('鼓山索道');
    expect(blankCentsFallback.amountCents).toBe('12050');
    expect(blankCentsFallback.category).toBe('TICKET');
    expect(blankCentsFallback.payerMemberId).toBe(m1);
    expect(blankCentsFallback.splitMode).toBe('SHARES');
    expect(blankCentsFallback.receiptImageId).toBe(verifiedReceiptId);

    // AMOUNT mode with omitted total auto-sums from valid splits with warning; mismatched AMOUNT degrades to EQUAL.
    const autoSumAmount = normalizeAiDraftOutput(
      {
        title: '拼车',
        category: 'TRANSPORT',
        splitMode: ' amount ',
        splits: [
          { memberId: m1, amountYuan: '35.00' },
          { memberId: m2, amountCents: '2500' },
        ],
      },
      { names, receiptImageId: null, referenceDate: '2026-11-19' },
    );
    expect(autoSumAmount.amountCents).toBe('6000');
    expect(autoSumAmount.splitMode).toBe('AMOUNT');
    expect(autoSumAmount.warnings).toContain('已按分摊明细合计补全总金额，请核对');

    const degradedUnknownMode = normalizeAiDraftOutput(
      {
        title: '未知分摊',
        amountCents: '5000',
        category: 'INVALID_CAT',
        occurredOn: '2026-99-99',
        payerMemberId: '00000000-0000-4000-8000-00000000ffff',
        splitMode: 'PERCENTAGE',
        splits: 'not-an-array',
        warnings: Array.from({ length: 15 }, (_, index) => `上游提示 ${index}`),
      },
      { names, receiptImageId: null, referenceDate: '2026-11-19' },
    );
    expect(degradedUnknownMode.splitMode).toBe('EQUAL');
    expect(degradedUnknownMode.splits).toEqual([]);
    expect(degradedUnknownMode.warnings.length).toBeLessThanOrEqual(MAX_AI_DRAFT_WARNINGS);
    // Server-generated degradation warnings take priority over upstream warning floods.
    expect(degradedUnknownMode.warnings[0]).toBe('消费分类已回退为其他，请核对');
    expect(degradedUnknownMode.warnings).toContain('分摊方式无法识别，已切换为均分，请核对');
    expect(degradedUnknownMode.warnings).toContain('分摊成员格式无效，已清空分摊列表，请核对');

    // Non-object raw output throws explicit 502 AI_DRAFT_UPSTREAM_ERROR.
    expect(() =>
      normalizeAiDraftOutput(['not-an-object'], { names, receiptImageId: null }),
    ).toThrowError(AppError);
  });

  it('encodes receipt images as data URLs, maps network errors to 502, and rejects unconfigured provider with 503', async () => {
    const { fetchImpl, requests } = createDeterministicOpenAiFetchDouble([
      {
        kind: 'json-content',
        content: JSON.stringify({ title: '收据午餐', amountYuan: '45.00', category: 'DINING' }),
      },
      { kind: 'network-error', message: 'ECONNREFUSED' },
    ]);

    const provider = createOpenAiCompatibleAiDraftProvider(
      {
        apiBaseUrl: 'https://ai.double.invalid/v1/',
        apiKey: 'test-key-never-sent-externally',
        model: 'deterministic-vision',
        timeoutMs: 100,
      },
      fetchImpl,
    );

    const requestWithImage: AiDraftParseRequest = {
      ...baseRequest,
      receiptImage: {
        imageId: '00000000-0000-4000-8000-000000000077',
        mimeType: 'image/png',
        content: new Uint8Array([137, 80, 78, 71]),
      },
    };
    const parsed = await provider.parse(requestWithImage);
    expect(parsed).toEqual({ title: '收据午餐', amountYuan: '45.00', category: 'DINING' });
    const sentBody = requests[0]?.body as {
      messages: Array<{ role: string; content: unknown }>;
    };
    expect(Array.isArray(sentBody.messages[1]?.content)).toBe(true);
    expect(JSON.stringify(sentBody.messages[1]?.content)).toContain(
      'data:image/png;base64,iVBORw==',
    );

    await expect(provider.parse(baseRequest)).rejects.toMatchObject({
      code: 'AI_DRAFT_UPSTREAM_ERROR',
      statusCode: 502,
    });

    const unconfigured = createUnconfiguredAiDraftProvider();
    await expect(unconfigured.parse(baseRequest)).rejects.toMatchObject({
      code: 'AI_DRAFT_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('enforces exact 6-hour reminder cooldown boundary (6h - 1ms blocks, exact 6h allows)', () => {
    expect(DEFAULT_REMINDER_COOLDOWN_MS).toBe(6 * 60 * 60 * 1000);
    const lastRemindedAt = new Date('2026-11-19T08:00:00.000Z');
    const oneMsBeforeExpiry = new Date(lastRemindedAt.getTime() + DEFAULT_REMINDER_COOLDOWN_MS - 1);
    const exactExpiry = new Date(lastRemindedAt.getTime() + DEFAULT_REMINDER_COOLDOWN_MS);

    expect(() =>
      assertReminderNotInCooldown(lastRemindedAt, oneMsBeforeExpiry, DEFAULT_REMINDER_COOLDOWN_MS),
    ).toThrowError(
      expect.objectContaining({
        code: 'REMINDER_COOLDOWN',
        statusCode: 429,
      }),
    );
    expect(() =>
      assertReminderNotInCooldown(lastRemindedAt, exactExpiry, DEFAULT_REMINDER_COOLDOWN_MS),
    ).not.toThrow();
  });
});
