import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { Node, dom } from './helpers/client-dom.mjs';
import { captureBattleResult, installBattleResults } from '../../apps/core/sgs/results.mjs';
import { engineSettings, launchKey, normalizeLaunch } from '../../apps/core/sgs/launch-config.mjs';
import { createBattleRecords, battleRecordsKey } from '../../apps/core/sgs/battle-records.mjs';

const settle = () => new Promise(resolve => setImmediate(resolve));
const read = path => readFileSync(new URL(`../../apps/core/${path}`, import.meta.url), 'utf8');
const gameSource = read('noname/game/index.js');
const overSource = gameSource.slice(gameSource.indexOf('\tover(result, bool) {'), gameSource.indexOf('\tloop(event =', gameSource.indexOf('\tover(result, bool) {')));
assert.ok(overSource.includes('lib.onover[i](resultbool)'));

// Minimal native presentation sinks. The complete locked game.over function
// still generates both its live/dead stat tables and invokes every over hook.
class NativeNode extends Node {
  constructor(tag) { super(tag); this.style = {}; }
  set innerHTML(value) { this.html = String(value); this.textContent = this.html.replace(/<[^>]*>/g, ''); }
  get innerHTML() { return this.html || ''; }
  appendChild(node) { this.append(node); return node; }
  hide() {}
  show() {}
}
function player(name, identity, side) {
  return { name, name1: name, identity, side, ai: {}, stat: [{ card: {}, skill: {} }],
    getCards: () => [], isOnline2: () => false, isAlive() { return !this.dead; }, isDead() { return !!this.dead; },
    classList: { contains(value) { return value === 'dead' && !!this.owner.dead; } }, showGiveup() {} };
}
function fixture(input = {}) {
  const document = dom(), nativeDocument = { createElement: tag => new NativeNode(tag) };
  const launch = normalizeLaunch({ generalId: 'caocao', pack: 'standard', mode: 'identity', identity: 'random', ...input });
  const me = player(launch.generalId, 'zhong', true), zhu = player('liubei', 'zhu', true), enemy = player('lvbu', 'fan', false);
  for (const p of [me, zhu, enemy]) p.classList.owner = p;
  const _status = { mode: launch.mode === 'versus' ? 'two' : 'normal' };
  const lib = { onover: [], config: { mode: launch.mode }, storage: {} };
  const recorded = [], video = [], navigation = [], writes = new Map();
  const get = { mode: () => launch.mode, config: () => false, id: () => 'hand', poptip: () => '手牌',
    translation: value => typeof value === 'object' ? value.name : ({ caocao: '曹操', liubei: '刘备', lvbu: '吕布' }[value] || value),
    convertedCharacter: value => value };
  const game = { players: [me, zhu, enemy], dead: [], me, zhu, roundNumber: 7,
    stopCountChoose() {}, broadcastAll() {}, addVideo: (...args) => video.push(args),
    addRecord: value => recorded.push(value), reload() {}, showIdentity() {} };
  get.population = identity => game.players.filter(p => p.identity === identity).length;
  const ui = { control: new NativeNode(), clear() {}, create: {
    div: () => new NativeNode(), control: () => new NativeNode(), dialog(result) {
      const dialog = new NativeNode(), content = new NativeNode(), caption = new NativeNode();
      caption.className = 'caption'; caption.innerHTML = result; content.append(caption);
      dialog.content = content; dialog.add = node => content.append(node);
      dialog.open = () => { dialog.openCount = (dialog.openCount || 0) + 1; return dialog; };
      ui.dialog = dialog; return dialog;
    },
  } };
  const context = { game, lib, ui, get, _status, document: nativeDocument, window: {} };
  game.over = new Function(...Object.keys(context), `return {${overSource}}.over`)(...Object.values(context));
  let speed = launch.speed, actions, elapsed = 125000;
  const preferences = { get: () => ({ speed }) };
  const options = { game, lib, get, _status, document, launch, preferences,
    records: createBattleRecords(() => ({ getItem: key => writes.get(key) ?? null, setItem: (key, value) => writes.set(key, value) })),
    storage: () => ({ setItem: (key, value) => writes.set(key, value) }), elapsedMs: () => elapsed,
    navigate: restart => navigation.push(restart), onReady: value => { actions = value; } };
  const kill = p => { p.dead = true; game.players = game.players.filter(other => other !== p); game.dead.push(p); };
  return { ...options, options, ui, me, zhu, enemy, kill, recorded, video, writes, navigation,
    actions: () => actions, setSpeed: value => { speed = value; }, setElapsed: value => { elapsed = value; },
    dialog: () => document.body.children.at(-1) };
}
function nativeMode(name, f) {
  if (name !== 'versus') {
    const text = read(`mode/${name}.js`), start = text.indexOf('\t\tcheckResult() {'), end = text.indexOf('\t\tcheckOnlineResult(', start);
    assert.ok(start >= 0 && end > start);
    return { game: new Function('game', 'get', '_status', `return {${text.slice(start, end)}}`)(f.game, f.get, f._status) };
  }
  const source = read(`mode/${name}.js`).replace(/^import .*?;\r?\n/, '').replace('export const type = "mode";', '').replace('export default', 'return');
  return new Function('lib', 'game', 'ui', 'get', 'ai', '_status', source)(f.lib, f.game, f.ui, f.get, {}, f._status)();
}

