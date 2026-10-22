import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  text,
  boolean,
  integer,
  smallint,
  bigint,
  timestamp,
  date,
  jsonb,
  customType,
  primaryKey,
  unique,
  check,
  foreignKey,
  index,
  uniqueIndex,
  type PgTableExtraConfigValue,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => 'bytea' });

export const users = pgTable(
  'users',
  {
    id: uuid('id').notNull().defaultRandom(),
    username: varchar('username', { length: 30 }).notNull(),
    email: varchar('email', { length: 254 }).notNull(),
    passwordHash: text('password_hash').notNull(),
    notificationEnabled: boolean('notification_enabled').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_users', columns: [t.id] }),
    unique('uq_users_email').on(t.email),
    check('ck_users_username', sql`char_length(username) BETWEEN 2 AND 30`),
    check(
      'ck_users_email',
      sql`email = lower(btrim(email)) AND char_length(email) BETWEEN 3 AND 254`,
    ),
    check('ck_users_password_hash', sql`password_hash LIKE '$argon2id$%'`),
  ],
);

export const ledgers = pgTable(
  'ledgers',
  {
    id: uuid('id').notNull().defaultRandom(),
    createdByUserId: uuid('created_by_user_id').notNull(),
    name: varchar('name', { length: 40 }).notNull(),
    coverKey: varchar('cover_key', { length: 30 }).default('mountain'),
    coverImageId: uuid('cover_image_id'),
    status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
    version: integer('version').notNull().default(1),
    settledAt: timestamp('settled_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_ledgers', columns: [t.id] }),
    check('ck_ledgers_name', sql`char_length(btrim(name)) BETWEEN 1 AND 40`),
    check('ck_ledgers_cover', sql`num_nonnulls(cover_key, cover_image_id) = 1`),
    check('ck_ledgers_status', sql`status IN ('ACTIVE','SETTLING','SETTLED')`),
    check('ck_ledgers_version', sql`version > 0`),
    check('ck_ledgers_settled', sql`(status = 'SETTLED') = (settled_at IS NOT NULL)`),
    foreignKey({
      name: 'fk_ledgers_created_by_user_id',
      columns: [t.createdByUserId],
      foreignColumns: [users.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('ix_ledgers_creator').on(t.createdByUserId, t.createdAt),
    foreignKey({
      name: 'fk_ledgers_cover',
      columns: [t.id, t.coverImageId],
      foreignColumns: [imageAssets.ledgerId, imageAssets.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
  ],
);

export const ledgerMembers = pgTable(
  'ledger_members',
  {
    id: uuid('id').notNull().defaultRandom(),
    ledgerId: uuid('ledger_id').notNull(),
    userId: uuid('user_id').notNull(),
    archivedAt: timestamp('archived_at', { withTimezone: true, mode: 'date' }),
    joinedAt: timestamp('joined_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_ledger_members', columns: [t.id] }),
    unique('uq_ledger_members_ledger_user').on(t.ledgerId, t.userId),
    unique('uq_ledger_members_ledger_id_id').on(t.ledgerId, t.id),
    foreignKey({
      name: 'fk_ledger_members_ledger_id',
      columns: [t.ledgerId],
      foreignColumns: [ledgers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_ledger_members_user_id',
      columns: [t.userId],
      foreignColumns: [users.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('ix_ledger_members_user_archive').on(t.userId, t.archivedAt, t.joinedAt),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: uuid('id').notNull().defaultRandom(),
    ledgerId: uuid('ledger_id').notNull(),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    code: varchar('code', { length: 6 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_invitations', columns: [t.id] }),
    unique('uq_invitations_code').on(t.code),
    check('ck_invitations_code', sql`code ~ '^[23456789ABCDEFGHJKLMNPQRSTUVWXYZ]{6}$'`),
    check('ck_invitations_expiry', sql`expires_at > created_at`),
    check('ck_invitations_revoked', sql`revoked_at IS NULL OR revoked_at >= created_at`),
    foreignKey({
      name: 'fk_invitations_ledger_id',
      columns: [t.ledgerId],
      foreignColumns: [ledgers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_invitations_ledger_id_created_by_member_id',
      columns: [t.ledgerId, t.createdByMemberId],
      foreignColumns: [ledgerMembers.ledgerId, ledgerMembers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('ix_invitations_ledger_time').on(t.ledgerId, t.createdAt),
    uniqueIndex('uq_invitations_current')
      .on(t.ledgerId)
      .where(sql`revoked_at IS NULL`),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').notNull().defaultRandom(),
    ledgerId: uuid('ledger_id').notNull(),
    recorderMemberId: uuid('recorder_member_id').notNull(),
    payerMemberId: uuid('payer_member_id').notNull(),
    title: varchar('title', { length: 60 }).notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    category: varchar('category', { length: 16 }).notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    splitMode: varchar('split_mode', { length: 8 }).notNull(),
    note: varchar('note', { length: 500 }),
    version: integer('version').notNull().default(1),
    deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_expenses', columns: [t.id] }),
    unique('uq_expenses_ledger_id_id').on(t.ledgerId, t.id),
    check('ck_expenses_title', sql`char_length(btrim(title)) BETWEEN 1 AND 60`),
    check('ck_expenses_amount', sql`amount_cents BETWEEN 1 AND 999999999`),
    check(
      'ck_expenses_category',
      sql`category IN ('DINING','TRANSPORT','TICKET','LODGING','SHOPPING','OTHER')`,
    ),
    check('ck_expenses_split_mode', sql`split_mode IN ('EQUAL','SHARES','AMOUNT')`),
    check('ck_expenses_version', sql`version > 0`),
    foreignKey({
      name: 'fk_expenses_ledger_id',
      columns: [t.ledgerId],
      foreignColumns: [ledgers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_expenses_ledger_id_recorder_member_id',
      columns: [t.ledgerId, t.recorderMemberId],
      foreignColumns: [ledgerMembers.ledgerId, ledgerMembers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_expenses_ledger_id_payer_member_id',
      columns: [t.ledgerId, t.payerMemberId],
      foreignColumns: [ledgerMembers.ledgerId, ledgerMembers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('ix_expenses_list')
      .on(t.ledgerId, t.occurredOn.desc(), t.id.desc())
      .where(sql`deleted_at IS NULL`),
    index('ix_expenses_category')
      .on(t.ledgerId, t.category, t.occurredOn.desc(), t.id.desc())
      .where(sql`deleted_at IS NULL`),
    index('ix_expenses_payer')
      .on(t.ledgerId, t.payerMemberId, t.occurredOn.desc(), t.id.desc())
      .where(sql`deleted_at IS NULL`),
  ],
);

export const expenseSplits = pgTable(
  'expense_splits',
  {
    expenseId: uuid('expense_id').notNull(),
    memberId: uuid('member_id').notNull(),
    ledgerId: uuid('ledger_id').notNull(),
    shares: integer('shares'),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_expense_splits', columns: [t.expenseId, t.memberId] }),
    check('ck_expense_splits_amount', sql`amount_cents BETWEEN 0 AND 999999999`),
    check('ck_expense_splits_shares', sql`shares IS NULL OR shares BETWEEN 1 AND 10000`),
    foreignKey({
      name: 'fk_expense_splits_ledger_id_expense_id',
      columns: [t.ledgerId, t.expenseId],
      foreignColumns: [expenses.ledgerId, expenses.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_expense_splits_ledger_id_member_id',
      columns: [t.ledgerId, t.memberId],
      foreignColumns: [ledgerMembers.ledgerId, ledgerMembers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('ix_expense_splits_member').on(t.ledgerId, t.memberId),
  ],
);

export const imageAssets = pgTable(
  'image_assets',
  {
    id: uuid('id').notNull().defaultRandom(),
    ledgerId: uuid('ledger_id'),
    uploadedByUserId: uuid('uploaded_by_user_id').notNull(),
    kind: varchar('kind', { length: 8 }).notNull(),
    mimeType: varchar('mime_type', { length: 16 }).notNull(),
    byteSize: integer('byte_size').notNull(),
    width: integer('width').notNull(),
    height: integer('height').notNull(),
    sha256: varchar('sha256', { length: 64 }).notNull(),
    content: bytea('content').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_image_assets', columns: [t.id] }),
    unique('uq_image_assets_ledger_id_id').on(t.ledgerId, t.id),
    check('ck_image_assets_kind', sql`kind IN ('COVER','RECEIPT')`),
    check('ck_image_assets_mime', sql`mime_type IN ('image/jpeg','image/png')`),
    check(
      'ck_image_assets_bytes',
      sql`byte_size BETWEEN 1 AND 1048576 AND octet_length(content) = byte_size`,
    ),
    check(
      'ck_image_assets_pixels',
      sql`width BETWEEN 1 AND 4096 AND height BETWEEN 1 AND 4096 AND width::bigint * height <= 16000000`,
    ),
    check('ck_image_assets_hash', sql`sha256 ~ '^[0-9a-f]{64}$'`),
    foreignKey({
      name: 'fk_image_assets_ledger_id',
      columns: [t.ledgerId],
      foreignColumns: [ledgers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_image_assets_uploaded_by_user_id',
      columns: [t.uploadedByUserId],
      foreignColumns: [users.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('ix_image_assets_temporary')
      .on(t.createdAt)
      .where(sql`ledger_id IS NULL`),
    index('ix_image_assets_ledger').on(t.ledgerId),
  ],
);

export const expenseImages = pgTable(
  'expense_images',
  {
    expenseId: uuid('expense_id').notNull(),
    ledgerId: uuid('ledger_id').notNull(),
    imageId: uuid('image_id').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_expense_images', columns: [t.expenseId] }),
    unique('uq_expense_images_image').on(t.imageId),
    foreignKey({
      name: 'fk_expense_images_ledger_id_expense_id',
      columns: [t.ledgerId, t.expenseId],
      foreignColumns: [expenses.ledgerId, expenses.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_expense_images_ledger_id_image_id',
      columns: [t.ledgerId, t.imageId],
      foreignColumns: [imageAssets.ledgerId, imageAssets.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
  ],
);

export const settlementBatches = pgTable(
  'settlement_batches',
  {
    id: uuid('id').notNull().defaultRandom(),
    ledgerId: uuid('ledger_id').notNull(),
    createdByMemberId: uuid('created_by_member_id').notNull(),
    sourceVersion: integer('source_version').notNull(),
    expenseTotalCents: bigint('expense_total_cents', { mode: 'bigint' }).notNull(),
    transferTotalCents: bigint('transfer_total_cents', { mode: 'bigint' }).notNull(),
    transferCount: smallint('transfer_count').notNull(),
    netSnapshot: jsonb('net_snapshot').notNull(),
    algorithmVersion: varchar('algorithm_version', { length: 30 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_settlement_batches', columns: [t.id] }),
    unique('uq_settlement_batches_ledger').on(t.ledgerId),
    unique('uq_settlement_batches_ledger_id_id').on(t.ledgerId, t.id),
    check('ck_settlement_batches_version', sql`source_version > 0`),
    check(
      'ck_settlement_batches_totals',
      sql`expense_total_cents >= 0 AND transfer_total_cents >= 0`,
    ),
    check('ck_settlement_batches_count', sql`transfer_count BETWEEN 0 AND 11`),
    check('ck_settlement_batches_snapshot', sql`jsonb_typeof(net_snapshot) = 'array'`),
    check('ck_settlement_batches_zero', sql`(transfer_count = 0) = (transfer_total_cents = 0)`),
    foreignKey({
      name: 'fk_settlement_batches_ledger_id',
      columns: [t.ledgerId],
      foreignColumns: [ledgers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_settlement_batches_ledger_id_created_by_member_id',
      columns: [t.ledgerId, t.createdByMemberId],
      foreignColumns: [ledgerMembers.ledgerId, ledgerMembers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
  ],
);

export const settlementTransfers = pgTable(
  'settlement_transfers',
  {
    id: uuid('id').notNull().defaultRandom(),
    ledgerId: uuid('ledger_id').notNull(),
    batchId: uuid('batch_id').notNull(),
    sequence: smallint('sequence').notNull(),
    payerMemberId: uuid('payer_member_id').notNull(),
    payeeMemberId: uuid('payee_member_id').notNull(),
    amountCents: bigint('amount_cents', { mode: 'bigint' }).notNull(),
    status: varchar('status', { length: 8 }).notNull().default('PENDING'),
    registeredByMemberId: uuid('registered_by_member_id'),
    registeredAt: timestamp('registered_at', { withTimezone: true, mode: 'date' }),
    registrationNote: varchar('registration_note', { length: 200 }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_settlement_transfers', columns: [t.id] }),
    unique('uq_settlement_transfers_batch_sequence').on(t.batchId, t.sequence),
    check('ck_settlement_transfers_amount', sql`amount_cents > 0`),
    check('ck_settlement_transfers_sequence', sql`sequence BETWEEN 1 AND 11`),
    check('ck_settlement_transfers_parties', sql`payer_member_id <> payee_member_id`),
    check('ck_settlement_transfers_status', sql`status IN ('PENDING','PAID')`),
    check(
      'ck_settlement_transfers_registration',
      sql`(status = 'PENDING' AND registered_by_member_id IS NULL AND registered_at IS NULL AND registration_note IS NULL) OR (status = 'PAID' AND registered_by_member_id IS NOT NULL AND registered_at IS NOT NULL)`,
    ),
    foreignKey({
      name: 'fk_settlement_transfers_ledger_id',
      columns: [t.ledgerId],
      foreignColumns: [ledgers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_settlement_transfers_ledger_id_batch_id',
      columns: [t.ledgerId, t.batchId],
      foreignColumns: [settlementBatches.ledgerId, settlementBatches.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_settlement_transfers_ledger_id_payer_member_id',
      columns: [t.ledgerId, t.payerMemberId],
      foreignColumns: [ledgerMembers.ledgerId, ledgerMembers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_settlement_transfers_ledger_id_payee_member_id',
      columns: [t.ledgerId, t.payeeMemberId],
      foreignColumns: [ledgerMembers.ledgerId, ledgerMembers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_settlement_transfers_ledger_id_registered_by_member_id',
      columns: [t.ledgerId, t.registeredByMemberId],
      foreignColumns: [ledgerMembers.ledgerId, ledgerMembers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
  ],
);

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: uuid('id').notNull().defaultRandom(),
    userId: uuid('user_id').notNull(),
    tokenHash: varchar('token_hash', { length: 64 }).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_auth_sessions', columns: [t.id] }),
    unique('uq_auth_sessions_token_hash').on(t.tokenHash),
    check('ck_auth_sessions_hash', sql`token_hash ~ '^[0-9a-f]{64}$'`),
    check('ck_auth_sessions_expiry', sql`expires_at > created_at`),
    check('ck_auth_sessions_revoked', sql`revoked_at IS NULL OR revoked_at >= created_at`),
    foreignKey({
      name: 'fk_auth_sessions_user_id',
      columns: [t.userId],
      foreignColumns: [users.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('ix_auth_sessions_user').on(t.userId),
    index('ix_auth_sessions_expiry').on(t.expiresAt),
  ],
);

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid('user_id').notNull(),
    operation: varchar('operation', { length: 160 }).notNull(),
    key: uuid('key').notNull(),
    requestHash: varchar('request_hash', { length: 64 }).notNull(),
    responseStatus: smallint('response_status').notNull(),
    responseBody: jsonb('response_body').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_idempotency_keys', columns: [t.userId, t.operation, t.key] }),
    check('ck_idempotency_keys_hash', sql`request_hash ~ '^[0-9a-f]{64}$'`),
    check('ck_idempotency_keys_status', sql`response_status BETWEEN 200 AND 299`),
    check('ck_idempotency_keys_expiry', sql`expires_at > created_at`),
    foreignKey({
      name: 'fk_idempotency_keys_user_id',
      columns: [t.userId],
      foreignColumns: [users.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('ix_idempotency_keys_expiry').on(t.expiresAt),
  ],
);

export const operationLogs = pgTable(
  'operation_logs',
  {
    id: uuid('id').notNull().defaultRandom(),
    actorUserId: uuid('actor_user_id').notNull(),
    ledgerId: uuid('ledger_id'),
    action: varchar('action', { length: 40 }).notNull(),
    targetType: varchar('target_type', { length: 30 }).notNull(),
    targetId: uuid('target_id'),
    requestId: uuid('request_id').notNull(),
    details: jsonb('details').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).notNull().defaultNow(),
  },
  (t): PgTableExtraConfigValue[] => [
    primaryKey({ name: 'pk_operation_logs', columns: [t.id] }),
    check('ck_operation_logs_details', sql`jsonb_typeof(details) = 'object'`),
    foreignKey({
      name: 'fk_operation_logs_actor_user_id',
      columns: [t.actorUserId],
      foreignColumns: [users.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    foreignKey({
      name: 'fk_operation_logs_ledger_id',
      columns: [t.ledgerId],
      foreignColumns: [ledgers.id],
    })
      .onDelete('restrict')
      .onUpdate('restrict'),
    index('ix_operation_logs_ledger_time').on(t.ledgerId, t.createdAt),
    index('ix_operation_logs_request').on(t.requestId),
  ],
);
