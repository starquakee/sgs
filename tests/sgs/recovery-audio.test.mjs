import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import ts from 'typescript';
import { installCardAudio } from '../../apps/core/sgs/card-audio.mjs';

const read = path => readFileSync(new URL(`../../apps/core/${path}`, import.meta.url), 'utf8');
const gameSource = read('noname/game/index.js');
const playerSource = read('noname/library/element/player.js');
const contentSource = read('noname/library/element/content.ts');
const eventSource = read('noname/library/element/gameEvent.ts');
const recoveryManifest = JSON.parse(read('sgs/recovery-audio.json'));
const cardManifest = JSON.parse(read('sgs/card-audio.json'));
for (const [name, value] of Object.entries({
  addArray(items) { for (const item of items) if (!this.includes(item)) this.push(item); return this; },
  remove(item) { const index = this.indexOf(item); if (index !== -1) this.splice(index, 1); return this; },
})) {
  const previous = Object.getOwnPropertyDescriptor(Array.prototype, name);
  Object.defineProperty(Array.prototype, name, { configurable: true, value });
  after(() => previous ? Object.defineProperty(Array.prototype, name, previous) : delete Array.prototype[name]);
}
function nativeMethod(source, name, scope) {
  const escaped = name.replaceAll('$', '\\$');
  const method = source.match(new RegExp(`\\t(?:async )?${escaped}\\([^]*?\\n\\t\\}`))?.[0];
  assert.ok(method, `Native ${name} must exist`);
  const code = ts.transpileModule(`const native = ({${method}}).${name};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), `${code}\nreturn native;`)(...Object.values(scope));
}
function nativeClass(path, name, scope) {
  const source = read(path).replace(/^import[^\n]+\n/gm, '').replace('export default ', '');
  const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(scope), `${code}\nreturn ${name};`)(...Object.values(scope));
}

// Execute native recover/changeHp factories, contents, Player.update, hooks and
// ArrayCompiler. Only event scheduling, players/DOM and the silent device are fixtures.
function harness(options = {}) {
  const _status = { event: null, dying: [], video: false };
  const trace = [], starts = [], stopped = [], fetched = [], events = [];
  const lib = { config: { background_audio: options.enabled !== false, volumn_audio: 6, animation: false },
    skill: {}, card: { tao: {} }, hooks: { checkUpdate: [] }, element: { content: {} } };
  const game = {
    log() {}, broadcast() {}, broadcastAll(fn, ...args) { fn(...args); },
    getGlobalHistory: () => ({ changeHp: [] }), addGlobalSkill() {}, removeGlobalSkill() {},
    playAudio() { throw new Error('Unpackaged native sounds must remain muted'); },
  };
  const get = { event: () => _status.event, cnNumber: String,
    itemtype: value => value?.isPlayer ? 'player' : undefined, type: () => 'basic', natureList: () => [], dynamicVariable: value => value };
  const scope = { lib, game, get, _status };
  const handlerStart = gameSource.indexOf('globalEventHandlers = new (class {');
  const handlerEnd = gameSource.indexOf('\n\t})();', handlerStart) + '\n\t})();'.length;
  game.globalEventHandlers = new Function(`return ${gameSource.slice(handlerStart, handlerEnd).replace('globalEventHandlers = ', '')}`)();
  game.callHook = nativeMethod(gameSource, 'callHook', scope);
  game.playCardAudio = nativeMethod(gameSource, 'playCardAudio', scope);
  const Base = nativeClass('noname/library/element/GameEvent/compilers/ContentCompilerBase.ts', 'ContentCompilerBase', scope);
  const Compiler = nativeClass('noname/library/element/GameEvent/compilers/ArrayCompiler.ts', 'ArrayCompiler', { ...scope, ContentCompilerBase: Base });
  const compiler = new Compiler();
  for (const name of ['recover', 'changeHp']) lib.element.content[name] = compiler.compile([nativeMethod(contentSource, name, scope)]);
  const eventMethods = Object.fromEntries(['getDefaultHandlerType', 'getHandler', 'hasHandler', 'pushHandler', 'callHandler']
    .map(name => [name, nativeMethod(eventSource, name, scope)]));
  const player = {
    isPlayer: true, hp: options.hp ?? 2, maxHp: options.maxHp ?? 4, hujia: 0,
    isHealthy() { return this.hp >= this.maxHp; }, isDead: () => false, isOut: () => false,
    getHp() { return Math.max(0, this.hp); }, $recover() {}, $damagepop() {},
    $update() { trace.push(['updated', this.hp]); },
  };
  for (const name of ['recover', 'changeHp', 'update']) player[name] = nativeMethod(playerSource, name, scope);
  game.me = player;
  game.createEvent = name => {
    let step = 0, nextStep = null, promise;
    const event = { name, parent: _status.event, finished: false, ...eventMethods,
      get step() { return step; }, set step(value) { nextStep = value; },
      updateStep() { if (nextStep !== null) { step = nextStep; nextStep = null; } },
      clearStepCache() {}, waitNext: async () => {}, finish() { this.finished = true; },
      getParent(name) { let parent = this.parent; if (!name) return parent;
        while (parent && parent.name !== name) parent = parent.parent; return parent || {}; },
      setContent(name) { this.content = lib.element.content[name]; return this; },
      async trigger(point) { trace.push(['trigger', point, this.player?.hp]); await options.afterChange?.(this, point, h); },
      then(resolve, reject) { promise ||= run(event); return promise.then(resolve, reject); },
    };
    game.globalEventHandlers.addHandlerToEvent(event);
    events.push(event);
    return event;
  };
  async function run(event) {
    const previous = _status.event;
    _status.event = event;
    try {
      await options.beforeContent?.(event, h);
      if (!event.finished && !event.filterStop?.()) await event.content.call(event, event);
    } finally { _status.event = previous; }
  }
  const ctx = { state: options.suspended ? 'suspended' : 'running', currentTime: 8, destination: {},
    async resume() { this.state = 'running'; }, async close() { this.state = 'closed'; },
    async decodeAudioData() { return { duration: 0.6 }; },
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; },
    createBufferSource() { return { connect(gain) { this.gain = gain; }, disconnect() {},
      start(at) { starts.push({ at, source: this }); }, stop() { stopped.push(this); } }; },
  };
  const controller = installCardAudio(scope, cardManifest, { recoveryManifest, surface: null, host: {},
    createContext: () => ctx, enabled: options.enabled, loadTimeout: options.loadTimeout,
    fetch(url, init) { fetched.push(String(url)); trace.push(['fetch', player.hp, _status.event?.name]);
      return options.fetch ? options.fetch(url, init) : { ok: true, arrayBuffer: async () => new ArrayBuffer(12) }; },
    ...options.audioOptions });
  const h = { ...scope, player, ctx, controller, trace, starts, stopped, fetched, events, run,
    async recover(num = 1, properties = {}) {
      _status.event = { name: 'useCard', card: { name: 'tao' }, player };
      const event = Object.assign(player.recover(num), properties);
      await event;
      return { event };
    } };
  return h;
}

test('actual native Peach and skill recovery emit one effect after HP is changed, with native cap and effect volume', async () => {
  const h = harness();
  h.controller.setVolume('effect', 0.4);
  await h.recover();
  await h.controller.whenIdle();
  assert.equal(h.player.hp, 3);
  assert.equal(h.starts.length, 1);
  assert.deepEqual(h.trace.find(row => row[0] === 'fetch'), ['fetch', 3, 'changeHp']);
  assert.equal(h.starts[0].at, h.ctx.currentTime);
  assert.equal(h.starts[0].source.gain.gain.value, 0.75 * 0.4);
  const { event: capped } = await h.recover(3, { card: undefined, skill: 'native-recovery-skill' });
  await h.controller.whenIdle();
  assert.equal(capped.num, 1);
  assert.equal(h.player.hp, 4);
  assert.equal(h.starts.length, 2);
  assert.equal(h.controller.status().lastEffect, 'effect/recover');
  h.controller.dispose();
});

test('actual native healing from negative HP counts even while the display remains at zero', async () => {
  const h = harness({ hp: -2 });
  await h.recover();
  await h.controller.whenIdle();
  assert.equal(h.player.hp, -1);
  assert.equal(h.events.find(event => event.name === 'changeHp').changedHp, 0);
  assert.equal(h.starts.length, 1);
  h.controller.dispose();
});

test('full health, zero and negative recovery produce no effect', async () => {
  for (const [hp, num] of [[4, 1], [2, 0], [2, -1]]) {
    const h = harness({ hp });
    await h.recover(num);
    await h.controller.whenIdle();
    assert.equal(h.player.hp, hp);
    assert.equal(h.starts.length, 0);
    assert.equal(h.fetched.length, 0);
    h.controller.dispose();
  }
});

test('native pre-change recover audio request cannot sound when changeHp is cancelled or reduced to zero', async () => {
  for (const cancel of [true, false]) {
    const h = harness({ beforeContent(event) {
      if (event.name !== 'changeHp') return;
      if (cancel) { event._cancelled = true; event.finish(); }
      else event.num = 0;
    } });
    await h.recover();
    await h.controller.whenIdle();
    assert.equal(h.player.hp, 2);
    assert.equal(h.starts.length, 0);
    assert.equal(h.fetched.length, 0);
    h.controller.dispose();
  }
});

test('recovery recording is the byte-identical pinned upstream asset with complete attribution', () => {
  assert.equal(recoveryManifest.upstreamCommit, '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a');
  assert.equal(recoveryManifest.attribution.license, 'GPL-3.0');
  assert.equal(recoveryManifest.uniqueFiles, 1);
  assert.deepEqual(Object.keys(recoveryManifest.clips), ['effect/recover']);
  const clip = recoveryManifest.clips['effect/recover'];
  assert.equal(clip.sourceUrl, `https://raw.githubusercontent.com/libnoname/noname/${recoveryManifest.upstreamCommit}/apps/core/audio/effect/recover.mp3`);
  assert.equal(clip.sourceGitBlob, '1472462d35dc98d4206e5fb33e13970283e2a92d');
  const bytes = readFileSync(new URL(`../../apps/core/sgs/${clip.file}`, import.meta.url));
  assert.equal(bytes.length, 8834);
  assert.equal(clip.bytes, bytes.length);
  assert.equal(recoveryManifest.totalBytes, bytes.length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), clip.sourceGitBlob);
});

