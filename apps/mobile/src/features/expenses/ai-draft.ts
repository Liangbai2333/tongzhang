import type { Category, ExpenseDraft } from '@tongzhang/contracts';
import { formatYuan } from '@tongzhang/domain';
import { ApiError } from '@/lib/api-error';
import type { Ledger, SplitSettings } from './presentation';

export type ExpenseFormDraftValues = {
  title: string;
  amount: string;
  category: Category;
  date: string;
  payer: string;
  note: string;
  split: SplitSettings;
  existingReceiptId: string | null;
};

export type AiDraftStatus = 'idle' | 'parsing' | 'prefilled' | 'degraded' | 'error';

export type AiDraftErrorKind =
  | 'unavailable'
  | 'upstream_error'
  | 'frozen'
  | 'validation'
  | 'forbidden'
  | 'unauthenticated'
  | 'network'
  | 'unknown';

export type AiDraftErrorFeedback = {
  kind: AiDraftErrorKind;
  message: string;
  actionLabel?: string;
  preservesForm: true;
  autoRetry: false;
  manualRetryAllowed: boolean;
};

export type AppliedExpenseDraft = {
  values: ExpenseFormDraftValues;
  warnings: string[];
  appliedFields: Array<keyof ExpenseFormDraftValues>;
};

/**
 * Prefill editable ExpenseForm state from an A31 draft response.
 * Never persists to the server; the user must inspect and explicitly trigger A13 createExpense.
 */
export function applyExpenseDraftToForm(
  draft: ExpenseDraft,
  ledger: Ledger,
  current: ExpenseFormDraftValues,
): AppliedExpenseDraft {
  const memberIds = new Set(ledger.members.map((m) => m.id));
  const warnings = [...draft.warnings];
  const appliedFields: Array<keyof ExpenseFormDraftValues> = [];

  let title = current.title;
  if (draft.title !== null) {
    title = draft.title;
    appliedFields.push('title');
  }

  let amount = current.amount;
  if (draft.amountCents !== null) {
    amount = formatYuan(BigInt(draft.amountCents));
    appliedFields.push('amount');
  }

  const category = draft.category;
  appliedFields.push('category');

  let date = current.date;
  if (draft.occurredOn !== null) {
    date = draft.occurredOn;
    appliedFields.push('date');
  }

  let payer = current.payer;
  if (draft.payerMemberId !== null && memberIds.has(draft.payerMemberId)) {
    payer = draft.payerMemberId;
    appliedFields.push('payer');
  }

  let note = current.note;
  if (draft.note !== null) {
    note = draft.note;
    appliedFields.push('note');
  }

  let existingReceiptId = current.existingReceiptId;
  if (draft.receiptImageId !== null) {
    existingReceiptId = draft.receiptImageId;
    appliedFields.push('existingReceiptId');
  }

  const split = splitSettingsFromDraft(draft, ledger, current.split, memberIds, warnings);
  appliedFields.push('split');

  return {
    values: { title, amount, category, date, payer, note, split, existingReceiptId },
    warnings,
    appliedFields,
  };
}

function splitSettingsFromDraft(
  draft: ExpenseDraft,
  ledger: Ledger,
  current: SplitSettings,
  memberIds: Set<string>,
  warnings: string[],
): SplitSettings {
  const allMembers = ledger.members.map((m) => m.id);
  const validIds = draft.splits.map((s) => s.memberId).filter((id) => memberIds.has(id));

  if (draft.splitMode === 'EQUAL') {
    const resolved =
      validIds.length > 0
        ? validIds
        : current.memberIds.length > 0
          ? current.memberIds
          : allMembers;
    return { mode: 'EQUAL', memberIds: resolved, values: {} };
  }

  if (validIds.length !== draft.splits.length || validIds.length === 0) {
    warnings.push('草稿中包含非当前账本成员，分摊方式已回退为当前人均设置，请手动核对');
    return { mode: 'EQUAL', memberIds: allMembers, values: {} };
  }

  const values: Record<string, string> = {};
  if (draft.splitMode === 'SHARES') {
    for (const s of draft.splits) values[s.memberId] = String(s.shares);
    return { mode: 'SHARES', memberIds: validIds, values };
  }

  for (const s of draft.splits) values[s.memberId] = formatYuan(BigInt(s.amountCents));
  return { mode: 'AMOUNT', memberIds: validIds, values };
}

/**
 * Map A31 parseExpenseDraft failures to user-facing guidance.
 * All branches keep existing form input intact and forbid automatic retries.
 */
export function aiDraftErrorFeedback(error: unknown): AiDraftErrorFeedback {
  if (!(error instanceof ApiError)) {
    return {
      kind: 'unknown',
      message: 'AI 解析暂时失败，已保留当前输入，请手动填写或稍后重试。',
      preservesForm: true,
      autoRetry: false,
      manualRetryAllowed: true,
    };
  }
  switch (error.code) {
    case 'AI_DRAFT_UNAVAILABLE':
      return {
        kind: 'unavailable',
        message: '服务端暂未启用 AI 辅助记账，已保留当前输入，请直接手动填写消费。',
        preservesForm: true,
        autoRetry: false,
        manualRetryAllowed: false,
      };
    case 'AI_DRAFT_UPSTREAM_ERROR':
      return {
        kind: 'upstream_error',
        message: 'AI 解析服务暂时不可用，已保留当前输入与收据，可手动重试或直接手工填写。',
        actionLabel: '手动重试解析',
        preservesForm: true,
        autoRetry: false,
        manualRetryAllowed: true,
      };
    case 'LEDGER_FROZEN':
      return {
        kind: 'frozen',
        message: '账本已进入结算或结清状态，无法继续记账。',
        actionLabel: '刷新账本状态',
        preservesForm: true,
        autoRetry: false,
        manualRetryAllowed: false,
      };
    case 'IMAGE_INVALID':
    case 'VALIDATION_ERROR':
      return {
        kind: 'validation',
        message: error.message || '请检查记账文本或重新选择收据图片后再试。',
        preservesForm: true,
        autoRetry: false,
        manualRetryAllowed: true,
      };
    case 'FORBIDDEN':
      return {
        kind: 'forbidden',
        message: error.message || '你没有权限操作此账本。',
        preservesForm: true,
        autoRetry: false,
        manualRetryAllowed: false,
      };
    case 'UNAUTHENTICATED':
      return {
        kind: 'unauthenticated',
        message: '登录状态已失效，同账号重新核验后将保留当前表单输入，请手动重新发起解析。',
        preservesForm: true,
        autoRetry: false,
        manualRetryAllowed: false,
      };
    case 'REQUEST_TIMEOUT':
    case 'NETWORK_ERROR':
      return {
        kind: 'network',
        message: '网络异常，AI 解析未完成，已保留当前输入，请检查网络后手动重试或手工填写。',
        actionLabel: '手动重试解析',
        preservesForm: true,
        autoRetry: false,
        manualRetryAllowed: true,
      };
    default:
      return {
        kind: 'unknown',
        message: error.message || 'AI 解析暂时失败，已保留当前输入，请手动填写或稍后重试。',
        preservesForm: true,
        autoRetry: false,
        manualRetryAllowed: true,
      };
  }
}
