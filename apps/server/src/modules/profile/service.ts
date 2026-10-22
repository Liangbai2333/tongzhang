import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
import type { Orm } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';
import { findUser } from './repository.js';
import { toUserSelf } from './mapper.js';
export interface ProfileService {
  getMe: Handler<'getMe'>;
  updateProfile: Handler<'updateProfile'>;
  updatePreferences: Handler<'updatePreferences'>;
}
export function createProfileService(db: Orm): ProfileService {
  return {
    getMe: async (_input, { principal }) => {
      if (!principal) throw new AppError('UNAUTHENTICATED', '请先登录', 401);
      const user = await findUser(db, principal.userId);
      if (!user) throw new AppError('UNAUTHENTICATED', '登录已失效，请重新登录', 401);
      return { data: toUserSelf(user) };
    },
    updateProfile: notReady('updateProfile'),
    updatePreferences: notReady('updatePreferences'),
  };
}
