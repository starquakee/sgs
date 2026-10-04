import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { dom, Node } from './helpers/client-dom.mjs';
import { loadRosterAssets, loadAudioAssets, resourceJSON, createLoadingScreen } from '../../apps/core/sgs/loading.mjs';
import { createLaunchHandoff, launchURL, readLaunch, retainLaunch } from '../../apps/core/sgs/launch-handoff.mjs';
import { canPersist, installVolatileLocalStorage, persistentStorage, saveNativeSettings, createMemoryDatabase } from '../../apps/core/sgs/storage.mjs';
import { engineSettings, normalizeLaunch } from '../../apps/core/sgs/launch-config.mjs';
import { createPreferences } from '../../apps/core/sgs/preferences.mjs';
import { createBattleRecords, consumeRecordReplay } from '../../apps/core/sgs/battle-records.mjs';
import { completedBattle } from './helpers/battle-record.mjs';

const denied = () => { throw new Error('Storage denied'); };
const read = path => readFileSync(new URL(`../../apps/core/${path}`, import.meta.url), 'utf8');

test('actual resource stages report only requested work; critical HTTP, malformed and timed-out resources reject', async () => {
  const stages = [], requests = [];
  const assets = await loadRosterAssets({ stage: value => stages.push(value), fetcher: async url => {
    requests.push(url);
    return { ok: true, json: async () => url.includes('roster') ? JSON.parse(read('sgs/roster.json')) : { portraits: {} } };
  } });
  assert.ok(assets.catalog.characters.length > 1);
  assert.deepEqual(requests, ['./sgs/roster.json', './sgs/portraits.json']);
  assert.deepEqual(stages, ['正在读取武将名册', '正在读取画像索引']);
  for (const fetcher of [async () => ({ ok: false, status: 503 }), async () => ({ ok: true, json: async () => ({ characters: [] }) }),
    async () => ({ ok: true, json: async () => { throw SyntaxError('bad JSON'); } })]) {
    await assert.rejects(loadRosterAssets({ fetcher }));
  }
  let signal;
  await assert.rejects(resourceJSON('roster.json', () => true, (_, options) => {
    signal = options.signal; return new Promise(() => {});
  }, 10), /请求超时/);
  assert.equal(signal.aborted, true);
});

test('audio manifests fail independently and retain valid native channels; malformed JSON also degrades', async () => {
  const warnings = [];
  const assets = await loadAudioAssets({ warn: value => warnings.push(value), fetcher: async url => {
    if (url.includes('card-audio')) return { ok: false, status: 404 };
    if (url.includes('damage-audio')) return { ok: true, json: async () => ({ clips: [] }) };
    return { ok: true, json: async () => ({ characters: {}, clips: { 'skill/test': { file: 'audio/test.mp3' } } }) };
  } });
  assert.equal(warnings.length, 2);
  assert.match(warnings.join(' '), /卡牌语音.*静音.*受击音效.*静音/);
  assert.deepEqual(assets.audioManifest.clips, {});
  assert.deepEqual(assets.damageAudioManifest.clips, {});
  assert.equal(assets.characterAudioManifest.clips['skill/test'].file, 'audio/test.mp3');
});

test('storage-free handoff keeps all three modes, consumes record speed once and carries later preferences through restart', () => {
  for (const mode of ['versus', 'identity', 'doudizhu']) {
    const input = { generalId: 'dc_zhouxuān', pack: 'xianding', mode, playerCount: 7, landlordRole: 'farmer', identity: 'fan', speed: 'fast', fromBattleRecord: true };
    let href = '', count = 0;
    const handoff = createLaunchHandoff({ session: denied, navigate: url => { href = url; count++; } });
    handoff(input, { speed: 'normal', cardVolume: 0.4 }); handoff(input);
    assert.equal(count, 1);
    const location = { hash: new URL(href, 'http://127.0.0.1').hash };
    const saved = readLaunch({ location, session: denied });
    assert.deepEqual(normalizeLaunch(saved), normalizeLaunch(input));
    const preferences = createPreferences(denied);
    preferences.set(saved.preferences); consumeRecordReplay(saved, preferences, denied);
    assert.equal(preferences.get().speed, 'fast');
    preferences.set({ speed: 'normal', sound: false });
    retainLaunch(saved, preferences.get(), { history: { replaceState(_, __, url) { href = url; } } });
    const next = readLaunch({ location: { hash: new URL(href, 'http://127.0.0.1').hash }, session: denied });
    assert.equal(next.fromBattleRecord, undefined);
    const restarted = createPreferences(denied); restarted.set(next.preferences); consumeRecordReplay(next, restarted, denied);
    assert.equal(restarted.get().speed, 'normal'); assert.equal(restarted.get().cardVolume, 0.4); assert.equal(restarted.get().sound, false);
  }
  assert.deepEqual(readLaunch({ location: { hash: '#sgs-launch=null' }, session: denied }), {});
  const sanitized = readLaunch({ location: { hash: new URL(launchURL({ generalId: '../escape' }), 'http://localhost').hash } });
  assert.equal(sanitized.generalId, 'caocao');
});

