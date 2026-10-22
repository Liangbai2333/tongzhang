import * as Network from 'expo-network';
import type { z } from 'zod';
import { errorResponseSchema } from '@tongzhang/contracts';

export const apiBaseUrl = (process.env.EXPO_PUBLIC_API_BASE_URL ?? 'http://localhost:3300').replace(
  /\/$/,
  '',
);

export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function getJson<T>(path: string, schema: z.ZodType<T>): Promise<T> {
  if (!__DEV__ && !apiBaseUrl.startsWith('https://')) {
    throw new ApiError('INVALID_CONFIGURATION', '安装包需要配置 HTTPS API 地址');
  }
  const state = await Network.getNetworkStateAsync();
  if (state.isConnected === false || state.isInternetReachable === false) {
    throw new ApiError('NETWORK_OFFLINE', '网络未连接，请联网后重试');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      signal: controller.signal,
      headers: { Accept: 'application/json' },
    });
    const body: unknown = await response.json();
    if (!response.ok) {
      const parsed = errorResponseSchema.safeParse(body);
      throw new ApiError(
        parsed.success ? parsed.data.error.code : 'HTTP_ERROR',
        parsed.success ? parsed.data.error.message : `请求失败（${response.status}）`,
      );
    }
    const parsed = schema.safeParse(body);
    if (!parsed.success) throw new ApiError('INVALID_RESPONSE', '接口返回格式不符合约定');
    return parsed.data;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError('NETWORK_ERROR', '连接失败，请检查服务地址与网络后重试');
  } finally {
    clearTimeout(timeout);
  }
}
