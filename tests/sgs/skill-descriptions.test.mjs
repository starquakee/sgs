import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseSource, defaultObject, objectEntries } from '../../scripts/sgs/catalog-source.mjs';
import { loadDescriptionReader, createDescriptionReader, plainDescription } from '../../scripts/sgs/skill-descriptions.mjs';
import { inBrowseScope } from '../../apps/core/sgs/roster-filters.mjs';
const root = new URL('../../', import.meta.url);
const read = async path => JSON.parse(await readFile(new URL(path, root), 'utf8'));
const [catalog, roster, baseline, reader] = await Promise.all([
  read('apps/core/sgs/catalog.json'), read('apps/core/sgs/roster.json'),
  read('tests/sgs/fixtures/missing-skill-descriptions.json'), loadDescriptionReader(),
]);
function table(pack, source) {
  return new Map(objectEntries(defaultObject(parseSource(`${pack}.js`, source)), [], pack).map(e => [e.id, e]));
}

test('all 63 audited descriptions for 60 common-browsing characters are sourced, without rewriting catalog evidence', () => {
  const missing = roster.characters.filter(c => inBrowseScope(c, 'target')).flatMap(c => c.skills.filter(s => !s.description).map(s => ({ character: c, skill: s })));
  assert.deepEqual(missing.map(({ character: c, skill: s }) => `${c.key}/${s.id}`).sort(), baseline);
  assert.equal(new Set(missing.map(x => x.character.key)).size, 60);
  assert.equal(new Set(missing.map(x => x.skill.id)).size, 63);
  for (const { character, skill } of missing) {
    assert.equal(skill.help.status, 'static', `${character.key}/${skill.id}`);
    assert.ok(skill.help.text.length > 10);
    const original = catalog.characters.find(c => c.key === character.key);
    assert.equal(original.skills.find(s => s.id === skill.id).description, null);
    assert.equal(original.implementation.behaviorStatus, 'unverified');
  }
});

test('every generated help record reproduces from the pinned source, including unchanged version and score inputs', () => {
  for (const character of roster.characters) {
    const original = catalog.characters.find(c => c.key === character.key);
    assert.deepEqual(character.version, original.version);
    for (const skill of character.skills) {
      assert.deepEqual(skill.help, reader.describe(character.pack, skill.id), `${character.key}/${skill.id}`);
      assert.equal(skill.description, original.skills.find(s => s.id === skill.id).description);
    }
  }
});

test('actual inline terms retain complete list content, names and fingerprints', async () => {
  const help = reader.describe('xianding', 'new_dclieqiong');
  assert.match(help.text, /击伤.*天冲/);
  assert.equal(help.terms.length, 2);
  assert.match(help.terms[0].text, /力烽[\s\S]*地机[\s\S]*中枢[\s\S]*气海/);
  assert.match(help.terms[1].text, /失去所有体力/);
  for (const record of [help, ...help.terms]) {
    const bytes = await readFile(new URL(record.source.file, root));
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.source.sha256);
    assert.ok(bytes.toString('utf8').split('\n')[record.source.line - 1].includes('get.poptip'));
  }
  const characterReference = reader.describe('xianding', 'decadexushen');
  assert.match(characterReference.text, /关索.*关索/);
  assert.equal(characterReference.terms.find(t => t.id === 'character_dc_guansuo').characterId, 'dc_guansuo');
});

test('exact finite map/join, card and rule references resolve without evaluating upstream modules', () => {
  assert.ok(reader.describe('sp2', 'jinghe').terms.length >= 12);
  assert.match(reader.describe('huicui', 'chijian').text, /青釭剑/);
  assert.match(reader.describe('huicui', 'chijian').terms[0].text, /防具/);
  const tables = new Map([['a', table('a', 'export default { x_info: `拥有${get.poptip("rule_hujia")}` }')]]);
  const r = createDescriptionReader(tables, { rules: new Map([['rule_hujia', { name: '护甲', info: '原始解释', source: { file: 'rule.js', line: 1 } }]]) });
  assert.equal(r.describe('a', 'x').text, '拥有护甲');
  assert.equal(r.describe('a', 'x').terms[0].text, '原始解释');
});

test('exact-ID cross-pack resolution cannot borrow same-name editions or override local dynamic text', () => {
  const r = createDescriptionReader(new Map([
    ['a', table('a', 'export default {x:"同名",x_info:"版本甲",z_info:danger()}')],
    ['b', table('b', 'export default {x:"同名",x_info:"版本乙",y:"异包技能",y_info:"跨包唯一原文",z_info:"不应借用"}')],
  ]));
  assert.equal(r.describe('a', 'x').text, '版本甲');
  assert.equal(r.describe('b', 'x').text, '版本乙');
  assert.equal(r.describe('c', 'x').reason, 'ambiguous');
  assert.equal(r.describe('a', 'y').text, '跨包唯一原文');
  assert.equal(r.describe('a', 'z').status, 'unresolved');
  assert.equal(r.describe('c', 'unknown').reason, 'missing');
});

test('cycles stay bounded and unsupported expressions/getters remain explicitly unresolved', () => {
  const source = 'import "not-executed"; export default {a:"甲",b:"乙",a_info:`甲获得${get.poptip("b")}`,b_info:`乙获得${get.poptip("a")}`,get bad_info(){throw Error("never")},evil_info:`${(() => {throw Error("never")})()}`,list_info:`${["a"].map(x => dangerous(x)).join("、")}`}';
  const r = createDescriptionReader(new Map([['a', table('a', source)]]));
  const a = r.describe('a', 'a');
  assert.equal(a.text, '甲获得乙');
  assert.equal(a.terms.length, 2);
  assert.ok(a.terms.some(t => t.reason === 'cycle'));
  for (const id of ['bad', 'evil', 'list']) {
    assert.equal(r.describe('a', id).status, 'unresolved');
    assert.equal(r.describe('a', id).text, null);
  }
});

test('plain descriptions preserve list/paragraph boundaries and runtime-dependent text is labelled', () => {
  assert.equal(plainDescription('<p>甲</p><li>一<br><li>二<span>条</span>&lt;3'), '甲\n• 一\n• 二条<3');
  const r = createDescriptionReader(new Map([['a', table('a', 'export default {x_info:"初始规则"}')]]), { dynamicSkills: new Set(['a:x']) });
  assert.equal(r.describe('a', 'x').dynamic, true);
  assert.equal(r.describe('a', 'x').text, '初始规则');
});
