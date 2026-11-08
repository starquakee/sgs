import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installTeammateHand, visibleTeammate } from '../../apps/core/sgs/teammate-hand.mjs';
import { Node, dom } from './helpers/client-dom.mjs';

function nativeVisibility(mode) {
  const source = readFileSync(new URL(`../../apps/core/mode/${mode}.js`, import.meta.url), 'utf8')
    .replace(/^import .*?;\r?\n/gm, '').replace('export const type = "mode";', '').replace('export default', 'return');
  let value = new Function('lib', 'game', 'ui', 'get', 'ai', '_status', 'html', source)({}, {}, {}, { convertedCharacter: value => value }, {}, {}, String.raw);
  if (typeof value === 'function') value = value();
  return value.skill[`${mode}_viewHandcard`].ai.skillTagFilter;
}

function fixture(mode) {
  const filter = nativeVisibility(mode);
  const player = (side, identity) => ({ name: 'test', side, identity, isAlive: () => true });
  const me = player(true, 'fan'), friend = player(true, 'fan'), enemy = player(false, 'zhu');
  me.hasSkillTag = (tag, unused, target, global) => {
    assert.equal(tag, 'viewHandcard');
    assert.equal(unused, null);
    assert.equal(global, true);
    return filter(me, tag, target) !== false;
  };
  return { me, friend, enemy, players: [me, enemy, friend] };
}

test('2v2 hand panel respects native same-side permission and removes dead or changed teammates', () => {
  const game = fixture('versus');
  assert.equal(visibleTeammate(game, 'versus'), game.friend);
  game.friend.side = false;
  assert.equal(visibleTeammate(game, 'versus'), undefined);
  game.friend.side = true;
  game.friend.isAlive = () => false;
  assert.equal(visibleTeammate(game, 'versus'), undefined);
  game.friend.isAlive = () => true;
  game.me.hasSkillTag = () => false;
  assert.equal(visibleTeammate(game, 'versus'), undefined);
});

test('native farmer visibility permits the other farmer only; landlord has no teammate hand', () => {
  const game = fixture('doudizhu');
  assert.equal(visibleTeammate(game, 'doudizhu'), game.friend);
  game.me.identity = 'zhu';
  assert.equal(visibleTeammate(game, 'doudizhu'), undefined);
});

test('identity games, observers and pre-initialization never expose this team panel', () => {
  const game = fixture('versus');
  assert.equal(visibleTeammate(game, 'identity'), undefined);
  game.observe = true;
  assert.equal(visibleTeammate(game, 'versus'), undefined);
  game.observe = false;
  game.me.name = undefined;
  assert.equal(visibleTeammate(game, 'versus'), undefined);
  game.me = undefined;
  assert.equal(visibleTeammate(game, 'versus'), undefined);
});

// Run the actual presentation module. Hover/focus-visible geometry is browser
// QA; this harness checks the live read-only data, focusable root and lifecycle.
function panelFixture(t, mode = 'versus') {
  const document = dom(), game = fixture(mode), observers = [];
  const previousObserver = Object.getOwnPropertyDescriptor(globalThis, 'MutationObserver');
  class Observer {
    constructor(callback) { this.callback = callback; this.targets = new Map(); observers.push(this); }
    observe(target, options) { this.targets.set(target, options); }
    disconnect() { this.targets.clear(); }
    deliver() { this.callback([...this.targets.keys()].map(target => ({ type: 'childList', target })), this); }
  }
  Object.defineProperty(globalThis, 'MutationObserver', { configurable: true, value: Observer });
  t.after(() => previousObserver ? Object.defineProperty(globalThis, 'MutationObserver', previousObserver) : delete globalThis.MutationObserver);
  document.createElement = tag => {
    const node = new Node(tag); node.ownerDocument = document;
    node.removeAttribute = key => { delete node.attrs[key]; };
    node.contains = other => { for (let current = other; current; current = current.parentNode) if (current === node) return true; return false; };
    node.matches = selector => { assert.equal(selector, ':focus-visible'); return document.activeElement === node && !!node.keyboardFocus; };
    node.focus = ({ keyboard = true, betweenEvents = () => {} } = {}) => {
      if (document.activeElement === node) return;
      const previous = document.activeElement;
      document.activeElement = node;
      node.keyboardFocus = keyboard;
      for (let target = previous; target; target = target.parentNode) target.emit('focusout', { target: previous, relatedTarget: node });
      // The old :focus-visible state is already gone before the new focusin.
      betweenEvents();
      for (let target = node; target; target = target.parentNode) target.emit('focusin', { target: node });
    };
    return node;
  };
  const arena = document.createElement('div'), hand1 = document.createElement('div'), hand2 = document.createElement('div');
  document.body.append(arena);
  game.friend.name = 'teammate'; game.friend.dataset = { position: '3' };
  game.friend.node = { handcards1: hand1, handcards2: hand2 };
  let reads = 0, permitted = true;
  game.friend.getCards = zone => { assert.equal(zone, 'h'); reads++; return [...hand1.children, ...hand2.children]; };
  game.enemy.getCards = () => { throw new Error('Enemy hand must never be read'); };
  const nativePermission = game.me.hasSkillTag;
  game.me.hasSkillTag = (...args) => permitted && nativePermission(...args);
  const names = { teammate: '<b>队友甲</b>', sha: '杀', shan: '闪', tao: '桃', heart: '红桃', spade: '黑桃', club: '梅花' };
  const get = {
    translation: value => typeof value === 'object' ? value.name === 'sha' && value.nature === 'fire' ? '火杀' : names[value.name] : names[value] || value,
    natureList: (card, native) => { assert.equal(native, false); return card.nature ? card.nature.split('|') : []; },
    suit: (card, native) => { assert.equal(native, false); return card.suit; },
    number: (card, native) => { assert.equal(native, false); return card.number; },
    strNumber: number => number === 1 ? 'A' : String(number),
  };
  function card(name, suit, number, nature) {
    return Object.assign(document.createElement('div'), { className: 'card', name, suit, number, nature });
  }
  const fire = card('sha', 'heart', 1, 'fire'), dodge = card('shan', 'spade', 7);
  hand1.append(fire); hand2.append(dodge);
  const ui = { arena, selected: { cards: [fire], targets: [game.enemy] } };
  const controller = installTeammateHand({ game, ui, get }, mode);
  t.after(() => controller.dispose());
  return { document, game, ui, arena, hand1, hand2, fire, dodge, card, controller, observer: observers[0],
    reads: () => reads, permission: value => { permitted = value; }, panel: () => arena.querySelector('.sgs-teammate-hand') };
}
const summaryRows = panel => panel.querySelector('.sgs-teammate-summary').children.map(row => row.textContent);

