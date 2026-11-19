import { describe, expect, it, vi } from 'vitest';
import { expenseDraftSchema } from '@tongzhang/contracts';
import {
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
});
