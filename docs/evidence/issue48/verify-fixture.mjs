import { Buffer } from 'node:buffer';
import { readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import assert from 'node:assert/strict';
const root = process.cwd();
const { createDatabase } = await import(root + '/apps/server/dist/db/client.js');
const config = JSON.parse(
  readFileSync(process.env.ISSUE48_RUNTIME ?? '/tmp/tz48-runtime.json', 'utf8'),
);
const db = createDatabase({
  host: config.PGHOST,
  port: +config.PGPORT,
  user: config.PGUSER,
  password: config.PGPASSWORD,
  database: 'tongzhang_48_native',
});
const id = process.env.ISSUE48_LEDGER_ID ?? '9c39754f-647d-46e9-b68f-1e3c90c483b5';
const accounts = JSON.parse(readFileSync('/tmp/tz48-accounts.json', 'utf8'));
const evidence = { ledgerId: id, checkedAt: new Date().toISOString(), http: [], database: {} };
for (const a of accounts.slice(0, 2)) {
  const login = await fetch('http://127.0.0.1:3348/api/v1/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ account: a.email, password: a.password }),
  });
  assert.equal(login.status, 200);
  const token = (await login.json()).data.accessToken;
  const get = async (path) => {
    const r = await fetch('http://127.0.0.1:3348/api/v1' + path, {
      headers: { authorization: 'Bearer ' + token },
    });
    assert.equal(r.status, 200);
    return r.json();
  };
  const detail = (await get('/ledgers/' + id)).data;
  assert.equal(detail.expenseTotalCents, '12000');
  assert.equal(detail.myRemainingNetCents, '0');
  assert.equal(detail.version, 5);
  assert.equal(detail.status, 'SETTLED');
  const batch = (await get('/ledgers/' + id + '/settlement')).data;
  assert.equal(batch.transferCount, 1);
  assert.equal(batch.transferTotalCents, '6000');
  assert.equal(batch.progress.remainingCents, '0');
  assert.equal(batch.transfers[0].registrationNote, 'Issue48-6000');
  const current = (await get('/ledgers')).data.map((x) => x.id);
  const history = (await get('/ledgers?archived=true')).data.map((x) => x.id);
  const owner = a === accounts[0];
  assert.equal(current.includes(id), !owner);
  assert.equal(history.includes(id), owner);
  const expenses = (await get('/ledgers/' + id + '/expenses')).data;
  assert.equal(expenses.length, 1);
  const expense = (await get(`/ledgers/${id}/expenses/${expenses[0].id}`)).data;
  assert.deepEqual(
    expense.splits.map((x) => x.amountCents),
    ['6000', '6000'],
  );
  const images = [];
  for (const imageId of [detail.coverImageId, expense.receiptImageId]) {
    const r = await fetch('http://127.0.0.1:3348/api/v1/images/' + imageId, {
      headers: { authorization: 'Bearer ' + token },
    });
    assert.equal(r.status, 200);
    const bytes = Buffer.from(await r.arrayBuffer());
    const row = (
      await db.pool.query('select content,byte_size from image_assets where id=$1', [imageId])
    ).rows[0];
    assert.deepEqual(bytes, row.content);
    assert.equal(bytes.length, row.byte_size);
    images.push({
      imageId,
      bytes: bytes.length,
      sha256: createHash('sha256').update(bytes).digest('hex'),
      cache: r.headers.get('cache-control'),
    });
  }
  evidence.http.push({
    role: owner ? 'owner' : 'member',
    detail,
    batch,
    current,
    history,
    expense,
    images,
  });
}
for (const table of [
  'ledgers',
  'ledger_members',
  'expenses',
  'expense_splits',
  'expense_images',
  'settlement_batches',
  'settlement_transfers',
  'operation_logs',
]) {
  const key = table === 'ledgers' ? 'id' : 'ledger_id';
  evidence.database[table] = (
    await db.pool.query(`select * from ${table} where ${key}=$1`, [id])
  ).rows;
}
const outsider = accounts[2];
const response = await fetch('http://127.0.0.1:3348/api/v1/auth/login', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ account: outsider.email, password: outsider.password }),
});
assert.equal(response.status, 200);
const outsiderToken = (await response.json()).data.accessToken;
evidence.imageDenials = [];
for (const image of evidence.http[0].images)
  for (const [role, headers] of [
    ['anonymous', {}],
    ['outsider', { authorization: 'Bearer ' + outsiderToken }],
  ]) {
    const r = await fetch('http://127.0.0.1:3348/api/v1/images/' + image.imageId, { headers });
    assert.equal(r.status, role === 'anonymous' ? 401 : 403);
    evidence.imageDenials.push({ role, imageId: image.imageId, status: r.status });
  }
const before = JSON.parse(
  readFileSync(root + '/docs/evidence/issue48/db-preview.json', 'utf8'),
).tables;
for (const table of ['expenses', 'expense_splits', 'expense_images'])
  assert.deepEqual(JSON.parse(JSON.stringify(evidence.database[table])), before[table]);
assert.equal(before.ledgers[0].status, 'ACTIVE');
assert.equal(before.ledgers[0].version, 3);
assert.equal(before.settlement_batches.length, 0);
const frozen = JSON.parse(
  readFileSync(root + '/docs/evidence/issue48/db-frozen.json', 'utf8'),
).tables;
assert.equal(frozen.ledgers[0].status, 'SETTLING');
assert.equal(frozen.ledgers[0].version, 4);
assert.deepEqual(
  JSON.parse(JSON.stringify(evidence.database.settlement_batches)),
  frozen.settlement_batches,
);
const paid = JSON.parse(readFileSync(root + '/docs/evidence/issue48/db-paid.json', 'utf8')).tables;
assert.equal(paid.ledgers[0].status, 'SETTLING');
assert.deepEqual(
  JSON.parse(JSON.stringify(evidence.database.settlement_transfers)),
  paid.settlement_transfers,
);
evidence.unchanged = {
  originalExpenseSplitsReceipt: true,
  formalBatchSnapshot: true,
  paidTransferAfterSettleArchive: true,
};
const raw = readFileSync('/tmp/tz48-requests.jsonl', 'utf8').trim().split('\n').map(JSON.parse);
const related = raw.filter(
  (r) => r.path.includes(id) || (r.path === '/api/v1/ledgers' && r.body?.data?.ledger?.id === id),
);
assert.equal(related.filter((r) => r.path === '/api/v1/ledgers').length, 1);
assert.equal(
  new Set(related.filter((r) => r.path === '/api/v1/ledgers').map((r) => r.keyDigest)).size,
  1,
);
assert.equal(evidence.database.operation_logs.length, 7);
writeFileSync(
  root + '/docs/evidence/issue48/native-verification.json',
  JSON.stringify(evidence, null, 2) + '\n',
);

console.log(
  'Native fixture: 12000/6000/6000, one 6000 transfer, batch/receipt/cover, archive isolation and 7 audits verified.',
);
await db.close();
