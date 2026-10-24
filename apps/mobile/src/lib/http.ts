import * as Network from 'expo-network';
import type { z } from 'zod';
import { errorResponseSchema } from '@tongzhang/contracts';
export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3300').replace(
  /\/$/,
  '',
);
import { ApiError } from './api-error';
export { ApiError } from './api-error';
export interface HttpOptions {
  method?: string;
  token?: string | null;
  idempotencyKey?: string;
  body?: unknown;
  formData?: FormData;
  timeoutMs?: number;
}
async function request(
  path: string,
  options: HttpOptions,
  decode: (response: Response) => Promise<unknown>,
): Promise<unknown> {
  if (!__DEV__ && !apiBaseUrl.startsWith('https://'))
    throw new ApiError('INVALID_CONFIGURATION', '安装包需要配置 HTTPS API 地址');
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected === false || state.isInternetReachable === false)
    throw new ApiError('NETWORK_UNAVAILABLE', '网络未连接，请联网后重试');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), options.timeoutMs ?? 10000);
  const headers: Record<string, string> = { Accept: '*/*' };
  if (options.token) headers.Authorization = `Bearer ${options.token}`;
  if (options.idempotencyKey) headers['Idempotency-Key'] = options.idempotencyKey;
  if (options.body !== undefined && !options.formData) headers['Content-Type'] = 'application/json';
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: options.method ?? 'GET',
      headers,
      body:
        options.formData ?? (options.body === undefined ? undefined : JSON.stringify(options.body)),
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(await response.json().catch(() => null));
      throw new ApiError(
        parsed.success ? parsed.data.error.code : 'HTTP_ERROR',
        parsed.success ? parsed.data.error.message : `请求失败（${response.status}）`,
        response.status,
        parsed.success ? parsed.data.error.fieldErrors : undefined,
      );
    }
    return await decode(response);
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(
      controller.signal.aborted ? 'REQUEST_TIMEOUT' : 'NETWORK_ERROR',
      controller.signal.aborted ? '提交结果尚未确认，请核对后重试' : '连接失败，请检查网络',
    );
  } finally {
    clearTimeout(timeout);
  }
}
export async function requestJson<T>(
  path: string,
  schema: z.ZodType<T>,
  options: HttpOptions = {},
): Promise<T> {
  const body = await request(path, options, (response) => response.json());
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new ApiError('INVALID_RESPONSE', '接口返回格式不符合约定');
  return parsed.data;
}
export const getJson = <T>(path: string, schema: z.ZodType<T>) => requestJson(path, schema);
export async function requestImage(
  path: string,
  token: string,
): Promise<{ content: Uint8Array; mimeType: string }> {
  return (await request(path, { token }, async (response) => {
    const mimeType = response.headers.get('content-type')?.split(';')[0] ?? '';
    if (!['image/png', 'image/jpeg'].includes(mimeType))
      throw new ApiError('INVALID_RESPONSE', '图片格式无效');
    return { content: new Uint8Array(await response.arrayBuffer()), mimeType };
  })) as { content: Uint8Array; mimeType: string };
}
