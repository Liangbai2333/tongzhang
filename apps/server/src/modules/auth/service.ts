import type { Handler } from '../../http/context.js';
import { withTransaction, type Orm } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';
import { toUserSelf } from '../profile/index.js';
import { hashPassword, issueSessionToken, verifyPassword } from './credentials.js';
import { findLoginUsers, insertSession, insertUser, revokeSession } from './repository.js';
export interface AuthService {
  register: Handler<'register'>;
  login: Handler<'login'>;
  logout: Handler<'logout'>;
}
// Unknown accounts still run Argon2 verification. Never persist this dummy credential.
let dummyHash: Promise<string> | undefined;
export function createAuthService(db: Orm): AuthService {
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
        const issued = issueSessionToken();
        await insertSession(tx, {
          userId: user.id,
          tokenHash: issued.tokenHash,
          expiresAt: issued.expiresAt,
        });
        return {
          data: {
            user: toUserSelf(user),
            token: issued.token,
            expiresAt: issued.expiresAt.toISOString(),
          },
        };
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
      return withTransaction(db, async (tx) => {
        const issued = issueSessionToken();
        await insertSession(tx, {
          userId: user.id,
          tokenHash: issued.tokenHash,
          expiresAt: issued.expiresAt,
        });
        return {
          data: {
            user: toUserSelf(user),
            token: issued.token,
            expiresAt: issued.expiresAt.toISOString(),
          },
        };
      });
    },
    logout: async (_input, { principal }) => {
      if (!principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      await withTransaction(db, (tx) => revokeSession(tx, principal.sessionId, principal.userId));
      return { data: { revoked: true } };
    },
  };
}
