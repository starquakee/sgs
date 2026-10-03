import test, { after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installOpeningHand } from '../../apps/core/sgs/opening-hand.mjs';
import { engineSettings } from '../../apps/core/sgs/launch-config.mjs';

// Run the pinned engine's complete dealing and replacement functions, including
// its special-pile/starting-tag branches. Only events, players and cards are fixtures.
const source = readFileSync(new URL('../../apps/core/noname/library/element/content.ts', import.meta.url), 'utf8');
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
