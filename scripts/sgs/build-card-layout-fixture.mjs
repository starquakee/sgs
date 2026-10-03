// Browser regression seam: run the pinned native hand-layout functions on real
// DOM cards, without booting or simulating game rules. Output is disposable.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const source = await readFile(new URL('../../apps/core/noname/ui/index.js', import.meta.url), 'utf8');
const update = source.match(/\tupdatehl\(\) \{[\s\S]*?\n\t\}/)?.[0];
const spread = source.match(/\tgetSpreadOffset\(cards, options = \{\}\) \{[\s\S]*?\n\t\}/)?.[0];
if (!update || !spread) throw new Error('Pinned native hand layout method not found');
const template = await readFile(new URL('../../tests/sgs/card-layout.fixture.html', import.meta.url), 'utf8');
const baseline = process.argv.includes('--before');
const output = new URL(`../../dist-sgs/sgs/card-layout-${baseline ? 'before' : 'test'}.html`, import.meta.url);
await mkdir(new URL('./', output), { recursive: true });
if (baseline) {
  const css = execFileSync('git', ['show', '743cd19:apps/core/sgs/table.css'], {
    cwd: fileURLToPath(new URL('../../', import.meta.url)), windowsHide: true,
  });
  await writeFile(new URL('card-layout-before.css', output), css);
}
await writeFile(output, template.replace('__NATIVE_SPREAD__', spread).replace('__NATIVE_UPDATE__', update)
  .replace('href="table.css"', `href="${baseline ? 'card-layout-before.css' : 'table.css'}"`));
console.log(`Browser fixture: ${output.pathname.split('/dist-sgs/')[1]} (9 → 8 real DOM cards)`);