test('compact teammate summary and expanded list track the same live native hand without replacing the focused panel', t => {
  const h = panelFixture(t); h.controller.refresh();
  const panel = h.panel(), summary = panel.querySelector('.sgs-teammate-summary');
  const detail = panel.querySelector('.sgs-teammate-detail');
  assert.ok(summary && detail, 'the compact summary and expandable detail both exist');
  const list = detail.querySelector('.sgs-teammate-cards');
  assert.equal(panel.tabIndex, 0, 'the compact panel is reachable without a pointer');
  assert.equal(list.tabIndex, 0, 'the expanded list can receive keyboard scrolling focus');
  assert.match(panel.attrs['aria-label'], /队友甲.*2张/);
  assert.match(panel.attrs['aria-label'], /悬停/); assert.match(panel.attrs['aria-label'], /键盘|聚焦|焦点/);
  assert.deepEqual(summaryRows(panel), ['火杀', '闪']);
  assert.equal(list.children.length, 2);
  assert.equal(list.children[0].querySelector('.sgs-teammate-card-name').textContent, '火杀');
  assert.equal(list.children[0].querySelector('.sgs-teammate-rank').textContent, '♥A');
  assert.equal(list.children[0].querySelector('.sgs-teammate-rank').dataset.color, 'red');
  assert.equal(list.children[1].querySelector('.sgs-teammate-rank').dataset.color, 'black');
  assert.equal(list.children[0].dataset.nature, 'fire');
  assert.deepEqual([...h.observer.targets.keys()], [h.hand1, h.hand2]);
  const firstLabel = list.children[0]; panel.focus(); list.scrollTop = 42;
  h.controller.refresh();
  assert.equal(h.panel(), panel); assert.equal(list.children[0], firstLabel, 'unchanged hands do not rebuild labels');

  h.fire.remove(); const peach = h.card('tao', 'heart', 9); h.hand1.append(peach);
  h.game.friend.dataset.position = '1'; h.observer.deliver();
  assert.equal(h.panel(), panel); assert.equal(panel.querySelector('.sgs-teammate-summary'), summary);
  assert.equal(h.document.activeElement, panel); assert.equal(list.scrollTop, 42);
  assert.equal(panel.dataset.position, '1'); assert.deepEqual(summaryRows(panel), ['桃', '闪']);
  assert.deepEqual(list.children.map(item => item.querySelector('.sgs-teammate-card-name').textContent), ['桃', '闪']);
  assert.equal(peach.parentNode, h.hand1); assert.equal(h.dodge.parentNode, h.hand2, 'native selectable card nodes are never moved into the panel');
});

