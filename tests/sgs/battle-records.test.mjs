import test from 'node:test';
import assert from 'node:assert/strict';
import { createBattleRecords, battleRecordsKey, createBattleSessionId, recordLaunch, consumeRecordReplay } from '../../apps/core/sgs/battle-records.mjs';
import { createPreferences, preferencesKey } from '../../apps/core/sgs/preferences.mjs';
import { launchKey } from '../../apps/core/sgs/launch-config.mjs';
import { createClientDialogs } from '../../apps/core/sgs/settings.mjs';
import { openBattleRecords } from '../../apps/core/sgs/records-dialog.mjs';
import { dom } from './helpers/client-dom.mjs';
import { completedBattle } from './helpers/battle-record.mjs';

function storage(value) {
  const data = new Map(value === undefined ? [] : [[battleRecordsKey, value]]);
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
}
const characters = [{ pack: 'standard', id: 'caocao', key: 'standard:caocao' }];

test('completed history retains exactly the newest 50, deduplicates immutable sessions and survives JSON reload', () => {
  const local = storage(), records = createBattleRecords(() => local);
  for (let i = 0; i < 55; i++) assert.equal(records.record(completedBattle({ sessionId: `match-${i}`, completedAt: i })).saved, true);
  const loaded = createBattleRecords(() => local);
  assert.equal(loaded.get().records.length, 50);
  assert.deepEqual(loaded.get().records.map(row => row.sessionId), Array.from({ length: 50 }, (_, i) => `match-${54 - i}`));
  loaded.record(completedBattle({ sessionId: 'match-54', outcome: 'loss', completedAt: 999 }));
  assert.equal(loaded.get().records[0].outcome, 'win');
  assert.equal(loaded.get().records[0].completedAt, 54);
  const copy = loaded.get(); copy.records[0].stats.damage = 999; copy.records[0].replay.pack = 'refresh'; copy.records.pop();
  assert.equal(loaded.get().records[0].stats.damage, 5);
  assert.equal(loaded.get().records[0].replay.pack, 'standard');
  assert.equal(loaded.get().records.length, 50);
  assert.equal(JSON.parse(local.getItem(battleRecordsKey)).version, 1);
  // A stale open page must retain the match just completed by another page.
  records.record(completedBattle({ sessionId: 'new-match', completedAt: 1000 }));
  loaded.record(completedBattle({ sessionId: 'other-match', completedAt: 1001 }));
  assert.deepEqual(loaded.get().records.slice(0, 2).map(row => row.sessionId), ['other-match', 'new-match']);
  assert.notEqual(createBattleSessionId(), createBattleSessionId());
});

test('serialization stores only completed summary fields and preserves exact pack IDs and non-boolean outcomes', () => {
  const local = storage(), records = createBattleRecords(() => local);
  const input = completedBattle({ title: '特殊结算', outcome: 'ended', rounds: null, hiddenCards: ['sha'] });
  input.replay.cards = ['shan']; input.stats.skill = { secret: 1 };
  records.record(input);
  input.stats.damage = 100;
  const saved = createBattleRecords(() => local).get().records[0];
  assert.equal(saved.outcome, 'ended'); assert.equal(saved.title, '特殊结算'); assert.equal(saved.rounds, null);
  assert.equal(saved.stats.damage, 5); assert.equal(saved.hiddenCards, undefined); assert.equal(saved.replay.cards, undefined);
  assert.equal(saved.stats.skill, undefined);
  assert.deepEqual(recordLaunch(saved, characters), completedBattle().replay);
  assert.equal(recordLaunch(saved, [{ ...characters[0], pack: 'refresh', key: 'refresh:caocao' }]), null);
  assert.equal(recordLaunch(saved, [{ ...characters[0], isUnseen: true }]), null);
});

test('corrupt history degrades with an honest notice, salvages valid rows, and refuses wrong-config fallback', () => {
  for (const raw of ['{broken', 'null', '[]', '{"version":1,"records":{}}']) {
    const local = storage(raw), records = createBattleRecords(() => local);
    assert.deepEqual(records.get().records, []); assert.match(records.get().notice, /损坏|不可用/);
    assert.equal(records.record(completedBattle()).saved, true);
    assert.equal(createBattleRecords(() => local).get().records.length, 1);
  }
  const good = completedBattle();
  const bad = [null, 0, {}, ...[
    { replay: { ...good.replay, pack: 'bad:pack' } }, { replay: { ...good.replay, mode: 'unknown' } },
    { replay: { ...good.replay, identity: 'unknown' } }, { elapsedMs: -1 }, { completedAt: 9e15 },
    { stats: { ...good.stats, damage: '5' } }, { dead: 'false' }, { rounds: 1.5 }, { general: null },
  ].map(patch => ({ ...good, ...patch }))];
  const records = createBattleRecords(() => storage(JSON.stringify({ version: 1, records: [...bad, good, good] })));
  assert.deepEqual(records.get().records, [good]); assert.match(records.get().notice, /部分战绩已损坏/);
  for (const value of bad) { assert.equal(records.record(value).saved, false); assert.equal(recordLaunch(value, characters), null); }
});

