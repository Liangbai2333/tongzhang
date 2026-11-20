import { z } from 'zod';
import {
  MAX_AI_DRAFT_WARNINGS,
  MAX_EXPENSE_CENTS,
  categorySchema,
  expenseDraftSchema,
  expenseMoneySchema,
  localDateSchema,
  nonnegativeMoneySchema,
  type Category,
  type ExpenseDraft,
} from '@tongzhang/contracts';
import { allocateExpense, parseYuan } from '@tongzhang/domain';
import { AppError } from '../../http/errors.js';

const rawSplitItemSchema = z.record(z.string(), z.unknown());
const rawDraftObjectSchema = z.record(z.string(), z.unknown());

export interface NormalizeAiDraftContext {
  names: ReadonlyMap<string, string>;
  receiptImageId: string | null;
  referenceDate?: string;
}

function parseCentsValue(
  rawCents: unknown,
  rawYuan: unknown,
  allowZero: boolean,
): { value: bigint | null; invalid: boolean } {
  if (rawCents !== undefined && rawCents !== null) {
    if (typeof rawCents !== 'string') return { value: null, invalid: true };
    const trimmed = rawCents.trim();
    if (trimmed !== '') {
      const schema = allowZero ? nonnegativeMoneySchema : expenseMoneySchema;
      const parsed = schema.safeParse(trimmed);
      if (!parsed.success) return { value: null, invalid: true };
      const cents = BigInt(parsed.data);
      if (cents > MAX_EXPENSE_CENTS) return { value: null, invalid: true };
      return { value: cents, invalid: false };
    }
  }
  if (rawYuan !== undefined && rawYuan !== null) {
    if (typeof rawYuan !== 'string') return { value: null, invalid: true };
    const cleaned = rawYuan
      .trim()
      .replace(/^[¥￥]\s*/, '')
      .replace(/\s*元$/, '');
    if (cleaned === '') return { value: null, invalid: false };
    try {
      const cents = parseYuan(cleaned);
      if ((!allowZero && cents <= 0n) || cents < 0n || cents > MAX_EXPENSE_CENTS) {
        return { value: null, invalid: true };
      }
      return { value: cents, invalid: false };
    } catch {
      return { value: null, invalid: true };
    }
  }
  return { value: null, invalid: false };
}

function resolveMemberByName(names: ReadonlyMap<string, string>, rawName: unknown): string | null {
  if (typeof rawName !== 'string') return null;
  const target = rawName.trim();
  if (!target) return null;
  const matches: string[] = [];
  for (const [memberId, username] of names) {
    if (username.trim() === target) matches.push(memberId);
  }
  return matches.length === 1 ? matches[0]! : null;
}

function resolveMemberId(
  names: ReadonlyMap<string, string>,
  rawMemberId: unknown,
  rawName?: unknown,
): string | null {
  if (typeof rawMemberId === 'string') {
    const normalized = rawMemberId.trim().toLowerCase();
    if (names.has(normalized)) return normalized;
  }
  return resolveMemberByName(names, rawName);
}

function normalizeStringField(
  raw: unknown,
  maxLength: number,
  warningText: string,
  warnings: string[],
): string | null {
  if (raw === undefined || raw === null) return null;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  if (trimmed.length > maxLength) {
    warnings.push(warningText);
    return trimmed.slice(0, maxLength).trim() || null;
  }
  return trimmed;
}

function normalizeCategory(raw: unknown, warnings: string[]): Category {
  const parsed = categorySchema.safeParse(typeof raw === 'string' ? raw.trim().toUpperCase() : raw);
  if (parsed.success) return parsed.data;
  if (raw !== undefined && raw !== null && raw !== '') {
    warnings.push('消费分类已回退为其他，请核对');
  }
  return 'OTHER';
}

