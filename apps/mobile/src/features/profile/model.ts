export type ProfilePanel =
  | { kind: 'closed' }
  | { kind: 'edit-username' }
  | { kind: 'document'; document: 'terms' | 'privacy' | 'about' }
  | { kind: 'logout-confirm' };
