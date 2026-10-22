import { operationClient } from '@/lib/api';
export const balancesApi = {
  getBalances: operationClient('getBalances'),
  getStatistics: operationClient('getStatistics'),
};