test('empty hands stay explicit and permission loss, death or roster removal disconnect and remove all teammate details', t => {
  const h = panelFixture(t, 'doudizhu'); h.controller.refresh();
  h.hand1.replaceChildren(); h.hand2.replaceChildren(); h.observer.deliver();
  const panel = h.panel(), detail = panel.querySelector('.sgs-teammate-detail');
  assert.ok(panel.querySelector('.sgs-teammate-summary') && detail, 'empty hands keep both presentation regions');
  assert.deepEqual(summaryRows(panel), ['暂无手牌']);
  assert.equal(detail.querySelector('.sgs-teammate-cards').hidden, true);
  assert.equal(detail.querySelector('.sgs-teammate-empty').hidden, false);
  assert.match(panel.attrs['aria-label'], /0张/);
  const reads = h.reads(); h.permission(false); h.controller.refresh(); h.observer.callback([]);
  assert.equal(h.panel(), undefined); assert.equal(h.observer.targets.size, 0); assert.equal(h.reads(), reads);
  h.permission(true); h.controller.refresh();
  assert.ok(h.panel()); assert.notEqual(h.panel(), panel); assert.equal(h.observer.targets.size, 2);
  h.game.friend.isAlive = () => false; h.controller.refresh();
  assert.equal(h.panel(), undefined); assert.equal(h.observer.targets.size, 0);
  h.game.friend.isAlive = () => true; h.controller.refresh();
  h.game.players = h.game.players.filter(player => player !== h.game.friend); h.controller.refresh();
  assert.equal(h.panel(), undefined); assert.equal(h.observer.targets.size, 0);
});

test('disposed teammate presentation stays removed after queued mutations and late refreshes without affecting native cards', t => {
  const h = panelFixture(t); h.controller.refresh();
  const callback = h.observer.callback, panel = h.panel();
  h.controller.dispose(); h.controller.dispose();
  assert.equal(h.panel(), undefined); assert.equal(h.observer.targets.size, 0);
  callback([{ type: 'childList', target: h.hand1 }]); h.controller.refresh();
  panel.emit('pointerenter'); panel.emit('focusin', { target: panel }); panel.emit('keydown', { key: 'Escape' });
  assert.equal(!!h.panel(), false, 'disposal cannot be undone by queued observation or a late decorator tick');
  assert.equal(h.observer.targets.size, 0);
  assert.equal(h.fire.parentNode, h.hand1); assert.equal(h.dodge.parentNode, h.hand2);
});

test('inspection rechecks permission and current cards; Escape is contained without changing native selection or blocking Tab', t => {
  const h = panelFixture(t); h.controller.refresh();
  const panel = h.panel(), selectedCards = h.ui.selected.cards, selectedTargets = h.ui.selected.targets;
  panel.setAttribute('data-dismissed', 'true');
  h.fire.name = 'tao'; h.fire.nature = '';
  panel.emit('pointerenter');
  assert.deepEqual(summaryRows(panel), ['桃', '闪'], 'inspection refreshes even before an observer delivery');
  assert.equal(panel.attrs['data-dismissed'], undefined);
  let stopped = 0, prevented = 0;
  panel.emit('keydown', { key: 'Escape', stopPropagation() { stopped++; }, preventDefault() { prevented++; } });
  assert.equal(panel.attrs['data-dismissed'], 'true'); assert.equal(stopped, 1, 'Escape must not reach native cancel handlers');
  panel.emit('keydown', { key: 'Tab', stopPropagation() { stopped++; }, preventDefault() { prevented++; } });
  assert.equal(stopped, 2); assert.equal(prevented, 0, 'browser keyboard navigation remains available');
  assert.equal(h.ui.selected.cards, selectedCards); assert.deepEqual(h.ui.selected.cards, [h.fire]);
  assert.equal(h.ui.selected.targets, selectedTargets); assert.deepEqual(h.ui.selected.targets, [h.game.enemy]);
  const outside = h.document.createElement('button'); h.arena.append(outside); outside.focus();
  panel.focus(); assert.equal(panel.attrs['data-dismissed'], undefined, 'fresh keyboard focus permits inspection again');
  const reads = h.reads(); h.permission(false); panel.emit('pointerenter');
  assert.equal(h.panel(), undefined); assert.equal(h.reads(), reads); assert.equal(h.observer.targets.size, 0);
  h.permission(true); h.controller.refresh(); const next = h.panel();
  const list = next.querySelector('.sgs-teammate-detail').querySelector('.sgs-teammate-cards');
  h.permission(false); list.focus();
  assert.equal(h.panel(), undefined); assert.equal(h.observer.targets.size, 0, 'descendant keyboard focus uses the same permission gate');
});

