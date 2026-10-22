import type { FastifyInstance } from 'fastify';
import { registerOperation } from '../../http/operation.js';
import type { BalancesService } from './service.js';
export function registerBalancesRoutes(app: FastifyInstance, service: BalancesService) {
  registerOperation(app, 'getBalances', service.getBalances);
  registerOperation(app, 'getStatistics', service.getStatistics);
}
