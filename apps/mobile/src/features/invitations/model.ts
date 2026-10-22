export type InvitationsPanel =
  | { kind: 'closed' }
  | { kind: 'scanner' }
  | { kind: 'join-confirm'; code: string }
  | { kind: 'reset-confirm' };
