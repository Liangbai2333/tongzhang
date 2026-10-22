import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import {
  errorResponseSchema,
  healthResponseSchema,
  readyResponseSchema,
  systemInfoResponseSchema,
} from '@tongzhang/contracts';
import { MONEY_SCALE } from '@tongzhang/domain';
import { AppError } from '../../shared/errors.js';

export const systemRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    '/health/live',
    { schema: { tags: ['system'], response: { 200: healthResponseSchema } } },
    async () => ({
      data: { status: 'ok' as const, service: 'tongzhang-api' as const },
    }),
  );
  app.get(
    '/health/ready',
    {
      schema: {
        tags: ['system'],
        response: { 200: readyResponseSchema, 503: errorResponseSchema },
      },
    },
    async () => {
      try {
        await app.db.check();
      } catch (error) {
        app.log.warn({ err: error }, 'Database readiness check failed');
        throw new AppError('SERVICE_UNAVAILABLE', '数据库暂时不可用', 503);
      }
      return { data: { status: 'ok' as const, database: 'connected' as const } };
    },
  );
  app.get(
    '/api/v1/system/info',
    {
      schema: { tags: ['system'], response: { 200: systemInfoResponseSchema } },
    },
    async () => ({
      data: {
        name: '同账',
        currency: 'CNY',
        minorUnit: MONEY_SCALE,
        maxLedgerMembers: 12,
      } as const,
    }),
  );
};
