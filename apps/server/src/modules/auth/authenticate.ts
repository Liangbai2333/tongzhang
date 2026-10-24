import type { DatabaseExecutor } from '../../db/transaction.js';
import type { Authenticator } from '../../http/context.js';
import { AppError } from '../../http/errors.js';
import type { AccessTokens } from './tokens.js';
import { findActiveSession } from './repository.js';
export function createAuthenticator(db: DatabaseExecutor, tokens: AccessTokens): Authenticator {
  return async (request) => {
    const token = /^Bearer ([A-Za-z0-9_.-]{1,2048})$/.exec(
      request.headers.authorization ?? '',
    )?.[1];
    if (!token) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
    const principal = await tokens.verify(token);
    const session = await findActiveSession(db, principal.sessionId, principal.userId);
    if (!session) throw new AppError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
    return { userId: session.userId, sessionId: session.id };
  };
}
