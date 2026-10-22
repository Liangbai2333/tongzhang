import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
export interface SettlementsService {
  previewSettlement: Handler<'previewSettlement'>;
  startSettlement: Handler<'startSettlement'>;
  getSettlement: Handler<'getSettlement'>;
  markTransferPaid: Handler<'markTransferPaid'>;
  settleLedger: Handler<'settleLedger'>;
}
export function createSettlementsService(): SettlementsService {
  return {
    previewSettlement: notReady('previewSettlement'),
    startSettlement: notReady('startSettlement'),
    getSettlement: notReady('getSettlement'),
    markTransferPaid: notReady('markTransferPaid'),
    settleLedger: notReady('settleLedger'),
  };
}
