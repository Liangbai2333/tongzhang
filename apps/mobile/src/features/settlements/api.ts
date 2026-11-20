import { operationClient } from '@/lib/api';
export const settlementsApi = {
  previewSettlement: operationClient('previewSettlement'),
  startSettlement: operationClient('startSettlement'),
  getSettlement: operationClient('getSettlement'),
  markTransferPaid: operationClient('markTransferPaid'),
  remindTransfer: operationClient('remindTransfer'),
  settleLedger: operationClient('settleLedger'),
};
