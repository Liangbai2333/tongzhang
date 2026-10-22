import { operationClient } from '@/lib/api';
export const expensesApi = {
  createExpense: operationClient('createExpense'),
  listExpenses: operationClient('listExpenses'),
  getExpense: operationClient('getExpense'),
  updateExpense: operationClient('updateExpense'),
  deleteExpense: operationClient('deleteExpense'),
};