test('complete native over keeps non-boolean captions distinct, records unchanged results and renders only once', async () => {
  for (const [input, title, outcome, hook] of [[true, '战斗胜利', 'win', true], [false, '战斗失败', 'loss', false],
    [undefined, '战斗结束', 'ended', null], [null, '战斗结束', 'ended', null],
    ['游戏平局', '游戏平局', 'ended', null], ['<b>特殊结算</b>', '特殊结算', 'ended', null]]) {
    const f = fixture(), adapter = installBattleResults(f);
    const nativeOver = f.game.over;
    assert.equal(f.document.body.children.length, 0);
    f.game.over(input); await settle();
    assert.equal(f.dialog().querySelector('h2').textContent, title);
    assert.equal(f.dialog().dataset.outcome, outcome);
    const history = JSON.parse(f.writes.get(battleRecordsKey)).records;
    assert.equal(history[0].title, title); assert.equal(history[0].outcome, outcome);
    assert.deepEqual(f.recorded, [hook]); assert.equal(f.video[0][0], 'over');
    f.game.over(!input); f.lib.onover[0](false); await settle();
    assert.equal(f.document.body.children.length, 1); assert.equal(f.game.over, nativeOver);
    adapter.dispose(); assert.equal(f.document.body.children.length, 0);
  }
});

test('human multi-turn counters equal the full native dead-player table; summary round/time freeze at onover', async () => {
  const f = fixture();
  f.me.stat = [{ damage: 2, damaged: 1, gain: 4, card: { sha: 2, jiu: 1 } }, { damage: 3, damaged: 2, gain: 2, card: { nanman: 1 }, kill: 2 }, { card: {} }];
  const original = structuredClone(f.me.stat); f.kill(f.me);
  const adapter = installBattleResults(f); f.game.over(true); await settle();
  const summary = f.dialog().querySelector('.sgs-result-stats').children.map(cell => Number(cell.children[0].textContent));
  const deadTable = f.ui.dialog.content.children.filter(node => node.tagName === 'table').at(-1);
  const native = deadTable.children[0].children.slice(1, 6).map(cell => Number(cell.innerHTML));
  assert.deepEqual(summary, [5, 3, 6, 4, 2]); assert.deepEqual(summary, native);
  const stored = JSON.parse(f.writes.get(battleRecordsKey)).records[0];
  assert.deepEqual(Object.values(stored.stats), native);
  assert.match(f.dialog().querySelector('.sgs-result-player').textContent, /曹操 · 忠臣 · 已阵亡/);
  assert.match(f.dialog().querySelector('.sgs-result-context').textContent, /第 7 轮.*02:05/);
  f.dialog().emit('cancel'); f.game.roundNumber = 99; f.setElapsed(800000); f.me.stat[0].damage = 200;
  adapter.show();
  assert.match(f.dialog().querySelector('.sgs-result-context').textContent, /第 7 轮.*02:05/);
  assert.equal(f.dialog().querySelector('.sgs-result-stats').children[0].children[0].textContent, 5);
  assert.equal(original[0].damage, 2); adapter.dispose();
});

