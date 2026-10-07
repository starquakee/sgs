import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import { installTablePageLifecycle } from '../../apps/core/sgs/page-lifecycle.mjs';
import { installOwnedPause } from '../../apps/core/sgs/pause.mjs';
import { normalizeLaunch } from '../../apps/core/sgs/launch-config.mjs';
import { createPreferences } from '../../apps/core/sgs/preferences.mjs';
import { dom, Node } from './helpers/client-dom.mjs';

function table() {
  const host = new Node('window'), document = dom(); document.head = new Node('head');
  const status = { paused2: false }, calls = [], navigations = [];
  const game = { pause2() { status.paused2 = true; calls.push('pause'); }, resume2() { status.paused2 = false; calls.push('resume'); } };
  const originals = { ...game }, sessionPause = installOwnedPause({ game, _status: status });
  sessionPause.acquire('settings');
  let cleanups = 0;
  const lifecycle = installTablePageLifecycle({ game, _status: status, host, document,
    cleanup() { cleanups++; sessionPause.dispose(); }, navigate: restart => navigations.push(restart) });
  return { host, document, status, calls, game, originals, lifecycle, navigations, cleanups: () => cleanups };
}

test('cached table stops once before session disposal and holds a non-dismissible recovery pause across returns', async () => {
  const app = table();
  app.host.emit('pageshow', { persisted: false });
  assert.equal(app.cleanups(), 0);
  assert.equal(app.document.body.children.length, 0);
  app.host.emit('pagehide', { persisted: true });
  await Promise.resolve();
  assert.equal(app.lifecycle.stopped, true);
  assert.equal(app.cleanups(), 1);
  assert.equal(app.status.paused2, true);
  assert.equal(app.calls.includes('resume'), false, 'session teardown must never release the frozen table');
  app.host.emit('pageshow', { persisted: true });
  const dialog = app.document.body.children[0];
  assert.equal(dialog.attrs['aria-labelledby'], 'sgs-dialog-history-return');
  assert.equal(dialog.open, true);
  assert.equal(dialog.querySelectorAll('button').length, 2);
  assert.equal(dialog.querySelector('[data-restart]').focused, true);
  dialog.emit('keydown', { key: 'Escape' }); dialog.emit('cancel');
  app.game.resume2(); await Promise.resolve();
  assert.equal(dialog.open, true);
  assert.equal(app.status.paused2, true, 'a delayed native resume cannot bypass recovery');
  assert.equal(app.calls.includes('resume'), false);
  dialog.querySelector('[data-restart]').emit('click'); dialog.querySelector('[data-lobby]').emit('click');
  assert.deepEqual(app.navigations, [true]);
  app.host.emit('pagehide', { persisted: true });
  app.host.emit('pageshow', { persisted: true });
  assert.equal(app.cleanups(), 1);
  assert.equal(app.document.body.children.length, 1);
  assert.equal(app.document.head.children.length, 1);
  dialog.querySelector('[data-lobby]').emit('click');
  assert.deepEqual(app.navigations, [true, false]);
  app.host.emit('pagehide', { persisted: false });
  await Promise.resolve();
  assert.equal(app.cleanups(), 1);
  assert.equal(app.document.body.children.length, 0);
  assert.equal(app.document.head.children.length, 0);
  assert.equal(app.host.listeners.get('pagehide').size, 0);
  assert.equal(app.host.listeners.get('pageshow').size, 0);
  assert.equal(app.game.pause2, app.originals.pause2);
  assert.equal(app.game.resume2, app.originals.resume2);
  assert.equal(app.status.paused2, true);
  assert.equal(app.calls.includes('resume'), false);
});

test('a table leaving without caching cleans up without offering a recovery action', () => {
  const app = table();
  app.host.emit('pagehide', { persisted: false });
  app.host.emit('pageshow', { persisted: true });
  assert.equal(app.cleanups(), 1);
  assert.equal(app.lifecycle.stopped, true);
  assert.equal(app.document.body.children.length, 0);
  assert.equal(app.game.pause2, app.originals.pause2);
  assert.equal(app.game.resume2, app.originals.resume2);
});

