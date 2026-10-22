import type { LedgerStatus } from '@tongzhang/contracts';
import { AppError } from '../../http/errors.js';
export interface LedgerAccess {
  status: LedgerStatus;
  memberId: string;
  isCreator: boolean;
}
export function requireActive(access: LedgerAccess) {
  if (access.status !== 'ACTIVE')
    throw new AppError('LEDGER_FROZEN', '账本已进入结算，无法修改', 409);
}
export function requireCreator(access: LedgerAccess) {
  if (!access.isCreator) throw new AppError('FORBIDDEN', '你没有权限执行此操作', 403);
}
export function requireExpenseEditor(access: LedgerAccess, recorderMemberId: string) {
  requireActive(access);
  if (!access.isCreator && access.memberId !== recorderMemberId)
    throw new AppError('FORBIDDEN', '你没有权限执行此操作', 403);
}
export function requireTransferRegistrar(access: LedgerAccess, payerMemberId: string) {
  if (access.status !== 'SETTLING')
    throw new AppError('LEDGER_STATE_INVALID', '当前账本状态不支持此操作', 409);
  if (!access.isCreator && access.memberId !== payerMemberId)
    throw new AppError('FORBIDDEN', '你没有权限执行此操作', 403);
}
