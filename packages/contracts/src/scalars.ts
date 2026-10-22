import { z } from 'zod';
import { MAX_EXPENSE_CENTS } from '@tongzhang/domain';
export const uuidSchema = z.uuid();
export const instantSchema = z.iso.datetime({ offset: true });
export const localDateSchema = z.iso.date();
/** Integer cents as a decimal string, within PostgreSQL BIGINT. */
export const moneySchema = z
  .string()
  .regex(/^(0|-?[1-9]\d{0,18})$/)
  .refine((s) => {
    if (!/^(0|-?[1-9]\d{0,18})$/.test(s)) return false;
    const n = BigInt(s);
    return n >= -9223372036854775808n && n <= 9223372036854775807n;
  }, '金额超出64位整数范围');
export const nonnegativeMoneySchema = moneySchema.pipe(z.string().refine((s) => BigInt(s) >= 0n));
export const expenseMoneySchema = moneySchema.pipe(
  z.string().refine((s) => BigInt(s) > 0n && BigInt(s) <= MAX_EXPENSE_CENTS),
);
export const transferMoneySchema = moneySchema.pipe(z.string().refine((s) => BigInt(s) > 0n));
export const ledgerStatusSchema = z.enum(['ACTIVE', 'SETTLING', 'SETTLED']);
export const categorySchema = z.enum([
  'DINING',
  'TRANSPORT',
  'TICKET',
  'LODGING',
  'SHOPPING',
  'OTHER',
]);
export const coverKeySchema = z.enum(['mountain', 'dining', 'city', 'plain']);
export const inviteCodeSchema = z.string().regex(/^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$/);
export const versionSchema = z.number().int().positive().max(2147483647);
export type LedgerStatus = z.infer<typeof ledgerStatusSchema>;
export type Category = z.infer<typeof categorySchema>;
