import test, { after } from 'node:test';
import ts from 'typescript';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseSource, defaultObject, objectEntries, literal, binding, fields } from '../../scripts/sgs/catalog-source.mjs';
import { resolveCardAudio, installCardAudio } from '../../apps/core/sgs/card-audio.mjs';
import { resolveCharacterAudio, installCharacterAudio } from '../../apps/core/sgs/character-audio.mjs';
import { resolveDamageAudio } from '../../apps/core/sgs/damage-audio.mjs';
import voices from '../../apps/core/character/xianding/voices.js';
import { readCharacterAudioSource } from '../../scripts/sgs/character-audio-source.mjs';

const base = new URL('../../apps/core/sgs/', import.meta.url);
const manifest = JSON.parse(await readFile(new URL('card-audio.json', base), 'utf8'));
const engineSource = await readFile(new URL('../../apps/core/noname/game/index.js', import.meta.url), 'utf8');
const nativeMethod = engineSource.match(/\tplayCardAudio\(card, sex\) \{[\s\S]*?\n\t\}/)[0];
const characterManifest = JSON.parse(await readFile(new URL('character-audio.json', base), 'utf8'));
const characterSource = await readCharacterAudioSource();
const damageManifest = JSON.parse(await readFile(new URL('damage-audio.json', base), 'utf8'));
const contentSource = parseSource('content.ts', await readFile(new URL('../../apps/core/noname/library/element/content.ts', import.meta.url), 'utf8'));
const damageStep = fields(binding(contentSource, 'Content')).get('damage').elements[4].getText(contentSource);
const damageJS = ts.transpileModule(`const damage = ${damageStep};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
const librarySource = await readFile(new URL('../../apps/core/noname/library/index.js', import.meta.url), 'utf8');
const nativeNatureAudio = new Function(`return (${librarySource.match(/\tnatureAudio = (\{[\s\S]*?\n\t\});/)[1]});`)();
const audioSource = await readFile(new URL('../../apps/core/noname/get/audio.ts', import.meta.url), 'utf8');
const audioJS = ts.transpileModule(audioSource.replace(/^import[^\n]+\n/, '').replace('export class Audio', 'class Audio'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
const originalRandomRemove = Object.getOwnPropertyDescriptor(Array.prototype, 'randomRemove');
const originalAddArray = Object.getOwnPropertyDescriptor(Array.prototype, 'addArray');
let pickLast = false;
Object.defineProperty(Array.prototype, 'randomRemove', { configurable: true, value() { return this.splice(pickLast ? this.length - 1 : 0, 1)[0]; } });
Object.defineProperty(Array.prototype, 'addArray', { configurable: true, value(values) { for (const value of values) if (!this.includes(value)) this.push(value); return this; } });
after(() => { if (originalRandomRemove) Object.defineProperty(Array.prototype, 'randomRemove', originalRandomRemove); else delete Array.prototype.randomRemove; });
after(() => { if (originalAddArray) Object.defineProperty(Array.prototype, 'addArray', originalAddArray); else delete Array.prototype.addArray; });

test('local card recordings are attributable, intact, and cover both voices for the complete standard/extra deck', async () => {
  assert.equal(manifest.upstreamCommit, '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a');
  const needed = new Set();
  for (const pack of ['standard', 'extra']) {
    const text = await readFile(new URL(`../../apps/core/card/${pack}.js`, import.meta.url), 'utf8');
    const source = parseSource(`${pack}.js`, text);
    const list = objectEntries(defaultObject(source), [], pack).find(entry => entry.id === 'list');
    for (const [, , name, nature] of literal(list.node)) needed.add(name === 'sha' && nature ? `${name}_${nature}` : name);
  }
  for (const name of needed) {
    for (const sex of ['male', 'female']) {
      assert.ok(resolveCardAudio(`card/${sex}/${name}`, manifest), `Missing deck audio: ${sex}/${name}`);
    }
  }
  let total = 0;
  const files = new Set();
  for (const [key, clip] of Object.entries(manifest.clips)) {
    assert.equal(key, clip.key);
    assert.match(clip.file, /^audio\/card\/(male|female|shared)\/[a-z_]+\.(mp3|ogg)$/);
    if (clip.kind === 'system-speech') {
      assert.match(key, /^card\/(male|female)\/tao$/);
      assert.equal(clip.speech.text, '桃');
      assert.equal(clip.speech.locale, 'zh-CN');
      assert.ok(clip.speech.voice.startsWith('Microsoft '));
      assert.equal(clip.recipe, 'scripts/sgs/prepare-peach-voice.ps1');
    } else assert.match(clip.sourceUrl, /^https:\/\/raw\.githubusercontent\.com\/libnoname\/noname\/[a-f\d]{40}\//);
    const bytes = await readFile(new URL(clip.file, base));
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
    if (clip.sourceGitBlob) assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), clip.sourceGitBlob);
    if (clip.file.endsWith('.ogg')) assert.equal(bytes.subarray(0, 4).toString(), 'OggS');
    else assert.ok(bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224), `Invalid MP3: ${key}`);
    assert.ok(bytes.length > 500 && bytes.length < 512 * 1024);
    files.add(clip.file);
    total += bytes.length;
  }
  assert.equal(total, manifest.totalBytes);
  assert.equal(files.size, manifest.uniqueFiles);
  assert.ok(total < 2 * 1024 * 1024);
  for (const sex of ['male', 'female']) {
    assert.equal((await readdir(new URL(`audio/card/${sex}/`, base))).length,
      [...files].filter(file => file.startsWith(`audio/card/${sex}/`)).length);
  }
  assert.equal(resolveCardAudio('card/male/tao', manifest).kind, 'system-speech');
  assert.notEqual(resolveCardAudio('card/female/tao', manifest).sha256, resolveCardAudio('card/male/tao', manifest).sha256);
  assert.equal(resolveCardAudio('card/female/huosha.mp3', manifest).key, 'card/female/sha_fire');
  assert.equal(resolveCardAudio('card/male/../../skill/a', manifest), null);
  assert.equal(resolveCardAudio('skill/longdan1', manifest), null);
});

function harness({ running = true, fetchFail = false, characterAudio = false, damageAudio = false, fetchAudio, audioOptions = {} } = {}) {
  let current;
  const fetched = [];
  const starts = [];
  const stopped = [];
  const listeners = new Map();
  const surface = {
    addEventListener(type, fn) { listeners.set(type, fn); },
    removeEventListener(type) { listeners.delete(type); },
  };
  const ctx = {
    state: running ? 'running' : 'suspended', currentTime: 5, destination: {}, resumes: 0,
    async resume() { this.resumes++; this.state = 'running'; },
    async close() { this.state = 'closed'; },
    async decodeAudioData() { return { duration: 0.8 }; },
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; },
    createBufferSource() {
      const source = { connect(gain) { this.gain = gain; }, disconnect() {}, start(at) { starts.push({ at, source }); }, stop() { stopped.push(source); } };
      return source;
    },
  };
  const lib = {
    config: { background_audio: true, equip_audio: true, background_speak: false, volumn_audio: 6 },
    skill: { global: [], ...structuredClone(characterSource.skills) },
    translate: voices, characterSubstitute: structuredClone(characterSource.characterSubstitute), natureAudio: structuredClone(nativeNatureAudio),
    card: { sha: { audio: true }, shan: { audio: true }, huogong: { audio: true }, tao: {}, bagua: { audio: true } },
  };
  const get = {
    event: () => current,
    itemtype: item => item && typeof item === 'object' && 'sex' in item ? 'player' : 'other',
    type: card => card.name === 'bagua' ? 'equip' : 'basic',
    natureList: card => card.nature?.split('|') || [],
    dynamicVariable: value => value,
    info: name => lib.skill[name],
    character: id => characterSource.characters[id] || { sex: 'male', tempname: [], dieAudios: [], isNull: true },
    convertedCharacter: () => ({ tempname: [], dieAudios: [] }),
    cnNumber: value => String(value),
    translation: value => String(value),
  };
  const game = {
    playAudio() { throw new Error('Unpackaged upstream audio must not be requested'); },
    broadcast() {},
    broadcastAll(fn, ...args) { fn(...args); },
    log() {},
    addGlobalSkill(name) { this.globalSkill = name; },
    removeGlobalSkill(name) { assert.equal(name, this.globalSkill); },
  };
  // Test the actual pinned native resolver rather than a mirror of its logic.
  game.playCardAudio = new Function('game', 'lib', 'get', `return ({${nativeMethod}}).playCardAudio;`)(game, lib, get);
  get.Audio = new Function('lib', 'get', `${audioJS}\nreturn Audio;`)(lib, get);
  for (const method of ['tryAudio', 'trySkillAudio', 'tryDieAudio']) {
    const code = engineSource.match(new RegExp(`\\t${method}\\([^]*?\\n\\t\\}`))[0];
    game[method] = new Function('game', 'lib', 'get', `return ({${code}}).${method};`)(game, lib, get);
  }
  const original = game.playCardAudio;
  const controller = installCardAudio({ lib, game, get }, manifest, {
    surface, host: {}, createContext: () => ctx, baseURL: new URL('http://localhost/sgs/'), characterManifest: characterAudio ? characterManifest : undefined, damageManifest: damageAudio ? damageManifest : undefined,
    ...audioOptions,
    fetch: async (url, request) => { fetched.push(String(url)); return fetchAudio ? fetchAudio(url, request) : { ok: !fetchFail, status: fetchFail ? 404 : 200, arrayBuffer: async () => new ArrayBuffer(12) }; },
  });
  const nativeSkill = game.trySkillAudio;
  const hero = characterAudio ? installCharacterAudio({ lib, game }, characterManifest, { host: {} }) : null;
  const damage = new Function('game', 'lib', 'get', `${damageJS}\nreturn damage;`)(game, lib, get);
  return { game, lib, get, ctx, fetched, starts, stopped, listeners, controller, original, hero, nativeSkill, damage, setEvent: event => { current = event; } };
}

test('native confirmed play and supplemental trigger produce one correctly gendered nature voice', async () => {
  const h = harness();
  const event = { name: 'useCard', card: { name: 'sha', nature: 'fire' }, player: { sex: 'female' } };
  h.setEvent(event);
  h.game.playCardAudio(event.card, event.player);
  await h.lib.skill[h.game.globalSkill].content({}, event);
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 1);
  assert.deepEqual(h.fetched, ['http://localhost/sgs/audio/card/female/sha_fire.mp3']);
  assert.equal(h.controller.status().lastClip, 'card/female/sha_fire');
  assert.equal(h.lib.skill[h.game.globalSkill].content.constructor.name, 'AsyncFunction');
  assert.deepEqual(h.lib.skill[h.game.globalSkill].trigger, { player: ['useCard1', 'respond'] });
  h.controller.dispose();
  assert.equal(h.game.playCardAudio, h.original);
});

test('skill conversion, response, and Peach remain audible while committed equipment stays silent', async () => {
  const h = harness();
  assert.equal(h.starts.length, 0);
  for (const [name, card, sex] of [['useCard', 'sha', 'male'], ['respond', 'shan', 'female'], ['useCard', 'bagua', 'male'], ['useCard', 'tao', 'female']]) {
    const event = { name, card: { name: card }, player: { sex }, skill: 'longdan' };
    await h.lib.skill[h.game.globalSkill].content({}, event);
  }
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 3);
  assert.deepEqual(h.fetched.map(url => url.split('/').slice(-2).join('/')), ['male/sha.mp3', 'female/shan.mp3', 'female/tao.mp3']);
  assert.ok(h.starts.every((entry, i) => !i || entry.at >= h.starts[i - 1].at + 0.8));
  h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, audio: false });
  h.game.playAudio('effect', 'damage');
  h.game.playAudio('skill', 'longdan1');
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 3);
  h.controller.dispose();
});

test('equipment is silent through native and fallback calls after unmuting, without suppressing hero lines or view-as cards', async () => {
  const h = harness({ characterAudio: true });
  const player = { name: 'v_dongzhuo', sex: 'male' };
  try {
    for (const toggle of [false, true]) {
      if (toggle) {
        h.controller.setEnabled(false);
        h.controller.setEnabled(true);
        assert.equal(h.lib.config.equip_audio, false);
      }
      const event = { name: 'useCard', card: { name: 'bagua' }, player };
      h.setEvent(event);
      h.game.playCardAudio(event.card, player);
      h.game.playCardAudio('bagua', 'female');
      await h.lib.skill[h.game.globalSkill].content({}, event);
      await h.controller.whenIdle();
      assert.equal(h.fetched.length, 0, 'equipment must not enter the audio queue');
      assert.equal(h.starts.length, 0);
    }
    h.game.trySkillAudio('dcguangyong', player);
    // An equipment cost converted into Slash is still announced as Slash.
    h.controller.playCommitted({ name: 'useCard', card: { name: 'sha', cards: [{ name: 'bagua' }] }, player });
    await h.controller.whenIdle();
    assert.equal(h.starts.length, 2);
    assert.deepEqual(h.fetched.map(url => url.replace('http://localhost/sgs/audio/', '')), ['skill/dcguangyong1.mp3', 'card/male/sha.mp3']);
  } finally { h.hero.dispose(); h.controller.dispose(); }
});

test('gesture unlock persists for AI, mute stops queued audio, and no blocked backlog is replayed', async () => {
  const h = harness({ running: false });
  h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: { sex: 'male' } });
  assert.equal(h.fetched.length, 0);
  assert.equal(h.controller.status().blocked, true);
  h.listeners.get('pointerdown')();
  await h.controller.unlock();
  assert.equal(h.ctx.state, 'running');
  assert.equal(h.starts.length, 0);
  h.controller.playCommitted({ name: 'useCard', card: { name: 'huogong' }, player: { sex: 'male' } });
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 1);
  h.controller.setEnabled(false);
  assert.equal(h.stopped.length, 1);
  h.controller.playCommitted({ name: 'respond', card: { name: 'shan' }, player: { sex: 'female' } });
  await h.controller.whenIdle();
  assert.equal(h.fetched.length, 1);
  h.controller.dispose();
  assert.equal(h.listeners.size, 0);
});

test('missing or undecodable audio cannot interrupt rule resolution', async () => {
  const h = harness({ fetchFail: true });
  assert.doesNotThrow(() => h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: { sex: 'male' } }));
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 0);
  assert.equal(h.controller.status().pending, 0);
  assert.match(h.controller.status().lastError, /404/);
  h.controller.dispose();
});

test('the original five Wei Dong Zhuo recordings remain byte-identical and match native paths/text', async () => {
  const h = harness({ characterAudio: true });
  const source = parseSource('xianding-skill.js', await readFile(new URL('../../apps/core/character/xianding/skill.js', import.meta.url), 'utf8'));
  const skills = objectEntries(defaultObject(source), [], 'xianding');
  const paths = [];
  for (const skill of ['dcguangyong', 'dcjuchui']) {
    const nativeInfo = skills.find(entry => entry.id === skill);
    const nativeAudio = objectEntries(nativeInfo.node, [], skill).find(entry => entry.id === 'audio');
    h.lib.skill[skill].audio = literal(nativeAudio.node);
    assert.equal(h.lib.skill[skill].audio, 2);
    paths.push(...h.get.Audio.skill({ skill, player: 'v_dongzhuo' }).fileList);
  }
  paths.push(...h.get.Audio.die({ player: 'v_dongzhuo' }).fileList);
  assert.equal(paths.length, 5);
  assert.equal(characterManifest.upstreamCommit, manifest.upstreamCommit);
  assert.deepEqual(characterManifest.characters.v_dongzhuo.clipKeys.slice().sort(), paths.map(path => path.replace(/\.mp3$/, '')).sort());
  let total = 0;
  for (const path of paths) {
    const clip = resolveCharacterAudio(path, characterManifest);
    assert.equal(clip.character, 'v_dongzhuo');
    assert.equal(clip.text, voices[`#${clip.key.split('/')[1]}${clip.key.startsWith('die/') ? ':die' : ''}`]);
    assert.equal(clip.sourceUrl, `https://raw.githubusercontent.com/libnoname/noname/${manifest.upstreamCommit}/apps/core/audio/${path}`);
    const bytes = await readFile(new URL(clip.file, base));
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), clip.sourceGitBlob);
    total += bytes.length;
  }
  assert.equal(total, 407236);
  for (const path of ['skill/longdan1', 'die/dongzhuo', 'skill/../../dcguangyong1', 'https://example.com/skill/dcguangyong1.mp3']) {
    assert.equal(resolveCharacterAudio(path, characterManifest), null);
  }
  h.hero.dispose(); h.controller.dispose();
});

