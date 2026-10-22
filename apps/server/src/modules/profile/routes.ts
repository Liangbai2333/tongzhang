import type { FastifyInstance } from 'fastify';
import { registerOperation } from '../../http/operation.js';
import type { ProfileService } from './service.js';
export function registerProfileRoutes(app: FastifyInstance, service: ProfileService) {
  registerOperation(app, 'getMe', service.getMe);
  registerOperation(app, 'updateProfile', service.updateProfile);
  registerOperation(app, 'updatePreferences', service.updatePreferences);
}
