#!/usr/bin/env bash
# Isolated, disposable database. Never uses the developer or production .env.
set -euo pipefail
cd "$(dirname "$0")/.."
export SERVER_IMAGE="${SERVER_IMAGE:-tongzhang-server:check}"
export POSTGRES_USER=tongzhang POSTGRES_PASSWORD='container_test:$@/#' POSTGRES_DB=tongzhang_container_test
export API_DOMAIN=localhost PROXY_SUBNET="${TEST_PROXY_SUBNET:-172.31.240.0/28}"
compose=(docker compose --env-file infra/.env.example -p "tongzhang-check-$$" -f infra/compose.prod.yml)
cleanup() {
  result=$?
  if [ "$result" -ne 0 ]; then "${compose[@]}" logs --tail 60 server; fi
  "${compose[@]}" --profile tools down --volumes --remove-orphans
  exit "$result"
}
trap cleanup EXIT
"${compose[@]}" config --quiet
"${compose[@]}" up -d --wait postgres
"${compose[@]}" run --rm migrate
"${compose[@]}" run --rm migrate
"${compose[@]}" up -d --wait --wait-timeout 90 server
"${compose[@]}" exec -T server node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import argon2 from 'argon2';
import sharp from 'sharp';
import pg from 'pg';
assert.notEqual(process.getuid(), 0);
assert.equal(existsSync('.env'), false);
assert.equal(existsSync('node_modules/typescript'), false);
const hash = await argon2.hash('container-check');
assert.ok(await argon2.verify(hash, 'container-check'));
await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).png().toBuffer();
for (const [path, status] of [['/health/live',200],['/health/ready',200],['/docs',404]]) {
  assert.equal((await fetch(`http://127.0.0.1:3300${path}`)).status, status);
}
const pool = new pg.Pool();
try {
  const tables = await pool.query("select count(*)::int as count from information_schema.tables where table_schema='public'");
  assert.equal(tables.rows[0].count, 13);
} finally { await pool.end(); }
console.log('Container checks passed: real PostgreSQL, repeatable migration, HTTP, native dependencies, non-root, production files.');
NODE
"${compose[@]}" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
