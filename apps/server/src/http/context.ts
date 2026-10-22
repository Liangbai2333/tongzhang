import type { FastifyRequest } from 'fastify';
import type { EndpointParsedInput, EndpointOutput, Operation } from '@tongzhang/contracts';
export interface Principal {
  userId: string;
  sessionId: string;
}
export interface ServiceContext {
  requestId: string;
  principal: Principal | null;
  idempotencyKey?: string;
}
export type Handler<K extends Operation> = (
  input: EndpointParsedInput<K>,
  context: ServiceContext,
) => Promise<EndpointOutput<K>>;
/** Resolves the bearer session; provided by the auth module, consumed by the HTTP adapter. */
export type Authenticator = (request: FastifyRequest) => Promise<Principal>;
