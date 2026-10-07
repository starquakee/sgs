import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { createRecentGenerals } from '../../apps/core/sgs/recent-generals.mjs';
import { launchKey, normalizeLaunch } from '../../apps/core/sgs/launch-config.mjs';
import { createPreferences, applyMotionPreference } from '../../apps/core/sgs/preferences.mjs';
import { createClientDialogs, openClientSettings } from '../../apps/core/sgs/settings.mjs';
import { dom } from './helpers/client-dom.mjs';
import { createBattleRecords, battleRecordsKey } from '../../apps/core/sgs/battle-records.mjs';
import { openBattleRecords } from '../../apps/core/sgs/records-dialog.mjs';
import { completedBattle } from './helpers/battle-record.mjs';
import { createLaunchHandoff, readLaunch } from '../../apps/core/sgs/launch-handoff.mjs';
import { loadRosterAssets } from '../../apps/core/sgs/loading.mjs';
import { canPersist, storageNotice } from '../../apps/core/sgs/storage.mjs';
import { browsePackName, isOldGeneral, hasUnknownYear, releaseLabel, inBrowseScope, compareBrowseCharacters } from '../../apps/core/sgs/roster-filters.mjs';
import { ratingScopes, ratingScopeName, ratingValue, compareOfficialRatings, normalizeRatingPreference } from '../../apps/core/sgs/official-rating.mjs';
import { skillReadingHTML, closeReadingDetails } from '../../apps/core/sgs/skill-reading.mjs';
import { installComposedSearch } from '../../apps/core/sgs/lobby-continuity.mjs';

const recentKey = 'sgs.recent-generals.v1';
const character = (pack, id, category = 'common') => ({
  key: `${pack}:${id}`, pack, id, name: id, version: {category}, faction: 'wei', factions: ['wei'],
  hp: 4, maxHp: 4, groups: [{name: pack}], skills: [{name: '治世', description: '摸两张牌'}],
});
const characters = [character('standard', 'caocao'), character('refresh', 'caocao', 'other'),
  character('xianding', 'recent', 'decade'), ...Array.from({length: 9}, (_, i) => character('standard', `general${i}`))];
function storage(entries = {}) {
  const data = new Map(Object.entries(entries));
  return {getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key)};
}

test('recent generals keep eight unique pack:id versions in confirmed-use order across reloads', () => {
  const local = storage();
  const recent = createRecentGenerals(characters, () => local);
  characters.forEach(c => assert.equal(recent.record(c.key), true));
  assert.deepEqual(recent.keys(), characters.slice(-8).reverse().map(c => c.key));
  recent.record(characters.at(-4).key);
  recent.record('standard:caocao');
  recent.record('refresh:caocao');
  const reloaded = createRecentGenerals(characters, () => local);
  assert.deepEqual(reloaded.keys().slice(0, 3), ['refresh:caocao', 'standard:caocao', characters.at(-4).key]);
  assert.equal(reloaded.keys().length, 8);
  const snapshot = reloaded.keys(); snapshot.length = 0;
  assert.equal(reloaded.keys().length, 8);
});

test('recent history rejects malformed, unknown, unseen and ambiguous versions without changing other preferences', () => {
  const hidden = {...character('standard', 'hidden'), isUnseen: true};
  const invalid = {...character('standard', 'invalid'), key: 'invalid'};
  const local = storage({
    [recentKey]: JSON.stringify({version: 1, keys: [null, {}, 'standard:caocao', 'standard:caocao', 'old:missing', hidden.key, invalid.key, 'refresh:caocao']}),
    'sgs.favorites.v1': '["standard:caocao"]', 'sgs.settings.v1': '{"speed":"fast"}',
  });
  const recent = createRecentGenerals([...characters, hidden, invalid], () => local);
  assert.deepEqual(recent.keys(), ['standard:caocao', 'refresh:caocao']);
  assert.equal(recent.record(hidden.key), false);
  assert.equal(recent.record('caocao'), false);
  assert.equal(recent.record(invalid.key), false);
  recent.record('xianding:recent');
  assert.equal(local.getItem('sgs.favorites.v1'), '["standard:caocao"]');
  assert.equal(local.getItem('sgs.settings.v1'), '{"speed":"fast"}');
  for (const raw of ['{broken', 'null', '[]', '{"version":2,"keys":["standard:caocao"]}', '{"version":1,"keys":{}}']) {
    assert.deepEqual(createRecentGenerals(characters, () => storage({[recentKey]: raw})).keys(), []);
  }
});

test('unavailable or unwritable recent storage degrades to an in-memory list', () => {
  for (const getStorage of [() => {throw new Error('denied');}, () => ({getItem() {throw new Error('read');}, setItem() {throw new Error('quota');}})]) {
    const recent = createRecentGenerals(characters, getStorage);
    assert.deepEqual(recent.keys(), []);
    assert.equal(recent.record('standard:caocao'), false);
    assert.deepEqual(recent.keys(), ['standard:caocao']);
  }
});

