import { describe, expect, it } from 'vitest';
import { AppError } from '../src/http/errors.js';
import {
  createOpenAiCompatibleAiDraftProvider,
  normalizeAiDraftOutput,
  type AiDraftParseRequest,
} from '../src/modules/expenses/index.js';
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
    expect(requests).toHaveLength(4);
  });
});
