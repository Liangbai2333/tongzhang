import { describe, expect, it, vi } from 'vitest';
import { MAX_AI_DRAFT_WARNINGS, MAX_EXPENSE_CENTS, expenseDraftSchema } from '@tongzhang/contracts';
import { aiDraftConfig, readEnv } from '../src/config/env.js';
import {
  createAiDraftProvider,
  createOpenAiCompatibleAiDraftProvider,
  createUnconfiguredAiDraftProvider,
  normalizeAiDraftOutput,
} from '../src/modules/expenses/index.js';
import { AppError } from '../src/http/errors.js';

const an = '00000000-0000-4000-8000-000000000001';
const bai = '00000000-0000-4000-8000-000000000002';
const chen = '00000000-0000-4000-8000-000000000003';
const ding = '00000000-0000-4000-8000-000000000004';
const outsider = '00000000-0000-4000-8000-000000000099';
const receiptId = '00000000-0000-4000-8000-000000000101';
const spoofedReceiptId = '00000000-0000-4000-8000-000000000199';

const gushanNames = new Map([
  [an, '小安'],
  [bai, '小白'],
  [chen, '小陈'],
  [ding, '小丁'],
]);

describe('normalizeAiDraftOutput', () => {
  it('normalizes yuan strings into integer cents and validates EQUAL/SHARES/AMOUNT drafts', () => {
    const equal = normalizeAiDraftOutput(
      {
        title: ' 鼓山食堂 ',
        amountYuan: '¥120.00',
        category: 'dining',
        occurredOn: '2026-11-18',
        payerName: '小安',
        splitMode: 'EQUAL',
        splits: [{ memberId: an }, { memberId: bai }, { memberId: chen }, { memberId: ding }],
        note: '四人均分',
        receiptImageId: spoofedReceiptId,
        warnings: [],
      },
      { names: gushanNames, receiptImageId: receiptId },
    );
    expect(expenseDraftSchema.parse(equal)).toEqual({
      title: '鼓山食堂',
      amountCents: '12000',
      category: 'DINING',
      occurredOn: '2026-11-18',
      payerMemberId: an,
      splitMode: 'EQUAL',
      splits: [{ memberId: an }, { memberId: bai }, { memberId: chen }, { memberId: ding }],
      note: '四人均分',
      receiptImageId: receiptId,
      warnings: [],
    });

    const shares = normalizeAiDraftOutput(
      {
        title: '包车费用',
        amountCents: '6000',
        category: 'TRANSPORT',
        occurredOn: '2026-11-18',
        payerMemberId: chen.toUpperCase(),
        splitMode: 'SHARES',
        splits: [
          { memberId: an, shares: 1 },
          { memberId: chen, shares: 2 },
        ],
        note: null,
        warnings: [],
      },
      { names: gushanNames, receiptImageId: null },
    );
    expect(shares.splitMode).toBe('SHARES');
    expect(shares.payerMemberId).toBe(chen);
    expect(shares.splits).toEqual([
      { memberId: an, shares: 1 },
      { memberId: chen, shares: 2 },
    ]);

    const amount = normalizeAiDraftOutput(
      {
        title: '门票与饮品',
        amountYuan: '120.50',
        category: 'TICKET',
        occurredOn: '2026-11-18',
        payerMemberId: bai,
        splitMode: 'AMOUNT',
        splits: [
          { memberId: an, amountYuan: '60.25' },
          { memberId: bai, amountCents: '6025' },
        ],
        note: null,
        warnings: [],
      },
      { names: gushanNames, receiptImageId: null },
    );
    expect(amount.splitMode).toBe('AMOUNT');
    expect(amount.amountCents).toBe('12050');
    expect(amount.splits).toEqual([
      { memberId: an, amountCents: '6025' },
      { memberId: bai, amountCents: '6025' },
    ]);
  });

  it('filters non-members and duplicates, enforces AMOUNT conservation, and avoids float amounts', () => {
    const unconserved = normalizeAiDraftOutput(
      {
        title: '晚餐',
        amountCents: '10000',
        category: 'UNKNOWN_CAT',
        occurredOn: '2026-02-31',
        payerMemberId: outsider,
        splitMode: 'AMOUNT',
        splits: [
          { memberId: an, amountCents: '3333' },
          { memberId: bai, amountCents: '3333' },
          { memberId: chen, amountCents: '3333' },
          { memberId: outsider, amountCents: '1' },
          { memberId: an, amountCents: '1' },
        ],
        note: 'x'.repeat(550),
        warnings: ['模型提示'],
      },
      { names: gushanNames, receiptImageId: null, referenceDate: '2026-11-18' },
    );
    expect(expenseDraftSchema.parse(unconserved)).toBeTruthy();
    expect(unconserved.payerMemberId).toBeNull();
    expect(unconserved.category).toBe('OTHER');
    expect(unconserved.occurredOn).toBe('2026-11-18');
    expect(unconserved.splitMode).toBe('EQUAL');
    expect(unconserved.splits).toEqual([{ memberId: an }, { memberId: bai }, { memberId: chen }]);
    expect(unconserved.note?.length).toBe(500);
    expect(unconserved.warnings.length).toBeGreaterThanOrEqual(4);

    const floatRejected = normalizeAiDraftOutput(
      {
        title: '咖啡',
        amountCents: 35.5,
        category: 'DINING',
        splitMode: 'EQUAL',
        splits: [{ memberId: an }],
      },
      { names: gushanNames, receiptImageId: null },
    );
    expect(floatRejected.amountCents).toBeNull();
    expect(floatRejected.warnings).toContain('未能识别有效金额，请手动填写');
  });

  it.each([
    ['negative cents', { amountCents: '-1' }],
    ['zero cents', { amountCents: '0' }],
    ['overflow cents', { amountCents: (MAX_EXPENSE_CENTS + 1n).toString() }],
    ['negative yuan', { amountYuan: '-0.01' }],
    ['overflow yuan', { amountYuan: '10000000.00' }],
    ['invalid cents with valid yuan', { amountCents: '-1', amountYuan: '120.00' }],
  ])('clears %s without guessing a replacement total', (_label, amount) => {
    const draft = normalizeAiDraftOutput(
      { ...amount, splitMode: 'EQUAL', splits: [{ memberId: an }] },
      { names: gushanNames, receiptImageId: null },
    );
    expect(draft.amountCents).toBeNull();
    expect(draft.warnings).toContain('未能识别有效金额，请手动填写');
    expect(expenseDraftSchema.parse(draft)).toEqual(draft);
  });

  it.each(['-1', (MAX_EXPENSE_CENTS + 1n).toString()])(
    'degrades invalid AMOUNT split %s without changing a valid total',
    (amountCents) => {
      const draft = normalizeAiDraftOutput(
        {
          amountCents: '12000',
          splitMode: 'AMOUNT',
          splits: [{ memberId: an, amountCents }],
        },
        { names: gushanNames, receiptImageId: null },
      );
      expect(draft.amountCents).toBe('12000');
      expect(draft.splitMode).toBe('EQUAL');
      expect(draft.splits).toEqual([{ memberId: an }]);
      expect(draft.warnings).toContain('按金额分摊合计与总金额不一致，已切换为均分，请核对');
    },
  );

  it('derives total amount from conserved AMOUNT splits when total is omitted', () => {
    const derived = normalizeAiDraftOutput(
      {
        title: '车费',
        amountCents: null,
        category: 'TRANSPORT',
        splitMode: 'AMOUNT',
        splits: [
          { memberId: an, amountYuan: '30' },
          { memberId: chen, amountYuan: '30.00' },
        ],
      },
      { names: gushanNames, receiptImageId: null },
    );
    expect(derived.splitMode).toBe('AMOUNT');
    expect(derived.amountCents).toBe('6000');
    expect(derived.warnings).toContain('已按分摊明细合计补全总金额，请核对');
  });

  it('rejects non-object raw provider payloads with controlled 502 error', () => {
    for (const bad of [null, 'text', 123, []]) {
      expect(() =>
        normalizeAiDraftOutput(bad, { names: gushanNames, receiptImageId: null }),
      ).toThrowError(AppError);
      try {
        normalizeAiDraftOutput(bad, { names: gushanNames, receiptImageId: null });
      } catch (error) {
        expect((error as AppError).statusCode).toBe(502);
        expect((error as AppError).code).toBe('AI_DRAFT_UPSTREAM_ERROR');
      }
    }
  });

  it('degrades malformed SHARES, out-of-range AMOUNT, unknown splitMode, and non-array splits with warnings', () => {
    const badShares = normalizeAiDraftOutput(
      {
        title: '包车',
        amountCents: '6000',
        category: 'TRANSPORT',
        splitMode: ' shares ',
        splits: [
          { memberId: an, shares: 0 },
          { memberId: chen, shares: 1.5 },
        ],
      },
      { names: gushanNames, receiptImageId: null },
    );
    expect(badShares.splitMode).toBe('EQUAL');
    expect(badShares.splits).toEqual([{ memberId: an }, { memberId: chen }]);
    expect(badShares.warnings).toContain('按份分摊信息不完整，已切换为均分，请核对');

    const overflowDerivedAmount = normalizeAiDraftOutput(
      {
        title: '超限分摊',
        amountCents: null,
        category: 'OTHER',
        splitMode: ' amount ',
        splits: [
          { memberId: an, amountCents: '600000000' },
          { memberId: bai, amountCents: '600000000' },
        ],
      },
      { names: gushanNames, receiptImageId: null },
    );
    expect(overflowDerivedAmount.splitMode).toBe('EQUAL');
    expect(overflowDerivedAmount.amountCents).toBeNull();
    expect(overflowDerivedAmount.warnings).toContain(
      '按金额分摊合计与总金额不一致，已切换为均分，请核对',
    );

    const zeroAmountSplit = normalizeAiDraftOutput(
      {
        title: '免单含零分摊',
        amountCents: '',
        amountYuan: '120.00',
        category: 'DINING',
        splitMode: 'AMOUNT',
        splits: [
          { memberId: an, amountCents: '0' },
          { memberId: bai, amountCents: '4000' },
          { memberId: chen, amountCents: '4000' },
          { memberId: ding, amountCents: '4000' },
        ],
      },
      { names: gushanNames, receiptImageId: null },
    );
    expect(expenseDraftSchema.parse(zeroAmountSplit)).toBeTruthy();
    expect(zeroAmountSplit.splitMode).toBe('AMOUNT');
    expect(zeroAmountSplit.amountCents).toBe('12000');
    expect(zeroAmountSplit.splits).toEqual([
      { memberId: an, amountCents: '0' },
      { memberId: bai, amountCents: '4000' },
      { memberId: chen, amountCents: '4000' },
      { memberId: ding, amountCents: '4000' },
    ]);

    const badModeAndSplits = normalizeAiDraftOutput(
      {
        title: '异常模式',
        amountYuan: '12.345',
        category: 'DINING',
        splitMode: 'PERCENTAGE',
        splits: 'everyone',
      },
      { names: gushanNames, receiptImageId: null },
    );
    expect(badModeAndSplits.amountCents).toBeNull();
    expect(badModeAndSplits.splitMode).toBe('EQUAL');
    expect(badModeAndSplits.splits).toEqual([]);
    expect(badModeAndSplits.warnings).toContain('未能识别有效金额，请手动填写');
    expect(badModeAndSplits.warnings).toContain('分摊方式无法识别，已切换为均分，请核对');
    expect(badModeAndSplits.warnings).toContain('分摊成员格式无效，已清空分摊列表，请核对');
  });

  it('avoids guessing ambiguous duplicate usernames and prioritizes server warnings under flood', () => {
    const duplicateNames = new Map([
      [an, '小安'],
      [bai, '小安'],
      [chen, '小陈'],
    ]);
    const flooded = normalizeAiDraftOutput(
      {
        title: 'a'.repeat(80),
        amountCents: '0',
        category: 'INVALID',
        occurredOn: 'not-a-date',
        payerName: '小安',
        splitMode: 'EQUAL',
        splits: [{ name: '小安' }, { memberId: chen }, { memberId: chen.toUpperCase() }],
        note: 'b'.repeat(600),
        warnings: [
          ...Array.from({ length: 15 }, (_, i) => `模型告警-${i}-${'x'.repeat(220)}`),
          123,
          null,
        ],
      },
      { names: duplicateNames, receiptImageId: receiptId, referenceDate: '2026-11-19' },
    );
    expect(expenseDraftSchema.parse(flooded)).toBeTruthy();
    expect(flooded.title?.length).toBe(60);
    expect(flooded.note?.length).toBe(500);
    expect(flooded.amountCents).toBeNull();
    expect(flooded.payerMemberId).toBeNull();
    expect(flooded.splits).toEqual([{ memberId: chen }]);
    expect(flooded.receiptImageId).toBe(receiptId);
    expect(flooded.occurredOn).toBe('2026-11-19');
    expect(flooded.warnings).toHaveLength(MAX_AI_DRAFT_WARNINGS);
    expect(flooded.warnings.every((w) => w.length <= 200)).toBe(true);
    expect(flooded.warnings).toContain('标题过长已截断，请核对');
    expect(flooded.warnings).toContain('未能识别有效金额，请手动填写');
    expect(flooded.warnings).toContain('未能匹配账本付款人，请手动选择');
    expect(flooded.warnings).toContain('已过滤非本账本或重复的分摊成员，请核对');

    const empty = normalizeAiDraftOutput(
      {},
      { names: gushanNames, receiptImageId: null, referenceDate: '2026-11-19' },
    );
    expect(expenseDraftSchema.parse(empty)).toEqual({
      title: null,
      amountCents: null,
      category: 'OTHER',
      occurredOn: '2026-11-19',
      payerMemberId: null,
      splitMode: 'EQUAL',
      splits: [],
      note: null,
      receiptImageId: null,
      warnings: [],
    });
  });
});

