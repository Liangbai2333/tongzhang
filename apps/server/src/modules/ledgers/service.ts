import type { Handler } from '../../http/context.js';
import { notReady } from '../../http/not-ready.js';
export interface LedgersService {
  createLedger: Handler<'createLedger'>;
  listLedgers: Handler<'listLedgers'>;
  getLedger: Handler<'getLedger'>;
  listMembers: Handler<'listMembers'>;
  archiveLedger: Handler<'archiveLedger'>;
}
export function createLedgersService(): LedgersService {
  return {
    createLedger: notReady('createLedger'),
    listLedgers: notReady('listLedgers'),
    getLedger: notReady('getLedger'),
    listMembers: notReady('listMembers'),
    archiveLedger: notReady('archiveLedger'),
  };
}
