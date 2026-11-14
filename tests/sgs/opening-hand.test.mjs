import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { installOpeningHand } from '../../apps/core/sgs/opening-hand.mjs';
import { installCardAudio } from '../../apps/core/sgs/card-audio.mjs';
import { engineSettings } from '../../apps/core/sgs/launch-config.mjs';

// Run the pinned engine's complete dealing and replacement functions, including
// its special-pile/starting-tag branches. Only events, players and cards are fixtures.
const source = readFileSync(new URL('../../apps/core/noname/library/element/content.ts', import.meta.url), 'utf8');
const openingManifest = JSON.parse(readFileSync(new URL('../../apps/core/sgs/opening-audio.json', import.meta.url), 'utf8'));
const previousAddArray = Object.getOwnPropertyDescriptor(Array.prototype, 'addArray');
Object.defineProperty(Array.prototype, 'addArray', { configurable: true, value(items) { this.push(...items); return this; } });
after(() => previousAddArray ? Object.defineProperty(Array.prototype, 'addArray', previousAddArray) : delete Array.prototype.addArray);
function content(name, next, scope) {
  const start = source.indexOf(`\tasync ${name}(`);
  const end = source.indexOf(`\tasync ${next}(`, start);
  assert.ok(start >= 0 && end > start);
  return new Function('lib', 'game', 'ui', 'get', '_status', `return {${source.slice(start, end)}}.${name}`)(...scope);
}

function fixture(mode, answers = [false]) {
  const choices = [], handlers = new Map(), discarded = [], videos = [];
  const _status = { mode: mode === 'versus' ? 'two' : 'normal' };
  const lib = { config: { mode }, element: { content: {} } };
  let serial = 0;
  function cards(n) {
    return Array.from({ length: n }, () => ({
      id: ++serial, tags: [], removeGaintag() { this.tags = []; },
      discard(bool) { assert.equal(bool, false, 'native mulligans return old cards to the draw pile'); this.owner.hand.splice(this.owner.hand.indexOf(this), 1); discarded.push(this); },
    }));
  }
  const pile = cards(160);
  const players = Array.from({ length: mode === 'versus' ? 4 : 3 }, (_, index) => ({
    name: `p${index}`, playerid: `p${index}`, hand: [], isAlive: () => true,
    getCards: function () { return [...this.hand]; }, countCards: function () { return this.hand.length; },
    directgain(gained, unused, tag) { for (const card of gained) { card.owner = this; if (tag) card.tags.push(tag); this.hand.push(card); } },
  }));
  players.forEach((player, index) => { player.next = players[(index + 1) % players.length]; });
  const game = {
    players, me: players[0],
    globalEventHandlers: {
      pushHandler(name, type, fn) { handlers.set(`${name}:${type}`, fn); },
      removeHandler(name, type, fn) { if (handlers.get(`${name}:${type}`) === fn) handlers.delete(`${name}:${type}`); },
    },
    broadcastAll: (fn, ...args) => fn(...args), addVideo: (...args) => videos.push(args),
    createEvent(name) {
      return {
        name, setContent(fn) { this.content = typeof fn === 'string' ? lib.element.content[fn] : fn; return this; },
        then(resolve, reject) {
          const run = async () => {
            const parent = _status.event;
            _status.event = this;
            try { await this.content(this, undefined, this.player); } finally { _status.event = parent; }
          };
          run().then(resolve, reject);
        },
      };
    },
    gameDraw(player = this.me, num = 4, targets = this.players) {
      return Object.assign(this.createEvent('gameDraw'), { player, num, targets }).setContent('gameDraw');
    },
  };
  const get = { mode: () => mode, config: () => 'disabled', cards: n => pile.splice(0, n), cardsInfo: list => list.map(card => card.id) };
  const scope = [lib, game, {}, get, _status];
  lib.element.content.gameDraw = content('gameDraw', 'phaseLoop', scope);
  lib.element.content.replaceHandcards = content('replaceHandcards', 'replaceHandcardsOL', scope);
  game.me.chooseBool = function (prompt) {
    const parent = _status.event;
    const choice = { prompt, getParent: () => parent, async forResult() {
      const handler = handlers.get('chooseBool:onChooseBool');
      handler?.(choice, { state: 'begin' });
      choices.push({ prompt: choice.prompt, description: choice.prompt2, cards: game.me.getCards('h'),
        others: players.slice(1).map(player => player.getCards('h')), opening: choice.sgsOpeningHandChoice });
      assert.ok(answers.length, 'unexpected extra opening prompt');
      choice.result = { bool: answers.shift() };
      handler?.(choice, { state: 'end' });
      return choice.result;
    } };
    return choice;
  };
  return { lib, game, _status, choices, handlers, discarded, videos, cards };
}

