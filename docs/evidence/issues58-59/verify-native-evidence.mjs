import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';

// Rechecks captured SQL/HTTP/request evidence; never sends a business request.
const root = 'docs/evidence/issues58-59/';
const read = (name) => JSON.parse(readFileSync(root + name, 'utf8'));
const stage = (name) => read(`db-${name}.json`);
for (const [before, after] of [
  ['cover-before-reauth', 'cover-after-reauth'],
  ['cover-after-reauth', 'cover-replayed'],
  ['receipt-before-reauth', 'receipt-after-reauth'],
  ['receipt-after-reauth', 'receipt-replayed'],
  ['receipt-replayed', 'switched-account'],
]) {
  assert.deepEqual(stage(before).tables, stage(after).tables);
  assert.deepEqual(stage(before).images, stage(after).images);
}
const preview = stage('preview');
assert.equal(preview.tables.ledgers[0].status, 'ACTIVE');
assert.equal(preview.tables.ledgers[0].version, 3);
assert.deepEqual(preview.tables.settlement_batches, []);
assert.deepEqual(preview.tables.settlement_transfers, []);
const frozen = stage('frozen');
assert.equal(frozen.tables.ledgers[0].status, 'SETTLING');
assert.equal(frozen.tables.ledgers[0].version, 4);
assert.equal(frozen.tables.expenses[0].amount_cents, '12000');
assert.deepEqual(
  frozen.tables.expense_splits.map((r) => r.amount_cents),
  ['6000', '6000'],
);
assert.equal(frozen.tables.settlement_batches[0].transfer_count, 1);
assert.equal(frozen.tables.settlement_transfers[0].amount_cents, '6000');
for (const name of ['paid', 'settled', 'archived']) {
  const current = stage(name);
  for (const table of ['expenses', 'expense_splits', 'expense_images', 'settlement_batches'])
    assert.deepEqual(current.tables[table], frozen.tables[table], `${name}: ${table}`);
  assert.deepEqual(current.images, frozen.images);
}
const paid = stage('paid');
assert.deepEqual(paid.tables.settlement_transfers, [
  {
    ...frozen.tables.settlement_transfers[0],
    status: 'PAID',
    registered_by_member_id: frozen.tables.settlement_transfers[0].payer_member_id,
    registered_at: paid.tables.settlement_transfers[0].registered_at,
    registration_note: 'Day6-6000',
  },
]);
const settled = stage('settled');
const archived = stage('archived');
assert.deepEqual(paid.tables.settlement_transfers, settled.tables.settlement_transfers);
assert.deepEqual(settled.tables.settlement_transfers, archived.tables.settlement_transfers);
assert.deepEqual(settled.tables.ledgers, archived.tables.ledgers);
assert.equal(archived.tables.ledgers[0].status, 'SETTLED');
assert.equal(archived.tables.ledgers[0].version, 5);
const counts = Object.fromEntries(Object.entries(archived.tables).map(([k, v]) => [k, v.length]));
assert.deepEqual(counts, {
  ledgers: 1,
  ledger_members: 2,
  expenses: 1,
  expense_splits: 2,
  expense_images: 1,
  settlement_batches: 1,
  settlement_transfers: 1,
  operation_logs: 7,
});
assert.equal(archived.images.length, 2);
const owner = archived.tables.ledger_members.find(
  (m) => m.user_id === archived.tables.ledgers[0].created_by_user_id,
);
assert.ok(owner.archived_at);
assert.equal(archived.tables.ledger_members.find((m) => m.id !== owner.id).archived_at, null);
assert.deepEqual(archived.tables.operation_logs.map((r) => r.action).sort(), [
  'EXPENSE_CREATED',
  'LEDGER_ARCHIVED',
  'LEDGER_CREATED',
  'LEDGER_SETTLED',
  'MEMBER_JOINED',
  'SETTLEMENT_STARTED',
  'TRANSFER_PAID',
]);
const requests = read('native-requests.json').requests;
const replayKeys = {};
for (const suffix of ['/ledgers', '/expenses']) {
  const writes = requests.filter((r) => r.method === 'POST' && r.path.endsWith(suffix));
  assert.equal(writes.length, 2);
  assert.equal(writes[0].keyDigest, writes[1].keyDigest);
  assert.equal(writes[0].sentStatus, 503);
  assert.equal(writes[1].status, 201);
  replayKeys[suffix] = writes[0].keyDigest;
}
const roles = read('http-verification.json').roles;
assert.deepEqual(roles[0].batch, roles[1].batch);
for (const role of roles) {
  assert.equal(role.detail.expenseTotalCents, '12000');
  assert.equal(role.detail.myRemainingNetCents, '0');
  assert.equal(role.batch.progress.remainingCents, '0');
  assert.equal(role.batch.transfers[0].registrationNote, 'Day6-6000');
}
assert.equal(roles[0].current.length, 0);
assert.equal(roles[0].history.length, 1);
assert.equal(roles[1].current.length, 1);
assert.equal(roles[1].history.length, 0);
writeFileSync(
  root + 'native-verification.json',
  JSON.stringify(
    {
      checkedAtUtc: new Date().toISOString(),
      candidate: '89d0166da5c528edeac80e460c689f40385e813b',
      ledgerId: archived.tables.ledgers[0].id,
      batchId: archived.tables.settlement_batches[0].id,
      counts,
      imageCount: 2,
      expenseTotalCents: '12000',
      splitCents: ['6000', '6000'],
      transferCents: '6000',
      replayKeys,
      sameAccountFinancialRowsUnchanged: true,
      differentAccountDraftNotWritten: true,
      frozenRowsUnchangedAfterCompletion: true,
      personalArchiveIsolation: true,
      checksPassed: true,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Native evidence: original references/keys, exact money, immutable snapshots and personal archive isolation pass.',
);
