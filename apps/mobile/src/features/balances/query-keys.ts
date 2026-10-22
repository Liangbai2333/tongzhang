export const balancesKeys = {
  root: (userId: string) => ['user', userId, 'balances'] as const,
  ledger: (userId: string, ledgerId: string) => ['user', userId, 'balances', ledgerId] as const,
};
