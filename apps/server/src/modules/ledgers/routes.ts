import type { FastifyInstance } from 'fastify';
import { registerOperation } from '../../http/operation.js';
import type { LedgersService } from './service.js';
export function registerLedgersRoutes(app: FastifyInstance, service: LedgersService) {
  registerOperation(app, 'createLedger', service.createLedger);
  registerOperation(app, 'listLedgers', service.listLedgers);
  registerOperation(app, 'getLedger', service.getLedger);
  registerOperation(app, 'listMembers', service.listMembers);
  registerOperation(app, 'archiveLedger', service.archiveLedger);
}