function openingAudio(f, options = {}) {
  const { fetch: fetcher, ...audioOptions } = options;
  const fetched = [], started = [], stopped = [];
  const ctx = {
    state: options.suspended ? 'suspended' : 'running', currentTime: 2, destination: {},
    async resume() { this.state = 'running'; }, async close() { this.state = 'closed'; },
    async decodeAudioData() { return { duration: 0.2 }; },
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; },
    createBufferSource() {
      const source = { connect(gain) { this.gain = gain; }, disconnect() {},
        start(at) { started.push({ at, gain: this.gain.gain.value }); }, stop() { stopped.push(this); } };
      return source;
    },
  };
  f.lib.skill = {};
  f.lib.config.volumn_audio = 6;
  f.game.addGlobalSkill = () => {};
  f.game.removeGlobalSkill = () => {};
  f.game.playAudio = () => { throw new Error('Native unpackaged audio must stay muted'); };
  f.game.playCardAudio = () => {};
  const controller = installCardAudio({ ...f, get: { event: () => f._status.event } }, { clips: {} }, {
    openingManifest, surface: null, host: {}, createContext: () => ctx,
    fetch: (url, init) => {
      fetched.push(String(url));
      return fetcher ? fetcher(url, init) : { ok: true, arrayBuffer: async () => new ArrayBuffer(12) };
    }, ...audioOptions,
  });
  const completed = [];
  installOpeningHand(f, { onReplaced(event) { completed.push(event); controller.playOpeningHand(event); } });
  return { controller, fetched, started, stopped, ctx, completed };
}

test('mulligan recording preserves the exact pinned upstream card-movement bytes and attribution', () => {
  assert.equal(openingManifest.uniqueFiles, 1);
  assert.deepEqual(Object.keys(openingManifest.clips), ['effect/draw']);
  const clip = openingManifest.clips['effect/draw'];
  assert.equal(openingManifest.upstreamCommit, '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a');
  assert.equal(clip.sourceGitBlob, '62933c85ae728765d07dd08160fec2aa19655b10');
  assert.equal(clip.sourceUrl, `https://raw.githubusercontent.com/libnoname/noname/${openingManifest.upstreamCommit}/apps/core/audio/effect/draw.mp3`);
  assert.equal(openingManifest.attribution.license, 'GPL-3.0');
  const bytes = readFileSync(new URL(`../../apps/core/sgs/${clip.file}`, import.meta.url));
  assert.equal(bytes.length, 14214);
  assert.equal(clip.bytes, bytes.length);
  assert.equal(openingManifest.totalBytes, bytes.length);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), clip.sourceGitBlob);
});

test('actual native mulligans reach the shared audio controller once each with effect volume', async () => {
  for (const mode of ['identity', 'versus', 'doudizhu']) {
    const f = fixture(mode, [true, true, false]);
    const h = openingAudio(f);
    h.controller.setVolume('effect', 0.4);
    await f.game.gameDraw();
    await h.controller.whenIdle();
    assert.equal(h.started.length, 2);
    assert.ok(h.started.every(row => row.at === h.ctx.currentTime && row.gain === 0.75 * 0.4));
    assert.equal(h.fetched.length, 1, 'repeated replacements reuse the decoded recording');
    assert.equal(h.controller.status().lastEffect, 'effect/draw');
    h.controller.playOpeningHand(h.completed[0]);
    await h.controller.whenIdle();
    assert.equal(h.started.length, 2, 'a completed native event cannot emit twice');
    h.controller.dispose();
  }
});