test('native 2v2 death victory includes a dead human and never ends on the first teammate death', async () => {
  const f = fixture({ mode: 'versus' }), adapter = installBattleResults(f), mode = nativeMode('versus', f);
  const secondEnemy = player('sunquan', 'fan', false); f.game.players.push(secondEnemy);
  f.kill(f.me); mode.element.player.dieAfter.call(f.me); await settle();
  assert.equal(f._status.over, undefined); assert.equal(f.document.body.children.length, 0);
  f.kill(f.enemy); mode.element.player.dieAfter.call(f.enemy); await settle();
  assert.equal(f._status.over, undefined); assert.equal(f.document.body.children.length, 0);
  f.kill(secondEnemy); mode.element.player.dieAfter.call(secondEnemy); await settle();
  assert.equal(f.dialog().dataset.outcome, 'win'); assert.match(f.dialog().querySelector('.sgs-result-player').textContent, /己方 · 四号位 · 已阵亡/);
  assert.deepEqual(f.recorded, [true]); adapter.dispose();
});

test('native landlord/farmer and identity checkResult decide victory/loss, including dead farmer and loyalist wins', async () => {
  for (const [modeName, landlord] of [['doudizhu', false], ['doudizhu', true], ['identity', false]]) for (const win of [true, false]) {
    const f = fixture({ mode: modeName }), adapter = installBattleResults(f), mode = nativeMode(modeName, f);
    if (modeName === 'doudizhu') {
      if (landlord) {
        f.game.zhu = f.me; f.me.identity = 'zhu'; f.zhu.identity = 'fan';
        if (win) { f.kill(f.zhu); f.kill(f.enemy); } else f.kill(f.me);
      } else {
        f.me.identity = 'fan'; f.kill(f.me);
        if (win) f.kill(f.zhu); else f.kill(f.enemy);
      }
    } else {
      f.kill(f.me);
      f.kill(win ? f.enemy : f.zhu);
    }
    mode.game.checkResult(); await settle();
    assert.deepEqual(f.recorded, [win]); assert.equal(f.dialog().dataset.outcome, win ? 'win' : 'loss');
    adapter.dispose();
  }
});

test('native details are retained and reopenable; Escape and return require no unfinished-game confirmation', async () => {
  const f = fixture(), adapter = installBattleResults(f); f.game.over(false); await settle();
  const native = f.ui.dialog, content = native.content;
  f.dialog().querySelector('[data-details]').emit('click'); await settle();
  assert.equal(f.document.body.children.length, 0); assert.equal(native.openCount, 1); assert.equal(native.content, content);
  f.actions().show(); f.actions().show(); assert.equal(f.document.body.children.length, 1);
  f.dialog().emit('cancel'); await settle(); assert.equal(f.document.body.children.length, 0);
  f.actions().show(); f.dialog().querySelector('[data-return]').emit('click'); f.actions().leave();
  assert.deepEqual(f.navigation, [false]); assert.equal(f.writes.has(launchKey), false); adapter.dispose();
});

test('rematch hands only the selected general/pack, actual role and current speed to a fresh launch in all modes', async () => {
  for (const mode of ['identity', 'versus', 'doudizhu']) for (const landlord of mode === 'doudizhu' ? [true, false] : [false]) {
    const f = fixture({ mode, generalId: 'dc_sb_zhouyu', pack: 'xianding' });
    if (landlord) f.game.zhu = f.me;
    // Transforming the current hero must not replace the user's launch choice.
    f.me.name1 = 'transformed'; f.me.identity = 'nei';
    const adapter = installBattleResults(f); f.game.over(true); await settle(); f.setSpeed('fast');
    f.dialog().querySelector('[data-replay]').emit('click'); f.actions().replay();
    const config = JSON.parse(f.writes.get(launchKey));
    assert.equal(config.generalId, 'dc_sb_zhouyu'); assert.equal(config.pack, 'xianding'); assert.equal(config.mode, mode);
    assert.equal(config.speed, 'fast'); assert.equal(config.identity, mode === 'identity' ? 'nei' : 'random');
    if (mode === 'doudizhu') assert.equal(config.landlordRole, landlord ? 'landlord' : 'farmer');
    assert.deepEqual(Object.keys(config).sort(), Object.keys(normalizeLaunch()).sort());
    const settings = engineSettings(config);
    assert.deepEqual(settings.continue_name, ['dc_sb_zhouyu']); assert.equal(settings.game_speed, 'vfast');
    assert.deepEqual(f.navigation, [true]); adapter.dispose();
  }
});