test('keyboard reveal survives panel-to-list focus transfer and closes only on outside focus or Escape', t => {
  const h = panelFixture(t); h.controller.refresh();
  const panel = h.panel(), list = panel.querySelector('.sgs-teammate-detail').querySelector('.sgs-teammate-cards');
  const outside = h.document.createElement('button'); h.arena.append(outside);
  panel.focus({ keyboard: false });
  assert.equal(panel.attrs['data-keyboard-open'], undefined, 'pointer focus must not latch details after hover ends');
  outside.focus({ keyboard: false }); panel.focus();
  assert.equal(panel.attrs['data-keyboard-open'], 'true');
  list.focus({ betweenEvents() {
    assert.equal(panel.matches(':focus-visible'), false);
    assert.equal(panel.attrs['data-keyboard-open'], 'true', 'the reveal survives the interval before the list receives focusin');
  } });
  assert.equal(h.document.activeElement, list); assert.equal(panel.attrs['data-keyboard-open'], 'true');
  panel.focus(); assert.equal(panel.attrs['data-keyboard-open'], 'true', 'returning within the same panel retains reveal');
  outside.focus({ betweenEvents() { assert.equal(panel.attrs['data-keyboard-open'], undefined); } });
  panel.focus(); list.focus();
  let stopped = false;
  panel.emit('keydown', { key: 'Escape', target: list, stopPropagation() { stopped = true; } });
  assert.equal(stopped, true); assert.equal(panel.attrs['data-keyboard-open'], undefined); assert.equal(panel.attrs['data-dismissed'], 'true');
  assert.equal(h.document.activeElement, panel, 'Escape restores the visible summary before hiding the focused list');
  assert.deepEqual(h.ui.selected.cards, [h.fire]); assert.deepEqual(h.ui.selected.targets, [h.game.enemy]);
  outside.focus(); panel.focus();
  assert.equal(panel.attrs['data-dismissed'], undefined); assert.equal(panel.attrs['data-keyboard-open'], 'true', 'a later deliberate keyboard visit can reopen');
  panel.emit('focusout', { target: panel, relatedTarget: null });
  assert.equal(panel.attrs['data-keyboard-open'], undefined, 'leaving the document is also outside focus');
});

test('vertical summary keeps at most five separate card rows, adds overflow separately and shrinks back without losing full details', t => {
  const h = panelFixture(t); h.controller.refresh();
  const panel = h.panel(), summary = panel.querySelector('.sgs-teammate-summary');
  const list = panel.querySelector('.sgs-teammate-detail').querySelector('.sgs-teammate-cards');
  const cards = [h.fire, h.dodge, h.card('sha', 'club', 3, 'fire'), h.card('tao', 'heart', 4), h.card('shan', 'spade', 5),
    h.card('sha', 'club', 6), h.card('tao', 'heart', 7), h.card('shan', 'spade', 8), h.card('sha', 'club', 9),
    h.card('tao', 'heart', 10), h.card('shan', 'spade', 11), h.card('sha', 'club', 12)];
  const allNames = ['火杀', '闪', '火杀', '桃', '闪', '杀', '桃', '闪', '杀', '桃', '闪', '杀'];
  const firstFive = ['火杀', '闪', '火杀', '桃', '闪'];
  assert.equal(summary.tagName, 'ul');
  for (const [count, expected, remaining] of [[0, ['暂无手牌'], 0], [1, ['火杀'], 0], [5, firstFive, 0],
    [6, [...firstFive, '…'], 1], [12, [...firstFive, '…'], 7], [5, firstFive, 0], [1, ['火杀'], 0], [0, ['暂无手牌'], 0]]) {
    h.hand1.replaceChildren(); h.hand2.replaceChildren();
    const current = cards.slice(0, count), split = Math.min(3, count);
    h.hand1.append(...current.slice(0, split)); h.hand2.append(...current.slice(split));
    h.observer.deliver();
    assert.equal(h.panel(), panel); assert.equal(panel.querySelector('.sgs-teammate-summary'), summary);
    assert.deepEqual(summaryRows(panel), expected, `${count} current cards`);
    assert.ok(summary.children.every(row => row.tagName === 'li'));
    assert.equal(summary.querySelectorAll('.sgs-teammate-summary-card').length, Math.min(count, 5));
    assert.equal(summary.querySelectorAll('.sgs-teammate-summary-empty').length, count === 0 ? 1 : 0);
    const more = summary.querySelectorAll('.sgs-teammate-more');
    assert.equal(more.length, remaining ? 1 : 0);
    if (remaining) assert.match(more[0].attrs['aria-label'], new RegExp(`${remaining}\\s*张`));
    assert.equal(list.children.length, count, 'the expanded list must retain every current card, including duplicates');
    assert.deepEqual(list.children.map(item => item.querySelector('.sgs-teammate-card-name').textContent), allNames.slice(0, count));
    assert.deepEqual([...h.hand1.children, ...h.hand2.children], current, 'summary truncation does not move or discard native cards');
    for (let index = 0; index < current.length; index++) assert.equal(current[index].parentNode, index < split ? h.hand1 : h.hand2);
  }
});
