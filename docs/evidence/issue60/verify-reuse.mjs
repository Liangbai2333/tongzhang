import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const read = (path) => JSON.parse(readFileSync(path, 'utf8'));
const hash = (path) => createHash('sha256').update(readFileSync(path)).digest('hex');
const oldRoot = 'docs/evidence/issues58-59/';
const lifecycle = '89d0166da5c528edeac80e460c689f40385e813b';
const network = 'adff4d8ef36a835917d7f04713574c1031bbfe94';
const paths = ['apps', 'packages', 'pnpm-lock.yaml', 'package.json', 'scripts', 'infra', '.github'];
assert.equal(git('diff', '--name-only', network, 'HEAD', '--', ...paths), '');
assert.equal(git('diff', '--name-only', '--', ...paths), '');
assert.equal(git('ls-files', '--others', '--exclude-standard', '--', ...paths), '');
const fresh = read('docs/evidence/issue60/loaded-js.json');
assert.equal(fresh.exactDeviceBundle, true);
const sourceChecks = read(oldRoot + 'loaded-js.json').matched.map((file) => {
  assert.equal(hash(file.path), file.sha256, file.path);
  assert.ok(
    fresh.matched.some((current) => current.path === file.path && current.sha256 === file.sha256),
  );
  return file;
});
const lifecycleChanges = git('diff', '--name-only', lifecycle, 'HEAD', '--', ...paths).split('\n');
assert.deepEqual(lifecycleChanges, [
  'apps/mobile/src/features/auth/controller.ts',
  'apps/mobile/tests/auth-controller.test.ts',
]);
const manifestChecks = Object.entries(read(oldRoot + 'manifest.json').files).map(([name, file]) => {
  const path = oldRoot + name;
  assert.equal(hash(path), file.sha256, path);
  return { path, sha256: file.sha256 };
});
const stage = (name) => read(oldRoot + `db-${name}.json`);
const frozen = stage('frozen');
assert.equal(stage('preview').tables.ledgers[0].status, 'ACTIVE');
assert.deepEqual(stage('preview').tables.settlement_batches, []);
assert.equal(frozen.tables.ledgers[0].status, 'SETTLING');
assert.equal(frozen.tables.expenses[0].amount_cents, '12000');
assert.deepEqual(
  frozen.tables.expense_splits.map((row) => row.amount_cents),
  ['6000', '6000'],
);
assert.equal(frozen.tables.settlement_transfers[0].amount_cents, '6000');
for (const name of ['paid', 'settled', 'archived']) {
  const current = stage(name);
  for (const table of ['expenses', 'expense_splits', 'expense_images', 'settlement_batches'])
    assert.deepEqual(current.tables[table], frozen.tables[table]);
  assert.deepEqual(current.images, frozen.images);
}
assert.equal(stage('paid').tables.settlement_transfers[0].status, 'PAID');
assert.deepEqual(
  stage('paid').tables.settlement_transfers,
  stage('archived').tables.settlement_transfers,
);
assert.equal(stage('archived').tables.ledgers[0].status, 'SETTLED');
const roles = read(oldRoot + 'http-verification.json').roles;
assert.deepEqual(roles[0].batch, roles[1].batch);
assert.deepEqual(
  roles.map((role) => [role.current.length, role.history.length]),
  [
    [0, 1],
    [1, 0],
  ],
);
for (const role of roles) {
  assert.equal(role.detail.expenseTotalCents, '12000');
  assert.equal(role.detail.myRemainingNetCents, '0');
  assert.equal(role.batch.progress.remainingCents, '0');
}
writeFileSync(
  'docs/evidence/issue60/reuse-verification.json',
  JSON.stringify(
    {
      checkedAtUtc: new Date().toISOString(),
      candidate: git('rev-parse', 'HEAD'),
      lifecycleCandidate: lifecycle,
      networkCandidate: network,
      changedRuntimeFilesSinceNetworkCandidate: [],
      lifecycleChanges,
      historicalEvidenceIsNewExecution: false,
      financialAssertionsPassed: true,
      sourceChecks,
      manifestChecks,
    },
    null,
    2,
  ) + '\n',
);
console.log(
  'Historical evidence integrity, current source compatibility and financial assertions pass.',
);
