import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installCardSelectionSwitch } from '../../apps/core/sgs/card-selection.mjs';
import { installManualConfirmation } from '../../apps/core/sgs/experience.mjs';

const gameSource = readFileSync(new URL('../../apps/core/noname/game/index.js', import.meta.url), 'utf8');
const clickSource = readFileSync(new URL('../../apps/core/noname/ui/click/index.js', import.meta.url), 'utf8');
const checkSource = readFileSync(new URL('../../apps/core/noname/game/check.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\r?\n/gm, '').replace('export class Check', 'return class Check');
function method(source, signature, end, scope) {
  const start = source.indexOf(`\t${signature}`);
  const finish = source.indexOf(end, start);
  assert.ok(start >= 0 && finish > start);
  return new Function('lib', 'game', 'ui', 'get', '_status', 'HTMLDivElement', `return {${source.slice(start, finish)}}.${signature.split('(')[0]}`)(...scope);
}
const selection = () => Object.assign([], {
  add(item) { if (!this.includes(item)) this.push(item); },
  remove(item) { const index = this.indexOf(item); if (index >= 0) this.splice(index, 1); },
});
const classes = () => {
  const items = new Set();
  return { contains: key => items.has(key), add: (...keys) => keys.forEach(key => items.add(key)), remove: (...keys) => keys.forEach(key => items.delete(key)) };
};
function fixture({ name = 'chooseToUse', range = [1, 1], skill, complexCard = false } = {}) {
  const cards = ['sha', 'huogong', 'shan'].map((name, index) => ({
    name, cardid: index + 1, legal: index < 2, classList: classes(), dataset: {},
    parentNode: { classList: classes() }, updateTransform(selected) { this.raised = !!selected; },
  }));
  const player = { node: { equips: { classList: classes(), querySelector: () => null } },
    getCards: () => cards, getSkills: () => [], isOut: () => false, classList: classes(), unprompt() {} };
  const target = { classList: classes(), isOut: () => false, unprompt() {}, playerid: 2 };
  let commits = 0;
  function autoConfirm(_event, state) { if (state.ok && state.auto) commits++; }
  const lib = { config: { auto_confirm: true }, skill: { global: [] }, filter: {
    cardAiIncluded: () => true, cardRespondable: card => card.respondable !== false,
  }, hooks: { checkBegin: [], checkCard: [], checkTarget: [], checkEnd: [autoConfirm], uncheckBegin: [] } };
  const ui = { click: {}, selected: { cards: selection(), targets: selection(), buttons: selection() },
    arena: { classList: classes(), offsetWidth: 1000, offsetHeight: 600 }, canvas: {},
    create: { confirm: () => {} }, touchlines: [] };
  const event = { name, player, skill, complexCard, position: 'h', selectCard: range, selectTarget: [1, 1],
    filterCard: card => card.legal, filterTarget: () => true, isMine: () => true,
    custom: { add: {}, replace: {} }, _skillChoice: [], _aiexclude: [] };
  const _status = { event, dragline: [], lastdragchange: [] };
  const get = {
    select: value => typeof value === 'function' ? value() : typeof value === 'number' ? [value, value] : value || [1, 1],
    info: () => ({}), card: () => ui.selected.cards[0],
    noSelected: () => !ui.selected.cards.length && !ui.selected.targets.length && !ui.selected.buttons.length,
    is: { phoneLayout: () => false },
  };
  const game = { me: player, players: [player, target], dead: [], expandSkills: list => list,
    countChoose() {}, callHook: (type, args) => lib.hooks[type]?.forEach(fn => fn(...args)) };
  const scope = [lib, game, ui, get, _status, class HTMLDivElement {}];
  const Check = new Function('lib', 'game', 'ui', 'get', '_status', checkSource)(lib, game, ui, get, _status);
  game.Check = new Check();
  game.check = method(gameSource, 'check(event = _status.event)', '\n\tCheck = new Check();', scope);
  game.uncheck = method(gameSource, 'uncheck(...args)', '\n\t/**', scope);
  ui.click.card = method(clickSource, 'card()', '\n\tavatar()', scope);
  installManualConfirmation(lib, ui);
  installCardSelectionSwitch({ lib, game, ui, get, _status });
  game.check();
  const click = card => { _status.clicked = false; ui.click.card.call(card); };
  const selectTarget = () => { ui.selected.targets.add(target); target.classList.add('selected'); game.check(); };
  return { cards, player, target, event, _status, ui, game, click, selectTarget, commits: () => commits };
}

test('native single-card selection switches directly, clears old targets and still requires confirmation', () => {
  const f = fixture();
  f.click(f.cards[0]); f.selectTarget();
  assert.equal(f.cards[1].classList.contains('selectable'), false, 'native single-card limit remains intact');
  assert.equal(f.cards[1].dataset.sgsSwitchable, 'true');
  f.click(f.cards[1]);
  assert.deepEqual([...f.ui.selected.cards], [f.cards[1]]);
  assert.equal(f.cards[0].classList.contains('selected'), false);
  assert.equal(f.cards[0].raised, false);
  assert.equal(f.cards[1].raised, true);
  assert.equal(f.ui.selected.targets.length, 0);
  assert.equal(f.target.classList.contains('selected'), false);
  assert.equal(f.player.getCards().length, 3);
  assert.equal(f.commits(), 0);
  f.click(f.cards[1]);
  assert.equal(f.ui.selected.cards.length, 0, 'clicking the selected card still cancels');
  assert.ok(f.cards.every(card => !card.dataset.sgsSwitchable));
});

test('an illegal card does not discard the previous card or target selection', () => {
  const f = fixture();
  f.click(f.cards[0]); f.selectTarget();
  f.click(f.cards[2]);
  assert.deepEqual([...f.ui.selected.cards], [f.cards[0]]);
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  assert.equal(f.cards[2].dataset.sgsSwitchable, undefined);
  assert.equal(f.commits(), 0);
});

test('native recheck rejects changed skill legality and restores the prior choice', () => {
  const f = fixture({ skill: 'single_card_view_as' });
  f.click(f.cards[0]); f.selectTarget();
  f.cards[1].legal = false;
  f.click(f.cards[1]);
  assert.deepEqual([...f.ui.selected.cards], [f.cards[0]]);
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  assert.equal(f.cards[1].dataset.sgsSwitchable, undefined);
  assert.equal(f.commits(), 0);
});

test('native multi-card skills and discards continue adding cards instead of replacing them', () => {
  for (const name of ['chooseToUse', 'chooseCard']) {
    const f = fixture({ name, range: [1, 3], skill: 'zhiheng' });
    f.click(f.cards[0]); f.click(f.cards[1]);
    assert.deepEqual([...f.ui.selected.cards], [f.cards[0], f.cards[1]]);
    assert.ok(f.cards.every(card => !card.dataset.sgsSwitchable));
  }
});

test('single-card responses and simple view-as skills can switch without auto-confirming', () => {
  for (const skill of [undefined, 'longdan']) {
    const f = fixture({ name: 'chooseToRespond', skill });
    f.click(f.cards[0]); f.click(f.cards[1]);
    assert.deepEqual([...f.ui.selected.cards], [f.cards[1]]);
    assert.equal(f.commits(), 0);
  }
});

test('AI, custom handlers and complex card selections retain native handling', () => {
  for (const kind of ['ai', 'custom', 'complex']) {
    const f = fixture();
    f.click(f.cards[0]);
    let customCard;
    if (kind === 'ai') f.event.isMine = () => false;
    if (kind === 'custom') f.event.custom.replace.card = card => { customCard = card; };
    if (kind === 'complex') f.event.complexCard = true;
    f.click(f.cards[1]);
    assert.deepEqual([...f.ui.selected.cards], [f.cards[0]]);
    if (kind === 'custom') assert.equal(customCard, f.cards[1]);
  }
});
