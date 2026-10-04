import test from 'node:test';
import assert from 'node:assert/strict';
import { readTableAction, visiblePlayerName, ownDescriptionCards, openNativeDescription,
  canOpenNativeRecord, installTableActions } from '../../apps/core/sgs/table-actions.mjs';

function element(name = '') {
  const classes = new Set();
  return { name, classList: { contains: key => classes.has(key), add: key => classes.add(key), delete: key => classes.delete(key) } };
}
function fixture() {
  const cards = [element('sha'), element('shan')];
  const me = { ...element('liubei'), getCards: zone => { assert.equal(zone, 'he'); return cards; } };
  const enemy = element('caocao');
  // A presentation helper must never inspect identities or opponent hands.
  Object.defineProperty(enemy, 'identity', { get() { throw new Error('hidden identity'); } });
  enemy.getCards = () => { throw new Error('enemy hand'); };
  const game = { me, players: [me, enemy], dead: [] };
  const ui = { selected: { cards: [], targets: [], buttons: [] }, pause: element(), click: {} };
  const lib = { config: {}, hooks: { checkEnd: [], uncheckEnd: [] } };
  const _status = { gameStarted: true, currentPhase: me };
  const get = { translation: value => typeof value === 'string' ? value : value.name };
  const event = { name: 'chooseToUse', type: 'phase', player: me, isMine: () => true,
    filterCard() { throw new Error('UI must not run legality'); },
    filterTarget() { throw new Error('UI must not run target legality'); },
    selectCard() { throw new Error('UI must not recompute ranges'); }, custom: { add: {}, replace: {} } };
  _status.event = event;
  return { game, ui, lib, _status, get, event, cards, enemy };
}

test('action state follows human native opening/play/response/discard/target events and exact selected counts', () => {
  const f = fixture();
  const read = () => readTableAction(f);
  f.event.sgsOpeningHandChoice = true;
  assert.equal(read().kind, 'opening');
  delete f.event.sgsOpeningHandChoice;
  assert.equal(read().kind, 'play');
  assert.equal(read().counts, '已选 0 牌 · 0 目标');
  f.ui.selected.cards.push(f.cards[0]);
  f.enemy.classList.add('selectable');
  assert.equal(read().kind, 'target');
  f.ui.selected.targets.push(f.enemy);
  assert.equal(read().counts, '已选 1 牌 · 1 目标');
  f.ui.selected.targets.length = 0;
  f.enemy.classList.delete('selectable');
  assert.equal(read().kind, 'play');
  f.event.name = 'chooseToRespond';
  delete f.event.filterTarget;
  assert.equal(read().kind, 'respond');
  f.event.name = 'chooseToUse';
  f.event.type = 'dying';
  assert.equal(read().kind, 'respond');
  f.event.name = 'chooseToDiscard';
  f.event.custom.add.card = () => { throw new Error('native discard callback must not run'); };
  f.event.complexCard = true;
  f.ui.selected.cards.push(f.cards[1]);
  assert.equal(read().kind, 'discard');
  assert.equal(read().counts, '已选 2 牌');
  assert.deepEqual(f.ui.selected.cards, f.cards);
});

test('complex, custom and button choices defer to the native dialog without executing rich prompts', () => {
  for (const variation of [{ complexCard: true }, { complexTarget: true }, { complexSelect: true },
    { custom: { add: { card() { throw new Error('custom'); } } } }, { name: 'chooseControl' },
    { name: 'chooseButton', filterButton: () => true }, { name: 'chooseBool' }]) {
    const f = fixture();
    Object.assign(f.event, variation);
    Object.defineProperty(f.event, 'prompt', { get() { throw new Error('private prompt'); } });
    f.event.dialog = { innerHTML: '<private card dialog>' };
    const action = readTableAction(f);
    assert.equal(action.kind, 'choice');
    assert.equal(action.detail, '请按牌桌对话框操作');
    assert.equal(f.event.dialog.innerHTML, '<private card dialog>');
  }
});

test('AI and settled events never show stale human selections or reveal hidden names/identities', () => {
  const f = fixture();
  f.ui.selected.cards.push(...f.cards);
  f.event.player = f.enemy;
  f.enemy.classList.add('unseen');
  assert.deepEqual(readTableAction(f), { kind: 'waiting', title: 'AI 行动', detail: '未知武将 · 等待原生流程', counts: '' });
  assert.equal(visiblePlayerName(f.enemy, f.get), '未知武将');
  f.event.player = f.game.me;
  f.event.finished = true;
  assert.equal(readTableAction(f).counts, '');
  f._status.auto = true;
  assert.equal(readTableAction(f).title, '托管中');
  f._status.over = true;
  assert.equal(readTableAction(f).kind, 'over');
  assert.equal(readTableAction(f).counts, '');
  f._status = {};
  assert.equal(readTableAction(f).title, '准备开局');
});

