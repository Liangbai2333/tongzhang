import { readFileSync, writeFileSync } from 'node:fs';
const root = process.cwd();
const c = JSON.parse(readFileSync(process.env.ISSUE48_RUNTIME ?? '/tmp/tz48-runtime.json', 'utf8'));
const { createDatabase } = await import(root + '/apps/server/dist/db/client.js');
const db = createDatabase({
  host: c.PGHOST,
  port: +c.PGPORT,
  user: c.PGUSER,
  password: c.PGPASSWORD,
  database: 'tongzhang_48_native',
});
const id = process.env.ISSUE48_LEDGER_ID ?? '9c39754f-647d-46e9-b68f-1e3c90c483b5';
const out = {
  time: new Date().toISOString(),
  stage: process.argv[2],
  database: 'tongzhang_48_native',
  tables: {},
};
if (process.argv[2] === 'revoke') {
  const user = JSON.parse(readFileSync('/tmp/tz48-accounts.json', 'utf8'))[
    Number(process.argv[3] ?? 0)
  ].user.id;
  out.revoked = (
    await db.pool.query(
      'update auth_sessions set revoked_at=now() where user_id=$1 and revoked_at is null returning id,user_id,revoked_at',
      [user],
    )
  ).rows;
} else
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
    out.tables[table] = (
      await db.pool.query(
        `select * from ${table} where ${table === 'ledgers' ? 'id' : 'ledger_id'}=$1`,
        [id],
      )
    ).rows;
  }
writeFileSync(
  root +
    '/docs/evidence/issue48/db-' +
    process.argv[2] +
    (process.argv[3] ? '-' + process.argv[3] : '') +
    '.json',
  JSON.stringify(out, null, 2) + '\n',
);
console.log('Saved isolated database evidence: ' + process.argv[2]);
await db.close();
