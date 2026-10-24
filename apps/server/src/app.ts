import { randomUUID } from 'node:crypto';
import Fastify from 'fastify';
import swagger from '@fastify/swagger';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import swaggerUi from '@fastify/swagger-ui';
import { MAX_IMAGE_BYTES } from '@tongzhang/contracts';
import {
  validatorCompiler,
  serializerCompiler,
  jsonSchemaTransform,
} from 'fastify-type-provider-zod';
import { databaseConfig, type Env } from './config/env.js';
import { createDatabase, type Database } from './db/client.js';
import { databasePlugin } from './db/plugin.js';
import { errorsPlugin } from './http/errors.js';
import { systemRoutes } from './http/system.js';
import { registerBusinessModules } from './modules/index.js';

export async function buildApp(env: Env, database: Database = createDatabase(databaseConfig(env))) {
  const app = Fastify({
    trustProxy: env.TRUST_PROXY || false,
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
      openapi: {
        info: { title: '同账 API', version: '0.1.0' },
        components: { securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } } },
      },
      transform: jsonSchemaTransform,
    });
    await app.register(swaggerUi, { routePrefix: '/docs' });
  }
  await app.register(multipart, {
    limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 2, parts: 3 },
  });
  await app.register(rateLimit, { global: false });
  await app.register(systemRoutes);
  registerBusinessModules(app, env.AUTH_JWT_SECRET);
  return app;
}
