import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { classifyBrowsePack, classifyRelease, validateRosterPolicy } from '../../scripts/sgs/roster-metadata.mjs';
import { inBrowseScope, isOldGeneral, hasUnknownYear, releaseLabel, compareBrowseCharacters } from '../../apps/core/sgs/roster-filters.mjs';
const read = async file => JSON.parse(await readFile(new URL(`../../${file}`, import.meta.url), 'utf8'));
const [catalog, roster, policy, history, audio] = await Promise.all([
  'apps/core/sgs/catalog.json', 'apps/core/sgs/roster.json', 'scripts/sgs/roster-policy.json',
  'scripts/sgs/roster-history.json', 'scripts/sgs/character-audio-selection.json',
].map(read));
const find = key => roster.characters.find(c => c.key === key);

test('six requested packs are ordered and named independently of native source-pack and faction', () => {
  assert.deepEqual(roster.browsePacks.slice(0, 6).map(p => p.name), ['一将成名', '限定专属', '群英荟萃', '星河璀璨', '谋包', '威包']);
  const cases = {
    'newjiang:lukai': 'yijiang', 'yijiang:caozhi': 'yijiang', 'refresh:dc_caozhi': 'yijiang',
    'xianding:dc_guansuo': 'limited', 'xianding:dc_zhaoxiang': 'limited', 'xianding:xin_baosanniang': 'limited',
    'xianding:zhouyi': 'limited', 'xianding:luyi': 'limited', 'xianding:dc_ruiji': 'limited',
    'xianding:wanglang': 'limited', 'xianding:liuhui': 'limited', 'xianding:wu_zhugeliang': 'limited',
    'extra:shen_caocao': 'limited', 'xianding:shen_pangtong': 'limited',
    'sp2:xushao': 'huicui', 'huicui:re_panfeng': 'huicui', 'sp2:star_yuanshu': 'xinghe',
    'xianding:dc_sb_lusu': 'mou', 'xianding:dc_jiangji': 'mou', 'newjiang:yj_sb_guojia': 'mou',
    'xianding:v_dongzhuo': 'wei', 'newjiang:v_sunce': 'wei',
    'standard:caocao': 'classic', 'sb:sb_caocao': 'other', 'sp:guansuo': 'other',
  };
  for (const [key, group] of Object.entries(cases)) assert.equal(find(key)?.browsePack, group, key);
  assert.ok(compareBrowseCharacters(find('newjiang:lukai'), find('xianding:v_dongzhuo')) < 0);
  assert.equal(inBrowseScope(find('newjiang:lukai'), 'target'), true, 'mixed source metadata must not hide new Yijiang');
  assert.equal(inBrowseScope(find('refresh:dc_caozhi'), 'target'), true);
  assert.equal(inBrowseScope(find('sb:sb_caocao'), 'target'), false, 'mobile Mou pack remains an explicitly separate version');
});

test('age filter respects the 2021 boundary, dated editions and exact native versions', () => {
  for (const key of ['standard:caocao', 'refresh:re_caocao', 'refresh:xin_gaoshun', 'yijiang:caozhi', 'newjiang:yj_zhanghe']) assert.equal(isOldGeneral(find(key)), true, key);
  for (const key of ['standard:std_panfeng', 'newjiang:lukai', 'refresh:dc_caozhi', 'refresh:dc_xushu', 'refresh:dc_bulianshi', 'xianding:v_dongzhuo', 'newjiang:v_sunce', 'sp2:star_yuanshu']) {
    assert.equal(isOldGeneral(find(key)), false, key); assert.equal(hasUnknownYear(find(key)), false, key);
  }
  assert.equal(find('newjiang:v_sunce').release.year, 2026, 'official date overrides upstream 2025 group label');
  const fixture = {key: 'standard:future', id: 'future', pack: 'standard', groups: [{id: 'standard_2021'}], skills: []};
  assert.equal(classifyRelease(fixture, policy, history, audio).era, 'recent');
  fixture.groups[0].id = 'standard_2020';
  assert.equal(classifyRelease(fixture, policy, history, audio).era, 'old');
});

test('unverified years remain visible with a clear label, and absence in old source never proves recency', () => {
  const fixture = {key: 'xianding:dc_unknown', id: 'dc_unknown', pack: 'xianding', groups: [], skills: []};
  const release = classifyRelease(fixture, policy, history, audio);
  assert.equal(release.era, 'unknown');
  assert.equal(isOldGeneral({release}), false);
  assert.equal(hasUnknownYear({release}), true);
  assert.equal(releaseLabel({release}), '年份待核实');
  assert.equal(releaseLabel({}), '年份待核实', 'older caches degrade conservatively');
  assert.equal(policy.unknownBehavior, 'keep-and-label');
});

test('roster metadata reproduces for every character without changing IDs, native packs or skill versions', () => {
  validateRosterPolicy(catalog, policy);
  assert.equal(roster.characters.length, catalog.characters.length);
  for (const c of catalog.characters) {
    const row = find(c.key);
    assert.equal(row.browsePack, classifyBrowsePack(c, policy), c.key);
    assert.deepEqual(row.release, classifyRelease(c, policy, history, audio), c.key);
    assert.equal(row.pack, c.pack); assert.equal(row.id, c.id);
    assert.deepEqual(row.version, c.version); assert.deepEqual(row.skills.map(s => s.id), c.skills.map(s => s.id));
    if (row.release.basis === 'historical-source') {
      const entry = history.characters.find(old => old.id === c.id && old.pack === row.release.sourcePack && old.line === row.release.line);
      assert.ok(entry, c.key);
      if (entry.pack !== c.pack) assert.deepEqual([...entry.skills].sort(), c.skills.map(s => s.id).sort(), c.key);
    }
  }
  assert.equal(history.commit, '906755306df269df50ddb146c5608af56b400fb6');
  assert.ok(history.sources.every(s => /^[a-f0-9]{64}$/.test(s.sha256) && s.url.includes(history.commit)));
  const stale = structuredClone(policy); stale.releaseOverrides['standard:missing'] = stale.releaseOverrides['refresh:dc_caozhi'];
  assert.throws(() => validateRosterPolicy(catalog, stale), /Stale roster key/);
});