test('Before/Begin HP changes are not counted as the later native recovery', async () => {
  for (const beforeHp of [3, 4]) {
    const h = harness({ beforeContent(event, h) {
      if (event.name === 'changeHp') { h.player.hp = beforeHp; h.player.update(); }
    } });
    await h.recover();
    await h.controller.whenIdle();
    const change = h.events.find(event => event.name === 'changeHp');
    assert.equal(change.originalHp, 2, 'native creation snapshot precedes Before/Begin changes');
    assert.equal(h.player.hp, 4);
    assert.equal(h.starts.length, beforeHp === 3 ? 1 : 0);
    h.controller.dispose();
  }
});

test('recovery still sounds before later passive health loss; extra passive healing and repeated updates do not duplicate', async () => {
  for (const passive of [-1, 1]) {
    const h = harness({ afterChange: async (event, point, h) => {
      if (point !== 'changeHp' || event.getParent().name !== 'recover') return;
      h.player.update(); h.player.update();
      h.game.playAudio('effect', 'recover');
      await h.player.changeHp(passive);
    } });
    await h.recover();
    await h.controller.whenIdle();
    assert.equal(h.player.hp, 3 + passive);
    assert.equal(h.starts.length, 1);
    assert.deepEqual(h.trace.find(row => row[0] === 'fetch'), ['fetch', 3, 'changeHp']);
    h.controller.dispose();
  }
});

