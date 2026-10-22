import type { FastifyInstance } from 'fastify';
import { registerOperation } from '../../http/operation.js';
import type { ExpensesService } from './service.js';
export function registerExpensesRoutes(app: FastifyInstance, service: ExpensesService) {
  registerOperation(app, 'createExpense', service.createExpense);
  registerOperation(app, 'listExpenses', service.listExpenses);
  registerOperation(app, 'getExpense', service.getExpense);
  registerOperation(app, 'updateExpense', service.updateExpense);
  registerOperation(app, 'deleteExpense', service.deleteExpense);
}
