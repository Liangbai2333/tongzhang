import { z } from 'zod';
import type { AiDraftProviderConfig } from '../../config/env.js';
import { AppError } from '../../http/errors.js';
import type { DraftReceiptImage } from '../images/index.js';

export interface AiDraftMember {
  memberId: string;
  username: string;
}

export interface AiDraftParseRequest {
  text?: string;
  referenceDate?: string;
  receiptImage?: DraftReceiptImage;
  members: readonly AiDraftMember[];
  currentMemberId: string;
}

export interface AiDraftProvider {
  parse(request: AiDraftParseRequest): Promise<unknown>;
}

const openAiResponseSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([
            z.string(),
            z.array(z.object({ type: z.string(), text: z.string().optional() })),
          ]),
        }),
      }),
    )
    .min(1),
});

const SYSTEM_PROMPT = [
  '你是同账（多人共享记账 App）的消费草稿解析器。',
  '仅从用户输入和收据图片中提取结构化消费草稿，输出严格 JSON 对象，不要输出任何额外说明或 Markdown。',
  '字段约束：',
  '- title: string | null（简短消费标题，最多 60 字）',
  '- amountYuan: string | null（十进制元字符串，最多两位小数，如 "120.50"，不要输出数字类型）',
  '- category: "DINING" | "TRANSPORT" | "TICKET" | "LODGING" | "SHOPPING" | "OTHER"',
  '- occurredOn: "YYYY-MM-DD" | null',
  '- payerMemberId: string | null（必须从给定成员列表的 memberId 中选择，不确定则 null）',
  '- splitMode: "EQUAL" | "SHARES" | "AMOUNT"',
  '- splits: Array<{ memberId: string, shares?: number, amountYuan?: string }>（仅限给定成员）',
  '- note: string | null（最多 500 字）',
  '- warnings: string[]（若有不确定字段，用简体中文提示用户核对）',
].join('\n');

function extractJsonText(content: string): string {
  const trimmed = content.trim();
  const fenced = /^```(?:json)?\s*([\s\S]*?)\s*```$/i.exec(trimmed);
  return fenced ? fenced[1]!.trim() : trimmed;
}

function buildUserContent(request: AiDraftParseRequest) {
  const contextText = JSON.stringify({
    referenceDate: request.referenceDate ?? null,
    currentMemberId: request.currentMemberId,
    members: request.members,
    text: request.text ?? null,
    hasReceiptImage: Boolean(request.receiptImage),
  });
  if (!request.receiptImage) return contextText;
  const base64 = Buffer.from(request.receiptImage.content).toString('base64');
  return [
    { type: 'text', text: contextText },
    {
      type: 'image_url',
      image_url: { url: `data:${request.receiptImage.mimeType};base64,${base64}` },
    },
  ];
}

export function createUnconfiguredAiDraftProvider(): AiDraftProvider {
  return {
    async parse() {
      throw new AppError('AI_DRAFT_UNAVAILABLE', 'AI 辅助记账服务暂未配置，请手动填写', 503);
    },
  };
}

export function createOpenAiCompatibleAiDraftProvider(
  config: AiDraftProviderConfig,
  fetchImpl: typeof fetch = fetch,
): AiDraftProvider {
  const endpoint = `${config.apiBaseUrl.replace(/\/+$/, '')}/chat/completions`;
  return {
    async parse(request) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), config.timeoutMs);
      let response: Response;
      try {
        response = await fetchImpl(endpoint, {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${config.apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: config.model,
            temperature: 0,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user', content: buildUserContent(request) },
            ],
          }),
          signal: controller.signal,
        });
      } catch {
        throw new AppError(
          'AI_DRAFT_UPSTREAM_ERROR',
          'AI 解析服务暂时不可用，请稍后重试或手动填写',
          502,
        );
      } finally {
        clearTimeout(timer);
      }

      if (!response.ok) {
        throw new AppError(
          'AI_DRAFT_UPSTREAM_ERROR',
          'AI 解析服务返回异常，请稍后重试或手动填写',
          502,
        );
      }

      let payload: unknown;
      try {
        payload = await response.json();
      } catch {
        throw new AppError(
          'AI_DRAFT_UPSTREAM_ERROR',
          'AI 解析结果格式异常，请稍后重试或手动填写',
          502,
        );
      }

      const parsed = openAiResponseSchema.safeParse(payload);
      if (!parsed.success) {
        throw new AppError(
          'AI_DRAFT_UPSTREAM_ERROR',
          'AI 解析结果格式异常，请稍后重试或手动填写',
          502,
        );
      }
      const rawContent = parsed.data.choices[0]!.message.content;
      const text =
        typeof rawContent === 'string'
          ? rawContent
          : rawContent
              .map((part) => part.text ?? '')
              .join('')
              .trim();
      try {
        return JSON.parse(extractJsonText(text)) as unknown;
      } catch {
        throw new AppError(
          'AI_DRAFT_UPSTREAM_ERROR',
          'AI 解析结果格式异常，请稍后重试或手动填写',
          502,
        );
      }
    },
  };
}

export function createAiDraftProvider(config: AiDraftProviderConfig | null): AiDraftProvider {
  return config
    ? createOpenAiCompatibleAiDraftProvider(config)
    : createUnconfiguredAiDraftProvider();
}
