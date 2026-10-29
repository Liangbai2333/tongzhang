import { expect, it, jest } from '@jest/globals';
import { sessionToken } from '../src/lib/session-token';

const mockDelete = jest.fn<(key: string) => Promise<void>>();
jest.mock('expo-secure-store', () => ({
  deleteItemAsync: (key: string) => mockDelete(key),
}));
jest.mock('../src/lib/http', () => ({ requestJson: jest.fn() }));

it('reports credentials as cleared only after the refresh-token deletion succeeds', async () => {
  const failure = new Error('secure store unavailable');
  mockDelete.mockRejectedValueOnce(failure);
  await expect(sessionToken.clear()).rejects.toBe(failure);
  expect(mockDelete).toHaveBeenCalledWith('tongzhang.session.refresh-token');
  expect(sessionToken.credentialsCleared()).toBe(false);

  mockDelete.mockResolvedValueOnce();
  await sessionToken.clear();
  expect(sessionToken.credentialsCleared()).toBe(true);
});