test('all curated recent hero audio is complete, pinned and reproducible, excluding old versions', async () => {
  assert.equal(characterManifest.schemaVersion, 2);
  assert.deepEqual(characterManifest.characters, characterSource.metadata);
  assert.deepEqual(Object.keys(characterManifest.clips).sort(), Object.keys(characterSource.clips).sort());
  assert.equal(Object.keys(characterManifest.characters).length, 9);
  assert.equal(characterManifest.uniqueFiles, 58);
  const roster = JSON.parse(await readFile(new URL('roster.json', base), 'utf8'));
  for (const [id, hero] of Object.entries(characterManifest.characters)) {
    assert.equal(roster.characters.find(character => character.id === id).version.category, 'decade');
    assert.ok(hero.releaseDate >= '2024-10-04' && hero.releaseDate <= '2026-10-04');
    assert.match(hero.evidenceUrl, /^https:\/\/x\.sanguosha\.com\/news\//);
  }
  let total = 0;
  for (const [key, clip] of Object.entries(characterManifest.clips)) {
    assert.equal(resolveCharacterAudio(`audio/${key}.mp3`, characterManifest), clip);
    assert.equal(clip.file, characterSource.clips[key].file);
    assert.equal(clip.text, characterSource.clips[key].text);
    assert.equal(clip.sourceUrl, `https://raw.githubusercontent.com/libnoname/noname/${manifest.upstreamCommit}/apps/core/${clip.file}`);
    const bytes = await readFile(new URL(clip.file, base));
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), clip.sourceGitBlob);
    total += bytes.length;
  }
  assert.equal(total, characterManifest.totalBytes);
  assert.ok(total < 8 * 1024 * 1024);
  assert.equal(new Set(Object.values(characterManifest.clips).map(clip => clip.file)).size, 58);
  for (const id of ['dongzhuo', 'sunquan', 'shen_sunquan', 're_caocao', 'xunyu', 'sb_xunyu']) {
    assert.equal(characterManifest.characters[id], undefined);
    assert.equal(resolveCharacterAudio(`die/${id}`, characterManifest), null);
  }
});

