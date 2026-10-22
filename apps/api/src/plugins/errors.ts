import fp from 'fastify-plugin';
import { AppError } from '../shared/errors.js';

export const errorsPlugin = fp(
  async (app) => {
    app.setNotFoundHandler((request, reply) =>
      reply.code(404).send({
        error: { code: 'NOT_FOUND', message: '接口不存在' },
        requestId: request.id,
      }),
    );
    app.setErrorHandler((error, request, reply) => {
      if (error instanceof AppError) {
        return reply.code(error.statusCode).send({
          error: { code: error.code, message: error.message },
          requestId: request.id,
        });
      }
      const details = error !== null && typeof error === 'object' ? error : {};
      if ('validation' in details && details.validation) {
        return reply.code(400).send({
          error: { code: 'VALIDATION_ERROR', message: '请求参数不正确' },
          requestId: request.id,
        });
      }
      const status =
        'statusCode' in details &&
        typeof details.statusCode === 'number' &&
        details.statusCode >= 400 &&
        details.statusCode < 500
          ? details.statusCode
          : 500;
      if (status >= 500) request.log.error({ err: error }, 'Request failed');
      return reply.code(status).send({
        error: {
          code: status >= 500 ? 'INTERNAL_ERROR' : 'BAD_REQUEST',
          message: status >= 500 ? '服务暂时不可用，请稍后重试' : '请求格式不正确',
        },
        requestId: request.id,
      });
    });
  },
  { name: 'errors' },
);
