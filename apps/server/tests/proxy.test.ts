import { expect, it } from 'vitest';
import { buildApp } from '../src/app.js';
import { testEnv } from './fixtures/env.js';

it.each([
  ['172.30.0.3', 400],
  ['192.0.2.1', 429],
])(
  'only accepts forwarded client IPs from the configured proxy (%s)',
  async (remoteAddress, expected) => {
    const app = await buildApp({ ...testEnv, TRUST_PROXY: '172.30.0.0/28' });
    try {
      let status;
      for (let i = 1; i <= 11; i++) {
        status = (
          await app.inject({
            method: 'POST',
            url: '/api/v1/auth/login',
            remoteAddress: String(remoteAddress),
            headers: { 'x-forwarded-for': `198.51.100.${i}` },
            payload: { email: 'invalid', password: 'short' },
          })
        ).statusCode;
      }
      expect(status).toBe(expected);
    } finally {
      await app.close();
    }
  },
);
