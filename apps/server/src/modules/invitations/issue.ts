import { randomInt } from 'node:crypto';
import type { EndpointOutput } from '@tongzhang/contracts';
import type { Transaction } from '../../db/transaction.js';
import { invitations } from '../../db/schema/index.js';

/** Same alphabet as the `ck_invitations_code` constraint: no 0/1/I/O. */
const ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
export const INVITATION_TTL_MS = 7 * 86_400_000;
export const INVITE_QR_PREFIX = 'tongzhang:invite:v1:';

export const generateInviteCode = () =>
  Array.from({ length: 6 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

type InvitationRow = typeof invitations.$inferSelect;

export function toInvitationDto(
  row: Pick<InvitationRow, 'id' | 'code' | 'expiresAt'>,
  now = new Date(),
): EndpointOutput<'getInvitation'>['data'] {
  return {
    id: row.id,
    code: row.code,
    expiresAt: row.expiresAt.toISOString(),
    expired: row.expiresAt <= now,
    qrPayload: `${INVITE_QR_PREFIX}${row.code}`,
  };
}

/**
 * Create the ledger's current invitation inside the caller's transaction.
 * The caller must hold the ledger lock (or own the brand-new ledger) and, when replacing,
 * revoke the previous code first so `uq_invitations_current` is respected.
 */
export async function issueInvitation(
  tx: Transaction,
  input: { ledgerId: string; createdByMemberId: string },
): Promise<InvitationRow> {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const now = new Date();
    // ON CONFLICT keeps a code collision from aborting the surrounding transaction.
    const [row] = await tx
      .insert(invitations)
      .values({
        ledgerId: input.ledgerId,
        createdByMemberId: input.createdByMemberId,
        code: generateInviteCode(),
        createdAt: now,
        expiresAt: new Date(now.getTime() + INVITATION_TTL_MS),
      })
      .onConflictDoNothing({ target: invitations.code })
      .returning();
    if (row) return row;
  }
  throw new Error('Unable to allocate a unique invitation code');
}
