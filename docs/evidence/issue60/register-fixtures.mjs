import { existsSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
const accounts = [];
if (existsSync('/tmp/tz60-accounts.json'))
  throw new Error('Existing private account fixture must be preserved.');
for (const label of ['owner', 'member', 'outsider']) {
  const body = {
    acceptTerms: true,
    username: `Issue60-${label}`,
    email: `issue60-${label}@example.test`,
    password: randomBytes(12).toString('hex'),
  };
  const response = await fetch('http://127.0.0.1:3360/api/v1/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const json = await response.json();
  if (!response.ok) throw new Error(JSON.stringify(json));
  accounts.push({ ...body, ...json.data });
}
writeFileSync('/tmp/tz60-accounts.json', JSON.stringify(accounts), { mode: 0o600 });
console.log(
  'Three dedicated accounts registered; credentials stored only in local private fixture',
);