function normalizeOccurredOn(
  raw: unknown,
  referenceDate: string | undefined,
  warnings: string[],
): string | null {
  if (raw === undefined || raw === null || raw === '') return referenceDate ?? null;
  if (typeof raw === 'string') {
    const parsed = localDateSchema.safeParse(raw.trim());
    if (parsed.success) return parsed.data;
  }
  warnings.push('消费日期格式无效，请核对');
  return referenceDate ?? null;
}

function normalizeSplits(
  rawSplitMode: unknown,
  rawSplits: unknown,
  amountCents: bigint | null,
  names: ReadonlyMap<string, string>,
  warnings: string[],
): {
  amountCents: bigint | null;
  splitMode: ExpenseDraft['splitMode'];
  splits: ExpenseDraft['splits'];
} {
  const normalizedMode =
    typeof rawSplitMode === 'string' ? rawSplitMode.trim().toUpperCase() : rawSplitMode;
  const requestedMode =
    normalizedMode === 'SHARES' || normalizedMode === 'AMOUNT' || normalizedMode === 'EQUAL'
      ? normalizedMode
      : 'EQUAL';
  if (
    rawSplitMode !== undefined &&
    rawSplitMode !== null &&
    rawSplitMode !== '' &&
    normalizedMode !== 'SHARES' &&
    normalizedMode !== 'AMOUNT' &&
    normalizedMode !== 'EQUAL'
  ) {
    warnings.push('分摊方式无法识别，已切换为均分，请核对');
  }
  if (rawSplits !== undefined && rawSplits !== null && !Array.isArray(rawSplits)) {
    warnings.push('分摊成员格式无效，已清空分摊列表，请核对');
  }
  const items = Array.isArray(rawSplits) ? rawSplits : [];
  const seen = new Set<string>();
  const validItems: { memberId: string; raw: Record<string, unknown> }[] = [];
  let droppedMembers = false;

  for (const item of items) {
    const obj = rawSplitItemSchema.safeParse(item);
    if (!obj.success) {
      droppedMembers = true;
      continue;
    }
    const memberId = resolveMemberId(names, obj.data.memberId, obj.data.username ?? obj.data.name);
    if (!memberId || seen.has(memberId)) {
      droppedMembers = true;
      continue;
    }
    seen.add(memberId);
    validItems.push({ memberId, raw: obj.data });
  }
  if (droppedMembers) warnings.push('已过滤非本账本或重复的分摊成员，请核对');

  if (requestedMode === 'SHARES') {
    const sharesSplits: { memberId: string; shares: number }[] = [];
    let invalidShares = false;
    for (const item of validItems) {
      const s = item.raw.shares;
      if (typeof s === 'number' && Number.isInteger(s) && s >= 1 && s <= 10000) {
        sharesSplits.push({ memberId: item.memberId, shares: s });
      } else {
        invalidShares = true;
      }
    }
    if (sharesSplits.length > 0 && !invalidShares) {
      return { amountCents, splitMode: 'SHARES', splits: sharesSplits };
    }
    warnings.push('按份分摊信息不完整，已切换为均分，请核对');
    return {
      amountCents,
      splitMode: 'EQUAL',
      splits: validItems.map((item) => ({ memberId: item.memberId })),
    };
  }

  if (requestedMode === 'AMOUNT') {
    const amountSplits: { memberId: string; cents: bigint }[] = [];
    let invalidAmount = false;
    for (const item of validItems) {
      const parsed = parseCentsValue(item.raw.amountCents, item.raw.amountYuan, true);
      if (parsed.invalid || parsed.value === null) {
        invalidAmount = true;
        break;
      }
      amountSplits.push({ memberId: item.memberId, cents: parsed.value });
    }
    if (!invalidAmount && amountSplits.length > 0) {
      const sum = amountSplits.reduce((acc, s) => acc + s.cents, 0n);
      let resolvedTotal = amountCents;
      if (resolvedTotal === null && sum > 0n && sum <= MAX_EXPENSE_CENTS) {
        resolvedTotal = sum;
        warnings.push('已按分摊明细合计补全总金额，请核对');
      }
      if (resolvedTotal !== null && sum === resolvedTotal) {
        // Verify integer-cent conservation with the shared domain allocator.
        const allocated = allocateExpense(resolvedTotal, {
          mode: 'AMOUNT',
          members: amountSplits.map((s) => ({ memberId: s.memberId, amountCents: s.cents })),
        });
        if (allocated.reduce((acc, s) => acc + s.amountCents, 0n) === resolvedTotal) {
          return {
            amountCents: resolvedTotal,
            splitMode: 'AMOUNT',
            splits: amountSplits.map((s) => ({
              memberId: s.memberId,
              amountCents: s.cents.toString(),
            })),
          };
        }
      }
    }
    warnings.push('按金额分摊合计与总金额不一致，已切换为均分，请核对');
    return {
      amountCents,
      splitMode: 'EQUAL',
      splits: validItems.map((item) => ({ memberId: item.memberId })),
    };
  }

  return {
    amountCents,
    splitMode: 'EQUAL',
    splits: validItems.map((item) => ({ memberId: item.memberId })),
  };
}

