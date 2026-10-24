import { expect, it, jest } from '@jest/globals';
import { sessionToken } from '../src/lib/session-token';

const mockDelete = jest.fn<(key: string) => Promise<void>>();
jest.mock('expo-secure-store', () => ({
  deleteItemAsync: (key: string) => mockDelete(key),
}));
jest.mock('../src/lib/http', () => ({ requestJson: jest.fn() }));

it('waits for credential deletion to finish even when deleting the legacy key fails', async () => {
  let finishDeletion!: () => void;
  const deletion = new Promise<void>((resolve) => {
    finishDeletion = resolve;
  });
  const failure = new Error('legacy key unavailable');
  mockDelete.mockImplementation((key) =>
    key === 'tongzhang.session.refresh-token' ? deletion : Promise.reject(failure),
  );
  let completed = false;
  const clearing = sessionToken.clear().catch((error: unknown) => {
    completed = true;
    return error;
  });
  // Let immediately rejected native promises settle while the refresh-key deletion is pending.
  await new Promise((resolve) => setTimeout(resolve, 0));
  const completedBeforeDeletion = completed;
  finishDeletion();
  expect(await clearing).toBe(failure);
  expect(completedBeforeDeletion).toBe(false);
  expect(mockDelete).toHaveBeenCalledWith('tongzhang.session.token');
  expect(sessionToken.credentialsCleared()).toBe(false);
});
