import { operationClient } from '@/lib/api';
export const authApi = {
  register: operationClient('register'),
  login: operationClient('login'),
  logout: operationClient('logout'),
};
