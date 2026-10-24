import { randomUUID } from 'node:crypto';
import { SignJWT, decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  ACCESS_TOKEN_SECONDS,
  createAccessTokens,
  JWT_AUDIENCE,
  JWT_ISSUER,
} from '../src/modules/auth/tokens.js';

const secret = 'ca'.repeat(32);
const tokens = createAccessTokens(secret);
const principal = { userId: randomUUID(), sessionId: randomUUID() };
const now = new Date('2026-10-24T00:00:00Z');
const expires = new Date(now.getTime() + 30 * 86400000);

describe('access JWT validation', () => {
  it('binds identity and session, expires in 15 minutes, and rejects tampering or expiry', async () => {
    const pair = await tokens.issue(principal, expires, now);
    expect(await tokens.verify(pair.accessToken, now)).toEqual(principal);
    expect(decodeJwt(pair.accessToken).exp! - decodeJwt(pair.accessToken).iat!).toBe(
      ACCESS_TOKEN_SECONDS,
    );
    expect(Object.keys(decodeJwt(pair.accessToken)).sort()).toEqual([
      'aud',
      'exp',
      'iat',
      'iss',
      'sid',
      'sub',
    ]);
    await expect(
      tokens.verify(pair.accessToken, new Date(now.getTime() + 900_000)),
    ).rejects.toMatchObject({ statusCode: 401 });
    await expect(
      createAccessTokens('cb'.repeat(32)).verify(pair.accessToken, now),
    ).rejects.toMatchObject({ statusCode: 401 });
    const parts = pair.accessToken.split('.');
    parts[1] = Buffer.from(
      JSON.stringify({ ...decodeJwt(pair.accessToken), sub: randomUUID() }),
    ).toString('base64url');
    await expect(tokens.verify(parts.join('.'), now)).rejects.toMatchObject({ statusCode: 401 });
  });
  it('caps access lifetime at absolute session expiry', async () => {
    const end = new Date(now.getTime() + 65_000);
    const pair = await tokens.issue(principal, end, now);
    expect(pair.accessTokenExpiresAt).toBe(end.toISOString());
    await expect(tokens.issue(principal, new Date(now.getTime() + 999), now)).rejects.toMatchObject(
      { statusCode: 401 },
    );
  });
  it.each([
    'issuer',
    'audience',
    'algorithm',
    'type',
    'subject',
    'session',
    'missing-exp',
    'future-iat',
    'long-exp',
  ])('rejects a signed JWT with invalid %s', async (invalid) => {
    const issuedAt = Math.floor(now.getTime() / 1000);
    const jwt = new SignJWT({ sid: invalid === 'session' ? 'not-uuid' : principal.sessionId })
      .setProtectedHeader({
        alg: invalid === 'algorithm' ? 'HS384' : 'HS256',
        typ: invalid === 'type' ? 'JWT' : 'at+jwt',
      })
      .setIssuer(invalid === 'issuer' ? 'other' : JWT_ISSUER)
      .setAudience(invalid === 'audience' ? 'other' : JWT_AUDIENCE)
      .setSubject(invalid === 'subject' ? 'not-uuid' : principal.userId)
      .setIssuedAt(issuedAt + (invalid === 'future-iat' ? 60 : 0));
    if (invalid !== 'missing-exp')
      jwt.setExpirationTime(issuedAt + (invalid === 'long-exp' ? 3600 : 900));
    const token = await jwt.sign(Buffer.from(secret, 'hex'));
    await expect(tokens.verify(token, now)).rejects.toMatchObject({ statusCode: 401 });
  });
});