test('native skill aliases and conversion forms play every selected clip through the hero queue', async () => {
  const h = harness({ characterAudio: true });
  // Several different generals react within one card event: no hero line is deduplicated.
  h.setEvent({ name: 'useCard', card: { name: 'sha' } });
  let expectedStarts = 0;
  for (const [id, hero] of Object.entries(characterManifest.characters)) {
    for (const form of hero.forms) {
      const player = { name: id, sex: 'male', skin: { name: form }, tempname: form === id ? [] : [form] };
      for (const skill of hero.skills) for (const last of [false, true]) {
        pickLast = last;
        h.game.trySkillAudio(skill, player, true);
        expectedStarts++;
        assert.equal(h.lib.config.background_speak, false);
      }
      h.game.tryDieAudio(player);
      expectedStarts++;
    }
  }
  await h.controller.whenIdle();
  assert.equal(h.starts.length, expectedStarts);
  assert.deepEqual(h.fetched.map(url => url.replace('http://localhost/sgs/audio/', '').replace(/\.mp3$/, '')).sort(), Object.keys(characterManifest.clips).sort());
  h.game.trySkillAudio('dccangming', 'shen_sunquan');
  h.game.trySkillAudio('dcsbshimou', 'xunyu');
  h.game.trySkillAudio('dcjuxi', 'v_mateng');
  h.game.tryDieAudio('sunquan');
  h.controller.setEnabled(false);
  h.game.trySkillAudio('luansuo', 'shen_pangtong');
  await h.controller.whenIdle();
  assert.equal(h.starts.length, expectedStarts);
  h.hero.dispose(); h.controller.dispose();
});

