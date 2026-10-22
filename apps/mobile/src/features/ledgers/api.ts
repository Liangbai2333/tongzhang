import { operationClient } from '@/lib/api';
export const ledgersApi = {
  createLedger: operationClient('createLedger'),
  listLedgers: operationClient('listLedgers'),
  getLedger: operationClient('getLedger'),
  listMembers: operationClient('listMembers'),
  archiveLedger: operationClient('archiveLedger'),
};