test('descriptions only forward current owned visible nodes to native intro and do not change selections', () => {
  const f = fixture();
  const calls = [];
  f._status.clicked = false;
  f.ui.click.intro = function (pointer) { f._status.clicked = true; calls.push({ node: this, pointer }); };
  const pointer = { clientX: 300, clientY: 80 };
  f.ui.selected.cards.push(f.cards[0]);
  assert.deepEqual(ownDescriptionCards(f.game), f.cards);
  assert.equal(openNativeDescription(f, f.game.me, pointer), true);
  assert.equal(openNativeDescription(f, f.cards[0], pointer), true);
  assert.equal(openNativeDescription(f, f.enemy, pointer), false);
  const moved = f.cards.shift();
  assert.equal(openNativeDescription(f, moved, pointer), false);
  f.cards[0].classList.add('infohidden');
  assert.deepEqual(ownDescriptionCards(f.game), []);
  assert.equal(openNativeDescription(f, f.cards[0], pointer), false);
  for (const key of ['paused2', 'dragged', 'removePop']) {
    f._status[key] = true;
    assert.equal(openNativeDescription(f, f.game.me, pointer), false);
    delete f._status[key];
  }
  assert.deepEqual(calls, [{ node: f.game.me, pointer }, { node: moved, pointer }]);
  assert.deepEqual(f.ui.selected.cards, [moved]);
  assert.equal(f._status.clicked, false);
});

test('record availability respects native game start, pause ownership and nopause guards', () => {
  const f = fixture();
  assert.equal(canOpenNativeRecord(f), true);
  for (const key of ['paused2', 'pausing', 'nopause']) {
    f._status[key] = true;
    assert.equal(canOpenNativeRecord(f), false);
    delete f._status[key];
  }
  f._status.gameStarted = false;
  assert.equal(canOpenNativeRecord(f), false);
  f._status.gameStarted = true;
  f.ui.pause.classList.add('hidden');
  assert.equal(canOpenNativeRecord(f), false);
  f.ui.pause.classList.delete('hidden');
  f.lib.config.test_game = true;
  assert.equal(canOpenNativeRecord(f), false);
});

// Minimal DOM for actual installed event handlers, not a layout/browser proxy.
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.listeners = new Map(); this.dataset = {}; this.textContent = ''; }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  replaceChildren(...nodes) { this.children.length = 0; this.append(...nodes); }
  setAttribute() {}
  addEventListener(name, fn) { this.listeners.set(name, fn); }
  removeEventListener(name, fn) { if (this.listeners.get(name) === fn) this.listeners.delete(name); }
  emit(name, event = {}) { this.listeners.get(name)?.({ stopPropagation() {}, ...event }); }
  remove() { this.parent.children.splice(this.parent.children.indexOf(this), 1); }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  getBoundingClientRect() { return { left: 320, bottom: 84 }; }
  focus() { this.focused = true; }
}
function mounted() {
  const f = fixture();
  const document = new Node('document');
  document.body = new Node('body');
  document.createElement = tag => new Node(tag);
  const queued = [];
  const timers = new Set();
  const api = installTableActions(f, { document, queueMicrotask: fn => queued.push(fn),
    setInterval: fn => { timers.add(fn); return fn; }, clearInterval: fn => timers.delete(fn) });
  const rail = document.body.children[0];
  const [state, nav] = rail.children;
  const [general, cards, record] = nav.children;
  const [summary, menu] = cards.children;
  return { ...f, api, document, queued, timers, rail, state, general, cardsMenu: cards, record, summary, menu };
}

test('installed rail updates after native checks, delegates records and removes hooks/listeners/timer on disposal', () => {
  const f = mounted();
  let records = 0;
  f.ui.click.pause = () => records++;
  const original = () => {};
  f.lib.hooks.checkEnd.unshift(original);
  f.ui.selected.cards.push(...f.cards);
  f.lib.hooks.checkEnd.at(-1)();
  f.queued.shift()();
  assert.equal(f.state.children[1].textContent, '已选 2 牌 · 0 目标');
  f.record.emit('click');
  assert.equal(records, 1);
  f._status.paused2 = true;
  f.record.emit('click');
  assert.equal(records, 1);
  f.ui.selected.cards.length = 0;
  f.lib.hooks.uncheckEnd[0]();
  f.api.dispose();
  f.api.dispose();
  f.queued.shift()(); // A scheduled refresh cannot resurrect disposed UI.
  assert.deepEqual(f.lib.hooks.checkEnd, [original]);
  assert.deepEqual(f.lib.hooks.uncheckEnd, []);
  assert.equal(f.timers.size, 0);
  assert.equal(f.document.listeners.size, 0);
  assert.equal(f.document.body.children.length, 0);
});

test('card reference menu stays in sync, preserves focus, rejects moved cards and supports Escape/outside close', () => {
  const f = mounted();
  const intros = [];
  f.ui.click.intro = function () { intros.push(this); };
  f.cardsMenu.open = true;
  f.cardsMenu.emit('toggle');
  const list = f.menu.children[1];
  assert.deepEqual(list.children.map(node => node.textContent), ['sha', 'shan']);
  const first = list.children[0];
  f.api.refresh();
  assert.equal(list.children[0], first);
  f.cards.shift();
  first.emit('click');
  assert.deepEqual(intros, []);
  f.cardsMenu.open = true;
  f.api.refresh();
  assert.deepEqual(list.children.map(node => node.textContent), ['shan']);
  list.children[0].emit('click');
  assert.deepEqual(intros, [f.cards[0]]);
  f.cardsMenu.open = true;
  f.document.emit('keydown', { key: 'Escape' });
  assert.equal(f.cardsMenu.open, false);
  assert.equal(f.summary.focused, true);
  f.cardsMenu.open = true;
  f.document.emit('pointerdown', { target: f.document.body });
  assert.equal(f.cardsMenu.open, false);
  f.cards.length = 0;
  f.cardsMenu.open = true;
  f.cardsMenu.emit('toggle');
  assert.equal(list.children.length, 0);
  assert.equal(f.menu.children[2].hidden, false);
  f.api.dispose();
});