test('native card and hero recordings overlap while each category keeps its own order', async () => {
  const h = harness({ characterAudio: true });
  const player = { name: 'v_dongzhuo', sex: 'male' };
  try {
    const event = { name: 'useCard', card: { name: 'huogong' }, player };
    h.setEvent(event);
    h.controller.playCommitted(event);
    h.game.trySkillAudio('dcguangyong', player);
    await h.controller.whenIdle();
    assert.deepEqual(h.starts.map(entry => entry.at), [5, 5], 'card and triggered hero line must overlap');
    h.game.tryDieAudio(player);
    h.controller.playCommitted({ name: 'respond', card: { name: 'shan' }, player });
    await h.controller.whenIdle();
    assert.equal(h.starts.length, 4);
    assert.equal(h.starts[2].at, h.starts[3].at, 'both channels advance independently');
    assert.ok(h.starts[2].at >= 5.8, 'each channel preserves its existing internal order');
    assert.equal(h.stopped.length, 0, 'overlap must not interrupt an earlier recording');
  } finally { h.hero.dispose(); h.controller.dispose(); }
});

test('a pending card or hero download never blocks the other category', async () => {
  for (const blocked of ['card', 'skill']) {
    let release;
    const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(12) };
    const h = harness({ characterAudio: true, fetchAudio: url => String(url).includes(`/${blocked}/`)
      ? new Promise(resolve => { release = () => resolve(response); }) : response });
    const card = () => h.controller.playCommitted({ name: 'useCard', card: { name: 'huogong' }, player: { name: 'v_dongzhuo', sex: 'male' } });
    const hero = () => h.game.trySkillAudio('dcguangyong', 'v_dongzhuo');
    try {
      if (blocked === 'card') { card(); hero(); } else { hero(); card(); }
      await new Promise(resolve => setImmediate(resolve));
      assert.equal(h.starts.length, 1, `${blocked} download must not hold the other channel`);
      assert.equal(h.starts[0].at, h.ctx.currentTime);
      release();
      await h.controller.whenIdle();
      assert.equal(h.starts.length, 2);
      assert.equal(h.starts[1].at, h.ctx.currentTime);
    } finally { release(); await h.controller.whenIdle(); h.hero.dispose(); h.controller.dispose(); }
  }
});

