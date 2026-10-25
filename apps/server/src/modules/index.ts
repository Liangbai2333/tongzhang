import type { FastifyInstance } from 'fastify';
import {
  createAuthenticator,
  registerAuthRoutes,
  createAuthService,
  createAccessTokens,
} from './auth/index.js';
import { registerBalancesRoutes, createBalancesService } from './balances/index.js';
import { registerExpensesRoutes, createExpensesService } from './expenses/index.js';
import { registerImagesRoutes, createImagesService } from './images/index.js';
import { registerInvitationsRoutes, createInvitationsService } from './invitations/index.js';
import { registerLedgersRoutes, createLedgersService } from './ledgers/index.js';
import { registerProfileRoutes, createProfileService } from './profile/index.js';
import { registerSettlementsRoutes, createSettlementsService } from './settlements/index.js';
export function registerBusinessModules(app: FastifyInstance, jwtSecret: string) {
  const tokens = createAccessTokens(jwtSecret);
  // Protected routes resolve the bearer session through this decorator.
  app.decorate('authenticate', createAuthenticator(app.db.orm, tokens));
  registerAuthRoutes(app, createAuthService(app.db.orm, tokens));
  registerProfileRoutes(app, createProfileService(app.db.orm));
  registerLedgersRoutes(app, createLedgersService(app.db.orm));
  registerInvitationsRoutes(app, createInvitationsService(app.db.orm));
  registerExpensesRoutes(app, createExpensesService(app.db.orm));
  registerImagesRoutes(app, createImagesService(app.db.orm));
  registerBalancesRoutes(app, createBalancesService(app.db.orm));
  registerSettlementsRoutes(app, createSettlementsService(app.db.orm));
}
