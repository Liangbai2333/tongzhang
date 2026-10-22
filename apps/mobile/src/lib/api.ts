import {
  endpoints,
  uuidSchema,
  type EndpointInput,
  type EndpointOutput,
  type Operation,
} from '@tongzhang/contracts';
import { randomUUID } from 'expo-crypto';
import { ApiError, requestJson } from './http';
import { sessionToken } from './session-token';
export type JsonOperation = Exclude<Operation, 'uploadImage' | 'getImage'>;
export interface CallOptions {
  idempotencyKey?: string;
}
/** Generate once per submitted form, retain this key when the result is unknown. */
export const createIdempotencyKey = () => randomUUID();
export async function callOperation<K extends JsonOperation>(
  operation: K,
  input: EndpointInput<K>,
  options: CallOptions = {},
): Promise<EndpointOutput<K>> {
  const endpoint = endpoints[operation];
  const parsed = endpoint.input.safeParse(input);
  if (!parsed.success) throw new ApiError('VALIDATION_ERROR', '请检查填写内容');
  if (endpoint.idempotent && !uuidSchema.safeParse(options.idempotencyKey).success)
    throw new ApiError('VALIDATION_ERROR', '提交需要稳定的请求标识');
  const token = endpoint.authenticated ? await sessionToken.read() : null;
  if (endpoint.authenticated && !token) throw new ApiError('UNAUTHENTICATED', '请先登录');
  let path: string = endpoint.path;
  for (const [key, value] of Object.entries(parsed.data.params))
    path = path.replace(`:${key}`, encodeURIComponent(String(value)));
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(parsed.data.query))
    if (value !== undefined) query.set(key, String(value));
  if (query.size) path += `?${query}`;
  return (await requestJson<unknown>(path, endpoint.response, {
    method: endpoint.method,
    token,
    body: parsed.data.body,
    idempotencyKey: options.idempotencyKey,
  })) as EndpointOutput<K>;
}
export function operationClient<K extends JsonOperation>(operation: K) {
  return (input: EndpointInput<K>, options?: CallOptions) =>
    callOperation(operation, input, options);
}
