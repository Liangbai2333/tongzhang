import { SignJWT, jwtVerify } from 'jose';
import { uuidSchema } from '@tongzhang/contracts';
import { AppError } from '../../http/errors.js';
import type { Principal } from '../../http/context.js';

export const ACCESS_TOKEN_SECONDS = 15 * 60;
export const SESSION_MILLISECONDS = 30 * 86400000;
export const JWT_ISSUER = 'tongzhang-api';
export const JWT_AUDIENCE = 'tongzhang-mobile';
export function createAccessTokens(secret: string) {
  const key = Buffer.from(secret, 'hex');
  return {
    async issue(principal: Principal, sessionExpiresAt: Date, now = new Date()) {
      const issuedAt = Math.floor(now.getTime() / 1000);
      const expiresAt = Math.min(
        issuedAt + ACCESS_TOKEN_SECONDS,
        Math.floor(sessionExpiresAt.getTime() / 1000),
      );
      if (expiresAt <= issuedAt)
        throw new AppError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
      const accessToken = await new SignJWT({ sid: principal.sessionId })
        .setProtectedHeader({ alg: 'HS256', typ: 'at+jwt' })
        .setSubject(principal.userId)
        .setIssuer(JWT_ISSUER)
        .setAudience(JWT_AUDIENCE)
        .setIssuedAt(issuedAt)
        .setExpirationTime(expiresAt)
        .sign(key);
      return { accessToken, accessTokenExpiresAt: new Date(expiresAt * 1000).toISOString() };
    },
    async verify(token: string, now = new Date()): Promise<Principal> {
      try {
        const { payload } = await jwtVerify(token, key, {
          algorithms: ['HS256'],
          typ: 'at+jwt',
          issuer: JWT_ISSUER,
          audience: JWT_AUDIENCE,
          requiredClaims: ['sub', 'sid', 'iat', 'exp'],
          maxTokenAge: ACCESS_TOKEN_SECONDS,
          currentDate: now,
        });
        const userId = uuidSchema.parse(payload.sub);
        const sessionId = uuidSchema.parse(payload.sid);
        if (
          typeof payload.iat !== 'number' ||
          typeof payload.exp !== 'number' ||
          payload.exp <= payload.iat ||
          payload.exp - payload.iat > ACCESS_TOKEN_SECONDS
        )
          throw new Error('Invalid token lifetime');
        return { userId, sessionId };
      } catch {
        throw new AppError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
      }
    },
  };
}
export type AccessTokens = ReturnType<typeof createAccessTokens>;
