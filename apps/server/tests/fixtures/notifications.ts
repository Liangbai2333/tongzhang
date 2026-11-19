import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { endpoints } from '@tongzhang/contracts';
import { ledgerMembers } from '../../src/db/schema/index.js';
import type { integrationFixture, TestAccount } from './integration.js';

export type IntegrationFixtureInstance = Awaited<ReturnType<typeof integrationFixture>>;

export const CORE_PUBLIC_TABLES = [
  'users',
  'auth_sessions',
  'auth_refresh_tokens',
  'ledgers',
  'ledger_members',
  'invitations',
  'image_assets',
  'expenses',
  'expense_splits',
  'expense_images',
  'settlement_batches',
  'settlement_transfers',
  'notifications',
  'operation_logs',
  'idempotency_keys',
] as const;

export type CorePublicTable = (typeof CORE_PUBLIC_TABLES)[number];

export type InjectResult = Awaited<ReturnType<IntegrationFixtureInstance['app']['inject']>>;

export interface SettlingReminderScenario {
  ledgerId: string;
  owner: TestAccount;
  payee: TestAccount;
  payer: TestAccount;
  outsider: TestAccount;
  memberIds: {
    owner: string;
    payee: string;
    payer: string;
  };
  transfers: Array<{
    id: string;
    payerMemberId: string;
    payeeMemberId: string;
    amountCents: string;
    status: 'PENDING' | 'PAID';
  }>;
  remind(actor: TestAccount, transferId: string, key?: string): Promise<InjectResult>;
  listNotifications(
    account: TestAccount,
    query?: { unreadOnly?: boolean; limit?: number; cursor?: string },
  ): Promise<InjectResult>;
  markNotificationRead(account: TestAccount, notificationId: string): Promise<InjectResult>;
  setNotificationEnabled(account: TestAccount, enabled: boolean): Promise<InjectResult>;
  markTransferPaid(actor: TestAccount, transferId: string, key?: string): Promise<InjectResult>;
}

const authHeaders = (account: TestAccount, idempotencyKey?: string) => ({
  authorization: `Bearer ${account.accessToken}`,
  ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
});

/**
 * Isolated-DB fixture that builds a real 3-member SETTLING ledger via HTTP:
 * - owner (小安): creates ledger, pays 6000 split across all 3 (net 0)
 * - payee (小白): pays 12000 split across all 3 (net +6000)
 * - payer (小陈): pays 0 (net -6000) -> owes payee 6000 in 1 PENDING transfer
 * - outsider (外人): registered non-member for cross-user/authorization boundary checks
 */