test('selection, arbitrary sound requests and unrelated positive HP changes cannot claim a recovery', async () => {
  const h = harness({ hp: 1 });
  for (const name of ['chooseToUse', 'chooseToRespond', 'useCard', 'useSkill']) {
    h._status.event = { name, card: { name: 'tao' } };
    h.game.playAudio('effect', 'recover');
    h.player.update();
  }
  h._status.event = { name: 'useSkill', parent: { name: 'recover', player: h.player, num: 1 } };
  await h.player.changeHp(1);
  await h.controller.whenIdle();
  assert.equal(h.player.hp, 2);
  assert.equal(h.starts.length, 0);
  assert.equal(h.fetched.length, 0);
  h.controller.dispose();
});

test('cancelled recovery, nonpositive child changes, replay and explicitly silent or unreal events emit no effect', async () => {
  for (const change of [
    { name: 'recover', _cancelled: true, finished: true },
    { name: 'changeHp', num: -1 },
    { name: 'recover', audio: false }, { name: 'changeHp', audio: false },
    { name: 'recover', unreal: true }, { name: 'changeHp', unreal: true },
    { name: 'changeHp', video: true },
  ]) {
    const h = harness({ beforeContent(event, h) {
      if (event.name !== change.name) return;
      if (change.video) h._status.video = true;
      else Object.assign(event, change);
    } });
    await h.recover();
    await h.controller.whenIdle();
    assert.equal(h.starts.length, 0);
    assert.equal(h.fetched.length, 0);
    h.controller.dispose();
  }
});

test('a pending Peach voice does not block its actual recovery effect or consume the recovery event', async () => {
  let release;
  const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(12) };
  const h = harness({ fetch: url => String(url).includes('/card/')
    ? new Promise(resolve => { release = () => resolve(response); }) : response });
  h._status.event = { name: 'useCard', card: { name: 'tao' }, player: h.player };
  h.game.playAudio('card', 'male', 'tao');
  await h.recover();
  for (let i = 0; i < 8; i++) await Promise.resolve();
  assert.equal(h.starts.length, 1);
  assert.equal(h.controller.status().lastEffect, 'effect/recover');
  assert.equal(h.controller.status().channels.card, null);
  release();
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 2);
  assert.ok(h.starts.every(({ at }) => at === h.ctx.currentTime));
  assert.equal(h.controller.status().effectPlayed, 1);
  assert.equal(h.controller.status().channels.card.clip, 'card/male/tao');
  h.controller.dispose();
});

