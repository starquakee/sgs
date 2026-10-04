import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { parseSource, fields, binding } from '../../scripts/sgs/catalog-source.mjs';
import { Node, dom } from './helpers/client-dom.mjs';
import { createPreferences } from '../../apps/core/sgs/preferences.mjs';
import { installBattleFeedback } from '../../apps/core/sgs/battle-feedback.mjs';

const source = path => readFileSync(new URL(`../../apps/core/noname/${path}`, import.meta.url), 'utf8');
const contentSource = parseSource('content.ts', source('library/element/content.ts'));
const nativeContents = fields(binding(contentSource, 'Content'));
const playerSource = source('library/element/player.js');
function nativeStep(name, index, h) {
  const step = nativeContents.get(name).elements[index].getText(contentSource);
  const code = ts.transpileModule(`const step = ${step};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('game', 'lib', 'get', 'ui', '_status', `${code} return step;`)(h.game, h.lib, h.get, h.ui, h._status);
}
function harness() {
  const document = dom(), arena = new Node(), a = new Node(), b = new Node();
  arena.append(a, b);
  for (const player of [a, b]) Object.assign(player, {
    name: 'hidden-name', className: 'player', hp: 6, hujia: 0, stat: [{}], style: {},
    node: { count: { hide() {} }, hp: { hide() {} }, equips: { hide() {} } },
    previous: {}, next: {}, getHistory: () => [], hasSkillTag: () => false,
    changeHp(amount) { this.hp += amount; return { set() {} }; },
    queue() { this.queued = (this.queued || 0) + 1; }, $damagepop() {}, removeLink() {},
  });
  const ui = { arena, selected: { targets: [] } };
  const _status = { event: { name: 'chooseToUse', filterTarget: true, isMine: () => true }, dying: { remove() {} } };
  const calls = [], tasks = new Map(); let id = 0;
  const timers = { setTimeout(fn, delay) { assert.equal(delay, 240); tasks.set(++id, fn); return id; }, clearTimeout(id) { tasks.delete(id); } };
  const lib = { hooks: { checkEnd: [], uncheckEnd: [] }, config: {}, natureAudio: { damage: {}, hujia_damage: {} }, natureSeparator: '|' };
  const game = { players: [a, b], dead: [], broadcast() {}, broadcastAll(fn, ...args) { fn(...args); }, log() {}, logv() {},
    addVideo(...args) { calls.push(args); return 'native-result'; } };
  game.players.remove = player => { const index = game.players.indexOf(player); if (index >= 0) game.players.splice(index, 1); };
  const get = { event: () => _status.event, cnNumber: String, translation: String, itemtype: value => value instanceof Node ? 'player' : 'other', is: { mobileMe: () => false, newLayout: () => true } };
  const prefs = createPreferences(() => ({ getItem: () => null, setItem() {} }));
  const native = game.addVideo;
  const feedback = installBattleFeedback({ lib, game, ui, get, _status, document, preferences: prefs, timers });
  const damageMethod = playerSource.match(/\t\$damage\(source\) \{[\s\S]*?\n\t\}/)[0];
  a.$damage = b.$damage = new Function('game', 'lib', 'get', `return ({${damageMethod}}).$damage;`)(game, lib, get);
  const flash = player => player.querySelector('.sgs-battle-flash').dataset.kind;
  const event = (properties = {}) => ({ name: 'damage', num: 1, nature: '', player: a, trigger: async () => {}, goto() {}, ...properties });
  return { document, a, b, ui, _status, lib, game, get, prefs, feedback, calls, tasks, native, flash, event,
    expire() { for (const fn of [...tasks.values()]) fn(); } };
}

test('actual native damage visual produces one short victim pulse after final damage; no rule/animation return is replaced', async () => {
  const h = harness(), damage = nativeStep('damage', 4, h);
  for (const [num, nature, hujia] of [[1, '', 0], [2, 'fire', 0], [2, 'thunder', 1]]) {
    h.a.hujia = hujia;
    const event = h.event({ num, nature }); h._status.event = event;
    const before = h.a.hp;
    await damage(event, null, h.a);
    assert.equal(h.a.hp, before - num, 'native HP path runs unchanged in harness');
    assert.equal(h.flash(h.a), 'hit'); assert.equal(h.flash(h.b), undefined);
    assert.equal(h.a.style.transform, 'scale(0.95)', 'original native visual still runs');
    h.expire(); assert.equal(h.flash(h.a), undefined);
    assert.equal(h.game.addVideo('damage', h.a), 'native-result');
    assert.equal(h.flash(h.a), undefined, 'same victim damage event cannot flash twice');
  }
  assert.equal(h.a.queued, 3); h.feedback.dispose();
});

test('native zero/unreal damage and selection/dodge/health-loss/foreign-victim records never create hit feedback', async () => {
  const h = harness(), damage = nativeStep('damage', 4, h);
  for (const properties of [{ num: 0 }, { unreal: true }, { _cancelled: true }, { animate: false }]) {
    const event = h.event(properties); h._status.event = event;
    await damage(event, null, h.a);
    assert.equal(h.flash(h.a), undefined);
  }
  for (const name of ['chooseToUse', 'useCard', 'respond', 'shaMiss', 'loseHp']) {
    h._status.event = h.event({ name }); h.game.addVideo('damage', h.a);
    assert.equal(h.flash(h.a), undefined);
  }
  h._status.event = h.event(); h.game.addVideo('damage', h.b); assert.equal(h.flash(h.b), undefined);
  h._status.video = true; h.game.addVideo('damage', h.a); assert.equal(h.flash(h.a), undefined);
  h.feedback.dispose();
});

test('actual native death emits feedback only after dead mutation, before mode victory checks, without exposing a name', async () => {
  const h = harness(), die = nativeStep('die', 0, h);
  const event = { name: 'die', player: h.a, noDieAudio: true, animate: false };
  h._status.event = event;
  h.game.addVideo('diex', h.a); assert.equal(h.flash(h.a), undefined);
  await die(event, null, h.a);
  assert.equal(h.flash(h.a), 'death'); assert.equal(h.a.classList.contains('dead'), true);
  assert.equal(h.game.dead[0], h.a); assert.equal(h.a.hp, 0);
  assert.equal(h.a.children.some(node => node.textContent?.includes(h.a.name)), false);
  h.expire(); h.game.addVideo('diex', h.a); assert.equal(h.flash(h.a), undefined);
  h.feedback.dispose();
});

test('turn and native target states remain distinct, selections never change, and repeated checks do not replay pulses', () => {
  const h = harness(); h._status.currentPhase = h.a;
  h.game.addVideo('phaseChange', h.a); assert.equal(h.a.dataset.sgsActing, 'true'); assert.equal(h.flash(h.a), 'acting');
  h.b.classList.add('selectable'); h.lib.hooks.checkEnd[0](h._status.event);
  assert.equal(h.b.dataset.sgsAim, 'legal'); assert.equal(h.flash(h.b), 'legal');
  h.expire(); h.lib.hooks.checkEnd[0](h._status.event); assert.equal(h.flash(h.b), undefined);
  h.b.classList.add('selected'); h.ui.selected.targets.push(h.b); h.lib.hooks.checkEnd[0](h._status.event);
  assert.equal(h.b.dataset.sgsAim, 'selected'); assert.equal(h.flash(h.b), 'selected');
  assert.deepEqual(h.ui.selected.targets, [h.b]);
  h.b.classList.remove('selected'); h.lib.hooks.checkEnd[0](h._status.event);
  assert.equal(h.b.dataset.sgsAim, 'legal', 'manual cancel stays canceled');
  h.b.classList.remove('selectable'); h.lib.hooks.uncheckEnd[0](); assert.equal(h.b.dataset.sgsAim, undefined);
  h._status.currentPhase = h.b; h.game.addVideo('phaseChange', h.b);
  assert.equal(h.a.dataset.sgsActing, undefined); assert.equal(h.b.dataset.sgsActing, 'true');
  h._status.auto = true; h.b.classList.add('selectable'); h.feedback.refresh(); assert.equal(h.b.dataset.sgsAim, undefined);
  h._status.over = true; h.feedback.refresh(); assert.equal(h.b.dataset.sgsActing, undefined);
  h.feedback.dispose();
});

test('reduced motion cancels pending flashes but retains static guidance; disposal restores hooks and native recorder', () => {
  const h = harness(); h._status.event = h.event(); h.game.addVideo('damage', h.a);
  assert.equal(h.tasks.size, 1);
  h.prefs.set({ reducedMotion: true }); assert.equal(h.flash(h.a), undefined); assert.equal(h.tasks.size, 0);
  h._status.currentPhase = h.b; h.game.addVideo('phaseChange', h.b);
  assert.equal(h.b.dataset.sgsActing, 'true'); assert.equal(h.flash(h.b), undefined);
  h.prefs.set({ reducedMotion: false }); h._status.event = h.event(); h.game.addVideo('damage', h.a);
  assert.equal(h.flash(h.a), 'hit');
  h.feedback.dispose(); h.feedback.dispose();
  assert.equal(h.game.addVideo, h.native); assert.equal(h.lib.hooks.checkEnd.length, 0); assert.equal(h.lib.hooks.uncheckEnd.length, 0);
  assert.equal(h.tasks.size, 0); assert.equal(h.a.children.length, 0); assert.equal(h.b.dataset.sgsActing, undefined);
});
