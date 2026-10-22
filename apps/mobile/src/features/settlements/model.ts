export type SettlementsPanel =
  | { kind: 'closed' }
  | { kind: 'freeze-confirm' }
  | { kind: 'paid-confirm'; transferId: string }
  | { kind: 'settle-confirm' };
