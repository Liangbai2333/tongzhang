import type { Handler } from '../../http/context.js';
import { withTransaction, type Orm, type Transaction } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';
import { toUserSelf } from '../profile/index.js';
import { digestToken, hashPassword, issueRefreshToken, verifyPassword } from './credentials.js';
import {
  consumeRefreshToken,
  findLoginUsers,
  insertRefreshToken,
  insertSession,
  insertUser,
  lockRefreshSession,
  revokeSession,
} from './repository.js';
import { SESSION_MILLISECONDS, type AccessTokens } from './tokens.js';
export interface AuthService {
  register: Handler<'register'>;
  login: Handler<'login'>;
  logout: Handler<'logout'>;
  refresh: Handler<'refresh'>;
}
// Unknown accounts still run Argon2 verification. Never persist this dummy credential.
let dummyHash: Promise<string> | undefined;
export function createAuthService(db: Orm, tokens: AccessTokens): AuthService {
  async function newSession(tx: Transaction, userId: string) {
    const now = new Date();
    const expiresAt = new Date(now.getTime() + SESSION_MILLISECONDS);
    const [session] = await insertSession(tx, { userId, expiresAt, createdAt: now });
    const issued = issueRefreshToken();
    await insertRefreshToken(tx, session!.id, issued.tokenHash);
    return {
      ...(await tokens.issue({ userId, sessionId: session!.id }, expiresAt, now)),
      refreshToken: issued.token,
      refreshTokenExpiresAt: expiresAt.toISOString(),
    };
  }
  return {
    register: async ({ body }) => {
      const passwordHash = await hashPassword(body.password);
      return withTransaction(db, async (tx) => {
        const user = await insertUser(tx, {
          username: body.username,
          email: body.email,
          passwordHash,
        });
        if (!user) throw new AppError('EMAIL_TAKEN', '该邮箱已注册，请登录或使用其他邮箱', 409);
        return { data: { user: toUserSelf(user), ...(await newSession(tx, user.id)) } };
      });
    },
    login: async ({ body }) => {
      const candidates = await findLoginUsers(db, body.account);
      if (candidates.length > 1)
        throw new AppError('ACCOUNT_AMBIGUOUS', '该用户名有重名，请使用邮箱登录', 409);
      const user = candidates[0];
      const encoded =
        user?.passwordHash ?? (await (dummyHash ??= hashPassword('unused-account-credential')));
      const valid = await verifyPassword(encoded, body.password);
      if (!user || !valid) throw new AppError('INVALID_CREDENTIALS', '账号或密码错误', 401);
      return withTransaction(db, async (tx) => ({
        data: { user: toUserSelf(user), ...(await newSession(tx, user.id)) },
      }));
    },
    refresh: async ({ body }) => {
      const result = await withTransaction(db, async (tx) => {
        const tokenHash = digestToken(body.refreshToken);
        const found = await lockRefreshSession(tx, tokenHash);
        const now = new Date();
        if (!found || found.session.revokedAt || found.session.expiresAt <= now) return null;
        const { session, token } = found;
        if (token.consumedAt) {
          // Return, then throw outside the transaction: the revocation must commit.
          await revokeSession(tx, session.id, session.userId);
          return null;
        }
        await consumeRefreshToken(tx, tokenHash, now);
        const issued = issueRefreshToken();
        await insertRefreshToken(tx, session.id, issued.tokenHash);
        return {
          ...(await tokens.issue(
            { userId: session.userId, sessionId: session.id },
            session.expiresAt,
            now,
          )),
          refreshToken: issued.token,
          refreshTokenExpiresAt: session.expiresAt.toISOString(),
        };
      });
      if (!result) throw new AppError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
      return { data: result };
    },
    logout: async (_input, { principal }) => {
      if (!principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      await withTransaction(db, (tx) => revokeSession(tx, principal.sessionId, principal.userId));
      return { data: { revoked: true } };
    },
  };
}