test('recovery actions use fresh reload of the current launch carrier and recover from navigation failure', () => {
  const host = new Node('window'), document = dom(); document.head = new Node('head');
  const status = { paused2: false }, game = { pause2() { status.paused2 = true; }, resume2() { status.paused2 = false; } };
  let reloads = 0;
  host.onbeforeunload = () => {};
  const carrier = './index.html?sgs=1#sgs-launch=retained-config';
  host.location = { href: carrier, reload() { reloads++; if (reloads === 1) throw new Error('blocked navigation'); } };
  installTablePageLifecycle({ game, _status: status, host, document, cleanup() {} });
  host.emit('pagehide', { persisted: true }); host.emit('pageshow', { persisted: true });
  const dialog = document.body.children[0], restart = dialog.querySelector('[data-restart]');
  restart.emit('click');
  assert.equal(restart.disabled, false);
  assert.match(dialog.querySelector('[data-history-message]').textContent, /请重试/);
  restart.emit('click'); restart.emit('click');
  assert.equal(reloads, 2);
  assert.equal(host.location.href, carrier, 'restart reloads the existing normalized carrier');
  assert.equal(host.onbeforeunload, null);
  host.emit('pagehide', { persisted: true }); host.emit('pageshow', { persisted: true });
  dialog.querySelector('[data-lobby]').emit('click');
  assert.equal(host.location.href, './sgs.html');
  assert.equal(status.paused2, true);
});

test('history recovery retains the pinned native asynchronous pause promise after session teardown and late resume', async () => {
  const read = path => readFileSync(new URL(`../../apps/core/noname/${path}`, import.meta.url), 'utf8');
  const status = {}, lib = { status: {}, getUTC: date => +date }, module = { exports: {} };
  const code = ts.transpileModule(read('game/PauseManager.ts'), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  new Function('require', 'module', 'exports', code)(() => ({ lib, _status: status }), module, module.exports);
  status.pauseManager = new module.exports.default();
  Object.defineProperty(status, 'paused2', { get: () => status.pauseManager.pause2.isStarted,
    set: value => value ? status.pauseManager.pause2.start() : status.pauseManager.pause2.resolve() });
  const gameCode = read('game/index.js'), game = {};
  for (const [name, next] of [['pause2', 'resume'], ['resume2', 'delaye']]) {
    const start = gameCode.indexOf(`\t${name}(`), end = gameCode.indexOf(`\t${next}(`, start);
    game[name] = new Function('_status', `return ({${gameCode.slice(start, end)}}).${name}`)(status);
  }
  const nativeResume = game.resume2, sessionPause = installOwnedPause({ game, _status: status });
  sessionPause.acquire('settings');
  let advanced = false;
  const wait = status.pauseManager.waitPause().then(() => { advanced = true; });
  const host = new Node('window'), document = dom(); document.head = new Node('head');
  installTablePageLifecycle({ game, _status: status, host, document, cleanup: () => sessionPause.dispose() });
  host.emit('pagehide', { persisted: true });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(advanced, false);
  host.emit('pageshow', { persisted: true });
  game.resume2();
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(advanced, false);
  assert.equal(status.paused2, true);
  host.emit('pagehide', { persisted: false });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(advanced, false);
  nativeResume(); await wait;
});

test('a cached return during actual runtime preparation never installs later table adapters', async () => {
  const source = readFileSync(new URL('../../apps/core/sgs/runtime.js', import.meta.url), 'utf8')
    .replace(/^import .*;\r?\n/gm, '').replace('export async function', 'async function');
  const host = new Node('window'), document = dom(); document.head = new Node('head');
  const status = {}, game = { pause2() { status.paused2 = true; }, resume2() { status.paused2 = false; } };
  const lib = { onload: [], arenaReady: [] };
  let finishRoster, audioLoads = 0;
  const roster = new Promise(resolve => { finishRoster = resolve; });
  const context = vm.createContext({ window: host, normalizeLaunch, createPreferences,
    persistentStorage: () => ({ getItem: () => null, setItem() {} }),
    readLaunch: () => ({ mode: 'versus', generalId: 'caocao', pack: 'standard' }),
    consumeRecordReplay() {}, retainLaunch() {},
    installTablePageLifecycle: options => installTablePageLifecycle({ ...options, host, document }),
    loadRosterAssets: () => roster, loadAudioAssets: () => { audioLoads++; throw new Error('stopped preparation continued'); },
  });
  vm.runInContext(`${source}\nthis.prepare = prepareSinglePlayer;`, context);
  const pending = context.prepare({ lib, game, ui: {}, get: {}, _status: status });
  host.emit('pagehide', { persisted: true });
  host.emit('pageshow', { persisted: true });
  finishRoster({ catalog: { characters: [] }, portraits: {} });
  await pending;
  assert.equal(audioLoads, 0);
  assert.equal(lib.onload.length, 0);
  assert.equal(lib.arenaReady.length, 0);
  assert.equal(status.paused2, true);
  assert.equal(document.body.children[0].open, true);
  host.emit('pagehide', { persisted: false });
});