describe('AI draft providers', () => {
  it('returns controlled 503 when external credentials are unconfigured', async () => {
    const provider = createUnconfiguredAiDraftProvider();
    await expect(
      provider.parse({
        text: '午餐 120 元',
        members: [{ memberId: an, username: '小安' }],
        currentMemberId: an,
      }),
    ).rejects.toMatchObject({
      code: 'AI_DRAFT_UNAVAILABLE',
      statusCode: 503,
    });
  });

  it('calls OpenAI-compatible endpoint with bearer key, handles fenced JSON and masks upstream failures', async () => {
    const fetchMock = vi.fn<typeof fetch>();
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: '```json\n{"title":"午饭","amountYuan":"88.50","category":"DINING"}\n```',
              },
            },
          ],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );

    const provider = createOpenAiCompatibleAiDraftProvider(
      {
        apiBaseUrl: 'https://llm.example.test/v1/',
        apiKey: 'sk-secret-key',
        model: 'test-model',
        timeoutMs: 5000,
      },
      fetchMock,
    );

    const parsed = await provider.parse({
      text: '午饭 88.5',
      referenceDate: '2026-11-18',
      receiptImage: {
        imageId: receiptId,
        mimeType: 'image/png',
        content: new Uint8Array([137, 80, 78, 71]),
      },
      members: [{ memberId: an, username: '小安' }],
      currentMemberId: an,
    });
    expect(parsed).toEqual({ title: '午饭', amountYuan: '88.50', category: 'DINING' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('https://llm.example.test/v1/chat/completions');
    expect((init?.headers as Record<string, string>).Authorization).toBe('Bearer sk-secret-key');
    expect(String(init?.body)).toContain('data:image/png;base64,');

    fetchMock.mockResolvedValueOnce(
      new Response('upstream secret error sk-secret-key', { status: 500 }),
    );
    await expect(
      provider.parse({
        text: '午饭 88.5',
        members: [{ memberId: an, username: '小安' }],
        currentMemberId: an,
      }),
    ).rejects.toMatchObject({
      code: 'AI_DRAFT_UPSTREAM_ERROR',
      statusCode: 502,
    });

    fetchMock.mockRejectedValueOnce(new Error('network timeout sk-secret-key'));
    try {
      await provider.parse({
        text: '午饭 88.5',
        members: [{ memberId: an, username: '小安' }],
        currentMemberId: an,
      });
      throw new Error('Expected failure');
    } catch (error) {
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).code).toBe('AI_DRAFT_UPSTREAM_ERROR');
      expect((error as AppError).statusCode).toBe(502);
      expect((error as AppError).message).not.toContain('sk-secret-key');
    }
  });

  it('supports multimodal array content, JPEG receipt-only requests, and partial-env 503 fallback', async () => {
    const baseEnv = {
      NODE_ENV: 'test',
      PGHOST: '127.0.0.1',
      PGPORT: '35432',
      PGUSER: 'tongzhang',
      PGPASSWORD: 'secret',
      PGDATABASE: 'tongzhang',
      AUTH_JWT_SECRET: 'ab'.repeat(32),
    };
    for (const partial of [
      { AI_DRAFT_API_BASE_URL: 'https://llm.example.test/v1', AI_DRAFT_MODEL: 'm' },
      { AI_DRAFT_API_BASE_URL: 'https://llm.example.test/v1', AI_DRAFT_API_KEY: 'sk-only' },
      { AI_DRAFT_API_KEY: 'sk-only', AI_DRAFT_MODEL: 'm' },
    ]) {
      const provider = createAiDraftProvider(aiDraftConfig(readEnv({ ...baseEnv, ...partial })));
      await expect(
        provider.parse({
          text: '晚餐 60 元',
          members: [{ memberId: an, username: '小安' }],
          currentMemberId: an,
        }),
      ).rejects.toMatchObject({ code: 'AI_DRAFT_UNAVAILABLE', statusCode: 503 });
    }

    const fetchMock = vi.fn<typeof fetch>();
    fetchMock
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [
              {
                message: {
                  content: [
                    { type: 'text', text: '{"title":"门票",' },
                    { type: 'text', text: '"amountYuan":"120.00","category":"TICKET"}' },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ choices: [{ message: { content: null } }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

    const provider = createOpenAiCompatibleAiDraftProvider(
      {
        apiBaseUrl: 'https://llm.example.test/v1',
        apiKey: 'sk-jpeg-secret',
        model: 'vision-model',
        timeoutMs: 5000,
      },
      fetchMock,
    );

    const parsed = await provider.parse({
      receiptImage: {
        imageId: receiptId,
        mimeType: 'image/jpeg',
        content: new Uint8Array([0xff, 0xd8, 0xff, 0xe0]),
      },
      members: [{ memberId: an, username: '小安' }],
      currentMemberId: an,
    });
    expect(parsed).toEqual({ title: '门票', amountYuan: '120.00', category: 'TICKET' });
    const body = String(fetchMock.mock.calls[0]?.[1]?.body ?? '');
    expect(body).toContain('data:image/jpeg;base64,');
    expect(body).toContain('\\"hasReceiptImage\\":true');

    await expect(
      provider.parse({
        text: '空 choices',
        members: [{ memberId: an, username: '小安' }],
        currentMemberId: an,
      }),
    ).rejects.toMatchObject({ code: 'AI_DRAFT_UPSTREAM_ERROR', statusCode: 502 });

    await expect(
      provider.parse({
        text: 'null content',
        members: [{ memberId: an, username: '小安' }],
        currentMemberId: an,
      }),
    ).rejects.toMatchObject({ code: 'AI_DRAFT_UPSTREAM_ERROR', statusCode: 502 });
  });
});
