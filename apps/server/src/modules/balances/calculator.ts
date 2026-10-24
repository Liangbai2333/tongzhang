export interface MemberTotals {
  memberId: string;
  username: string;
  paidCents: bigint;
  sharedCents: bigint;
  /** Net amount already moved by PAID settlement transfers (payer +, payee -). */
  settledCents: bigint;
}

export interface MemberBalance {
  memberId: string;
  username: string;
  paidCents: bigint;
  sharedCents: bigint;
  netCents: bigint;
  remainingNetCents: bigint;
}

/** net = paid - shared. A positive net is owed to the member; negative means the member owes. */
export function computeBalances(members: readonly MemberTotals[]): MemberBalance[] {
  const result = members
    .map((m) => {
      const netCents = m.paidCents - m.sharedCents;
      return {
        memberId: m.memberId,
        username: m.username,
        paidCents: m.paidCents,
        sharedCents: m.sharedCents,
        netCents,
        remainingNetCents: netCents + m.settledCents,
      };
    })
    .sort((a, b) => (a.memberId < b.memberId ? -1 : a.memberId > b.memberId ? 1 : 0));
  if (result.reduce((s, m) => s + m.netCents, 0n) !== 0n)
    throw new Error('账本数据不一致：全员净额之和不为 0');
  return result;
}

export function toBalanceDto(m: MemberBalance) {
  return {
    memberId: m.memberId,
    username: m.username,
    paidCents: m.paidCents.toString(),
    sharedCents: m.sharedCents.toString(),
    netCents: m.netCents.toString(),
    remainingNetCents: m.remainingNetCents.toString(),
  };
}
