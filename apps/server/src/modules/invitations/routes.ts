import type { FastifyInstance } from 'fastify';
import { registerOperation } from '../../http/operation.js';
import type { InvitationsService } from './service.js';
export function registerInvitationsRoutes(app: FastifyInstance, service: InvitationsService) {
  registerOperation(app, 'getInvitation', service.getInvitation);
  registerOperation(app, 'resetInvitation', service.resetInvitation);
  registerOperation(app, 'previewJoin', service.previewJoin);
  registerOperation(app, 'joinLedger', service.joinLedger);
}