export async function seedSettlingReminderScenario(
  fixture: IntegrationFixtureInstance,
  options: { ledgerName?: string } = {},
): Promise<SettlingReminderScenario> {
  const [owner, payee, payer, outsider] = await Promise.all([
    fixture.register('小安'),
    fixture.register('小白'),
    fixture.register('小陈'),
    fixture.register('外人'),
  ]);

  const created = await fixture.app.inject({
    method: 'POST',
    url: '/api/v1/ledgers',
    headers: authHeaders(owner, randomUUID()),
    payload: { name: options.ledgerName ?? '提醒夹具账本', coverKey: 'mountain' },
  });
  if (created.statusCode !== 201) {
    throw new Error(`Failed to create fixture ledger (${created.statusCode})`);
  }
  const { ledger, invitation } = endpoints.createLedger.response.parse(created.json()).data;

  for (const member of [payee, payer]) {
    const joined = await fixture.app.inject({
      method: 'POST',
      url: '/api/v1/invitations/join',
      headers: authHeaders(member, randomUUID()),
      payload: { code: invitation.code },
    });
    if (joined.statusCode !== 200) {
      throw new Error(`Failed to join fixture ledger (${joined.statusCode})`);
    }
  }

  const memberRows = await fixture.db.orm
    .select()
    .from(ledgerMembers)
    .where(eq(ledgerMembers.ledgerId, ledger.id));
  const memberIdOf = (account: TestAccount) => {
    const row = memberRows.find((entry) => entry.userId === account.user.id);
    if (!row) throw new Error(`Missing member row for ${account.user.id}`);
    return row.id;
  };
  const ownerMemberId = memberIdOf(owner);
  const payeeMemberId = memberIdOf(payee);
  const payerMemberId = memberIdOf(payer);
  const allSplits = [
    { memberId: ownerMemberId },
    { memberId: payeeMemberId },
    { memberId: payerMemberId },
  ];

  for (const [title, amountCents, payerMember] of [
    ['营地餐食', '6000', ownerMemberId],
    ['往返包车', '12000', payeeMemberId],
  ] as const) {
    const res = await fixture.app.inject({
      method: 'POST',
      url: `/api/v1/ledgers/${ledger.id}/expenses`,
      headers: authHeaders(owner, randomUUID()),
      payload: {
        title,
        amountCents,
        category: 'DINING',
        occurredOn: '2026-11-18',
        payerMemberId: payerMember,
        splitMode: 'EQUAL',
        splits: allSplits,
      },
    });
    if (res.statusCode !== 201) {
      throw new Error(`Failed to seed fixture expense (${res.statusCode})`);
    }
  }

  const detail = await fixture.app.inject({
    method: 'GET',
    url: `/api/v1/ledgers/${ledger.id}`,
    headers: authHeaders(owner),
  });
  const expectedVersion = endpoints.getLedger.response.parse(detail.json()).data.version;

  const started = await fixture.app.inject({
    method: 'POST',
    url: `/api/v1/ledgers/${ledger.id}/settlement`,
    headers: authHeaders(owner, randomUUID()),
    payload: { expectedVersion },
  });
  if (started.statusCode !== 201) {
    throw new Error(`Failed to start fixture settlement (${started.statusCode})`);
  }
  const settlement = endpoints.startSettlement.response.parse(started.json()).data;

  return {
    ledgerId: ledger.id,
    owner,
    payee,
    payer,
    outsider,
    memberIds: {
      owner: ownerMemberId,
      payee: payeeMemberId,
      payer: payerMemberId,
    },
    transfers: settlement.batch.transfers.map((transfer) => ({
      id: transfer.id,
      payerMemberId: transfer.payerMemberId,
      payeeMemberId: transfer.payeeMemberId,
      amountCents: transfer.amountCents,
      status: transfer.status,
    })),
    remind(actor, transferId, key = randomUUID()) {
      return fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.id}/settlement/transfers/${transferId}/remind`,
        headers: authHeaders(actor, key),
        payload: {},
      });
    },
    listNotifications(account, query = {}) {
      const search = new URLSearchParams();
      if (query.unreadOnly !== undefined) search.set('unreadOnly', String(query.unreadOnly));
      if (query.limit !== undefined) search.set('limit', String(query.limit));
      if (query.cursor !== undefined) search.set('cursor', query.cursor);
      const suffix = search.size > 0 ? `?${search.toString()}` : '';
      return fixture.app.inject({
        method: 'GET',
        url: `/api/v1/me/notifications${suffix}`,
        headers: authHeaders(account),
      });
    },
    markNotificationRead(account, notificationId) {
      return fixture.app.inject({
        method: 'POST',
        url: `/api/v1/me/notifications/${notificationId}/read`,
        headers: authHeaders(account),
      });
    },
    setNotificationEnabled(account, enabled) {
      return fixture.app.inject({
        method: 'PATCH',
        url: '/api/v1/me/preferences',
        headers: authHeaders(account),
        payload: { notificationEnabled: enabled },
      });
    },
    markTransferPaid(actor, transferId, key = randomUUID()) {
      return fixture.app.inject({
        method: 'POST',
        url: `/api/v1/ledgers/${ledger.id}/settlement/transfers/${transferId}/paid`,
        headers: authHeaders(actor, key),
        payload: {},
      });
    },
  };
}

/** Query exact row counts across all 15 public tables for isolated-DB zero-residue verification. */
export async function countCorePublicTableRows(
  db: IntegrationFixtureInstance['db'],
): Promise<Record<CorePublicTable, number>> {
  const counts = {} as Record<CorePublicTable, number>;
  for (const table of CORE_PUBLIC_TABLES) {
    const result = await db.orm.execute<{ count: string }>(
      sql`SELECT count(*)::text AS count FROM ${sql.identifier(table)}`,
    );
    counts[table] = Number(result.rows[0]?.count ?? '0');
  }
  return counts;
}