test('mute stops both voice channels and canceled loads cannot stall or revive after unmute', async () => {
  const running = harness({ characterAudio: true });
  running.game.trySkillAudio('dcguangyong', 'v_dongzhuo');
  running.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: { sex: 'male' } });
  await running.controller.whenIdle();
  running.controller.setEnabled(false);
  assert.equal(running.stopped.length, 2);
  running.hero.dispose(); running.controller.dispose();

  for (const fail of [false, true]) {
    const releases = [];
    const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(12) };
    const h = harness({ characterAudio: true, fetchAudio: url => /huogong|dcguangyong/.test(String(url))
      ? new Promise(resolve => releases.push(() => resolve(fail ? { ok: false, status: 404 } : response))) : response });
    try {
      h.controller.playCommitted({ name: 'useCard', card: { name: 'huogong' }, player: { sex: 'male' } });
      h.game.trySkillAudio('dcguangyong', 'v_dongzhuo');
      h.controller.setEnabled(false);
      h.controller.setEnabled(true);
      h.controller.playCommitted({ name: 'respond', card: { name: 'shan' }, player: { sex: 'male' } });
      h.game.trySkillAudio('dcjuchui', 'v_dongzhuo');
      await new Promise(resolve => setImmediate(resolve));
      assert.deepEqual(h.starts.map(entry => entry.at), [5, 5], 'unmuted channels must not wait for canceled downloads');
      releases.forEach(release => release());
      await h.controller.whenIdle();
      assert.equal(h.starts.length, 2, 'canceled voices and native error fallbacks cannot replay');
      assert.equal(h.fetched.length, 4);
      assert.equal(h.controller.status().pending, 0);
      assert.equal(h.controller.status().lastError, null);
    } finally { releases.forEach(release => release()); h.hero.dispose(); h.controller.dispose(); }
  }
});

test('timed-out card and hero loads release their own queues while the other voice category keeps playing', async () => {
  for (const blocked of ['card', 'hero']) {
    const tasks = new Map(); let timer = 0, signal, release;
    const timers = {setTimeout(fn,ms){assert.equal(ms,8000);tasks.set(++timer,fn);return timer;},clearTimeout(id){tasks.delete(id);}};
    const response = {ok:true,arrayBuffer:async()=>new ArrayBuffer(12)};
    const h = harness({characterAudio:true,audioOptions:{timers},fetchAudio:(url,request)=>{
      if (String(url).includes(blocked==='card'?'huogong':'dcguangyong')) {signal=request.signal;return new Promise(resolve=>release=resolve);}
      return response;
    }});
    try {
      if(blocked==='card') {
        h.controller.playCommitted({name:'useCard',card:{name:'huogong'},player:{sex:'male'}});
        h.controller.playCommitted({name:'respond',card:{name:'shan'},player:{sex:'male'}});
        h.game.trySkillAudio('dcjuchui','v_dongzhuo');
      } else {
        h.game.trySkillAudio('dcguangyong','v_dongzhuo');h.game.trySkillAudio('dcjuchui','v_dongzhuo');
        h.controller.playCommitted({name:'respond',card:{name:'shan'},player:{sex:'male'}});
      }
      await new Promise(r=>setImmediate(r));assert.equal(h.starts.length,1);
      for(const fn of [...tasks.values()])fn();await h.controller.whenIdle();
      assert.equal(signal.aborted,true);assert.equal(h.starts.length,2);assert.equal(h.controller.status().pending,0);
      release(response);await new Promise(r=>setImmediate(r));assert.equal(h.starts.length,2,'late request cannot replay');
    }finally{h.hero.dispose();h.controller.dispose();}
  }
});

test('a late decoder cannot sound after timeout or block the next confirmed card',async()=>{
  const tasks=new Map();let timer=0,decode=0,release;
  const h=harness({audioOptions:{timers:{setTimeout(fn){tasks.set(++timer,fn);return timer;},clearTimeout(id){tasks.delete(id);}}}});
  h.ctx.decodeAudioData=()=>++decode===1?new Promise(resolve=>release=resolve):Promise.resolve({duration:0.8});
  try {
    h.controller.playCommitted({name:'useCard',card:{name:'huogong'},player:{sex:'male'}});
    h.controller.playCommitted({name:'respond',card:{name:'shan'},player:{sex:'male'}});
    await new Promise(r=>setImmediate(r));assert.equal(h.starts.length,0);
    for(const fn of [...tasks.values()])fn();await h.controller.whenIdle();assert.equal(h.starts.length,1);
    release({duration:0.8});await new Promise(r=>setImmediate(r));assert.equal(h.starts.length,1);
  }finally{h.controller.dispose();}
});

