import { AppError } from '../../src/http/errors.js';
import type { AiDraftParseRequest, AiDraftProvider } from '../../src/modules/expenses/index.js';

export type AiDraftDoubleScenario =
  | 'valid-equal'
  | 'valid-shares'
  | 'valid-amount'
  | 'dirty-output'
  | 'upstream-502'
  | 'unavailable-503';

export type AiDraftDoubleOutcome =
  | { kind: 'scenario'; scenario: AiDraftDoubleScenario }
  | { kind: 'payload'; payload: unknown }
  | { kind: 'error'; error: Error }
  | { kind: 'handler'; handler: (request: AiDraftParseRequest) => unknown | Promise<unknown> };

export interface DeterministicAiDraftDouble extends AiDraftProvider {
  readonly calls: readonly AiDraftParseRequest[];
  enqueue(outcome: AiDraftDoubleOutcome): void;
  enqueueScenario(scenario: AiDraftDoubleScenario): void;
  setDefaultScenario(scenario: AiDraftDoubleScenario): void;
  reset(): void;
}

function buildScenarioResponse(
  scenario: AiDraftDoubleScenario,
  request: AiDraftParseRequest,
): unknown {
  const members = request.members;
  const firstMember = members[0]?.memberId ?? request.currentMemberId;
  const secondMember = members[1]?.memberId ?? firstMember;
  const occurredOn = request.referenceDate ?? '2026-11-18';

  switch (scenario) {
    case 'valid-equal':
      return {
        title: request.receiptImage ? '收据识别晚餐' : '鼓山食堂午餐',
        amountYuan: '120.00',
        category: 'DINING',
        occurredOn,
        payerMemberId: request.currentMemberId,
        splitMode: 'EQUAL',
        splits: members.map((member) => ({ memberId: member.memberId })),
        note: request.text ? `来自描述：${request.text.slice(0, 40)}` : '来自收据解析',
        warnings: [],
      };
    case 'valid-shares':
      return {
        title: '景区门票',
        amountYuan: '100.01',
        category: 'TICKET',
        occurredOn,
        payerMemberId: firstMember,
        splitMode: 'SHARES',
        splits: members.map((member, index) => ({
          memberId: member.memberId,
          shares: index === 0 ? 2 : 1,
        })),
        note: null,
        warnings: [],
      };
    case 'valid-amount':
      return {
        title: '往返车费',
        amountYuan: '60.00',
        category: 'TRANSPORT',
        occurredOn,
        payerMemberId: secondMember,
        splitMode: 'AMOUNT',
        splits: [
          { memberId: firstMember, amountYuan: '35.00' },
          ...(secondMember !== firstMember
            ? [{ memberId: secondMember, amountYuan: '25.00' }]
            : [{ memberId: firstMember, amountYuan: '60.00' }]),
        ].slice(0, secondMember !== firstMember ? 2 : 1),
        note: '精确金额分摊',
        warnings: ['请核对往返车费日期'],
      };
    case 'dirty-output':
      return {
        title: '超长消费标题'.repeat(15),
        amountYuan: '88.50',
        category: 'UNKNOWN_CATEGORY',
        occurredOn: '2026-13-45',
        payerMemberId: '00000000-0000-4000-8000-00000000ffff',
        splitMode: 'AMOUNT',
        splits: [
          { memberId: firstMember, amountYuan: '50.00' },
          { memberId: '00000000-0000-4000-8000-00000000eeee', amountYuan: '38.50' },
        ],
        note: '原始备注',
        warnings: ['模型输出包含不确定字段'],
      };
    case 'upstream-502':
      throw new AppError(
        'AI_DRAFT_UPSTREAM_ERROR',
        'AI 解析服务返回异常，请稍后重试或手动填写',
        502,
      );
    case 'unavailable-503':
      throw new AppError('AI_DRAFT_UNAVAILABLE', 'AI 辅助记账服务暂未配置，请手动填写', 503);
  }
}

/**
 * Deterministic in-process Test Double for A31 AI draft parsing.
 * Never performs external network calls and records every sanitized parse request.
 */
export function createDeterministicAiDraftDouble(
  defaultScenario: AiDraftDoubleScenario = 'valid-equal',
): DeterministicAiDraftDouble {
  let fallback: AiDraftDoubleScenario = defaultScenario;
  const queue: AiDraftDoubleOutcome[] = [];
  const calls: AiDraftParseRequest[] = [];

  return {
    get calls() {
      return calls;
    },
    enqueue(outcome) {
      queue.push(outcome);
    },
    enqueueScenario(scenario) {
      queue.push({ kind: 'scenario', scenario });
    },
    setDefaultScenario(scenario) {
      fallback = scenario;
    },
    reset() {
      queue.length = 0;
      calls.length = 0;
    },
    async parse(request) {
      calls.push({
        ...request,
        members: request.members.map((member) => ({ ...member })),
        receiptImage: request.receiptImage
          ? {
              ...request.receiptImage,
              content: Uint8Array.from(request.receiptImage.content),
            }
          : undefined,
      });
      const next = queue.shift() ?? { kind: 'scenario', scenario: fallback };
      switch (next.kind) {
        case 'scenario':
          return buildScenarioResponse(next.scenario, request);
        case 'payload':
          return next.payload;
        case 'error':
          throw next.error;
        case 'handler':
          return next.handler(request);
      }
    },
  };
}

export type OpenAiFetchDoubleStep =
  | { kind: 'json-content'; content: string }
  | { kind: 'http-error'; status: number; body?: string }
  | { kind: 'invalid-json'; body: string }
  | { kind: 'network-error'; message?: string }
  | { kind: 'hang-until-abort' };

/**
 * Deterministic fetch Test Double for exercising createOpenAiCompatibleAiDraftProvider
 * without touching any real OpenAI-compatible HTTP endpoint.
 */
export function createDeterministicOpenAiFetchDouble(steps: readonly OpenAiFetchDoubleStep[]) {
  const queue = [...steps];
  const requests: Array<{ url: string; headers: HeadersInit | undefined; body: unknown }> = [];

  const fetchImpl: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    const rawBody = typeof init?.body === 'string' ? JSON.parse(init.body) : init?.body;
    requests.push({ url, headers: init?.headers, body: rawBody });
    const step = queue.shift();
    if (!step) {
      throw new Error('Deterministic OpenAI fetch double queue exhausted');
    }
    switch (step.kind) {
      case 'json-content':
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: step.content } }],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } },
        );
      case 'http-error':
        return new Response(step.body ?? '{"error":"upstream"}', {
          status: step.status,
          headers: { 'content-type': 'application/json' },
        });
      case 'invalid-json':
        return new Response(step.body, {
          status: 200,
          headers: { 'content-type': 'application/json' },
        });
      case 'network-error':
        throw new Error(step.message ?? 'ECONNREFUSED');
      case 'hang-until-abort':
        return await new Promise<Response>((_, reject) => {
          const onAbort = () =>
            reject(new DOMException('The operation was aborted.', 'AbortError'));
          if (init?.signal?.aborted) {
            onAbort();
            return;
          }
          init?.signal?.addEventListener('abort', onAbort, { once: true });
        });
    }
  };

  return { fetchImpl, requests };
}
