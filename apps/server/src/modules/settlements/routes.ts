import type { FastifyInstance } from 'fastify';
import { registerOperation } from '../../http/operation.js';
import type { SettlementsService } from './service.js';
export function registerSettlementsRoutes(app: FastifyInstance, service: SettlementsService) {
  registerOperation(app, 'previewSettlement', service.previewSettlement);
  registerOperation(app, 'startSettlement', service.startSettlement);
  registerOperation(app, 'getSettlement', service.getSettlement);
  registerOperation(app, 'markTransferPaid', service.markTransferPaid);
  registerOperation(app, 'settleLedger', service.settleLedger);
}
