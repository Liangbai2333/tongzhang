import { copyFileSync, existsSync } from 'node:fs';

for (const name of ['api', 'mobile']) {
  const destination = new URL(`../apps/${name}/.env`, import.meta.url);
  if (!existsSync(destination)) {
    copyFileSync(new URL(`../apps/${name}/.env.example`, import.meta.url), destination);
    console.log(`Created apps/${name}/.env`);
  } else {
    console.log(`Kept existing apps/${name}/.env`);
  }
}
