import type { DocumentKind } from './documents';

export type ProfilePanel =
  | { kind: 'closed' }
  | { kind: 'account' }
  | { kind: 'settings' }
  | { kind: 'document'; document: DocumentKind }
  | { kind: 'logout-confirm' };
