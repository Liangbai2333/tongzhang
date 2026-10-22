import { operationClient } from '@/lib/api';
export const invitationsApi = {
  getInvitation: operationClient('getInvitation'),
  resetInvitation: operationClient('resetInvitation'),
  previewJoin: operationClient('previewJoin'),
  joinLedger: operationClient('joinLedger'),
};
