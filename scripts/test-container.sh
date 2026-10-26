#!/usr/bin/env bash
# Isolated, disposable database. Never uses the developer or production .env.
set -euo pipefail
cd "$(dirname "$0")/.."
export SERVER_IMAGE="${SERVER_IMAGE:-tongzhang-server:check}"
export POSTGRES_USER=tongzhang POSTGRES_PASSWORD='container_test:$@/#' POSTGRES_DB=tongzhang_container_test
export AUTH_JWT_SECRET=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb
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
  assert.equal(tables.rows[0].count, 14);
  const json = (path, body, token) => fetch(`http://127.0.0.1:3300${path}`, {
    method: 'POST',
    headers: { ...(body ? {'Content-Type':'application/json'} : {}), ...(token ? {Authorization:`Bearer ${token}`} : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const registered = await json('/api/v1/auth/register', {
    username:'容器验证', email:`${crypto.randomUUID()}@example.test`, password:'container-password', acceptTerms:true,
  });
  assert.equal(registered.status, 201);
  const {data:account} = await registered.json();
  const refreshed = await json('/api/v1/auth/refresh', {refreshToken:account.refreshToken});
  assert.equal(refreshed.status, 200);
  const {data:pair} = await refreshed.json();
  assert.notEqual(pair.refreshToken, account.refreshToken);
  assert.equal((await fetch('http://127.0.0.1:3300/api/v1/me', {headers:{Authorization:`Bearer ${pair.accessToken}`}})).status, 200);
  assert.equal((await json('/api/v1/auth/logout', undefined, pair.accessToken)).status, 200);
  assert.equal((await fetch('http://127.0.0.1:3300/api/v1/me', {headers:{Authorization:`Bearer ${account.accessToken}`}})).status, 401);
  assert.equal((await json('/api/v1/auth/refresh', {refreshToken:pair.refreshToken})).status, 401);
} finally { await pool.end(); }
console.log('Container checks passed: real PostgreSQL, repeatable migration, dual-token auth and immediate revocation, HTTP, native dependencies, non-root, production files.');
NODE
# Exercise the shipped cleanup command in a separate tools container against real bytea rows.
"${compose[@]}" exec -T server node --input-type=module <<'NODE'
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import pg from 'pg';
const pool = new pg.Pool();
try {
  const image = await sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).png().toBuffer();
  const owner = (await pool.query('select id from users limit 1')).rows[0].id;
  for (const interval of ['25 hours', '1 hour']) {
    await pool.query(`insert into image_assets
      (uploaded_by_user_id, kind, mime_type, byte_size, width, height, sha256, content, created_at)
      values ($1, 'COVER', 'image/png', $2, 1, 1, $3, $4, now() - $5::interval)`,
      [owner, image.length, createHash('sha256').update(image).digest('hex'), image, interval]);
  }
} finally { await pool.end(); }
NODE
"${compose[@]}" run --rm -T cleanup-images
"${compose[@]}" exec -T server node --input-type=module <<'NODE'
import assert from 'node:assert/strict';
import pg from 'pg';
const pool = new pg.Pool();
try {
  const { rows } = await pool.query('select created_at > now() - interval \'24 hours\' as recent from image_assets');
  assert.deepEqual(rows, [{ recent: true }]);
} finally { await pool.end(); }
console.log('Shipped cleanup command passed: expired temporary image deleted, recent image preserved.');
NODE
"${compose[@]}" run --rm --no-deps caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile
