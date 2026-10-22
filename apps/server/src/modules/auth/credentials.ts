import { createHash, randomBytes } from 'node:crypto';
import { hash, verify, argon2id } from 'argon2';
export const hashPassword = (password: string) =>
  hash(password, {
    type: argon2id,
    memoryCost: 19456,
    timeCost: 2,
    parallelism: 1,
    hashLength: 32,
    salt: randomBytes(16),
  });
export const verifyPassword = (encoded: string, password: string) => verify(encoded, password);
export const digestToken = (token: string) => createHash('sha256').update(token).digest('hex');
export function issueSessionToken(now = new Date()) {
  const token = randomBytes(32).toString('base64url');
  return {
    token,
    tokenHash: digestToken(token),
    expiresAt: new Date(now.getTime() + 30 * 86400000),
  };
}