function collectWarnings(rawWarnings: unknown, generated: readonly string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();
  const push = (value: string) => {
    const trimmed = value.trim().slice(0, 200).trim();
    if (!trimmed || seen.has(trimmed) || result.length >= MAX_AI_DRAFT_WARNINGS) return;
    seen.add(trimmed);
    result.push(trimmed);
  };
  // Prioritize server-generated degradation warnings so upstream warning floods cannot evict them.
  for (const item of generated) push(item);
  if (Array.isArray(rawWarnings)) {
    for (const item of rawWarnings) if (typeof item === 'string') push(item);
  }
  return result;
}

/** Validate raw AI provider output, filter non-members, enforce integer-cent conservation, and double-check via expenseDraftSchema. */
export function normalizeAiDraftOutput(
  raw: unknown,
  context: NormalizeAiDraftContext,
): ExpenseDraft {
  const obj = rawDraftObjectSchema.safeParse(raw);
  if (!obj.success) {
    throw new AppError('AI_DRAFT_UPSTREAM_ERROR', 'AI 解析结果格式异常，请稍后重试或手动填写', 502);
  }
  const data = obj.data;
  const warnings: string[] = [];

  const title = normalizeStringField(data.title, 60, '标题过长已截断，请核对', warnings);
  const note = normalizeStringField(data.note, 500, '备注过长已截断，请核对', warnings);
  const category = normalizeCategory(data.category, warnings);
  const occurredOn = normalizeOccurredOn(data.occurredOn, context.referenceDate, warnings);

  const parsedAmount = parseCentsValue(data.amountCents, data.amountYuan, false);
  if (parsedAmount.invalid) warnings.push('未能识别有效金额，请手动填写');

  const payerMemberId = resolveMemberId(context.names, data.payerMemberId, data.payerName);
  if (
    payerMemberId === null &&
    ((typeof data.payerMemberId === 'string' && data.payerMemberId.trim() !== '') ||
      (typeof data.payerName === 'string' && data.payerName.trim() !== ''))
  ) {
    warnings.push('未能匹配账本付款人，请手动选择');
  }

  const splitResult = normalizeSplits(
    data.splitMode,
    data.splits,
    parsedAmount.value,
    context.names,
    warnings,
  );

  const candidate = {
    title,
    amountCents: splitResult.amountCents !== null ? splitResult.amountCents.toString() : null,
    category,
    occurredOn,
    payerMemberId,
    splitMode: splitResult.splitMode,
    splits: splitResult.splits,
    note,
    // Always preserve the caller's verified receiptImageId; never trust provider-supplied IDs.
    receiptImageId: context.receiptImageId,
    warnings: collectWarnings(data.warnings, warnings),
  };

  const validated = expenseDraftSchema.safeParse(candidate);
  if (!validated.success) {
    throw new AppError(
      'AI_DRAFT_UPSTREAM_ERROR',
      'AI 解析结果未通过校验，请稍后重试或手动填写',
      502,
    );
  }
  return validated.data;
}
