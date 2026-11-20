import type { EndpointInput } from '@tongzhang/contracts';
import { callOperation, operationClient, type CallOptions } from '@/lib/api';

const AI_DRAFT_TIMEOUT_MS = 30000;

export const expensesApi = {
  createExpense: operationClient('createExpense'),
  listExpenses: operationClient('listExpenses'),
  getExpense: operationClient('getExpense'),
  updateExpense: operationClient('updateExpense'),
  deleteExpense: operationClient('deleteExpense'),
  parseExpenseDraft: (input: EndpointInput<'parseExpenseDraft'>, options?: CallOptions) =>
    callOperation('parseExpenseDraft', input, { timeoutMs: AI_DRAFT_TIMEOUT_MS, ...options }),
};