test('temporary local storage supports native import-time access but never claims preferences or records persisted', () => {
  const host = {}; Object.defineProperty(host, 'localStorage', { configurable: true, get: denied });
  assert.equal(installVolatileLocalStorage(host), true);
  const nativeRead = read('noname/util/index.js').match(/export const nonameInitialized = (.*);/)[1];
  assert.equal(new Function('localStorage', `return ${nativeRead}`)(host.localStorage), null);
  host.localStorage.setItem('directstart', true);
  assert.equal(host.localStorage.getItem('directstart'), 'true');
  assert.equal(host.localStorage.length, 1); assert.equal(host.localStorage.key(0), 'directstart');
  host.localStorage.removeItem('directstart'); assert.equal(host.localStorage.length, 0);
  host.localStorage['sandbox-key'] = 9;
  assert.equal(host.localStorage.getItem('sandbox-key'), '9');
  assert.deepEqual(Object.keys(host.localStorage), ['sandbox-key']);
  delete host.localStorage['sandbox-key']; assert.equal(host.localStorage.length, 0);
  assert.equal(canPersist(host), false);
  const preferences = createPreferences(() => persistentStorage(host));
  assert.equal(preferences.set({ speed: 'fast' }), false); assert.equal(preferences.get().speed, 'fast');
  const records = createBattleRecords(() => persistentStorage(host));
  assert.equal(records.record(completedBattle()).saved, false);
  assert.match(records.get().notice, /未保存/);
});

test('healthy native storage remains installed; transaction aborts fall back without hanging boot', async () => {
  const database = createMemoryDatabase();
  const original = { open() {
    const req = { result: database }; queueMicrotask(() => { req.onupgradeneeded(); req.onsuccess(); }); return req;
  } };
  const host = { indexedDB: original };
  assert.equal(await saveNativeSettings('sgs_local_v1_', { mode: 'versus' }, { host }), true);
  assert.equal(host.indexedDB, original);
  assert.equal(await new Promise(resolve => { const req = database.transaction().objectStore('config').get('mode'); req.onsuccess = () => resolve(req.result); }), 'versus');
  const aborted = { objectStoreNames: { contains: () => true }, close() {}, transaction() {
    const tx = { objectStore: () => ({ put() {} }) };
    queueMicrotask(() => tx.onabort(new Error('quota'))); return tx;
  } };
  host.indexedDB = { open() { const req = { result: aborted }; queueMicrotask(() => req.onsuccess()); return req; } };
  assert.equal(await saveNativeSettings('sgs_local_v1_', { mode: 'identity' }, { host }), false);
});

