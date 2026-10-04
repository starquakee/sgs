import test from 'node:test';
import { Node, dom } from './helpers/client-dom.mjs';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { installOwnedPause } from '../../apps/core/sgs/pause.mjs';
import { createPreferences, preferencesKey } from '../../apps/core/sgs/preferences.mjs';
import { createClientDialogs } from '../../apps/core/sgs/settings.mjs';
import { installTableSession } from '../../apps/core/sgs/table-session.mjs';

const source = path => readFileSync(new URL(`../../apps/core/noname/${path}`, import.meta.url), 'utf8');
const gameSource = source('game/index.js');
const clickSource = source('ui/click/index.js');
const pauseCode = ts.transpileModule(source('game/PauseManager.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
const settle = () => new Promise(resolve => setImmediate(resolve));
function storage(seed = {}) {
  const values = new Map(Object.entries(seed));
  return { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
}
function nativeMethod(text, name, next, context) {
  const start = text.indexOf(`\t${name}(`), end = text.indexOf(`\t${next}(`, start);
  assert.ok(start >= 0 && end > start);
  return new Function(...Object.keys(context), `return {${text.slice(start, end)}}.${name}`)(...Object.values(context));
}
function engine(initialPause = false) {
  const _status = { paused: true, imchoosing: true, event: { name: 'chooseToUse' } };
  const lib = { config: {}, status: {}, getUTC: date => +date };
  const module = { exports: {} };
  new Function('require', 'module', 'exports', pauseCode)(() => ({ lib, _status }), module, module.exports);
  _status.pauseManager = new module.exports.default();
  Object.defineProperty(_status, 'paused2', { get: () => _status.pauseManager.pause2.isStarted,
    set: value => value ? _status.pauseManager.pause2.start() : _status.pauseManager.pause2.resolve() });
  const game = {};
  game.pause2 = nativeMethod(gameSource, 'pause2', 'resume', { _status });
  game.resume2 = nativeMethod(gameSource, 'resume2', 'delaye', { _status });
  if (initialPause) game.pause2();
  const ui = { selected: { cards: [{ name: 'sha' }], targets: [{ name: 'caocao' }] } };
  return { game, _status, lib, ui };
}

test('owned nested modals keep the real native Deferred pending, preserving human choice and selections', async () => {
  const f = engine(); const native = f.game.pause2;
  const pause = installOwnedPause(f), selected = structuredClone(f.ui.selected), event = f._status.event;
  const closeSettings = pause.acquire('settings'), closeLeave = pause.acquire('leave');
  let advanced = false;
  const nativeWait = f._status.pauseManager.waitPause().then(() => { advanced = true; });
  closeSettings(); closeSettings(); await settle();
  assert.equal(advanced, false); assert.equal(f._status.paused2, true);
  closeLeave(); await nativeWait;
  assert.equal(advanced, true); assert.equal(f._status.paused2, false);
  assert.deepEqual(f.ui.selected, selected); assert.equal(f._status.event, event); assert.equal(f._status.paused, true);
  pause.dispose(); assert.equal(f.game.pause2, native);
});

test('SGS close never releases an existing or newly acquired native pause', async () => {
  for (const preexisting of [true, false]) {
    const f = engine(preexisting), pause = installOwnedPause(f), close = pause.acquire('settings');
    if (!preexisting) f.game.pause2();
    close(); await settle();
    assert.equal(f._status.paused2, true);
    f.game.resume2(); await settle(); assert.equal(f._status.paused2, false);
    pause.dispose();
  }
});

test('native resume while an SGS modal is open cannot resolve its underlying promise', async () => {
  const f = engine(true), pause = installOwnedPause(f), close = pause.acquire('settings');
  let advanced = false;
  f._status.pauseManager.waitPause().then(() => { advanced = true; });
  f.game.resume2(); await settle();
  assert.equal(advanced, false); assert.equal(f._status.paused2, true);
  close(); await settle(); assert.equal(advanced, true);
  pause.dispose();
});

test('same-turn dialog handoff retains the actual asynchronous native pause gate', async () => {
  const f = engine(), pause = installOwnedPause(f);
  const first = pause.acquire('settings');
  let advanced = false;
  f._status.pauseManager.waitPause().then(() => { advanced = true; });
  first(); const second = pause.acquire('leave');
  await settle(); assert.equal(advanced, false); assert.equal(f._status.paused2, true);
  second(); await settle(); assert.equal(advanced, true); pause.dispose();
});

test('clock excludes nested, background and native pause time without double subtraction, and stops at over', async () => {
  const f = engine(); let time = 0;
  const pause = installOwnedPause({ ...f, now: () => time });
  time = 1000; const close = pause.acquire('settings');
  time = 3000; const foreground = pause.acquire('background');
  time = 5000; close(); time = 8000; foreground(); await settle();
  time = 9000; assert.equal(pause.elapsedMs(), 2000);
  f.game.pause2(); time = 12000; f.game.resume2(); await settle();
  time = 13500; assert.equal(pause.elapsedMs(), 3500);
  f._status.over = true; assert.equal(pause.elapsedMs(), 3500);
  time = 20000; assert.equal(pause.elapsedMs(), 3500); pause.dispose();
});

test('disposing removes only owned pauses and restores native methods idempotently', async () => {
  for (const preexisting of [false, true]) {
    const f = engine(preexisting), original = f.game.resume2, pause = installOwnedPause(f);
    const close = pause.acquire('settings'); pause.dispose(); pause.dispose(); close(); await settle();
    assert.equal(f.game.resume2, original); assert.equal(f._status.paused2, preexisting);
    pause.acquire('late')(); assert.deepEqual(pause.reasons(), []);
  }
});

test('preferences migrate exact old speed/mute settings and leave launch/favorites untouched', () => {
  const local = storage({ 'sgs.settings.v1': JSON.stringify({ generalId: 'caocao', mode: 'versus', speed: 'fast' }),
    'sgs.card-audio.enabled': 'false', 'sgs.favorites.v1': '["standard:caocao"]' });
  const p = createPreferences(() => local);
  assert.deepEqual(p.get(), { speed: 'fast', sound: false, backgroundPause: true, reducedMotion: false, cardVolume: 1, heroVolume: 1, effectVolume: 1 });
  assert.equal(p.set({ speed: 'normal', reducedMotion: true, sound: true }), true);
  assert.deepEqual(JSON.parse(local.getItem('sgs.settings.v1')), { generalId: 'caocao', mode: 'versus', speed: 'normal' });
  assert.equal(local.getItem('sgs.favorites.v1'), '["standard:caocao"]');
  assert.equal(local.getItem('sgs.card-audio.enabled'), 'true');
  assert.deepEqual(createPreferences(() => local).get(), p.get());
});

test('malformed, unsupported and mistyped preferences use safe defaults without coercing strings', () => {
  for (const raw of ['{bad', 'null', '[]', '{"version":2,"backgroundPause":false}', '{"version":1,"sound":"false","speed":"vvfast","backgroundPause":0,"reducedMotion":1}']) {
    const p = createPreferences(() => storage({ [preferencesKey]: raw }), { speed: 'fast' });
    assert.deepEqual(p.get(), { speed: 'fast', sound: true, backgroundPause: true, reducedMotion: false, cardVolume: 1, heroVolume: 1, effectVolume: 1 });
    p.set({ speed: 'unsafe', sound: 0, backgroundPause: null });
    assert.equal(p.get().backgroundPause, true); assert.equal(p.get().speed, 'fast');
  }
});

test('denied storage and quota failures retain current preferences and notify without throwing', () => {
  for (const getter of [() => { throw new Error('denied'); }, () => ({ getItem() { throw new Error('read'); }, setItem() { throw new Error('quota'); } })]) {
    const p = createPreferences(getter); const updates = [];
    const unsubscribe = p.subscribe((value, saved) => updates.push({ value, saved }));
    assert.equal(p.set({ sound: false, speed: 'fast' }), false);
    assert.equal(p.get().sound, false); assert.equal(updates[0].saved, false);
    unsubscribe(); p.set({ backgroundPause: false }); assert.equal(updates.length, 1);
  }
});

function table(getStorage = () => storage()) {
  const f = engine(), document = dom(), hud = new Node('header');
  for (const name of ['sgs-return', 'sgs-restart', 'sgs-audio']) { const node = new Node('button'); node.className = name; hud.append(node); }
  const preferences = createPreferences(getStorage); let enabled = preferences.get().sound;
  const audio = { volumes: {}, status: () => ({ enabled }), setEnabled: value => { enabled = value; }, setVolume(channel, value) { this.volumes[channel] = value; } };
  f.ui.auto = new Node(); f.ui.arena = new Node(); f.ui.control = { hide() {}, show() {} };
  f._status.event.switchToAuto = () => { f._status.switched = true; };
  f.game.resume = () => { f._status.paused = false; };
  f.ui.click = { shortcut() {} };
  f.ui.click.auto = nativeMethod(clickSource, 'auto', 'wuxie', f);
  const navigation = [];
  const session = installTableSession({ ...f, document, hud, preferences, audio, navigate: restart => navigation.push(restart) });
  const buttons = hud.querySelectorAll('.sgs-session-button');
  return { ...f, document, hud, preferences, audio, session, navigation, pauseButton: buttons[0], autoButton: buttons[1], settingsButton: buttons[2],
    dialog: () => document.body.children.at(-1) };
}

test('dialog duplicate guard, Escape, nesting and showModal failure release only their own leases', async () => {
  const f = engine(), pause = installOwnedPause(f), document = dom(), host = createClientDialogs({ document, pause });
  const a = host.open('settings', '<h2>Settings</h2>');
  assert.equal(host.open('settings', ''), a); assert.equal(document.body.children.length, 1);
  const b = host.open('leave', '<h2>Leave</h2>'); b.emit('cancel'); await settle(); assert.equal(f._status.paused2, true);
  a.emit('cancel'); await settle(); assert.equal(f._status.paused2, false); assert.equal(document.body.children.length, 0);
  document.createElement = () => { const node = new Node('dialog'); node.showModal = () => { throw new Error('show'); }; return node; };
  assert.throws(() => host.open('failure', '<h2>Failure</h2>'), /show/); await settle(); assert.equal(f._status.paused2, false);
  host.dispose(); assert.equal(host.open('late', ''), null); pause.dispose();
});

test('table settings apply native speed, shared mute and motion; denied storage shows a nonblocking notice', async () => {
  const f = table(() => { throw new Error('denied'); }); f.settingsButton.emit('click');
  const dialog = f.dialog(); assert.equal(f._status.paused2, true);
  const speed = dialog.querySelector('[name="speed"]'); speed.value = 'fast'; speed.emit('change');
  assert.equal(f.lib.config.game_speed, 'vfast');
  const sound = dialog.querySelector('[name="sound"]'); sound.checked = false; sound.emit('change'); assert.equal(f.audio.status().enabled, false);
  const motion = dialog.querySelector('[name="reducedMotion"]'); motion.checked = true; motion.emit('change'); assert.equal(f.document.documentElement.classList.contains('sgs-reduced-motion'), true);
  assert.match(dialog.querySelector('.sgs-save-status').textContent, /未能保存/);
  f.preferences.set({ sound: true }); assert.equal(sound.checked, true);
  dialog.querySelector('[data-close]').emit('click'); await settle(); assert.equal(f._status.paused2, false); f.session.dispose();
});

test('background defaults on, repeated hidden events are idempotent, visible requires explicit continuation', async () => {
  const f = table(); f.document.hidden = true; f.document.emit('visibilitychange'); f.document.emit('visibilitychange');
  await settle(); assert.equal(f._status.paused2, true); assert.equal(f.document.body.children.length, 0);
  f.document.hidden = false; f.document.emit('visibilitychange'); f.document.emit('visibilitychange');
  await settle(); assert.equal(f._status.paused2, true); assert.equal(f.document.body.children.length, 1);
  f.dialog().querySelector('[data-settings]').emit('click'); assert.equal(f.document.body.children.length, 2);
  f.dialog().emit('cancel'); await settle(); assert.equal(f._status.paused2, true);
  f.dialog().querySelector('[data-continue]').emit('click'); await settle(); assert.equal(f._status.paused2, false);
  f.preferences.set({ backgroundPause: false }); f.document.hidden = true; f.document.emit('visibilitychange'); await settle(); assert.equal(f._status.paused2, false);
  f.session.dispose(); assert.equal(f.document.listeners.get('visibilitychange').size, 0);
});

test('background and native pauses survive closing settings; disabling background does not silently release a held pause', async () => {
  const f = table(); f.game.pause2(); f.settingsButton.emit('click');
  f.document.hidden = true; f.document.emit('visibilitychange');
  f.preferences.set({ backgroundPause: false }); f.dialog().emit('cancel'); await settle(); assert.equal(f._status.paused2, true);
  f.document.hidden = false; f.document.emit('visibilitychange'); f.dialog().emit('cancel'); await settle();
  assert.equal(f._status.paused2, true, 'native panel remains owner');
  f.game.resume2(); await settle(); assert.equal(f._status.paused2, false); f.session.dispose();
});

test('manual pause and leave/restart cancel retain choice; confirm navigates while still paused', async () => {
  const f = table(), selected = structuredClone(f.ui.selected);
  f.pauseButton.emit('click'); f.dialog().emit('cancel'); await settle(); assert.equal(f._status.paused2, false);
  for (const [selector, restart] of [['.sgs-return', false], ['.sgs-restart', true]]) {
    f.hud.querySelector(selector).emit('click'); assert.equal(f._status.paused2, true);
    f.dialog().querySelector('[data-stay]').emit('click'); await settle(); assert.equal(f._status.paused2, false);
    f.hud.querySelector(selector).emit('click'); f.dialog().querySelector('[data-leave]').emit('click');
    assert.equal(f._status.paused2, true); assert.equal(f.navigation.at(-1), restart);
    f.dialog().emit('cancel'); await settle();
  }
  assert.deepEqual(f.ui.selected, selected); assert.equal(f._status.paused, true);
  f.session.dispose(); await settle(); assert.equal(f.document.body.children.length, 0);
});

test('visible auto control delegates to real native auto and respects paused/hidden/over guards', async () => {
  const f = table(); f.autoButton.emit('click');
  assert.equal(f._status.auto, true); assert.equal(f._status.switched, true); assert.equal(f._status.paused, false);
  assert.equal(f.autoButton.textContent, '取消托管'); f.autoButton.emit('click'); assert.equal(f._status.auto, false);
  f.settingsButton.emit('click'); f.session.refresh(); f.autoButton.emit('click'); assert.equal(f._status.auto, false);
  f.dialog().emit('cancel'); await settle(); f.ui.auto.classList.add('hidden'); f.session.refresh(); assert.equal(f.autoButton.disabled, true);
  f.ui.auto.classList.remove('hidden'); f._status.over = true; f.session.refresh(); assert.equal(f.pauseButton.disabled, true); assert.equal(f.autoButton.disabled, true);
  f.session.dispose();
});

test('finished table exposes result/replay/return without reopening pause or unfinished-game dialogs', () => {
  const f = table(), calls = [];
  f._status.over = true;
  f.session.setResultActions({ show: () => calls.push('show'), replay: () => calls.push('replay'), leave: () => calls.push('leave') });
  assert.equal(f.pauseButton.textContent, '结算'); assert.equal(f.pauseButton.disabled, false);
  assert.equal(f.hud.querySelector('.sgs-restart').textContent, '再来一局');
  f.pauseButton.emit('click'); f.hud.querySelector('.sgs-restart').emit('click'); f.hud.querySelector('.sgs-return').emit('click');
  assert.deepEqual(calls, ['show', 'replay', 'leave']); assert.equal(f.document.body.children.length, 0);
  assert.equal(f._status.paused2, false); assert.equal(f.autoButton.disabled, true);
  f.session.dispose();
});

test('volume preferences migrate old v1 records, clamp finite numbers and survive failed storage', () => {
  const local = storage({ [preferencesKey]: JSON.stringify({ version: 1, sound: false, reducedMotion: true }) });
  const p = createPreferences(() => local);
  assert.equal(p.get().cardVolume, 1); assert.equal(p.get().sound, false);
  p.set({ cardVolume: .35, heroVolume: -2, effectVolume: 8 });
  const saved = createPreferences(() => local).get();
  assert.equal(saved.cardVolume, .35); assert.equal(saved.heroVolume, 0); assert.equal(saved.effectVolume, 1);
  p.set({ cardVolume: NaN, heroVolume: '0.5', effectVolume: Infinity }); assert.deepEqual(p.get(), saved);
  const bad = createPreferences(() => storage({ [preferencesKey]: '{"version":1,"cardVolume":"0","heroVolume":null,"effectVolume":{}}' }));
  assert.equal(bad.get().cardVolume, 1); assert.equal(bad.get().heroVolume, 1); assert.equal(bad.get().effectVolume, 1);
  const denied = createPreferences(() => { throw new Error('denied'); });
  assert.equal(denied.set({ effectVolume: .25 }), false); assert.equal(denied.get().effectVolume, .25);
});

test('settings range input updates each live audio channel, percentage and persistence while preserving selection/pause', async () => {
  const local = storage(), f = table(() => local), selection = structuredClone(f.ui.selected);
  assert.deepEqual(f.audio.volumes, { card: 1, hero: 1, effect: 1 });
  f.settingsButton.emit('click');
  for (const [channel, key, value] of [['card', 'cardVolume', .3], ['hero', 'heroVolume', .6], ['effect', 'effectVolume', 0]]) {
    const input = f.dialog().querySelector(`[name="${key}"]`);
    input.value = String(value); input.emit('input');
    assert.equal(f.audio.volumes[channel], value);
    assert.equal(f.dialog().querySelector(`[data-volume="${key}"]`).textContent, `${value * 100}%`);
    assert.equal(createPreferences(() => local).get()[key], value);
  }
  const sound = f.dialog().querySelector('[name="sound"]'); sound.checked = false; sound.emit('change');
  assert.equal(f.audio.status().enabled, false); assert.deepEqual(f.audio.volumes, { card: .3, hero: .6, effect: 0 });
  assert.equal(f._status.paused2, true); assert.deepEqual(f.ui.selected, selection);
  f.dialog().emit('cancel'); await settle(); assert.equal(f._status.paused2, false);
  f.session.dispose();
});