test('native hero variants and death keep their own queue without consuming card deduplication', async () => {
  const h = harness({ characterAudio: true });
  const player = { name: 'v_dongzhuo', sex: 'male' };
  const event = { name: 'useCard', card: { name: 'huogong' }, player };
  h.setEvent(event);
  for (const skill of ['dcguangyong', 'dcjuchui']) {
    for (const last of [false, true]) {
      pickLast = last;
      h.game.trySkillAudio(skill, player);
      assert.equal(h.lib.config.background_speak, false);
    }
  }
  h.controller.playCommitted(event);
  h.controller.playCommitted(event);
  h.game.tryDieAudio(player);
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 6);
  assert.deepEqual(h.fetched.map(url => url.replace('http://localhost/sgs/audio/', '')), [
    'skill/dcguangyong1.mp3', 'skill/dcguangyong2.mp3', 'skill/dcjuchui1.mp3', 'skill/dcjuchui2.mp3', 'card/male/huogong.mp3', 'die/v_dongzhuo.mp3',
  ]);
  const times = h.starts.map(entry => entry.at).sort((a, b) => a - b);
  assert.deepEqual(times.slice(0, 2), [5, 5]);
  assert.ok(times.slice(2).every((time, i) => time >= times[i + 1] + 0.8));
  assert.equal(h.controller.status().lastLabel, '威董卓 · 阵亡');
  h.hero.dispose(); assert.equal(h.game.trySkillAudio, h.nativeSkill);
  h.controller.dispose();
});

test('other heroes stay silent, native direct/global guards remain, and one switch mutes card and hero voices', async () => {
  const h = harness({ characterAudio: true });
  h.game.trySkillAudio('dcguangyong', 'dongzhuo');
  h.game.trySkillAudio('longdan', 'v_dongzhuo');
  h.game.tryDieAudio('dongzhuo');
  h.game.playAudio('skill', 'longdan1');
  h.lib.skill.dcguangyong.direct = true;
  h.game.trySkillAudio('dcguangyong', 'v_dongzhuo');
  h.lib.skill.global.push('dcjuchui');
  h.game.trySkillAudio('dcjuchui', 'v_dongzhuo');
  await h.controller.whenIdle();
  assert.equal(h.fetched.length, 0);
  h.game.trySkillAudio('dcguangyong', 'v_dongzhuo', true);
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 1);
  h.controller.setEnabled(false);
  assert.equal(h.stopped.length, 1);
  h.game.tryDieAudio('v_dongzhuo');
  h.controller.playCommitted({ name: 'respond', card: { name: 'shan' }, player: { sex: 'male' } });
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 1);
  h.controller.setEnabled(true);
  h.game.tryDieAudio('v_dongzhuo');
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 2);
  h.hero.dispose(); h.controller.dispose();
});

test('native hero fallback terminates after load failures and always restores the global speech setting', async () => {
  const h = harness({ characterAudio: true, fetchFail: true });
  h.game.trySkillAudio('dcguangyong', 'v_dongzhuo');
  await h.controller.whenIdle();
  await h.controller.whenIdle();
  assert.equal(h.fetched.length, 2);
  assert.equal(h.starts.length, 0);
  assert.equal(h.controller.status().pending, 0);
  assert.equal(h.lib.config.background_speak, false);
  h.get.Audio.skill = () => { throw new Error('resolver error'); };
  assert.throws(() => h.game.trySkillAudio('dcguangyong', 'v_dongzhuo'), /resolver error/);
  assert.equal(h.lib.config.background_speak, false);
  h.hero.dispose(); h.controller.dispose();
});

function damageEvent({ num = 1, nature = '', armor = 0, ...properties } = {}) {
  const history = [];
  const player = {
    hp: 12, hujia: armor, stat: [{}],
    hasSkillTag: () => false, getHistory: () => history,
    changeHp(amount) { this.hp += amount; return {}; },
  };
  return { name: 'damage', num, nature, player, animate: false, trigger: async () => {}, goto() {}, ...properties };
}

