import test, { after } from 'node:test';
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
const feedbackSkill = '_sgs_committed_card_feedback';
// Native respond uses these engine Array helpers while moving owned costs.
const arrayMethods = {
  addArray(values) { for (const value of values) if (!this.includes(value)) this.push(value); return this; },
  removeArray(values) { for (const value of values) { const index = this.indexOf(value); if (index !== -1) this.splice(index, 1); } return this; },
};
for (const [name, value] of Object.entries(arrayMethods)) {
  const previous = Object.getOwnPropertyDescriptor(Array.prototype, name);
  Object.defineProperty(Array.prototype, name, { configurable: true, value });
  after(() => previous ? Object.defineProperty(Array.prototype, name, previous) : delete Array.prototype[name]);
}
function nativeStep(name, index, h) {
  const step = nativeContents.get(name).elements[index].getText(contentSource);
  const code = ts.transpileModule(`const step = ${step};`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function('game', 'lib', 'get', 'ui', '_status', `${code} return step;`)(h.game, h.lib, h.get, h.ui, h._status);
}
function harness() {
  const document = dom(), arena = new Node(), a = new Node(), b = new Node();
  const nativeActions = [], globalSkills = new Set();
  arena.append(a, b);
  for (const player of [a, b]) Object.assign(player, {
    name: 'hidden-name', className: 'player', hp: 6, hujia: 0, stat: [{ skill: {} }], style: {},
    playerid: player === a ? 'a' : 'b', actionHistory: [{ respond: [] }],
    node: { count: { hide() {} }, hp: { hide() {} }, equips: { hide() {} } },
    previous: {}, next: {}, getHistory: () => [], hasSkillTag: () => false,
    getCards: () => [], tryCardAnimate() {}, logSkill() {}, checkShow() {},
    lose(cards) { nativeActions.push(['lose', this, cards]); return { set() { return this; } }; },
    $throw(cards) { nativeActions.push(['throw', this, cards]); },
    changeHp(amount) { this.hp += amount; return { set() {} }; },
    queue() { this.queued = (this.queued || 0) + 1; }, $damagepop() {}, removeLink() {},
  });
  const ui = { arena, selected: { targets: [] } };
  const _status = { event: { name: 'chooseToUse', filterTarget: true, isMine: () => true }, dying: { remove() {} } };
  const calls = [], tasks = new Map(); let id = 0;
  const timers = { setTimeout(fn, delay) { assert.equal(delay, 240); tasks.set(++id, fn); return id; }, clearTimeout(id) { tasks.delete(id); } };
  const lib = { skill: { global: [] }, hooks: { checkEnd: [], uncheckEnd: [] }, config: { background_audio: false }, natureAudio: { damage: {}, hujia_damage: {} }, natureSeparator: '|' };
  const game = { players: [a, b], dead: [], broadcast() {}, broadcastAll(fn, ...args) { fn(...args); }, log() {}, logv() {},
    playerMap: { a, b }, playCardAudio() { nativeActions.push(['silent-audio-request']); },
    async delayx(value) { nativeActions.push(['delay', value]); },
    addGlobalSkill(name) { globalSkills.add(name); if (!lib.skill.global.includes(name)) lib.skill.global.push(name); },
    removeGlobalSkill(name) { globalSkills.delete(name); lib.skill.global = lib.skill.global.filter(skill => skill !== name); },
    addVideo(...args) { calls.push(args); return 'native-result'; } };
  game.players.remove = player => { const index = game.players.indexOf(player); if (index >= 0) game.players.splice(index, 1); };
  const get = { event: () => _status.event, owner: card => card.owner, info: name => lib.skill[name], cnNumber: String, translation: String, itemtype: value => value instanceof Node ? 'player' : 'other', is: { mobileMe: () => false, newLayout: () => true } };
  const prefs = createPreferences(() => ({ getItem: () => null, setItem() {} }));
  prefs.set({ sound: false });
  const native = game.addVideo;
  const feedback = installBattleFeedback({ lib, game, ui, get, _status, document, preferences: prefs, timers });
  const damageMethod = playerSource.match(/\t\$damage\(source\) \{[\s\S]*?\n\t\}/)[0];
  a.$damage = b.$damage = new Function('game', 'lib', 'get', `return ({${damageMethod}}).$damage;`)(game, lib, get);
  const flash = player => player.querySelector('.sgs-battle-flash').dataset.kind;
  const event = (properties = {}) => ({ name: 'damage', num: 1, nature: '', player: a, trigger: async () => {}, goto() {}, ...properties });
  function cardEvent(name, properties = {}) {
    const player = properties.player || a, card = { name: name === 'respond' ? 'shan' : 'sha', isCard: true, owner: player };
    return { name, player, card, cards: [card], targets: [], audio: false,
      _playTargetAnimation() { nativeActions.push(['targets']); }, getParent: () => ({ name: 'useCard' }),
      async trigger(point) {
        nativeActions.push(['trigger', point, this]);
        for (const id of [...globalSkills]) {
          const skill = lib.skill[id];
          if (!skill?.trigger?.player?.includes(point) || (skill.filter && !skill.filter(this, this.player))) continue;
          const previous = _status.event;
          // Native content runs inside its own skill event, not the card event.
          _status.event = { name: id, triggername: point, player: this.player, _trigger: this };
          try { await skill.content(_status.event, this, this.player); }
          finally { _status.event = previous; }
        }
      }, ...properties };
  }
  return { document, a, b, ui, _status, lib, game, get, prefs, feedback, calls, tasks, native, flash, event, cardEvent, globalSkills, nativeActions,
    expire() { for (const fn of [...tasks.values()]) fn(); } };
}

test('pinned native committed use and response flash only the actor while muted, independent of audio flags and costs', async () => {
  const h = harness();
  try {
    for (const name of ['useCard', 'respond']) for (const virtual of [false, true]) {
      const event = h.cardEvent(name, virtual ? { card: { name: name === 'respond' ? 'shan' : 'sha' }, cards: [], addCount: false } : {});
      h._status.event = event;
      await nativeStep(name, name === 'useCard' ? 1 : 0, h)(event, null, h.a);
      assert.equal(h.flash(h.a), name === 'useCard' ? 'use' : 'respond');
      assert.equal(h.flash(h.b), undefined);
      assert.equal(h.tasks.size, 1, 'each committed event has only one 240 ms pulse');
      assert.equal(h.prefs.get().sound, false);
      if (name === 'respond') assert.equal(h.a.actionHistory.at(-1).respond.at(-1), event);
      h.expire();
      await event.trigger(name === 'useCard' ? 'useCard1' : 'respond');
      assert.equal(h.flash(h.a), undefined, 'the same native event cannot replay after its pulse expires');
    }
    assert.ok(h.nativeActions.some(([kind, owner]) => kind === 'lose' && owner === h.a), 'the native physical response cost still moves');
    assert.equal(h.lib.skill[feedbackSkill].content.constructor.name, 'AsyncFunction', 'the native compiler must retain the adapter closure');
    assert.deepEqual(h.lib.skill[feedbackSkill].trigger, { player: ['useCard1', 'respond'] });
  } finally { h.feedback.dispose(); }
});

test('native view-as response pulses its issuer rather than the physical cost owner and never implies a hit', async () => {
  const h = harness();
  try {
    h.lib.skill.view_as = { audio: true };
    const cost = { name: 'bagua', owner: h.b };
    const event = h.cardEvent('respond', { skill: 'view_as', card: { name: 'shan', cards: [cost] }, cards: [cost], addSkillCount: false });
    h._status.event = event;
    await nativeStep('respond', 0, h)(event, null, h.a);
    assert.equal(h.flash(h.a), 'respond'); assert.equal(h.flash(h.b), undefined);
    const loss = h.nativeActions.find(([kind]) => kind === 'lose');
    assert.equal(loss[1], h.b); assert.deepEqual(loss[2], [cost]);
    assert.equal(h.nativeActions.some(([kind]) => kind === 'silent-audio-request'), false, 'skill-owned speech suppresses card audio, but not the visual');
    h.expire();
    h._status.event = h.cardEvent('useCard', { card: { name: 'sha', nature: 'fire' } });
    await nativeStep('useCard', 1, h)(h._status.event, null, h.a);
    assert.equal(h.flash(h.a), 'use'); assert.equal(h.flash(h.b), undefined, 'a committed Slash does not claim any target was hit');
  } finally { h.feedback.dispose(); }
});

test('selection, cancellation, costs, suppressed animation and replay cannot emit a committed pulse', async () => {
  const h = harness();
  try {
    for (const name of ['useCard', 'respond']) for (const suppressed of ['animate', 'replay', 'canceled']) {
      const event = h.cardEvent(name, suppressed === 'animate' ? { animate: false } : suppressed === 'canceled' ? { _cancelled: true } : {});
      h._status.event = event; h._status.video = suppressed === 'replay';
      await nativeStep(name, name === 'useCard' ? 1 : 0, h)(event, null, h.a);
      assert.equal(h.flash(h.a), undefined, `${name}: ${suppressed}`);
    }
    h._status.video = false;
    const skill = h.lib.skill[feedbackSkill];
    for (const name of ['chooseToUse', 'chooseToRespond', 'chooseCard', 'discard', 'lose', 'useSkill']) {
      const event = h.cardEvent(name); h._status.event = event;
      assert.equal(skill.filter(event, h.a), false, name);
      await skill.content({}, event, h.a);
      assert.equal(h.flash(h.a), undefined, name);
    }
    for (const properties of [{ card: null }, { card: {} }, { player: h.b }]) {
      const event = h.cardEvent('useCard', properties);
      assert.equal(skill.filter(event, h.a), false);
      await skill.content({}, event, h.a);
    }
    assert.equal(h.flash(h.a), undefined); assert.equal(h.flash(h.b), undefined);
    h.game.addVideo('throw', h.a); h.game.addVideo('lose', h.a);
    assert.equal(h.tasks.size, 0, 'card movement records are not commit signals');
  } finally { h.feedback.dispose(); }
});

test('actual native damage visual produces one short victim pulse after final damage; no rule/animation return is replaced', async () => {
  const h = harness(), damage = nativeStep('damage', 4, h);
  for (const [num, nature, hujia, kind] of [[1, '', 0, 'hit'], [2, 'fire', 0, 'hit-fire'], [2, 'thunder', 1, 'hit-thunder'],
    [1, 'fire|thunder', 0, 'hit'], [1, 'ice', 0, 'hit']]) {
    h.a.hujia = hujia;
    const event = h.event({ num, nature, card: { name: 'sha', nature: 'thunder' } }); h._status.event = event;
    const before = h.a.hp;
    await damage(event, null, h.a);
    assert.equal(h.a.hp, before - num, 'native HP path runs unchanged in harness');
    assert.equal(h.flash(h.a), kind, 'only the final native damage nature chooses the flash'); assert.equal(h.flash(h.b), undefined);
    assert.equal(h.a.style.transform, 'scale(0.95)', 'original native visual still runs');
    h.expire(); assert.equal(h.flash(h.a), undefined);
    assert.equal(h.game.addVideo('damage', h.a), 'native-result');
    assert.equal(h.flash(h.a), undefined, 'same victim damage event cannot flash twice');
  }
  assert.equal(h.a.queued, 5); h.feedback.dispose();
});

test('native zero/unreal damage and selection/dodge/health-loss/foreign-victim records never create hit feedback', async () => {
  const h = harness(), damage = nativeStep('damage', 4, h);
  for (const properties of [{ num: 0 }, { unreal: true }, { _cancelled: true }, { animate: false }]) {
    const event = h.event(properties); h._status.event = event;
    await damage(event, null, h.a);
    assert.equal(h.flash(h.a), undefined);
    h.game.addVideo('damage', h.a);
    assert.equal(h.flash(h.a), undefined, 'direct records cannot bypass the native event suppression');
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

test('committed pulses stop immediately for reduced motion and never replay an already observed event', async () => {
  const h = harness(), use = nativeStep('useCard', 1, h);
  try {
    const first = h.cardEvent('useCard'); h._status.event = first;
    await use(first, null, h.a); assert.equal(h.flash(h.a), 'use');
    h.prefs.set({ reducedMotion: true });
    assert.equal(h.flash(h.a), undefined); assert.equal(h.tasks.size, 0);
    const second = h.cardEvent('useCard'); h._status.event = second;
    await use(second, null, h.a); assert.equal(h.flash(h.a), undefined);
    h.prefs.set({ reducedMotion: false });
    await first.trigger('useCard1'); await second.trigger('useCard1');
    assert.equal(h.flash(h.a), undefined, 'changing motion preferences creates no backlog');
    const third = h.cardEvent('useCard'); h._status.event = third;
    await use(third, null, h.a); assert.equal(h.flash(h.a), 'use');
  } finally { h.feedback.dispose(); }
});

test('disposal unregisters only owned feedback and delayed content, hooks, recorders and timers cannot rebuild its DOM', async () => {
  const h = harness(), event = h.cardEvent('respond'); h._status.event = event;
  const skill = h.lib.skill[feedbackSkill], record = h.game.addVideo, checked = h.lib.hooks.checkEnd[0];
  await nativeStep('respond', 0, h)(event, null, h.a);
  const expired = [...h.tasks.values()];
  h.lib.skill.unrelated = {}; h.game.addGlobalSkill('unrelated');
  h.feedback.dispose(); h.feedback.dispose();
  assert.deepEqual([...h.globalSkills], ['unrelated']); assert.equal(h.lib.skill[feedbackSkill], undefined);
  assert.equal(h.tasks.size, 0); assert.equal(h.game.addVideo, h.native);
  assert.equal(skill.filter(h.cardEvent('respond'), h.a), false);
  await skill.content({}, h.cardEvent('respond'), h.a);
  h._status.event = h.event(); assert.equal(record('damage', h.a), 'native-result');
  checked(h._status.event); for (const fn of expired) fn();
  h.prefs.set({ reducedMotion: true });
  assert.equal(h.a.children.length, 0); assert.equal(h.b.children.length, 0); assert.equal(h.tasks.size, 0);
  assert.equal(h.lib.hooks.checkEnd.length, 0); assert.equal(h.lib.hooks.uncheckEnd.length, 0);

  const replaced = harness(), replacement = { trigger: { player: ['respond'] }, async content() {} };
  replaced.lib.skill[feedbackSkill] = replacement;
  replaced.feedback.dispose();
  assert.equal(replaced.lib.skill[feedbackSkill], replacement, 'another owner may replace the registry entry');
  assert.equal(replaced.globalSkills.has(feedbackSkill), true, 'do not unregister a later owner');
});