test('denied rematch session storage permits reloading the runtime fragment carrier exactly once', async () => {
  const f = fixture(), carriers = [];
  const adapter = installBattleResults({ ...f, storage: () => { throw Error('denied'); }, retainReplay: config => carriers.push(config) });
  f.game.over(true); await settle(); f.dialog().emit('cancel'); await settle();
  f.actions().replay(); f.actions().replay(); assert.deepEqual(f.navigation, [true]);
  assert.equal(carriers.length, 1); assert.equal(carriers[0].identity, f.me.identity); adapter.dispose();
});

test('presentation hook preserves native receiver/arguments/return and disposal prevents pending UI or stale callbacks', async () => {
  const f = fixture(), seen = [], old = function (...args) { seen.push([this, ...args]); return 42; };
  f.game.addOverDialog = old;
  const unrelated = () => {}; f.lib.onover.push(unrelated);
  const adapter = installBattleResults(f), callback = f.lib.onover.at(-1);
  const custom = new NativeNode(); custom.content = new NativeNode();
  assert.equal(f.game.addOverDialog(custom, '特殊结果'), 42); assert.equal(seen[0][0], f.game);
  callback(true); assert.equal(f.actions(), undefined); // No actual game-over yet.
  f.game.over(true); adapter.dispose(); await settle();
  assert.equal(f.game.addOverDialog, old); assert.deepEqual(f.lib.onover, [unrelated]); assert.equal(f.document.body.children.length, 0);
  callback(false); f.actions().show(); assert.equal(f.document.body.children.length, 0);
  assert.deepEqual(captureBattleResult({ ...f, result: null, nativeText: '', elapsedMs: 0 }).stats, { damage: 0, damaged: 0, gain: 0, cards: 0, kill: 0 });
});

test('only a completed native match writes one immutable record; early exits and stale hooks write none', async () => {
  const abandoned = fixture(), first = installBattleResults(abandoned), stale = abandoned.lib.onover[0];
  stale(false); first.dispose(); stale(false);
  assert.equal(abandoned.writes.has(battleRecordsKey), false);
  const f = fixture(), adapter = installBattleResults({ ...f, sessionId: 'actual-match', now: () => 1791043200000 });
  f.setSpeed('fast'); f.kill(f.me);
  assert.equal(f.writes.has(battleRecordsKey), false, 'human death alone is not completion');
  f.game.over(true); await settle();
  const saved = JSON.parse(f.writes.get(battleRecordsKey)).records;
  assert.equal(saved.length, 1); assert.equal(saved[0].sessionId, 'actual-match');
  assert.equal(saved[0].outcome, 'win'); assert.equal(saved[0].dead, true);
  assert.equal(saved[0].general, '曹操'); assert.equal(saved[0].replay.identity, 'zhong');
  assert.equal(saved[0].replay.speed, 'fast'); assert.equal(saved[0].elapsedMs, 125000);
  assert.equal(saved[0].completedAt, 1791043200000); assert.deepEqual(saved[0].stats, { damage: 0, damaged: 0, gain: 0, cards: 0, kill: 0 });
  const original = f.writes.get(battleRecordsKey);
  f.setElapsed(999999); f.game.over(false); f.lib.onover[0](false);
  f.dialog().emit('cancel'); f.actions().show(); f.actions().leave(); adapter.dispose();
  assert.equal(f.writes.get(battleRecordsKey), original);
  // Replaying the same launch settings starts a different native match/ID.
  const next = fixture(), nextAdapter = installBattleResults(next);
  next.game.over(false); await settle();
  assert.notEqual(JSON.parse(next.writes.get(battleRecordsKey)).records[0].sessionId, saved[0].sessionId);
  nextAdapter.dispose();
});

test('record failure leaves native result and rematch usable with a persistent unsaved notice', async () => {
  const f = fixture(), records = createBattleRecords(() => { throw Error('denied'); });
  const adapter = installBattleResults({ ...f, records });
  f.game.over('特殊结算'); await settle();
  assert.equal(f.dialog().querySelector('h2').textContent, '特殊结算');
  assert.match(f.dialog().querySelector('[data-result-status]').textContent, /未保存/);
  assert.equal(records.get().records[0].outcome, 'ended');
  f.dialog().emit('cancel'); f.actions().show();
  assert.match(f.dialog().querySelector('[data-result-status]').textContent, /未保存/);
  f.actions().replay(); assert.deepEqual(f.navigation, [true]); assert.equal(f.writes.has(launchKey), true);
  assert.deepEqual(f.recorded, [null]); adapter.dispose();
});
