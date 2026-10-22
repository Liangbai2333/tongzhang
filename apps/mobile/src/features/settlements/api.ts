import { operationClient } from '@/lib/api';
export const settlementsApi = {
  previewSettlement: operationClient('previewSettlement'),
  startSettlement: operationClient('startSettlement'),
  getSettlement: operationClient('getSettlement'),
  markTransferPaid: operationClient('markTransferPaid'),
  settleLedger: operationClient('settleLedger'),
};