test('start, skipped openings, general draws and incomplete or unrelated events stay silent', async () => {
  for (const status of [{}, { auto: true }, { connectMode: true }, { brawl: { noGameDraw: true } }]) {
    const f = fixture('identity', status.auto || status.connectMode || status.brawl ? [] : [false]);
    Object.assign(f._status, status);
    const h = openingAudio(f);
    await f.game.gameDraw();
    await f.game.gameDraw();
    assert.equal(h.completed.length, 0);
    const completed = { name: 'replaceHandcards', players: [f.game.me], sgsOpeningHand: true, sgsAccepted: true, sgsOpeningHandCompleted: true };
    for (const change of [{ name: 'gameDraw' }, { name: 'chooseBool' }, { sgsOpeningHand: false },
      { sgsAccepted: false }, { sgsOpeningHandCompleted: false }, { players: [f.game.players[1]] }, { _cancelled: true }, { audio: false }]) {
      h.controller.playOpeningHand({ ...completed, ...change });
    }
    f.game.playAudio('effect', 'draw');
    await h.controller.whenIdle();
    assert.equal(h.fetched.length, 0);
    assert.equal(h.started.length, 0);
    h.controller.dispose();
  }
});

test('muted or gesture-blocked mulligans do not load audio or replay later', async () => {
  for (const options of [{ enabled: false }, { suspended: true }]) {
    const f = fixture('versus', [true, true, false]);
    const h = openingAudio(f, options);
    await f.game.gameDraw();
    assert.equal(h.completed.length, 2);
    assert.equal(h.fetched.length, 0);
    assert.equal(h.started.length, 0);
    h.controller.setEnabled(true);
    await h.controller.unlock();
    await h.controller.whenIdle();
    assert.equal(h.started.length, 0);
    assert.equal(h.fetched.length, 0);
    h.controller.dispose();
  }
});

test('mute and disposal abort pending mulligan loads without replay or blocking the native hand', async () => {
  for (const dispose of [false, true]) {
    const f = fixture('doudizhu', [true, false]);
    let signal, release;
    const h = openingAudio(f, { fetch: (_url, init) => {
      signal = init.signal;
      return new Promise(resolve => { release = () => resolve({ ok: true, arrayBuffer: async () => new ArrayBuffer(12) }); });
    } });
    await f.game.gameDraw();
    assert.equal(f.choices.length, 2, 'next opening choice does not wait for sound');
    assert.equal(h.controller.status().pending, 1);
    if (dispose) h.controller.dispose();
    else h.controller.setEnabled(false);
    assert.equal(signal.aborted, true);
    release();
    await h.controller.whenIdle();
    assert.equal(h.started.length, 0);
    assert.equal(h.controller.status().pending, 0);
    if (!dispose) {
      h.controller.setEnabled(true);
      await h.controller.whenIdle();
      assert.equal(h.started.length, 0);
      h.controller.dispose();
    }
  }
});

test('missing recording, failed device and timed-out loading leave mulligan and game start functional', async () => {
  for (const options of [
    { openingManifest: { clips: {} } },
    { fetch: () => ({ ok: false, status: 404 }) },
    { createContext: () => { throw new Error('device unavailable'); } },
    { fetch: () => new Promise(() => {}), loadTimeout: 10 },
  ]) {
    const f = fixture('identity', [true, false]);
    const h = openingAudio(f, options);
    await f.game.gameDraw();
    await h.controller.whenIdle();
    assert.equal(f.choices.length, 2);
    assert.equal(f.discarded.length, 4);
    assert.equal(h.started.length, 0);
    assert.equal(h.controller.status().pending, 0);
    assert.equal(f.handlers.size, 0);
    h.controller.dispose();
  }
});

test('native replacement failure never emits sound; notification failure cannot block game start', async () => {
  const f = fixture('identity', [true, false]);
  let notified = 0;
  installOpeningHand(f, { onReplaced() { notified++; throw new Error('effect unavailable'); } });
  await f.game.gameDraw();
  assert.equal(notified, 1);
  assert.equal(f.choices.length, 2);
  const failed = fixture('identity', []);
  failed.lib.element.content.replaceHandcards = async () => { throw new Error('native replacement failed'); };
  installOpeningHand(failed, { onReplaced() { notified++; } });
  await assert.rejects(async () => { await failed.game.gameDraw(); }, /native replacement failed/);
  assert.equal(notified, 1);
  assert.equal(failed.handlers.size, 0);
});

