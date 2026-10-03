import { spawnSync } from 'node:child_process';
import { cp, mkdir, rm } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../../', import.meta.url));
function run(command,args) { const result=spawnSync(command,args,{cwd:root,stdio:'inherit',windowsHide:true}); if(result.error) throw result.error; if(result.status!==0) process.exit(result.status || 1); }
run(process.execPath,['scripts/sgs/build-catalog.mjs']);
run(process.execPath,['scripts/sgs/build-lobby.mjs']);
if(process.platform==='win32') run(process.env.ComSpec || 'cmd.exe',['/d','/s','/c','pnpm -F noname... build']);
else run('pnpm',['-F','noname...','build']);
const output=resolve(root,'dist-sgs');
if(dirname(output)!==resolve(root)) throw new Error('Build output must remain in this workspace');
await rm(output,{recursive:true,force:true});
await mkdir(output,{recursive:true});
for(const [from,to] of [['apps/core/dist',''],['apps/core/image','image'],['apps/core/sgs','sgs'],['apps/core/sgs.html','sgs.html'],['LICENSE','LICENSE'],['README-SGS.md','README-SGS.md']]) {
  await cp(resolve(root,from),resolve(output,to),{recursive:true});
}
console.log('Production build ready: node scripts/sgs/serve.mjs');
