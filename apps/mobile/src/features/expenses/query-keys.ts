export const expensesKeys = {
  root: (userId: string) => ['user', userId, 'expenses'] as const,
  ledger: (userId: string, ledgerId: string) => ['user', userId, 'expenses', ledgerId] as const,
};