test('all three modes repeatedly replace only the human opening hand through native events, then stop', async () => {
  for (const mode of ['identity', 'versus', 'doudizhu']) {
    const f = fixture(mode, [true, true, true, false]);
    const originalFactory = f.game.gameDraw;
    const nativeDraw = f.lib.element.content.gameDraw;
    installOpeningHand(f);
    const event = f.game.gameDraw(f.game.players[1], player => mode === 'versus' && player === f.game.me ? 5 : 4);
    assert.equal(f.game.gameDraw, originalFactory);
    assert.equal(f.lib.element.content.gameDraw, nativeDraw);
    await event;
    const count = mode === 'versus' ? 5 : 4;
    assert.equal(f.choices.length, 4);
    f.choices.forEach((choice, index) => {
      assert.equal(choice.prompt, '开局换牌');
      assert.ok(choice.description.includes(`已换 ${index} 次`));
      assert.equal(choice.opening, true);
      assert.equal(choice.cards.length, count);
      if (index) assert.ok(choice.cards.every(card => !f.choices[index - 1].cards.includes(card)));
      assert.deepEqual(choice.others, f.choices[0].others);
    });
    assert.equal(f.discarded.length, count * 3);
    assert.equal(f.game.me.countCards('h'), count);
    assert.deepEqual(f.game.me._start_cards, f.choices.at(-1).cards);
    assert.equal(f.handlers.size, 0);
    assert.equal(engineSettings({ mode })[`change_card_mode_config_${mode}`], 'disabled');
  }
});

test('begin immediately keeps the original hand and later gameDraw calls do not reopen mulligans', async () => {
  const f = fixture('identity');
  installOpeningHand(f);
  await f.game.gameDraw();
  assert.deepEqual(f.game.me.hand, f.choices[0].cards);
  assert.equal(f.discarded.length, 0);
  await f.game.gameDraw();
  assert.equal(f.choices.length, 1);
});

test('opening sound is requested only after each accepted native replacement has completed', async () => {
  for (const mode of ['identity', 'versus', 'doudizhu']) {
    const f = fixture(mode, [true, true, false]);
    const requested = [];
    installOpeningHand(f, { onReplaced(event) {
      assert.equal(event.name, 'replaceHandcards');
      assert.equal(event.sgsOpeningHand, true);
      assert.equal(event.sgsOpeningHandCompleted, true);
      assert.equal(event.sgsAccepted, true);
      assert.deepEqual(event.players, [f.game.me]);
      assert.deepEqual(f.game.me._start_cards, f.game.me.hand, 'sound follows native starting-hand update');
      requested.push({ event, cards: f.game.me.getCards('h') });
    } });
    await f.game.gameDraw();
    assert.equal(requested.length, 2, 'one sound per completed mulligan, none for begin');
    assert.notEqual(requested[0].event, requested[1].event);
    assert.deepEqual(requested[0].cards, f.choices[1].cards);
    assert.deepEqual(requested[1].cards, f.choices[2].cards);
  }
});

test('native special piles, discard callbacks and starting-card tags survive replacement', async () => {
  const f = fixture('doudizhu', [true, false]);
  const special = f.cards(20), returned = [];
  installOpeningHand(f);
  const event = f.game.gameDraw();
  event.otherPile = { p0: { getCards: n => special.splice(0, n), discard(card) {
    returned.push(card); card.owner.hand.splice(card.owner.hand.indexOf(card), 1);
  } } };
  event.gaintag = { p0: 'opening-tag' };
  await event;
  assert.equal(returned.length, 4);
  assert.equal(f.discarded.length, 0);
  assert.ok(returned.every(card => card.tags.length === 0));
  assert.ok(f.game.me.hand.every(card => card.tags.includes('opening-tag')));
  assert.deepEqual(f.game.me._start_cards, f.game.me.hand);
});

test('auto, online and skipped initial deals do not wait for a human; draw errors remove handlers', async () => {
  for (const status of [{ auto: true }, { connectMode: true }, { brawl: { noGameDraw: true } }]) {
    const f = fixture('versus', []);
    Object.assign(f._status, status);
    installOpeningHand(f);
    await f.game.gameDraw();
    assert.equal(f.choices.length, 0);
    assert.equal(f.handlers.size, 0);
  }
  const f = fixture('identity', []);
  f.lib.element.content.gameDraw = async () => { throw new Error('draw failed'); };
  installOpeningHand(f);
  await assert.rejects(async () => { await f.game.gameDraw(); }, /draw failed/);
  assert.equal(f.handlers.size, 0);
});
