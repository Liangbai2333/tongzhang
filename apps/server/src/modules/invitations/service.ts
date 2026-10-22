import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
export interface InvitationsService {
  getInvitation: Handler<'getInvitation'>;
  resetInvitation: Handler<'resetInvitation'>;
  previewJoin: Handler<'previewJoin'>;
  joinLedger: Handler<'joinLedger'>;
}
export function createInvitationsService(): InvitationsService {
  return {
    getInvitation: notReady('getInvitation'),
    resetInvitation: notReady('resetInvitation'),
    previewJoin: notReady('previewJoin'),
    joinLedger: notReady('joinLedger'),
  };
}