test('three channel volumes preserve native loudness and change playing, scheduled and future sources independently', async () => {
  const h = harness({ characterAudio: true, damageAudio: true });
  const card = () => h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: { sex: 'male' } });
  card(); card(); await h.controller.whenIdle();
  h.game.trySkillAudio('dcguangyong', 'v_dongzhuo'); await h.controller.whenIdle();
  const hit = damageEvent(); h.setEvent(hit); await h.damage(hit, null, hit.player); await h.controller.whenIdle();
  const level = () => h.starts.map(({ source }) => source.gain.gain.value);
  const times = h.starts.map(({ at }) => at);
  assert.deepEqual(level(), [.75, .75, .75, .75], 'unit channel volume keeps original native gain');
  assert.deepEqual(times, [5, 5.84, 5, 5], 'hero overlaps card; impact starts immediately');
  h.controller.setVolume('card', .4); assert.deepEqual(level(), [.75 * .4, .75 * .4, .75, .75]);
  h.controller.setVolume('hero', 0); assert.deepEqual(level(), [.75 * .4, .75 * .4, 0, .75]);
  h.controller.setVolume('effect', .8); assert.equal(level()[3], .75 * .8);
  assert.deepEqual(h.starts.map(({ at }) => at), times, 'volume never restarts or reschedules a source');
  card(); await h.controller.whenIdle(); assert.equal(level().at(-1), .75 * .4);
  h.starts[0].source.onended({});
  h.controller.setVolume('card', .2);
  assert.equal(level()[0], .75 * .4, 'completed sources are released from volume updates');
  assert.equal(level()[1], .75 * .2);
  assert.equal(h.controller.setVolume('card', 5), 1);
  assert.equal(h.controller.setVolume('hero', -1), 0);
  for (const value of [NaN, Infinity, '0.5', null]) assert.equal(h.controller.setVolume('card', value), 1);
  assert.equal(h.controller.setVolume('music', .2), undefined);
  const snapshot = h.controller.status(); snapshot.volumes.card = 0;
  assert.equal(h.controller.status().volumes.card, 1);
  h.controller.setEnabled(false); assert.equal(h.stopped.length, 4, 'all remaining scheduled/running sources stop');
  h.hero.dispose(); h.controller.dispose();
});

test('pending loads use latest per-channel gain; mute cancels all three channels without reviving old jobs', async () => {
  const releases = [];
  let hold = true;
  const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(12) };
  const h = harness({ characterAudio: true, damageAudio: true,
    fetchAudio: () => hold ? new Promise(resolve => releases.push(() => resolve(response))) : response });
  h.controller.playCommitted({ name: 'useCard', card: { name: 'huogong' }, player: { sex: 'male' } });
  h.game.trySkillAudio('dcguangyong', 'v_dongzhuo');
  const hit = damageEvent(); h.setEvent(hit); await h.damage(hit, null, hit.player);
  assert.equal(releases.length, 3);
  h.controller.setVolume('card', .2); h.controller.setVolume('hero', .4); h.controller.setVolume('effect', .6);
  releases.splice(0).forEach(release => release()); await h.controller.whenIdle();
  assert.deepEqual(h.starts.map(({ source }) => source.gain.gain.value).sort(), [.75 * .2, .75 * .4, .75 * .6]);
  h.controller.playCommitted({ name: 'useCard', card: { name: 'shan' }, player: { sex: 'female' } });
  h.game.trySkillAudio('dcjuchui', 'v_dongzhuo');
  const next = damageEvent({ nature: 'fire' }); h.setEvent(next); await h.damage(next, null, next.player);
  h.controller.setEnabled(false); assert.equal(h.stopped.length, 3);
  h.controller.setVolume('hero', .8);
  hold = false; h.controller.setEnabled(true);
  releases.splice(0).forEach(release => release()); await h.controller.whenIdle();
  assert.equal(h.starts.length, 3, 'unmute/volume changes cannot replay canceled loads');
  h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: { sex: 'male' } });
  h.game.trySkillAudio('dcguangyong', 'v_dongzhuo');
  const fresh = damageEvent({ nature: 'thunder' }); h.setEvent(fresh); await h.damage(fresh, null, fresh.player);
  await h.controller.whenIdle();
  assert.deepEqual(h.starts.slice(3).map(({ source }) => source.gain.gain.value).sort(), [.75 * .2, .75 * .6, .75 * .8]);
  assert.equal(h.controller.status().pending, 0);
  h.hero.dispose(); h.controller.dispose();
});

test('all native normal/heavy/elemental/armor impact paths are packed and match pinned bytes', async () => {
  const h = harness({ damageAudio: true });
  const selected = new Set();
  for (const armor of [0, 1]) {
    for (const nature of ['', 'fire', 'thunder', 'ice']) {
      for (const num of [1, 2]) {
        const event = damageEvent({ num, nature, armor });
        h.setEvent(event);
        await h.damage(event, null, event.player);
        await h.controller.whenIdle();
        const key = h.controller.status().lastEffect;
        const expectedNature = armor && nature === 'ice' ? '' : nature;
        assert.equal(key, `effect/${armor ? 'hujia_' : ''}damage${expectedNature ? `_${expectedNature}` : ''}${num > 1 ? '2' : ''}`);
        selected.add(key);
      }
    }
  }
  assert.equal(h.starts.length, 16);
  assert.deepEqual([...selected].sort(), Object.keys(damageManifest.clips).sort());
  assert.equal(damageManifest.uniqueFiles, 14);
  assert.equal(damageManifest.upstreamCommit, manifest.upstreamCommit);
  let total = 0;
  for (const clip of Object.values(damageManifest.clips)) {
    assert.equal(clip.sourceUrl, `https://raw.githubusercontent.com/libnoname/noname/${manifest.upstreamCommit}/apps/core/audio/${clip.key}.mp3`);
    const bytes = await readFile(new URL(clip.file, base));
    assert.equal(bytes.length, clip.bytes);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
    assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), clip.sourceGitBlob);
    total += bytes.length;
  }
  assert.equal(total, damageManifest.totalBytes);
  assert.equal((await readdir(new URL('audio/effect/', base))).length, 14);
  for (const nature of ['', '_fire', '_thunder', '_ice']) {
    assert.notEqual(damageManifest.clips[`effect/damage${nature}`].sha256, damageManifest.clips[`effect/damage${nature}2`].sha256);
  }
  h.controller.dispose();
});