// Execute the locked native configuration loader and DB queue methods against
// the SGS fallback. This catches boot failures that a launcher-only test misses.
const initSource = read('noname/init/index.ts'), gameSource = read('noname/game/index.js');
const configSource = initSource.slice(initSource.indexOf('async function loadConfig()'), initSource.indexOf('async function loadCss()'));
const nativeLoadConfig = ts.transpileModule(configSource, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
function nativeMethod(name, nextName, lib, game, status, host) {
  const start = gameSource.indexOf(`\t${name}(`), end = gameSource.indexOf(`\t${nextName}(`, start);
  const source = gameSource.slice(start, end).replace(/\/\*\*[\s\S]*?\*\/\s*$/, '');
  return new Function('lib', 'game', '_status', 'window', `return ({${source}}).${name}`)(lib, game, status, host);
}
test('denied/blocked/missing IndexedDB still boots native mode config and native DB reads/writes for every supported mode', async () => {
  for (const [mode, factory] of [['identity', undefined], ['versus', { open: denied }], ['doudizhu', { open: () => ({}) }]]) {
    const host = { indexedDB: factory };
    const expected = engineSettings({ mode, generalId: 'dc_sb_lusu', pack: 'xianding', playerCount: 6, landlordRole: 'farmer' });
    assert.equal(await saveNativeSettings('sgs_local_v1_', expected, { host, timeout: 10 }), false);
    const lib = { configprefix: 'sgs_local_v1_', status: { reload: 0 }, ondb: [], ondb2: [],
      init: { promises: { json: async () => JSON.parse(read('game/config.json')) } } };
    const game = { promises: { checkFile: async () => 0 } }, status = {};
    game.reload2 = nativeMethod('reload2', 'reloadCurrent', lib, game, status, host);
    game.putDB = nativeMethod('putDB', 'getDB', lib, game, status, host);
    game.getDB = nativeMethod('getDB', 'deleteDB', lib, game, status, host);
    const config = { get: key => lib.config[key], set: (key, value) => { lib.config[key] = value; } };
    await new Function('lib', 'game', 'window', 'config', `${nativeLoadConfig}; return loadConfig();`)(lib, game, host, config);
    assert.equal(lib.config.mode, mode);
    assert.deepEqual(lib.config.continue_name, ['dc_sb_lusu']);
    assert.equal(lib.config.mode_config.identity.player_number, expected.player_number_mode_config_identity);
    assert.equal(lib.config.auto_confirm, false); assert.deepEqual(lib.config[`${mode}_bannedcards`], ['muniu']);
    const original = { nested: ['fresh'] };
    await Promise.all([game.putDB('data', mode, original), game.putDB('config', 'test', true)]);
    original.nested.push('mutated');
    assert.deepEqual(await game.getDB('data', mode), { nested: ['fresh'] });
    assert.equal((await game.getDB('config')).test, true);
    assert.equal(lib.status.reload, 0, 'native queued writes/reads must drain');
  }
});

test('loading failure UI keeps safe literal details, one retry navigation, dismissible degradation and clean disposal', () => {
  const document = dom(); document.head = new Node('head'); let retries = 0;
  const loading = createLoadingScreen({ document, retry: () => retries++ });
  const [root, notice] = document.body.children;
  loading.stage('正在读取武将名册'); loading.warn('声音静音'); loading.warn('声音静音');
  loading.fail(new Error('<resource unavailable>'));
  assert.match(root.querySelector('[data-stage]').textContent, /正在读取武将名册.*<resource unavailable>/);
  assert.equal(root.querySelector('[data-retry]').hidden, false);
  root.querySelector('[data-retry]').emit('click'); root.querySelector('[data-retry]').emit('click');
  assert.equal(retries, 1);
  loading.ready(); assert.equal(root.hidden, false, 'a failed boot cannot claim readiness');
  loading.dispose(); assert.equal(document.body.children.length, 0); assert.equal(document.head.children.length, 0);
  const fresh = createLoadingScreen({ document });
  const [freshRoot, freshNotice] = document.body.children;
  fresh.warn('声音静音'); fresh.ready(); assert.equal(freshRoot.hidden, true); assert.equal(freshNotice.hidden, false);
  assert.equal(freshNotice.querySelector('p').textContent, '声音静音');
  freshNotice.querySelector('button').emit('click'); assert.equal(freshNotice.hidden, true);
  fresh.dispose(); assert.equal(document.body.children.length, 0); assert.equal(document.head.children.length, 0);
  loading.warn('late callback'); assert.equal(document.body.children.length, 0);
});

test('SGS native boot timeout offers retry instead of native reset prompts and restores the original hook', () => {
  const document = dom(); document.head = new Node('head'); let resets = 0;
  const original = () => resets++, lib = { init: { reset: original } };
  const loading = createLoadingScreen({ document }); loading.watchNative(lib);
  lib.init.reset(); lib.init.reset();
  assert.equal(resets, 0); assert.match(document.body.children[0].querySelector('[data-stage]').textContent, /未能及时载入/);
  loading.dispose(); assert.equal(lib.init.reset, original);
  const next = createLoadingScreen({ document }); next.watchNative(lib); next.ready();
  assert.equal(lib.init.reset, original); next.dispose();
});
