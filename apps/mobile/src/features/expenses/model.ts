export type ExpensesPanel =
  | { kind: 'closed' }
  | { kind: 'split-editor'; mode: 'EQUAL' | 'SHARES' | 'AMOUNT' }
  | { kind: 'filter' }
  | { kind: 'delete-confirm'; expenseId: string }
  | { kind: 'receipt-preview'; imageId: string };
