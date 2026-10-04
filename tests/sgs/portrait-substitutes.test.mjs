import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import ts from 'typescript';
import { parseSource, defaultObject, fields, literal } from '../../scripts/sgs/catalog-source.mjs';
import { applyPortraits } from '../../apps/core/sgs/experience.mjs';

const source = path => readFileSync(new URL(`../../apps/core/${path}`, import.meta.url), 'utf8');
const portraits = JSON.parse(source('sgs/portraits.json')).portraits;
const index = parseSource('index.js', source('character/xianding/index.js'));
let substitutes;
function findSubstitutes(node) {
  if (ts.isPropertyAssignment(node) && node.name.getText(index) === 'characterSubstitute') {
    substitutes = literal(node.initializer);
  } else ts.forEachChild(node, findSubstitutes);
}
findSubstitutes(index);
assert.ok(substitutes, 'read substitute metadata from the locked pack');
const characters = parseSource('character.js', source('character/xianding/character.js'));
const zhouyu = literal(fields(defaultObject(characters)).get('dc_sb_zhouyu'));
const skills = parseSource('skill.js', source('character/xianding/skill.js'));
const yingmou = fields(defaultObject(skills)).get('dcsbyingmou');
const conversion = yingmou.properties.find(node => node.name?.getText(skills) === 'zhuanhuanji').getText(skills);
const nativeConvert = new Function(`return ({${conversion}}).zhuanhuanji;`)();
const nativeSkin = source('noname/library/element/player.js').match(/\tchangeSkin\(map, character\) \{[\s\S]*?\n\t\}/)[0];
const nativeConverted = source('noname/get/index.js').match(/\tconvertedCharacter\(data\) \{[\s\S]*?\n\t\}/)[0];
const nativeCharacter = source('noname/library/element/character.js').replace(/^import .*;\r?\n/, '').replace('export class Character', 'class Character');

function nativeHarness(pack) {
  const lib = { characterSubstitute: pack.characterSubstitute, character: {}, config: { skin: {} }, group: [], element: {} };
  const get = { mode: () => 'identity', copy: structuredClone, infoHp: Number, infoMaxHp: Number, infoHujia: () => 0,
    is: { object: value => value && typeof value === 'object' && !Array.isArray(value) } };
  lib.element.Character = new Function('lib', 'get', `${nativeCharacter}\nreturn Character;`)(lib, get);
  get.convertedCharacter = new Function('lib', `return ({${nativeConverted}}).convertedCharacter;`)(lib);
  lib.character.dc_sb_zhouyu = get.convertedCharacter(pack.character.dc_sb_zhouyu);
  const backgrounds = [], videos = [], temporaryNames = new Set();
  const game = { broadcastAll: (fn, ...args) => fn(...args), addVideo: (...args) => videos.push(args) };
  const player = { name: 'dc_sb_zhouyu', name1: 'dc_sb_zhouyu', skin: { name: 'dc_sb_zhouyu' }, storage: {},
    tempname: { add: name => temporaryNames.add(name), remove: name => temporaryNames.delete(name) },
    node: { avatar: { setBackgroundImage: path => backgrounds.push({ image: path }),
      setBackground: (id, type) => backgrounds.push({ id, type }), show() {} } },
    smoothAvatar() {},
    changeSkin: new Function('lib', 'game', 'get', `return ({${nativeSkin}}).changeSkin;`)(lib, game, get) };
  return { lib, player, backgrounds, videos, temporaryNames };
}

test('native Yingmou conversion and changeSkin keep the local portrait, real skin/audio alias and return path', () => {
  const pack = { character: { dc_sb_zhouyu: structuredClone(zhouyu) }, characterSubstitute: structuredClone(substitutes) };
  applyPortraits({ xianding: pack }, portraits);
  const h = nativeHarness(pack), localImage = `sgs/portraits/${portraits.dc_sb_zhouyu.file}`;
  assert.ok(existsSync(new URL(`../../apps/core/${localImage}`, import.meta.url)));
  nativeConvert(h.player, 'dcsbyingmou');
  assert.deepEqual(h.backgrounds, [{ image: localImage }], 'conversion must not request the absent upstream shadow JPG');
  assert.equal(h.player.storage.dcsbyingmou, true);
  assert.equal(h.player.skin.name, 'dc_sb_zhouyu_shadow');
  assert.deepEqual([...h.temporaryNames], ['dc_sb_zhouyu_shadow'], 'native audio alias must retain the shadow ID');
  assert.equal(h.lib.character.dc_sb_zhouyu_shadow, undefined, 'temporary character is removed by the native method');
  assert.deepEqual(pack.character.dc_sb_zhouyu.skills, zhouyu.skills);
  nativeConvert(h.player, 'dcsbyingmou');
  assert.equal(h.player.storage.dcsbyingmou, false);
  assert.equal(h.player.skin.name, 'dc_sb_zhouyu');
  assert.deepEqual(h.backgrounds, [{ image: localImage }, { image: localImage }]);
  assert.deepEqual(h.videos.map(([, , data]) => data.to), ['dc_sb_zhouyu_shadow', 'dc_sb_zhouyu']);
  h.lib.config.skin.dc_sb_zhouyu_shadow = 1;
  nativeConvert(h.player, 'dcsbyingmou');
  assert.deepEqual(h.backgrounds.at(-1), { id: 'dc_sb_zhouyu_shadow', type: 'character' }, 'explicit native skin settings keep their own image path');
});

test('substitutes prefer exact local art and preserve non-image metadata, absent assets and repeated initialization', () => {
  const metadata = ['wu', 'die:hero', 'unseen', 'hiddenSkill', 'tempname:voice_alias', 'img:old.jpg', 'custom-tag', { extension: true }];
  const pack = { character: { hero: { skills: ['convert'], isUnseen: true } }, characterSubstitute: {
    hero: [['exact', [...metadata]], ['fallback', []]], unknown: [['untouched', ['img:custom.jpg', 'die:unknown']]],
    otherPack: [['crosspack', []]],
  } };
  const local = { hero: { file: 'base.webp' }, exact: { file: 'exact.webp' }, otherPack: { file: 'other.webp' } };
  applyPortraits({ pack }, local);
  assert.deepEqual(pack.characterSubstitute.hero[0], ['exact', [...metadata.filter(tag => typeof tag !== 'string' || !tag.startsWith('img:')), 'img:sgs/portraits/exact.webp']]);
  assert.deepEqual(pack.characterSubstitute.hero[1], ['fallback', ['img:sgs/portraits/base.webp']]);
  assert.deepEqual(pack.characterSubstitute.otherPack[0], ['crosspack', ['img:sgs/portraits/other.webp']]);
  assert.deepEqual(pack.characterSubstitute.unknown[0], ['untouched', ['img:custom.jpg', 'die:unknown']]);
  assert.equal(pack.character.hero.isUnseen, true);
  assert.deepEqual(pack.character.hero.skills, ['convert']);
  const once = structuredClone(pack);
  applyPortraits({ pack }, local);
  assert.deepEqual(pack, once, 'retry must not stack img tags or alter native metadata');
});
