import type { DocumentKind } from './documents';

export type ProfilePanel =
  | { kind: 'closed' }
  | { kind: 'edit-username' }
  | { kind: 'document'; document: DocumentKind }
  | { kind: 'logout-confirm' };
