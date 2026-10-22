import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import {
  endpoints,
  errorResponseSchema,
  uuidSchema,
  type Operation,
  type EndpointParsedInput,
} from '@tongzhang/contracts';
import type { Authenticator, Handler, ServiceContext } from './context.js';
import { AppError } from './errors.js';
export function registerOperation<K extends Operation>(
  app: FastifyInstance,
  operation: K,
  handler: Handler<K>,
) {
  const endpoint = endpoints[operation];
  if (endpoint.authenticated && !app.hasDecorator('authenticate'))
    throw new Error(`${operation} 需要认证，注册路由前必须提供 app.authenticate`);
  app.route({
    method: endpoint.method,
    url: endpoint.path,
    config: { rateLimit: { max: endpoint.authenticated ? 120 : 10, timeWindow: '1 minute' } },
    schema: {
      tags: [endpoint.module],
      operationId: endpoint.id,
      params: endpoint.input.shape.params,
      querystring: endpoint.input.shape.query,
      ...(endpoint.transport !== 'multipart' &&
      !(endpoint.input.shape.body instanceof z.ZodUndefined)
        ? { body: endpoint.input.shape.body }
        : {}),
      ...(endpoint.authenticated ? { security: [{ bearerAuth: [] }] } : {}),
      response: {
        ...(endpoint.transport === 'binary' ? {} : { [endpoint.statusCode]: endpoint.response }),
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        409: errorResponseSchema,
        413: errorResponseSchema,
        429: errorResponseSchema,
        501: errorResponseSchema,
      },
    },
    // Verify before processing potentially large request bodies.
    onRequest: async (request) => {
      if (endpoint.authenticated) request.principal = await app.authenticate(request);
    },
    onSend: async (_request, reply) => {
      reply.header('Cache-Control', 'no-store');
    },
    handler: async (request, reply) => {
      const context: ServiceContext = {
        requestId: request.id,
        principal: request.principal ?? null,
      };
      if (endpoint.idempotent) {
        const key = uuidSchema.safeParse(request.headers['idempotency-key']);
        if (!key.success) throw new AppError('VALIDATION_ERROR', '缺少有效的 Idempotency-Key', 400);
        context.idempotencyKey = key.data;
      }
      let body: unknown = request.body;
      let file: unknown;
      if (endpoint.transport === 'multipart') {
        const fields: Record<string, string> = {};
        for await (const part of request.parts()) {
          if (part.type === 'file') {
            if (part.fieldname !== 'file' || file)
              throw new AppError('IMAGE_INVALID', '只接受一张图片', 400);
            const content = await part.toBuffer();
            file = { content, mimeType: part.mimetype, filename: part.filename };
          } else {
            if (typeof part.value !== 'string' || part.fieldname in fields)
              throw new AppError('IMAGE_INVALID', '图片字段无效', 400);
            fields[part.fieldname] = part.value;
          }
        }
        body = fields;
      }
      // Fastify has already parsed params/query/JSON body, including transforms.
      // Multipart metadata is parsed here because its stream bypasses JSON validation.
      let input: unknown = { params: request.params, query: request.query, body, file };
      if (endpoint.transport === 'multipart') {
        const parsed = endpoint.input.safeParse(input);
        if (!parsed.success) throw new AppError('VALIDATION_ERROR', '请检查填写内容', 400);
        input = parsed.data;
      } else if (endpoint.input.shape.body instanceof z.ZodUndefined && body !== undefined) {
        throw new AppError('VALIDATION_ERROR', '该接口不接受请求体', 400);
      }
      const result = await handler(input as EndpointParsedInput<K>, context);
      const validated = endpoint.response.parse(result);
      if (endpoint.transport === 'binary') {
        const image = z
          .object({ content: z.instanceof(Uint8Array), mimeType: z.string() })
          .parse(validated);
        return reply
          .header('Cache-Control', 'no-store')
          .type(image.mimeType)
          .send(Buffer.from(image.content));
      }
      return (reply as FastifyReply).code(endpoint.statusCode).send(validated);
    },
  });
}
declare module 'fastify' {
  interface FastifyInstance {
    authenticate: Authenticator;
  }
  interface FastifyRequest {
    principal?: ServiceContext['principal'];
  }
}