test('native Wine bonus produces the heavy impact, but final damage reduction uses the actual remaining amount', async () => {
  const h = harness({ damageAudio: true });
  const extraSource = parseSource('extra.js', await readFile(new URL('../../apps/core/card/extra.js', import.meta.url), 'utf8'));
  const jiu = fields(fields(defaultObject(extraSource)).get('skill')).get('jiu');
  // Object method syntax is retained so the actual native Wine content runs.
  const content = jiu.properties.find(property => property.name?.text === 'content').getText(extraSource);
  const applyWine = new Function('game', 'lib', `return ({${content}}).content;`)(h.game, h.lib);
  h.lib.skill.jiu2 = { filter: () => false };
  const use = { name: 'useCard', card: { name: 'sha' }, baseDamage: 1 };
  await applyWine({}, use, { storage: { jiu: 1 } });
  assert.equal(use.baseDamage, 2);
  assert.equal(use.jiu, true);
  for (const [num, expected] of [[use.baseDamage, 'effect/damage2'], [1, 'effect/damage']]) {
    const event = damageEvent({ num, getParent: () => use });
    h.setEvent(event);
    await h.damage(event, null, event.player);
    await h.controller.whenIdle();
    assert.equal(h.controller.status().lastEffect, expected);
  }
  h.controller.dispose();
});

test('zero/unreal/cancelled damage, card selection, dodges and health loss never play hit audio', async () => {
  const h = harness({ damageAudio: true });
  for (const properties of [{ num: 0 }, { unreal: true }, { _cancelled: true }]) {
    const event = damageEvent(properties);
    h.setEvent(event);
    await h.damage(event, null, event.player);
  }
  for (const name of ['chooseToUse', 'shaMiss', 'respond', 'loseHp']) {
    h.setEvent({ name, num: 1 });
    h.game.playAudio('effect', 'damage');
  }
  for (const path of ['effect/draw', 'effect/../damage', 'https://example.com/damage.mp3']) {
    assert.equal(resolveDamageAudio(path, damageManifest, damageEvent()), null);
  }
  await h.controller.whenIdle();
  assert.equal(h.fetched.length, 0);
  assert.equal(h.starts.length, 0);
  h.controller.dispose();
});

test('impacts bypass a pending long voice and deduplicate each victim event without blocking later voices', async () => {
  let releaseVoice;
  const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(12) };
  const h = harness({ characterAudio: true, damageAudio: true, fetchAudio: url => String(url).includes('/skill/') ? new Promise(resolve => { releaseVoice = () => resolve(response); }) : response });
  h.game.trySkillAudio('dcguangyong', 'v_dongzhuo');
  const hit = damageEvent({ nature: 'fire' });
  h.setEvent(hit);
  await h.damage(hit, null, hit.player);
  // Await the real instant path while the earlier hero recording is pending.
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(h.starts.length, 1);
  assert.equal(h.starts[0].at, h.ctx.currentTime);
  assert.equal(h.controller.status().lastEffect, 'effect/damage_fire');
  h.game.playAudio('effect', 'damage_fire');
  h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: { sex: 'male' } });
  releaseVoice();
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 3);
  assert.equal(h.controller.status().effectPlayed, 1);
  const secondVictim = damageEvent({ nature: 'fire' });
  h.setEvent(secondVictim);
  await h.damage(secondVictim, null, secondVictim.player);
  await h.controller.whenIdle();
  assert.equal(h.controller.status().effectPlayed, 2);
  assert.equal(h.starts.at(-1).at, h.ctx.currentTime);
  h.hero.dispose(); h.controller.dispose();
});

test('gesture preloads impacts silently, mute stops them and discards pending or blocked hits', async () => {
  const h = harness({ damageAudio: true, running: false });
  let event = damageEvent(); h.setEvent(event);
  await h.damage(event, null, event.player);
  assert.equal(h.fetched.length, 0);
  await h.controller.unlock();
  await h.controller.whenIdle();
  assert.equal(h.fetched.length, 14);
  assert.equal(h.starts.length, 0);
  event = damageEvent({ num: 2 }); h.setEvent(event);
  await h.damage(event, null, event.player);
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 1);
  h.controller.setEnabled(false);
  assert.equal(h.stopped.length, 1);
  event = damageEvent(); h.setEvent(event);
  await h.damage(event, null, event.player);
  h.controller.setEnabled(true);
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 1);
  assert.equal(h.fetched.length, 14);
  h.controller.dispose();

  let release;
  const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(12) };
  const late = harness({ damageAudio: true, fetchAudio: () => new Promise(resolve => { release = () => resolve(response); }) });
  const pending = damageEvent(); late.setEvent(pending);
  await late.damage(pending, null, pending.player);
  assert.equal(late.controller.status().pending, 1);
  late.controller.setEnabled(false);
  release();
  await late.controller.whenIdle();
  assert.equal(late.starts.length, 0);
  assert.equal(late.controller.status().pending, 0);
  late.controller.dispose();
});

test('a missing impact recording cannot interrupt native health loss or leave an unhandled effect job', async () => {
  const h = harness({ damageAudio: true, fetchFail: true });
  const event = damageEvent(); h.setEvent(event);
  await h.damage(event, null, event.player);
  await h.controller.whenIdle();
  assert.equal(event.player.hp, 11);
  assert.equal(h.starts.length, 0);
  assert.equal(h.controller.status().pending, 0);
  assert.match(h.controller.status().lastError, /404/);
  h.controller.dispose();
});
