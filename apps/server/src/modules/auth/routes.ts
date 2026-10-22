import type { FastifyInstance } from 'fastify';
import { registerOperation } from '../../http/operation.js';
import type { AuthService } from './service.js';
export function registerAuthRoutes(app: FastifyInstance, service: AuthService) {
  registerOperation(app, 'register', service.register);
  registerOperation(app, 'login', service.login);
  registerOperation(app, 'logout', service.logout);
}
