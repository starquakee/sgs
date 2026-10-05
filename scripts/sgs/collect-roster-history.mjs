// Optional maintainer task. Historical source presence is an upper bound, not an official release date.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { ts, parseSource, objectEntries, literal } from './catalog-source.mjs';

const root = new URL('../../', import.meta.url);
const commit = '906755306df269df50ddb146c5608af56b400fb6';
const packs = ['standard', 'refresh', 'shenhua', 'yijiang', 'extra', 'sp', 'sp2'];
const sources = [], characters = [];
for (const pack of packs) {
  const file = `character/${pack}.js`;
  const url = `https://raw.githubusercontent.com/libnoname/noname/${commit}/${file}`;
  const raw = process.argv.includes('--cached')
    ? await readFile(new URL(`.sgs-assets-cache/2020-${pack}.js`, root))
    : Buffer.from(await (async () => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url}: ${response.status}`);
      return response.arrayBuffer();
    })());
  const ast = parseSource(file, raw.toString('utf8'));
  const tables = [];
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'character' && ts.isObjectLiteralExpression(node.initializer)) tables.push(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(ast);
  if (tables.length !== 1) throw new Error(`${file}: ambiguous historical character table`);
  const diagnostics = [];
  for (const entry of objectEntries(tables[0], diagnostics, file)) {
    const data = literal(entry.node);
    if (!Array.isArray(data) || !Array.isArray(data[3])) throw new Error(`${file}:${entry.id}: unsupported shape`);
    characters.push({ id: entry.id, pack, skills: data[3], line: entry.source.line });
  }
  if (diagnostics.length) throw new Error(JSON.stringify(diagnostics));
  sources.push({ pack, url, sha256: createHash('sha256').update(raw).digest('hex') });
}
const result = { schemaVersion: 1, commit, sourceDate: '2020-12-31',
  note: '同一原生pack:id于2020年底已存在，技能平衡调整不自动变成新版本；跨包迁移需初始技能ID集合一致。不推断首次上线日期，不把未收录视为新武将。明确新版与官方上新证据优先。',
  sources, characters: characters.sort((a, b) => a.id.localeCompare(b.id, 'en') || a.pack.localeCompare(b.pack, 'en')) };
await writeFile(new URL('scripts/sgs/roster-history.json', root), `${JSON.stringify(result, null, 2)}\n`);
console.log(`Historical evidence: ${characters.length} character entries, ${sources.length} pinned source files.`);
