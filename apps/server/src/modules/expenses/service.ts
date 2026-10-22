import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
export interface ExpensesService {
  createExpense: Handler<'createExpense'>;
  listExpenses: Handler<'listExpenses'>;
  getExpense: Handler<'getExpense'>;
  updateExpense: Handler<'updateExpense'>;
  deleteExpense: Handler<'deleteExpense'>;
}
export function createExpensesService(): ExpensesService {
  return {
    createExpense: notReady('createExpense'),
    listExpenses: notReady('listExpenses'),
    getExpense: notReady('getExpense'),
    updateExpense: notReady('updateExpense'),
    deleteExpense: notReady('deleteExpense'),
  };
}
