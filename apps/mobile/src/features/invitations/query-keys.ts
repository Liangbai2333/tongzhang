export const invitationsKeys = {
  root: (userId: string) => ['user', userId, 'invitations'] as const,
  ledger: (userId: string, ledgerId: string) => ['user', userId, 'invitations', ledgerId] as const,
};
