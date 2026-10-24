import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';

for (const name of ['server', 'mobile']) {
  const destination = new URL(`../apps/${name}/.env`, import.meta.url);
  if (!existsSync(destination)) {
    copyFileSync(new URL(`../apps/${name}/.env.example`, import.meta.url), destination);
    console.log(`Created apps/${name}/.env`);
  } else {
    console.log(`Kept existing apps/${name}/.env`);
  }
  if (name === 'server') {
    const content = readFileSync(destination, 'utf8');
    const setting = /^AUTH_JWT_SECRET=(.*)$/m.exec(content);
    if (!setting || !setting[1].trim()) {
      const line = `AUTH_JWT_SECRET=${randomBytes(32).toString('hex')}`;
      writeFileSync(
        destination,
        setting
          ? content.replace(/^AUTH_JWT_SECRET=.*$/m, line)
          : `${content.trimEnd()}\n${line}\n`,
        { mode: 0o600 },
      );
      console.log('Initialized local AUTH_JWT_SECRET');
    }
  }
}
