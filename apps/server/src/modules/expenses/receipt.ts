import type { Transaction } from '../../db/transaction.js';
import { AppError } from '../../http/errors.js';

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

/** Until T22 lands, an expense with a receipt is rejected rather than saved without it. */
export const receiptBindingNotReady: ReceiptBinder = {
  async bind() {
    throw new AppError('FEATURE_NOT_READY', '凭证图片绑定尚未接通，请暂不附带图片', 501);
  },
};
