import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { existsSync } from 'node:fs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const vite = fileURLToPath(new URL('../../apps/core/node_modules/vite/bin/vite.js', import.meta.url));
if (!existsSync(vite)) {
  console.error('请先运行 pnpm --filter noname... --filter . install --ignore-scripts');
  process.exit(1);
}
console.log('三国杀单机研习版：http://127.0.0.1:8081/sgs.html');
const child = spawn(process.execPath, [vite, '--host', '127.0.0.1', '--port', '8081', '--strictPort', ...process.argv.slice(2)], {
  cwd: fileURLToPath(new URL('../../apps/core/', import.meta.url)), stdio: 'inherit', windowsHide: true,
});
child.on('exit', code => process.exit(code ?? 1));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
