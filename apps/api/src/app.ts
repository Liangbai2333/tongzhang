import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import {
  validatorCompiler,
  serializerCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod';
import type { Env } from './config/env.js';
import { createDatabase, type Database } from './db/client.js';
import { databasePlugin } from './plugins/database.js';
import { errorsPlugin } from './plugins/errors.js';
import { systemRoutes } from './modules/system/index.js';

export async function buildApp(env: Env, database: Database = createDatabase(env.DATABASE_URL)) {
  const app = Fastify({
    genReqId: () => randomUUID(),
    logger: { level: env.LOG_LEVEL, redact: ['req.headers.authorization', 'req.headers.cookie'] },
    bodyLimit: 1_100_000,
  });
  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);
  await app.register(errorsPlugin);
  await app.register(databasePlugin, { database });
  if (env.NODE_ENV !== 'production') {
    await app.register(swagger, {
      openapi: { info: { title: '同账 API', version: '0.1.0' } },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }
  await app.register(systemRoutes);
  return app;
}
