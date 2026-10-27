import { readFileSync, appendFileSync, existsSync, unlinkSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = process.cwd();
const config = JSON.parse(
  readFileSync(process.env.ISSUE48_RUNTIME ?? '/tmp/tz48-runtime.json', 'utf8'),
);
const { buildApp } = await import(root + '/apps/server/dist/app.js');
const { readEnv } = await import(root + '/apps/server/dist/config/env.js');
const env = readEnv({
  ...config,
  PGDATABASE: 'tongzhang_48_native',
  NODE_ENV: 'test',
  PORT: '3348',
  LOG_LEVEL: 'silent',
});
const app = await buildApp(env);
app.addHook('onSend', async (req, res, payload) => {
  const e = {
    time: new Date().toISOString(),
    requestId: req.id,
    method: req.method,
    path: req.url,
    status: res.statusCode,
    keyDigest: req.headers['idempotency-key']
      ? createHash('sha256').update(req.headers['idempotency-key']).digest('hex').slice(0, 12)
      : undefined,
  };
  if (
    !req.url.includes('/auth/') &&
    typeof payload === 'string' &&
    res.getHeader('content-type')?.includes('json')
  )
    try {
      e.body = JSON.parse(payload);
    } catch {
      // Non-JSON responses have no diagnostic body.
    }
  const control = existsSync('/tmp/tz48-control.json')
    ? JSON.parse(readFileSync('/tmp/tz48-control.json', 'utf8'))
    : null;
  if (control && req.url === control.path && req.method === control.method) {
    unlinkSync('/tmp/tz48-control.json');
    e.delayMs = control.delayMs;
    appendFileSync(
      '/tmp/tz48-requests.jsonl',
      JSON.stringify({ ...e, event: 'held-real-response' }) + '\n',
    );
    await new Promise((r) => setTimeout(r, control.delayMs));
    e.sentAt = new Date().toISOString();
  }
  appendFileSync('/tmp/tz48-requests.jsonl', JSON.stringify(e) + '\n');
  return payload;
});
await app.listen({ host: '127.0.0.1', port: 3348 });
console.log('Dedicated native API ready on 3348');
