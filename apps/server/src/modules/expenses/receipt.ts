import type { Transaction } from '../../db/transaction.js';

export interface ReceiptBindingInput {
  ledgerId: string;
  expenseId: string;
  imageId: string;
  userId: string;
}

/**
 * Interface boundary shared with the image module (T22).
 *
 * `bind` MUST use the exact `tx` it receives: it verifies the image is an unbound RECEIPT
 * uploaded by `userId` and attaches it to the ledger/expense in the same transaction that
 * creates the expense, so a failure rolls back both. It must never open its own transaction.
 */
export interface ReceiptBinder {
  bind(tx: Transaction, input: ReceiptBindingInput): Promise<void>;
}
