import { operationClient } from '@/lib/api';
export const profileApi = {
  getMe: operationClient('getMe'),
  updateProfile: operationClient('updateProfile'),
  updatePreferences: operationClient('updatePreferences'),
};