test('muted and gesture-blocked recovery does not load or replay when sound becomes available', async () => {
  for (const options of [{ enabled: false }, { suspended: true }]) {
    const h = harness(options);
    await h.recover();
    assert.equal(h.player.hp, 3);
    assert.equal(h.fetched.length, 0);
    h.controller.setEnabled(true);
    await h.controller.unlock();
    await h.controller.whenIdle();
    assert.equal(h.starts.length, 0);
    assert.equal(h.fetched.length, 0);
    await h.recover();
    await h.controller.whenIdle();
    assert.equal(h.starts.length, 1, 'only fresh recovery may sound');
    h.controller.dispose();
  }
});

test('muting or disposal aborts pending recovery loads without delaying HP or replaying late audio', async () => {
  for (const dispose of [false, true]) {
    let release, signal;
    const h = harness({ fetch: (_url, init) => {
      signal = init.signal;
      return new Promise(resolve => { release = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(12) }); });
    } });
    await h.recover();
    assert.equal(h.player.hp, 3);
    assert.equal(h.controller.status().pending, 1);
    if (dispose) h.controller.dispose(); else h.controller.setEnabled(false);
    assert.equal(signal.aborted, true);
    release();
    await h.controller.whenIdle();
    assert.equal(h.starts.length, 0);
    assert.equal(h.controller.status().pending, 0);
    if (!dispose) {
      h.controller.setEnabled(true);
      await h.controller.whenIdle();
      assert.equal(h.starts.length, 0);
      h.controller.dispose();
    }
  }
});

test('disposal preserves external hooks and blocks handlers already copied onto pending native events', async () => {
  const h = harness();
  let outsideBegins = 0, outsideUpdates = 0;
  const outsideHandler = (_event, { state }) => { if (state === 'begin') outsideBegins++; };
  const outsideUpdate = () => { outsideUpdates++; };
  h.game.globalEventHandlers.pushHandler('changeHp', 'onChangeHp', outsideHandler);
  h.lib.hooks.checkUpdate.push(outsideUpdate);
  const lateHooks = [...h.lib.hooks.checkUpdate];
  h._status.event = { name: 'recover', player: h.player, num: 1 };
  const pending = h.player.changeHp(1);
  assert.equal(pending.getHandler('onChangeHp').length, 2);
  h.controller.dispose(); h.controller.dispose();
  assert.deepEqual(h.lib.hooks.checkUpdate, [outsideUpdate]);
  assert.deepEqual(h.game.globalEventHandlers.getHandler('changeHp', 'onChangeHp'), [outsideHandler]);
  await pending;
  h._status.event = pending;
  for (const hook of lateHooks) hook(h.player);
  await h.controller.whenIdle();
  assert.equal(h.player.hp, 3);
  assert.equal(outsideBegins, 1);
  assert.equal(outsideUpdates, 2);
  assert.equal(h.starts.length, 0);
  assert.equal(h.fetched.length, 0);
});

test('delayed hooks from the loading phase cannot turn later HP changes into old recovery evidence', async () => {
  const h = harness();
  const deferred = [];
  h.lib.onload = { add: fn => deferred.push(fn) };
  await h.recover();
  assert.equal(h.player.hp, 3);
  h._status.event = h.events.find(event => event.name === 'changeHp');
  h.player.hp = 4;
  delete h.lib.onload;
  for (const hook of deferred) hook();
  await h.controller.whenIdle();
  assert.equal(h.starts.length, 0);
  assert.equal(h.fetched.length, 0);
  h.controller.dispose();
});

test('failed or timed-out recovery audio leaves native HP resolution functional and permits a later fresh recovery', async () => {
  for (const kind of ['missing', 'timeout', 'device']) {
    let fail = true;
    const h = harness({ loadTimeout: 10,
      fetch: () => fail ? kind === 'timeout' ? new Promise(() => {}) : { ok: false, status: 404 }
        : { ok: true, arrayBuffer: async () => new ArrayBuffer(12) },
      audioOptions: kind === 'device' ? { createContext: () => { if (fail) throw new Error('device unavailable'); return h.ctx; } } : {},
    });
    await h.recover();
    await h.controller.whenIdle();
    assert.equal(h.player.hp, 3);
    assert.equal(h.starts.length, 0);
    assert.equal(h.controller.status().pending, 0);
    fail = false;
    await h.recover();
    await h.controller.whenIdle();
    assert.equal(h.player.hp, 4);
    assert.equal(h.starts.length, 1);
    h.controller.dispose();
  }
});
