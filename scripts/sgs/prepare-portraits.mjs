import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { parseSource, defaultObject, objectEntries, literal } from './catalog-source.mjs';
const root = fileURLToPath(new URL('../../', import.meta.url));
const catalog = JSON.parse(await readFile(new URL('../../apps/core/sgs/catalog.json', import.meta.url), 'utf8'));
const commit = catalog.upstream.commit;
const tracked = new Set(execFileSync('git', ['-c','core.quotepath=false','ls-tree','-r','--name-only',commit,'apps/core/image'], {cwd:root,encoding:'utf8',maxBuffer:8*1024*1024,windowsHide:true}).trim().split(/\r?\n/).map(p=>p.replace(/^apps\/core\//,'')));
const aliases = JSON.parse(await readFile(new URL('./portrait-aliases.json',import.meta.url),'utf8'));
const external = JSON.parse(await readFile(new URL('./portrait-sources.json',import.meta.url),'utf8'));
const records = new Map();
for (const pack of catalog.packs) {
  const file = `apps/core/character/${pack.id}/character.js`;
  const ast = parseSource(file, await readFile(new URL('../../'+file, import.meta.url),'utf8'));
  for (const entry of objectEntries(defaultObject(ast), [], pack.id)) records.set(`${pack.id}:${entry.id}`,literal(entry.node));
}
const characters = catalog.characters.map(c=>{
  const data = records.get(c.key);
  const candidates = [data.img, ...['jpg','png','webp'].map(ext=>`image/character/${c.id}.${ext}`)].filter(Boolean);
  for (const item of data.trashBin || []) {
    if(item.startsWith('img:')) candidates.unshift(item.slice(4));
    if(item.startsWith('character:')) candidates.unshift(`image/character/${item.slice(10)}.jpg`);
  }
  const exact = candidates.find(p=>tracked.has(p));
  const alias = aliases[c.id] && `image/character/${aliases[c.id]}.jpg`;
  if(alias && !tracked.has(alias)) throw new Error(`Invalid portrait alias ${c.id}: ${alias}`);
  const network = external[c.id];
  return {key:c.key,id:c.id,name:c.name,sex:c.sex,faction:c.faction,source:exact || alias || network?.url || null,kind:exact?'upstream':alias?'same-person-variant':network?'network':'missing',sourcePage:network?.page,evidence:network?.evidence,note:network?.note,candidates};
});
const missing = characters.filter(c=>!c.source);
await mkdir(new URL('../../.sgs-assets-cache/',import.meta.url),{recursive:true});
await writeFile(new URL('../../.sgs-assets-cache/portrait-plan.json',import.meta.url),JSON.stringify({commit,characters},null,2));
console.log(JSON.stringify({total:characters.length,mapped:characters.length-missing.length,kinds:Object.fromEntries(['upstream','same-person-variant','network','missing'].map(kind=>[kind,characters.filter(c=>c.kind===kind).length])),uniqueSources:new Set(characters.filter(c=>c.source).map(c=>c.source)).size,missing:missing.map(({id,name})=>({id,name}))},null,2));