// Run the actual lobby event handlers with a minimal DOM. Geometry/browser QA is separate.
const html = await readFile(new URL('../../apps/core/sgs.html', import.meta.url), 'utf8');
const source = (await readFile(new URL('../../apps/core/sgs/lobby.js', import.meta.url), 'utf8')).replace(/^import .*;\r?\n/gm, '');
class Element {
  constructor() {
    this.value = ''; this.innerHTML = ''; this.textContent = ''; this.dataset = {}; this.attrs = {};
    this.listeners = {}; this.scrollTop = 0; this.tagName = 'BUTTON'; this.children = [];
    this.classList = {toggle() {}};
  }
  setAttribute(name, value) { this.attrs[name] = value; }
  addEventListener(name, callback) { this.listeners[name] = callback; }
  removeEventListener(name, callback) { if (this.listeners[name] === callback) delete this.listeners[name]; }
  emit(name, event = {}) { this.listeners[name]?.(event); }
  focus() { this.focused = true; }
  scrollIntoView() { this.scrolled = true; }
}
async function lobby({local = storage(), session = storage(), fetcher, pending = false, roster = characters} = {}) {
  const elements = Object.fromEntries([...html.matchAll(/\bid="([^"]+)"/g)].map(([, id]) => [id, new Element()]));
  for (const [id, value] of Object.entries({version: 'target', pack: 'all', 'player-count': '8', identity: 'random', speed: 'normal'})) elements[id].value = value;
  const modes = ['identity', 'versus', 'doudizhu'].map(mode => Object.assign(new Element(), {dataset: {mode}}));
  const factions = ['all', 'wei', 'shu'].map(faction => Object.assign(new Element(), {dataset: {faction}}));
  const browse = ['all', 'yijiang', 'limited', 'huicui', 'xinghe', 'mou', 'wei'].map(browse => Object.assign(new Element(), {dataset: {browse}}));
  const roles = ['landlord', 'farmer'].map(value => Object.assign(new Element(), {value, checked: value === 'landlord'}));
  const document = {
    ...dom(),
    documentElement: new Element(),
    getElementById: id => elements[id] ??= new Element(),
    querySelectorAll: selector => ({'[data-mode]': modes, '.factions button': factions, '[data-browse]': browse, '[name="landlord-role"]': roles}[selector] ?? []),
    querySelector(selector) {
      if (selector === '[name="landlord-role"]:checked') return roles.find(r => r.checked);
      if (selector.startsWith('[name="landlord-role"][value=')) return roles.find(r => selector.includes(`"${r.value}"`));
      if (selector.startsWith('[data-mode=')) return modes.find(m => selector.includes(`"${m.dataset.mode}"`));
      if (selector === '.general-detail') return elements['detail-name'];
      throw new Error(`Unexpected selector ${selector}`);
    },
    addEventListener() {},
  };
  const location = {href: ''}, navigations = [], window = dom(), timers = new Map();
  let timerId = 0;
  const fetch = fetcher || (async url => ({ok: true, json: async () => url.includes('portraits') ? {portraits: {}} : {
    characters: structuredClone(roster), packs: ['standard', 'refresh', 'xianding'].map(id => ({id, name: id})),
  }}));
  vm.runInNewContext(source, {
    document, localStorage: local, sessionStorage: session, location, innerWidth: 1024,
    launchKey, normalizeLaunch, createRecentGenerals: list => createRecentGenerals(list, () => local),
    createPreferences: () => createPreferences(() => local), applyMotionPreference, createClientDialogs, openClientSettings,
    createBattleRecords: () => createBattleRecords(() => local), openBattleRecords,
    createLaunchHandoff: () => createLaunchHandoff({ session: () => session, navigate(url) { navigations.push(url); location.href = url; } }),
    loadRosterAssets: options => loadRosterAssets({ ...options, fetcher: fetch }),
    canPersist: () => canPersist({ localStorage: local }), storageNotice,
    browsePackName, isOldGeneral, hasUnknownYear, releaseLabel, inBrowseScope, compareBrowseCharacters,
    ratingScopes, ratingScopeName, ratingValue, compareOfficialRatings, normalizeRatingPreference, skillReadingHTML, closeReadingDetails,
    // This older harness checks lobby data/event wiring only. Real keyed DOM
    // retention and focus are exercised separately in lobby-continuity tests/CUA.
    reconcileKeyedHTML: (node, html) => { node.innerHTML = html; },
    installComposedSearch, focusAfterFilterRemoval: (_node, _index, fallback) => fallback.focus(),
    window, setTimeout(fn) { timers.set(++timerId, fn); return timerId; }, clearTimeout(id) { timers.delete(id); },
    fetch,
  });
  await new Promise(resolve => setImmediate(resolve));
  if (!pending) assert.equal(elements['detail-name'].textContent, roster.find(c => c.id === 'caocao').name, 'real lobby init should finish');
  return {
    elements, local, session, location, modes, factions, browse, roles, document, window, navigations,
    flushTimers() { for (const [id, fn] of timers) { timers.delete(id); fn(); } },
    carrier: () => readLaunch({ location: { hash: new URL(location.href, 'http://localhost').hash } }),
    select(key) { elements['general-grid'].emit('click', {target: {closest: () => ({dataset: {key}})}}); },
    visible() { return [...elements['general-grid'].innerHTML.matchAll(/data-key="([^"]+)"/g)].map(([, key]) => key); },
  };
}

test('cached lobby returns preserve transient browsing and live settings/search, and allow one new launch per return', async () => {
  const app = await lobby(), e = app.elements;
  app.select('xianding:recent');
  app.modes.find(button => button.dataset.mode === 'doudizhu').emit('click');
  app.roles.forEach(role => { role.checked = role.value === 'farmer'; });
  app.roles[1].emit('change');
  e.search.value = 'general'; e.search.emit('input');
  e['general-grid'].scrollTop = 73;
  app.document.activeElement = e.search;
  const before = e['general-grid'].innerHTML;
  for (let cycle = 1; cycle <= 2; cycle++) {
    e['start-game'].onclick(); e['start-game'].onclick();
    assert.equal(app.navigations.length, cycle);
    app.window.emit('pageshow', { persisted: false });
    assert.equal(e['start-game'].disabled, true, 'ordinary pageshow cannot clear a live launch lock');
    app.window.emit('pagehide', { persisted: true });
    app.window.emit('pageshow', { persisted: true });
    assert.equal(e['start-game'].disabled, false, 'the cached lobby must accept a new launch');
    assert.equal(e['start-label'].textContent, '以农民身份出战');
    assert.equal(e['general-grid'].innerHTML, before);
    assert.equal(e['general-grid'].scrollTop, 73);
    assert.equal(app.document.activeElement, e.search);
    assert.equal(e['launch-general'].textContent, 'recent');
    assert.equal(app.carrier().mode, 'doudizhu');
    assert.equal(app.carrier().landlordRole, 'farmer');
  }
  e.search.value = 'caocao'; e.search.emit('input');
  assert.deepEqual(app.visible(), ['standard:caocao']);
  e['settings-link'].onclick();
  const settings = app.document.body.children.at(-1);
  assert.equal(settings.open, true);
  const speed = settings.querySelector('[name="speed"]');
  speed.value = 'fast'; speed.emit('change');
  assert.equal(e.speed.value, 'fast', 'preference subscriptions survive persisted hides');
  app.window.emit('pagehide', { persisted: false });
  assert.equal(app.document.body.children.length, 0);
  assert.equal(e.search.listeners.input, undefined, 'a later real leave still cleans up');
  assert.equal(app.window.listeners.get('pageshow')?.size || 0, 0);
});

test('history-restored search text updates the actual roster after pageshow without committing IME or changing the selected hero', async () => {
  const app = await lobby(), e = app.elements;
  app.select('xianding:recent');
  app.window.emit('pageshow', { persisted: false });
  // Browsers restore form state without an input event after pageshow.
  e.search.value = 'caocao'; app.flushTimers();
  assert.deepEqual(app.visible(), ['standard:caocao']);
  assert.equal(e['launch-general'].textContent, 'recent');
  e.search.emit('compositionstart'); e.search.value = 'general';
  app.window.emit('pageshow', { persisted: true }); app.flushTimers();
  assert.deepEqual(app.visible(), ['standard:caocao'], 'uncommitted IME text stays out of the list');
  e.search.emit('compositionend');
  assert.ok(app.visible().every(key => key.startsWith('standard:general')));
  const before = e['general-grid'].innerHTML;
  app.window.emit('pageshow', { persisted: true });
  e.search.value = 'caocao'; app.window.emit('pagehide', { persisted: false }); app.flushTimers();
  assert.equal(e['general-grid'].innerHTML, before, 'leaving cancels the deferred reconciliation');
});

test('browsing, favorites and combined filters preserve behavior without recording recent use', async () => {
  const app = await lobby();
  const e = app.elements;
  app.select('xianding:recent');
  e['favorite-toggle'].onclick();
  e.favorites.onclick();
  assert.deepEqual(app.visible(), ['xianding:recent']);
  assert.equal(e.favorites.attrs['aria-pressed'], 'true');
  assert.equal(e['all-generals'].attrs['aria-pressed'], 'false');
  e.version.value = 'decade'; e.version.emit('change');
  e.pack.value = 'xianding'; e.pack.emit('change');
  e.search.value = '治世'; e.search.emit('input');
  app.factions.find(f => f.dataset.faction === 'wei').onclick();
  assert.deepEqual(app.visible(), ['xianding:recent']);
  app.factions.find(f => f.dataset.faction === 'shu').onclick();
  assert.deepEqual(app.visible(), []);
  e['clear-filters'].onclick();
  e['next'].onclick();
  assert.match(e['page-number'].textContent, /^2 \/ /);
  assert.equal(app.local.getItem(recentKey), null);
  e['recent-generals'].onclick();
  assert.match(e['general-grid'].innerHTML, /还没有出战记录/);
  assert.equal(app.location.href, '');
});

test('lobby search keeps the committed query throughout IME and searches only the final text', async () => {
  const app = await lobby(), e = app.elements;
  e.search.value = 'caocao'; e.search.emit('input');
  const previous = app.visible();
  e.search.emit('compositionstart'); e.search.value = 're'; e.search.emit('input', {isComposing:true});
  assert.deepEqual(app.visible(), previous);
  assert.ok(e['active-filters'].innerHTML.includes('caocao'));
  e.search.value = 'recent'; e.search.emit('compositionend');
  assert.deepEqual(app.visible(), ['xianding:recent']);
  assert.equal(e['detail-name'].textContent, 'caocao');
});

test('active filters clear individually while retaining the selected general and launch settings', async () => {
  const app = await lobby(), e = app.elements;
  app.select('xianding:recent'); e.pack.value = 'standard'; e.pack.emit('change');
  app.factions.find(f => f.dataset.faction === 'shu').onclick();
  assert.match(e['active-filters'].innerHTML, /data-filter="pack"/);
  assert.equal(e['selected-filter-note'].hidden, false);
  e['active-filters'].emit('click', { target: { closest: () => ({ dataset: { filter: 'faction' } }) } });
  assert.equal(e.pack.value, 'standard'); assert.ok(app.visible().length > 0);
  assert.equal(e['launch-general'].textContent, 'recent');
  e['active-filters'].emit('click', { target: { closest: () => ({ dataset: { filter: 'pack' } }) } });
  assert.equal(e.pack.value, 'all'); assert.equal(e['selected-filter-note'].hidden, true);
  assert.equal(e['launch-general'].textContent, 'recent');
  assert.equal(app.local.getItem(recentKey), null);
});

test('recent tab keeps confirmed order and permits selecting a saved version outside the default filter', async () => {
  const local = storage({[recentKey]: JSON.stringify({version: 1, keys: ['refresh:caocao', 'xianding:recent']})});
  const app = await lobby({local});
  app.elements['recent-generals'].onclick();
  assert.deepEqual(app.visible(), ['refresh:caocao', 'xianding:recent']);
  app.select('refresh:caocao');
  assert.equal(app.elements['launch-version'].textContent, 'refresh');
  assert.equal(app.elements['recent-generals'].attrs['aria-pressed'], 'true');
  app.elements['start-game'].onclick();
  assert.equal(JSON.parse(app.session.getItem(launchKey)).pack, 'refresh');
});

test('confirmed launch alone records the selected version and preserves all three native mode configurations', async () => {
  for (const mode of ['identity', 'versus', 'doudizhu']) {
    const app = await lobby();
    app.select('xianding:recent');
    app.modes.find(m => m.dataset.mode === mode).emit('click');
    app.roles.forEach(role => role.checked = role.value === 'farmer');
    app.roles[1].emit('change');
    app.elements['player-count'].value = '6';
    app.elements.identity.value = 'fan';
    app.elements.identity.emit('change');
    app.elements.speed.value = 'fast';
    app.elements.speed.emit('change');
    app.elements['settings-link'].onclick();
    const settings = app.document.body.children.at(-1);
    assert.equal(settings.open, true);
    assert.equal(settings.querySelector('[name="speed"]').value, 'fast');
    settings.querySelector('[data-close]').emit('click');
    assert.equal(app.local.getItem(recentKey), null);
    app.elements['start-game'].onclick();
    assert.match(app.location.href, /^\.\/index\.html\?sgs=1#sgs-launch=/);
    assert.deepEqual(JSON.parse(app.session.getItem(launchKey)), normalizeLaunch({generalId:'recent', pack:'xianding', mode, landlordRole:'farmer', playerCount:6, identity:'fan', speed:'fast'}));
    assert.deepEqual(JSON.parse(app.local.getItem(recentKey)).keys, ['xianding:recent']);
  }
});

test('denied session or recent storage still launches through the normalized fragment carrier', async () => {
  const blocked = await lobby({session: {setItem() {throw new Error('blocked');}}});
  blocked.elements['start-game'].onclick();
  assert.equal(blocked.carrier().generalId, 'caocao');
  assert.deepEqual(JSON.parse(blocked.local.getItem(recentKey)).keys, ['standard:caocao']);
  const local = storage();
  const save = local.setItem;
  local.setItem = (key, value) => { if (key === recentKey) throw new Error('quota'); save(key, value); };
  const app = await lobby({local});
  app.elements['start-game'].onclick();
  assert.match(app.location.href, /^\.\/index\.html\?sgs=1#sgs-launch=/);
  assert.equal(JSON.parse(app.session.getItem(launchKey)).generalId, 'caocao');
});

test('lobby history reads only completed matches and starts exact stored pack, mode, role and speed with a fresh handoff', async () => {
  for (const [mode, role] of [['identity', 'landlord'], ['versus', 'landlord'], ['doudizhu', 'farmer'], ['doudizhu', 'landlord']]) {
    const local = storage({ 'sgs.favorites.v1': '["standard:caocao"]', 'sgs.card-audio.enabled': 'false' });
    const replay = normalizeLaunch({ generalId: 'caocao', pack: 'refresh', mode, landlordRole: role, identity: 'fan', playerCount: 7, speed: 'fast' });
    createBattleRecords(() => local).record(completedBattle({ replay }));
    const before = local.getItem(battleRecordsKey), app = await lobby({ local });
    app.elements['records-button'].onclick();
    const dialog = app.document.body.children.at(-1);
    assert.equal(app.location.href, ''); assert.equal(local.getItem(recentKey), null);
    dialog.querySelector('.sgs-record-content').children[0].emit('click');
    assert.equal(app.location.href, ''); assert.equal(local.getItem(recentKey), null);
    dialog.querySelector('[data-launch]').emit('click');
    assert.match(app.location.href, /^\.\/index\.html\?sgs=1#sgs-launch=/);
    assert.deepEqual(JSON.parse(app.session.getItem(launchKey)), { ...replay, fromBattleRecord: true });
    assert.deepEqual(JSON.parse(local.getItem(recentKey)).keys, ['refresh:caocao']);
    assert.equal(local.getItem('sgs.selected.v1'), 'refresh:caocao', 'returning to the lobby keeps the hero actually launched from history');
    assert.equal(createPreferences(() => local).get().speed, 'fast');
    assert.equal(createPreferences(() => local).get().sound, false);
    assert.equal(local.getItem('sgs.favorites.v1'), '["standard:caocao"]');
    assert.equal(local.getItem(battleRecordsKey), before, 'starting/browsing never invents a completed match');
  }
});

test('record launch tolerates denied session storage and double clicks navigate only once', async () => {
  const local = storage(), session = storage();
  createBattleRecords(() => local).record(completedBattle());
  const app = await lobby({ local, session: { getItem: session.getItem, setItem() { throw Error('denied'); } } });
  app.elements['records-button'].onclick();
  const dialog = app.document.body.children.at(-1); dialog.querySelector('.sgs-record-content').children[0].emit('click');
  dialog.querySelector('[data-launch]').emit('click');
  assert.equal(app.carrier().fromBattleRecord, true);
  assert.equal(app.carrier().speed, 'fast');
  dialog.querySelector('[data-launch]').emit('click'); app.elements['start-game'].onclick();
  assert.equal(app.navigations.length, 1);
});

test('broken or denied history alone never prevents ordinary lobby play or changes favorites/mute', async () => {
  for (const broken of [true, false]) {
    const local = storage({ [battleRecordsKey]: '{broken', 'sgs.favorites.v1': '["standard:caocao"]', 'sgs.card-audio.enabled': 'false' });
    const read = local.getItem;
    if (!broken) local.getItem = key => { if (key === battleRecordsKey) throw Error('denied'); return read(key); };
    const app = await lobby({ local }); app.elements['records-button'].onclick();
    const dialog = app.document.body.children.at(-1);
    assert.match(dialog.querySelector('[data-record-status]').textContent, /无法读取/);
    dialog.querySelector('[data-close]').emit('click'); app.elements['start-game'].onclick();
    assert.match(app.location.href, /^\.\/index\.html\?sgs=1#sgs-launch=/);
    assert.equal(local.getItem('sgs.favorites.v1'), '["standard:caocao"]');
    assert.equal(local.getItem('sgs.card-audio.enabled'), 'false');
  }
});

test('fully denied storage retains the current general, mode, role, speed and preferences in one fresh launch', async () => {
  const denied = { getItem() { throw Error('denied'); }, setItem() { throw Error('denied'); } };
  const app = await lobby({ local: denied, session: denied });
  assert.equal(app.elements['storage-notice'].hidden, false);
  assert.match(app.elements['storage-notice'].textContent, /偏好与战绩/);
  app.select('xianding:recent');
  app.modes.find(m => m.dataset.mode === 'doudizhu').emit('click');
  for (const role of app.roles) role.checked = role.value === 'farmer';
  app.elements.speed.value = 'fast'; app.elements.speed.emit('change');
  app.elements['start-game'].onclick(); app.elements['start-game'].onclick();
  assert.equal(app.navigations.length, 1);
  const carrier = app.carrier();
  assert.equal(carrier.generalId, 'recent'); assert.equal(carrier.pack, 'xianding');
  assert.equal(carrier.mode, 'doudizhu'); assert.equal(carrier.landlordRole, 'farmer');
  assert.equal(carrier.speed, 'fast'); assert.equal(carrier.preferences.speed, 'fast');
});

test('history distinguishes loading, failed and removed catalog versions and recovers in the same dialog after one retry', async () => {
  const local = storage(); createBattleRecords(() => local).record(completedBattle());
  let release, calls = 0, failing = true;
  const app = await lobby({ local, pending: true, fetcher: async url => {
    calls++;
    if (failing) return new Promise(resolve => { release = () => resolve({ ok: false, status: 503 }); });
    return { ok: true, json: async () => url.includes('portraits') ? { portraits: {} }
      : { characters: structuredClone(characters), packs: [] } };
  } });
  app.elements['start-game'].onclick(); assert.equal(app.navigations.length, 0);
  app.elements['records-button'].onclick();
  const dialog = app.document.body.children.at(-1);
  dialog.querySelector('.sgs-record-content').children[0].emit('click');
  assert.match(dialog.querySelector('[data-record-status]').textContent, /正在载入/);
  assert.equal(dialog.querySelector('[data-launch]').disabled, true);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.match(dialog.querySelector('[data-record-status]').textContent, /载入失败/);
  assert.equal(dialog.querySelector('[data-catalog-retry]').hidden, false);
  failing = false;
  dialog.querySelector('[data-catalog-retry]').emit('click');
  app.elements['retry-load'].onclick();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 3, 'one failed roster, one retried roster and one portrait index');
  assert.equal(dialog.querySelector('[data-catalog-retry]').hidden, true);
  assert.equal(dialog.querySelector('[data-launch]').disabled, false);
  assert.equal(app.document.body.children.length, 1, 'retry must preserve the open details without duplicating dialogs');
  dialog.querySelector('[data-launch]').emit('click');
  assert.equal(app.carrier().fromBattleRecord, true);
});

const realRoster = JSON.parse(await readFile(new URL('../../apps/core/sgs/roster.json', import.meta.url), 'utf8')).characters;
test('real roster defaults to pack ordering and all six tabs filter exact catalog versions', async () => {
  const app = await lobby({roster: realRoster}), e = app.elements;
  const byKey = new Map(realRoster.map(c => [c.key, c]));
  assert.ok(app.visible().every(key => byKey.get(key).browsePack === 'yijiang'), 'Yijiang leads the default all-pack list');
  for (const [group, key] of [['yijiang', 'newjiang:lukai'], ['limited', 'xianding:luyi'], ['huicui', 'sp2:xushao'], ['xinghe', 'sp2:star_caoren'], ['mou', 'xianding:dc_jiangji'], ['wei', 'newjiang:v_sunce']]) {
    app.browse.find(b => b.dataset.browse === group).onclick();
    e.search.value = key.split(':')[1]; e.search.emit('input');
    assert.ok(app.visible().includes(key), key);
    assert.ok(app.visible().every(visible => byKey.get(visible).browsePack === group), group);
    assert.equal(app.browse.find(b => b.dataset.browse === group).attrs['aria-pressed'], 'true');
  }
  assert.equal(app.local.getItem(recentKey), null);
  app.browse.find(b => b.dataset.browse === 'huicui').onclick();
  e.search.value = '许绍'; e.search.emit('input');
  assert.ok(app.visible().includes('sp2:xushao'), 'common homophone search finds 许劭 without renaming the general');
});

test('hide-old button excludes confirmed old editions but retains modern standard/refresh editions and labels unknown years', async () => {
  const app = await lobby({roster: realRoster}), e = app.elements;
  e['hide-old'].onclick();
  assert.equal(e['hide-old'].attrs['aria-pressed'], 'true');
  for (const [key, visible] of [['standard:caocao', false], ['refresh:re_caocao', false], ['refresh:xin_gaoshun', false], ['newjiang:yj_zhanghe', false], ['standard:std_panfeng', true], ['refresh:dc_caozhi', true], ['refresh:dc_bulianshi', true], ['xianding:liuhui', true]]) {
    e.search.value = key.split(':')[1]; e.search.emit('input');
    assert.equal(app.visible().includes(key), visible, key);
  }
  assert.match(e['general-grid'].innerHTML, /年份待核实/);
  assert.match(e['age-filter-note'].textContent, /年份待核实，暂时保留/);
  e['hide-old'].onclick(); e.search.value = 're_caocao'; e.search.emit('input');
  assert.ok(app.visible().includes('refresh:re_caocao'), 'toggle only hides, never deletes a catalog entry');
});

test('pack/year/search filters clear independently, persist only age preference and preserve exact native launch', async () => {
  const app = await lobby({roster: realRoster}), e = app.elements;
  app.select('newjiang:v_sunce');
  app.browse.find(b => b.dataset.browse === 'wei').onclick();
  e['hide-old'].onclick(); e.search.value = 'v_sunce'; e.search.emit('input');
  e['active-filters'].emit('click', {target: {closest: () => ({dataset: {filter: 'browse'}})}});
  assert.equal(e['hide-old'].attrs['aria-pressed'], 'true');
  assert.equal(e.search.value, 'v_sunce');
  e['active-filters'].emit('click', {target: {closest: () => ({dataset: {filter: 'search'}})}});
  assert.equal(e['launch-general'].textContent, '威孙策');
  assert.equal(e['selected-filter-note'].hidden, true);
  const local = storage({'sgs.hide-old-generals.v1': app.local.getItem('sgs.hide-old-generals.v1')});
  const reloaded = await lobby({roster: realRoster, local});
  assert.equal(reloaded.elements['hide-old'].attrs['aria-pressed'], 'true');
  app.modes.find(m => m.dataset.mode === 'doudizhu').emit('click');
  e['start-game'].onclick();
  assert.equal(app.carrier().generalId, 'v_sunce'); assert.equal(app.carrier().pack, 'newjiang');
  assert.equal(app.carrier().mode, 'doudizhu');
  assert.deepEqual(JSON.parse(app.local.getItem(recentKey)).keys, ['newjiang:v_sunce']);
});

test('year filtering tolerates denied preference storage and retains a selected old hero outside results', async () => {
  const local = storage(), save = local.setItem;
  local.setItem = (key, value) => { if (key === 'sgs.hide-old-generals.v1') throw Error('quota'); save(key, value); };
  const app = await lobby({roster: realRoster, local}), e = app.elements;
  e['hide-old'].onclick(); e.search.value = 'caocao'; e.search.emit('input');
  assert.equal(e['storage-notice'].hidden, false);
  assert.equal(e['selected-filter-note'].hidden, false);
  assert.equal(e['launch-general'].textContent, '曹操');
  assert.ok(!app.visible().includes('standard:caocao'));
  e['active-filters'].emit('click', {target: {closest: () => ({dataset: {filter: 'age'}})}});
  assert.ok(app.visible().includes('standard:caocao'));
  assert.equal(e.search.value, 'caocao');
});

const ratedSample = ['standard:caocao', 'refresh:re_caocao', 'newjiang:v_sunce', 'newjiang:yj_hanbing', 'xianding:shen_huangzhong']
  .map(key => realRoster.find(c => c.key === key));

test('slow roster loading preserves the saved rating scope before enabling the sort controls', async () => {
  const local = storage({'sgs.roster-sort.v1':JSON.stringify({order:'high',scope:'landlord'})});
  let release;
  const app = await lobby({roster:ratedSample, local, pending:true, fetcher: async url => {
    if (url.includes('portraits')) return {ok:true,json:async()=>({portraits:{}})};
    return new Promise(resolve => { release = () => resolve({ok:true,json:async()=>({characters:structuredClone(ratedSample),packs:[]})}); });
  }});
  const e = app.elements;
  assert.equal(e['sort-order'].value, 'high'); assert.equal(e['rating-scope'].value, 'landlord');
  assert.equal(e['sort-order'].disabled, true); assert.equal(e['rating-scope'].disabled, true);
  e['sort-order'].emit('change');
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(e['sort-order'].disabled, false); assert.equal(e['rating-scope'].disabled, false);
  assert.equal(e['rating-scope'].value, 'landlord');
  assert.equal(app.visible()[0], 'xianding:shen_huangzhong');
});

test('a mode and seat choice made while the roster loads survives completion and launches exactly that setup', async () => {
  const local = storage({'sgs.settings.v1': JSON.stringify({mode:'doudizhu',landlordRole:'farmer',playerCount:3})});
  let release;
  const app = await lobby({local, pending:true, fetcher: async url => {
    if (url.includes('portraits')) return {ok:true,json:async()=>({portraits:{}})};
    return new Promise(resolve => { release = () => resolve({ok:true,json:async()=>({characters:structuredClone(characters),packs:[]})}); });
  }});
  const e = app.elements;
  app.modes.find(mode => mode.dataset.mode === 'identity').emit('click');
  e['player-count'].value = '6'; e['player-count'].emit('change');
  e.identity.value = 'fan'; e.identity.emit('change');
  assert.equal(e['start-game'].disabled, true);
  release(); await new Promise(resolve => setImmediate(resolve));
  assert.equal(app.modes.find(mode => mode.dataset.mode === 'identity').attrs['aria-pressed'], 'true');
  assert.equal(e['player-count'].value, '6'); assert.equal(e.identity.value, 'fan');
  e['start-game'].onclick();
  assert.equal(app.carrier().mode, 'identity'); assert.equal(app.carrier().playerCount, 6); assert.equal(app.carrier().identity, 'fan');
});

test('actual rating controls sort numbers, keep unknowns last in both directions and preserve exact native launch', async () => {
  const app = await lobby({roster: ratedSample}), e = app.elements;
  app.select('refresh:re_caocao');
  for (const [order, scores] of [['high', [9,9,6,5,null]], ['low', [5,6,9,9,null]]]) {
    e['sort-order'].value = order; e['sort-order'].emit('change');
    assert.deepEqual(app.visible().map(key => ratingValue(ratedSample.find(c => c.key === key))), scores);
    assert.equal(e['launch-general'].textContent, '界曹操');
    assert.match(e['rating-detail'].textContent, /综合 6 \/ 10/);
    assert.equal(app.local.getItem(recentKey), null);
  }
  e.search.value = 'caocao'; e.search.emit('input');
  assert.deepEqual(app.visible(), ['standard:caocao', 'refresh:re_caocao']);
  e['start-game'].onclick();
  assert.equal(app.carrier().pack, 'refresh'); assert.equal(app.carrier().generalId, 're_caocao');
});

test('changing the official rating scope updates sorting and details while keeping filters and selection', async () => {
  const app = await lobby({roster: realRoster}), e = app.elements;
  app.select('xianding:shen_huangzhong');
  app.browse.find(b => b.dataset.browse === 'limited').onclick();
  e['sort-order'].value = 'high'; e['sort-order'].emit('change');
  e.next.onclick(); assert.match(e['page-number'].textContent, /^2 \/ /);
  e['rating-scope'].value = 'landlord'; e['rating-scope'].emit('change');
  assert.match(e['page-number'].textContent, /^1 \/ /);
  assert.equal(app.browse.find(b => b.dataset.browse === 'limited').attrs['aria-pressed'], 'true');
  assert.match(e['rating-detail'].textContent, /斗地主·地主 10 \/ 10/);
  const rows = app.visible().map(key => realRoster.find(c => c.key === key));
  assert.ok(rows.every(c => c.browsePack === 'limited'));
  assert.ok(rows.every((c,i) => !i || ratingValue(rows[i-1], 'landlord') >= ratingValue(c, 'landlord')));
  assert.equal(e['launch-general'].textContent, '神黄忠');
  e['rating-scope'].value = 'farmer'; e['rating-scope'].emit('change');
  assert.match(e['rating-detail'].textContent, /斗地主·农民 9 \/ 10/);
});

test('recent order returns intact after explicit score sorting and ratings persist independently of filters', async () => {
  const keys = ['standard:caocao', 'newjiang:yj_hanbing', 'newjiang:v_sunce'];
  const local = storage({[recentKey]: JSON.stringify({version:1, keys})});
  const app = await lobby({roster:ratedSample, local}), e = app.elements;
  e['recent-generals'].onclick(); assert.deepEqual(app.visible(), keys);
  e['sort-order'].value = 'high'; e['sort-order'].emit('change');
  assert.deepEqual(app.visible(), ['newjiang:v_sunce', 'standard:caocao', 'newjiang:yj_hanbing']);
  e['sort-order'].value = 'default'; e['sort-order'].emit('change');
  assert.deepEqual(app.visible(), keys);
  e['sort-order'].value = 'low'; e['rating-scope'].value = 'landlord'; e['rating-scope'].emit('change');
  e['clear-filters'].onclick();
  const reloaded = await lobby({roster:ratedSample, local});
  assert.equal(reloaded.elements['sort-order'].value, 'low');
  assert.equal(reloaded.elements['rating-scope'].value, 'landlord');
  assert.deepEqual(JSON.parse(local.getItem(recentKey)).keys, keys);
});

test('malformed and unwritable rating preferences do not prevent numeric sorting or launching', async () => {
  const local = storage({'sgs.roster-sort.v1':'{broken'}), save = local.setItem;
  local.setItem = (key,value) => { if (key === 'sgs.roster-sort.v1') throw Error('quota'); save(key,value); };
  const app = await lobby({roster:ratedSample, local}), e = app.elements;
  assert.equal(e['sort-order'].value, 'default'); assert.equal(e['rating-scope'].value, 'overall');
  e['sort-order'].value = 'high'; e['sort-order'].emit('change');
  assert.equal(e['storage-notice'].hidden, false);
  assert.equal(ratingValue(ratedSample.find(c => c.key === app.visible()[0])), 9);
  app.select('newjiang:yj_hanbing');
  assert.match(e['rating-detail'].textContent, /评分待收录/);
  e['start-game'].onclick(); assert.equal(app.carrier().generalId, 'yj_hanbing');
});
