import type { EndpointInput } from '@tongzhang/contracts';
import { endpoints } from '@tongzhang/contracts';
import { callOperation } from '@/lib/api';
import { requestJson } from '@/lib/http';
import { sessionToken } from '@/lib/session-token';

export const authApi = {
  async register(input: EndpointInput<'register'>) {
    const version = await sessionToken.clear();
    const result = await callOperation('register', input);
    await sessionToken.save(result.data, version);
    return result;
  },
  async login(input: EndpointInput<'login'>) {
    const version = await sessionToken.clear();
    const result = await callOperation('login', input);
    await sessionToken.save(result.data, version);
    return result;
  },
  restore: () => callOperation('getMe', { params: {}, query: {}, body: undefined }),
  async logout() {
    const version = sessionToken.version();
    let serverRevoked = false;
    let localCleared = false;
    try {
      const token = await sessionToken.read();
      const result = await requestJson(endpoints.logout.path, endpoints.logout.response, {
        method: 'POST',
        token,
      });
      serverRevoked = result.data.revoked;
    } catch {
      /* Report remote revocation separately from local deletion. */
    }
    try {
      await sessionToken.clear(version);
      localCleared = sessionToken.credentialsCleared();
    } catch {
      /* Keep a visible warning if secure credential deletion fails. */
    }
    return { serverRevoked, localCleared };
  },
};
