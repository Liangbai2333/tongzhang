export const settlementsKeys = {
  root: (userId: string) => ['user', userId, 'settlements'] as const,
  ledger: (userId: string, ledgerId: string) => ['user', userId, 'settlements', ledgerId] as const,
};
