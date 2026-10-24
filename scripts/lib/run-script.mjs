import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** Node dispatches package scripts with the platform shell, including Windows .cmd tools. */
export function runScript(name, { cwd = fileURLToPath(new URL('../../', import.meta.url)) } = {}) {
  const result = spawnSync(process.execPath, ['--run', name], { cwd, stdio: 'inherit' });
  if (result.error || result.status !== 0) throw new Error(`执行 ${name} 失败。`);
}