test('denied reads/writes keep a bounded session list, retry safely and never overwrite a future schema', () => {
  let blocked = true;
  const local = storage(), getStorage = () => { if (blocked) throw Error('denied'); return local; };
  const records = createBattleRecords(getStorage);
  for (let i = 0; i < 52; i++) assert.equal(records.record(completedBattle({ sessionId: `${i}`, completedAt: i })).saved, false);
  assert.equal(records.get().records.length, 50); assert.match(records.get().notice, /未保存/);
  blocked = false; assert.equal(records.record(completedBattle({ sessionId: '51', completedAt: 51 })).saved, true);
  assert.equal(createBattleRecords(() => local).get().records.length, 50);
  const quota = createBattleRecords(() => ({ getItem: local.getItem, setItem() { throw Error('quota'); } }));
  assert.equal(quota.record(completedBattle()).saved, false); assert.match(quota.get().notice, /未保存/);
  const future = '{"version":2,"records":[]}', futureLocal = storage(future), futureRecords = createBattleRecords(() => futureLocal);
  assert.equal(futureRecords.record(completedBattle()).saved, false); assert.match(futureRecords.get().notice, /版本暂不支持/);
  assert.equal(futureLocal.getItem(battleRecordsKey), future);
});

test('battle storage never changes existing favorites, general ID, mute, recent-use or speed keys', () => {
  const local = storage(), keys = ['sgs.favorites.v1', 'sgs.selected.v1', 'sgs.settings.v1', 'sgs.card-audio.enabled', 'sgs.preferences.v1', 'sgs.recent-generals.v1'];
  keys.forEach(key => local.setItem(key, `original-${key}`));
  createBattleRecords(() => local).record(completedBattle());
  keys.forEach(key => assert.equal(local.getItem(key), `original-${key}`));
});

test('record replay speed survives denied preference writes and its consumed marker leaves later restarts alone', () => {
  const local = storage(), session = storage(), config = completedBattle().replay;
  local.setItem(preferencesKey, JSON.stringify({ version: 1, speed: 'normal', sound: false }));
  const denied = { getItem: local.getItem, setItem() { throw Error('quota'); } };
  const preferences = createPreferences(() => denied, config);
  assert.equal(preferences.get().speed, 'normal');
  session.setItem(launchKey, JSON.stringify({ ...config, fromBattleRecord: true }));
  consumeRecordReplay(JSON.parse(session.getItem(launchKey)), preferences, () => session);
  assert.equal(preferences.get().speed, 'fast'); assert.equal(preferences.get().sound, false);
  assert.deepEqual(JSON.parse(session.getItem(launchKey)), config);
  assert.equal(JSON.parse(local.getItem(preferencesKey)).speed, 'normal', 'blocked persistence is not mistaken for success');
  preferences.set({ speed: 'normal' });
  consumeRecordReplay(JSON.parse(session.getItem(launchKey)), preferences, () => session);
  assert.equal(preferences.get().speed, 'normal', 'a later normal restart retains current speed');
  consumeRecordReplay({ ...config, fromBattleRecord: true }, preferences, () => { throw Error('denied'); });
  assert.equal(preferences.get().speed, 'fast', 'unavailable marker cleanup does not throw or block play');
});

test('records dialog has a real empty state, safe text details, repeat-open/dispose and retryable exact-version launch', () => {
  const document = dom(), dialogs = createClientDialogs({ document }), local = storage(), records = createBattleRecords(() => local);
  const launched = []; let denied = true;
  const options = { document, characters, launch: value => { if (denied) return '未能传递开局配置'; launched.push(value); return ''; } };
  let dialog = openBattleRecords(dialogs, records, options);
  const empty = dialog.querySelector('.sgs-record-content');
  assert.equal(empty.children[0].textContent, '还没有完成的对局');
  assert.equal(dialog.querySelector('[data-launch]').hidden, true);
  assert.equal(openBattleRecords(dialogs, records, options), dialog);
  dialog.emit('cancel'); assert.equal(document.body.children.length, 0);
  records.record(completedBattle({ general: '<img src=x onerror=alert(1)>', title: '特殊结算', outcome: 'ended' }));
  dialog = openBattleRecords(dialogs, records, options);
  const content = dialog.querySelector('.sgs-record-content');
  content.children[0].emit('click');
  assert.equal(content.children[0].textContent, '特殊结算');
  assert.match(content.children[1].textContent, /^<img src=x onerror=alert\(1\)>/);
  assert.equal(content.children[1].children.length, 0);
  assert.equal(content.querySelector('.sgs-record-stats').children[0].children[0].textContent, 5);
  const start = dialog.querySelector('[data-launch]'); start.emit('click');
  assert.match(dialog.querySelector('[data-record-status]').textContent, /未能传递/); assert.equal(start.disabled, false);
  denied = false; start.emit('click'); start.emit('click'); assert.deepEqual(launched, [completedBattle().replay]);
  dialog.querySelector('[data-back]').emit('click'); assert.equal(content.children.length, 1); assert.equal(start.hidden, true);
  dialogs.dispose(); assert.equal(document.body.children.length, 0); assert.equal(openBattleRecords(dialogs, records, options), null);
});

test('unavailable recorded versions and unreadable storage explain their state without inventing history or launching', () => {
  const document = dom(), dialogs = createClientDialogs({ document }), records = createBattleRecords(() => storage());
  records.record(completedBattle());
  let launched = false;
  let dialog = openBattleRecords(dialogs, records, { document, characters: [], launch() { launched = true; } });
  dialog.querySelector('.sgs-record-content').children[0].emit('click');
  assert.equal(dialog.querySelector('[data-launch]').disabled, true);
  assert.match(dialog.querySelector('[data-record-status]').textContent, /不在当前名册/);
  dialog.querySelector('[data-launch]').emit('click'); assert.equal(launched, false); dialog.emit('cancel');
  dialog = openBattleRecords(dialogs, createBattleRecords(() => { throw Error('denied'); }), { document, characters });
  assert.match(dialog.querySelector('[data-record-status]').textContent, /无法读取/);
  assert.equal(dialog.querySelector('.sgs-record-content').children[0].textContent, '暂无可读取的战绩');
  dialogs.dispose();
});
