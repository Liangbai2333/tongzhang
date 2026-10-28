import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(process.cwd() + '/apps/server/package.json');
const { Pool } = require('pg');
const config = JSON.parse(readFileSync('/tmp/tz60-runtime.json', 'utf8'));
const mode = process.argv[2];
const pool = new Pool({
  host: config.PGHOST,
  port: Number(config.PGPORT),
  user: config.PGUSER,
  password: config.PGPASSWORD,
  database: mode === 'test-cleanup' ? config.PGDATABASE : 'tongzhang_60_native',
});
try {
  if (mode === 'revoke') {
    const accounts = JSON.parse(readFileSync('/tmp/tz60-accounts.json', 'utf8'));
    const userId = accounts[Number(process.argv[3] ?? 0)].user.id;
    const { rows } = await pool.query(
      'update auth_sessions set revoked_at=now() where user_id=$1 and revoked_at is null returning id,user_id,revoked_at',
      [userId],
    );
    assert.ok(rows.length > 0);
    writeFileSync(
      `docs/evidence/issue60/db-revoke-${process.argv[4] ?? 'foreground'}.json`,
      JSON.stringify({ fixtureIntervention: true, rows }, null, 2) + '\n',
    );
  } else {
    const { rows: tables } = await pool.query(
      "select tablename from pg_tables where schemaname='public' order by tablename",
    );
    const counts = {};
    for (const { tablename } of tables) {
      assert.match(tablename, /^[a-z_]+$/);
      const { rows } = await pool.query(`select count(*)::int as n from "${tablename}"`);
      counts[tablename] = rows[0].n;
    }
    const { rows: connections } = await pool.query(
      'select application_name,state from pg_stat_activity where datname=current_database() and pid<>pg_backend_pid()',
    );
    const { rows: triggers } = await pool.query(
      "select tgname from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where not t.tgisinternal and n.nspname='public'",
    );
    if (mode === 'test-cleanup') {
      assert.ok(Object.values(counts).every((n) => n === 0));
      assert.deepEqual(connections, []);
      assert.deepEqual(triggers, []);
    }
    const details = {};
    if (mode !== 'test-cleanup')
      for (const table of ['ledgers', 'ledger_members', 'expenses', 'operation_logs'])
        details[table] = (await pool.query(`select * from ${table} order by 1`)).rows;
    writeFileSync(
      `docs/evidence/issue60/db-${mode}.json`,
      JSON.stringify(
        { capturedAtUtc: new Date().toISOString(), counts, connections, triggers, details },
        null,
        2,
      ) + '\n',
    );
  }
} finally {
  await pool.end();
}
