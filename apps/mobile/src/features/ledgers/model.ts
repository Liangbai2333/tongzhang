export type LedgersPanel =
  { kind: 'closed' } | { kind: 'cover-picker' } | { kind: 'archive-confirm'; ledgerId: string };
