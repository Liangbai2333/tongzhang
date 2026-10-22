export const ledgersKeys = {
  root: (userId: string) => ['user', userId, 'ledgers'] as const,
  ledger: (userId: string, ledgerId: string) => ['user', userId, 'ledgers', ledgerId] as const,
};
