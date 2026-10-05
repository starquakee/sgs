import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { matchOfficialRating, officialScores, validateOfficialRatingMap } from '../../scripts/sgs/official-ratings.mjs';
import { ratingValue, compareOfficialRatings, normalizeRatingPreference } from '../../apps/core/sgs/official-rating.mjs';
const read = async file => JSON.parse(await readFile(new URL(`../../${file}`, import.meta.url), 'utf8'));
const [catalog, roster, snapshot, policy] = await Promise.all([
  'apps/core/sgs/catalog.json', 'apps/core/sgs/roster.json', 'scripts/sgs/official-ratings-source.json', 'scripts/sgs/official-rating-map.json',
].map(read));
const find = key => roster.characters.find(c => c.key === key);

test('official numeric scores preserve the publisher overall and mode/identity fields, including native display clamping', () => {
  assert.equal(snapshot.source.versionTime, '2026-10-01 14:47:58.691');
  assert.equal(snapshot.records.length, 813);
  assert.equal(ratingValue(find('newjiang:v_sunce')), 9);
  assert.equal(ratingValue(find('newjiang:v_sunce'), 'landlord'), 8);
  assert.equal(ratingValue(find('xianding:shen_huangzhong'), 'landlord'), 10);
  assert.equal(ratingValue(find('xianding:shen_huangzhong'), 'farmer'), 9);
  assert.ok(snapshot.records.every(r => Object.values(officialScores(r)).every(n => n >= 0 && n <= 10)));
  assert.deepEqual(officialScores({id: 1, rawScores: [{mode:5,role:0,score:9},{mode:4,role:6,score:16},{mode:4,role:5,score:0}]}), {overall:9,landlord:10,farmer:0});
  assert.throws(() => officialScores({id:1,rawScores:[{mode:5,role:0,score:8},{mode:5,role:0,score:9}]}), /Invalid score/);
});

test('matching requires the correct edition, faction and initial skills; aliases never cross standard/refresh or platform boundaries', () => {
  assert.equal(find('standard:caocao').officialRating.officialId, 16);
  assert.equal(find('refresh:re_caocao').officialRating.officialId, 75);
  assert.equal(find('standard:zhenji').officialRating.officialId, 22);
  assert.equal(find('refresh:re_zhenji').officialRating.officialId, 81);
  assert.equal(find('xianding:luyi').officialRating.officialId, 566);
  assert.equal(find('extra:shen_zhangliao').officialRating.status, 'unmatched', 'old god must not borrow the new three-skill edition');
  assert.equal(find('xianding:dc_shen_zhangliao').officialRating.officialId, 211);
  assert.equal(find('extra:shen_guanyu').officialRating.reason, 'different-skill-edition');
  assert.equal(find('yijiang:xinxianying').officialRating.reason, 'different-skill-edition');
  assert.equal(find('xianding:dc_shen_guanyu').officialRating.officialId, 201);
  assert.equal(find('xianding:re_xinxianying').officialRating.officialId, 528);
  for (const key of ['huicui:dc_huangquan', 'huicui:pangshanmin', 'yijiang:guohuai']) {
    assert.equal(find(key).officialRating.status, 'unmatched', `${key}: changed base HP must not borrow a current-edition rating`);
  }
  assert.throws(() => validateOfficialRatingMap(catalog, snapshot, {...policy, excludedVersions:{}}), /competing editions/);
  assert.equal(find('sb:sb_caocao').officialRating.status, 'unmatched', 'mobile edition must not inherit a decade score');
  assert.equal(ratingValue(find('newjiang:yj_hanbing')), null);
  const duplicate = structuredClone(snapshot), record = duplicate.records.find(r => r.id === 2223);
  duplicate.records.push({...record, id: 999999});
  assert.equal(matchOfficialRating(catalog.characters.find(c => c.key === 'newjiang:v_sunce'), duplicate, policy).reason, 'ambiguous-version');
});

test('every displayed rating reproduces from the fixed official snapshot without modifying native IDs or skills', () => {
  validateOfficialRatingMap(catalog, snapshot, policy);
  for (const c of catalog.characters) {
    const row = find(c.key);
    assert.deepEqual(row.officialRating, matchOfficialRating(c, snapshot, policy), c.key);
    assert.equal(row.pack, c.pack); assert.equal(row.id, c.id);
    assert.deepEqual(row.skills.map(s => s.id), c.skills.map(s => s.id));
  }
  assert.equal(roster.characters.filter(c => c.officialRating.status === 'matched').length, 681);
});

test('numeric sorting handles ties, zero, missing and invalid ratings without changing the input roster', () => {
  const make = (id, value) => ({id, officialRating:{status:'matched',scores:{overall:value}}});
  const rows = [make('unknown', null), make('nine-a',9), make('zero',0), make('nine-b',9), make('five',5), make('bad','10')];
  assert.deepEqual([...rows].sort((a,b)=>compareOfficialRatings(a,b,'overall','high')).map(c=>c.id), ['nine-a','nine-b','five','zero','unknown','bad']);
  assert.deepEqual([...rows].sort((a,b)=>compareOfficialRatings(a,b,'overall','low')).map(c=>c.id), ['zero','five','nine-a','nine-b','unknown','bad']);
  assert.equal(rows[0].id, 'unknown');
  assert.equal(ratingValue(make('nan',NaN)), null);
  assert.equal(ratingValue(make('too-high',11)), null);
  assert.deepEqual(normalizeRatingPreference({order:'high',scope:'landlord'}), {order:'high',scope:'landlord'});
  for(const value of [null,[],{order:'bogus',scope:'quality'}]) assert.deepEqual(normalizeRatingPreference(value), {order:'default',scope:'overall'});
});
