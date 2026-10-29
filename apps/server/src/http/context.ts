import type { FastifyRequest } from 'fastify';
import type {
  endpoints,
  EndpointParsedInput,
  EndpointOutput,
  Operation,
} from '@tongzhang/contracts';
export interface Principal {
  userId: string;
  sessionId: string;
}
type Endpoint<K extends Operation> = (typeof endpoints)[K];
/**
 * The HTTP adapter authenticates and validates Idempotency-Key per endpoint before
 * calling a handler, so handlers receive these guarantees in their context type.
 */
export interface ServiceContext<K extends Operation = Operation> {
  requestId: string;
  principal: Endpoint<K>['authenticated'] extends true ? Principal : Principal | null;
  idempotencyKey: Endpoint<K>['idempotent'] extends true ? string : string | undefined;
}
export type Handler<K extends Operation> = (
  input: EndpointParsedInput<K>,
  context: ServiceContext<K>,
) => Promise<EndpointOutput<K>>;
/** Resolves the bearer session; provided by the auth module, consumed by the HTTP adapter. */
export type Authenticator = (request: FastifyRequest) => Promise<Principal>;
