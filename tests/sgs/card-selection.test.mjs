import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installCardSelectionSwitch, installUniqueCardTarget } from '../../apps/core/sgs/card-selection.mjs';
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
function fixture({ name = 'chooseToUse', range = [1, 1], skill, complexCard = false, uniqueTarget = false } = {}) {
  const cards = ['sha', 'huogong', 'shan'].map((name, index) => ({
    name, cardid: index + 1, legal: index < 2, classList: classes(), dataset: {},
    parentNode: { classList: classes() }, updateTransform(selected) { this.raised = !!selected; },
  }));
  const player = { node: { equips: { classList: classes(), querySelector: () => null } },
    getCards: () => cards, getSkills: () => [], isOut: () => false, classList: classes(), unprompt() {} };
  const target = { classList: classes(), isOut: () => false, unprompt() {}, playerid: 2 };
  let commits = 0, confirm = '';
  function autoConfirm(_event, state) { if (state.ok && state.auto) commits++; }
  const lib = { config: { auto_confirm: true }, skill: { global: [] }, filter: {
    cardAiIncluded: () => true, cardRespondable: card => card.respondable !== false,
  }, hooks: { checkBegin: [], checkCard: [], checkTarget: [], checkEnd: [autoConfirm], uncheckBegin: [] } };
  if (skill) lib.skill[skill] = skill === 'longdan' ? { viewAs: { name: 'sha' } } : {};
  const ui = { click: {}, selected: { cards: selection(), targets: selection(), buttons: selection() },
    arena: { classList: classes(), offsetWidth: 1000, offsetHeight: 600 }, canvas: {},
    create: { confirm: value => { confirm = value; } }, touchlines: [] };
  const event = { name, player, skill, complexCard, position: 'h', selectCard: range, selectTarget: [1, 1],
    filterCard: card => card.legal, filterTarget: (_card, player, target) => target !== player, isMine: () => true,
    custom: { add: {}, replace: {} }, _skillChoice: [], _aiexclude: [] };
  const _status = { event, dragline: [], lastdragchange: [] };
  const get = {
    select: value => typeof value === 'function' ? value() : typeof value === 'number' ? [value, value] : value || [1, 1],
    info: item => typeof item === 'string' ? lib.skill[item] || {} : {}, card: () => ui.selected.cards[0],
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
  ui.click.target = method(clickSource, 'target(e)', '\n\tcontrol2()', scope);
  installManualConfirmation(lib, ui);
  installCardSelectionSwitch({ lib, game, ui, get, _status });
  if (uniqueTarget) installUniqueCardTarget({ game, ui, get, _status });
  game.check();
  const click = card => { _status.clicked = false; ui.click.card.call(card); };
  const selectTarget = () => { ui.selected.targets.add(target); target.classList.add('selected'); game.check(); };
  const clickTarget = target => { _status.clicked = false; ui.click.target.call(target); };
  return { cards, player, target, event, _status, ui, game, get, lib, click, clickTarget, selectTarget, commits: () => commits, confirm: () => confirm };
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

const extraTarget = id => ({ playerid: id, classList: classes(), isOut: () => false, unprompt() {} });

async function qinglongFixture({ uniqueTarget = true } = {}) {
  const f = fixture({ uniqueTarget });
  const standardSource = readFileSync(new URL('../../apps/core/card/standard.js', import.meta.url), 'utf8')
    .replace(/^import .*?;\r?\n/gm, '').replace(/^export const type = .*?;\r?\n/gm, '').replace('export default', 'return');
  const standard = new Function('lib', 'game', 'ui', 'get', 'ai', '_status', standardSource)(f.lib, f.game, f.ui, f.get, {}, f._status);
  f.get.name = card => card.name;
  f.get.prompt2 = () => '青龙偃月刀：是否继续出杀？';
  f.player.hasSkill = () => true;
  f.lib.filter.filterCard = card => card.legal;
  f.lib.filter.filterTarget = (card, player, target) => target !== player;
  f.player.chooseToUse = options => Object.assign(f.event, options, {
    set(key, value) { this[key] = value; return this; },
  });
  await standard.skill.qinglong_skill.content({ name: 'qinglong_skill' }, { target: f.target }, f.player);
  f.game.check();
  return f;
}

test('native Qinglong manual target selection keeps the confirmation hook usable', async () => {
  const f = await qinglongFixture({ uniqueTarget: false });
  assert.equal(f.ui.selected.cards.length, 0);
  assert.equal(f.ui.selected.targets.length, 0);
  f.click(f.cards[0]);
  assert.equal(f.target.classList.contains('selectable'), true);
  assert.equal(f.confirm(), '');
  f.clickTarget(f.target);
  assert.equal(f.confirm().includes('o'), true);
  assert.equal(f.commits(), 0);
});

test('native Qinglong follow-up Slash selects its required defender and exposes manual confirmation', async () => {
  const f = await qinglongFixture();
  f.game.players.push(extraTarget(3));
  f.click(f.cards[0]);
  assert.equal(f.confirm().includes('o'), true, 'the native confirm button must appear after selecting the follow-up Slash');
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  assert.equal(f.commits(), 0, 'preselecting the defender must not fire the Slash');
  assert.equal(f.event.addCount, false, 'native follow-up must not consume the phase Slash limit');
  f.cards[1].name = 'sha';
  f.click(f.cards[1]);
  assert.deepEqual([...f.ui.selected.cards], [f.cards[1]]);
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  assert.equal(f.confirm().includes('o'), true, 'direct Slash switching preserves a usable confirmation');
  f.clickTarget(f.target);
  f.game.check();
  assert.equal(f.ui.selected.targets.length, 0, 'manual cancellation retains native complex-selection cleanup');
  assert.equal(f.ui.selected.cards.length, 0);
  f.click(f.cards[0]);
  assert.equal(f.confirm().includes('o'), true, 'a fresh follow-up selection can preselect again');
  assert.equal(f.commits(), 0);
});

test('Qinglong assistance cannot bypass native legality or optional/multiple target choices', async () => {
  for (const kind of ['illegal', 'optional', 'multiple', 'otherComplex', 'differentSource']) {
    const f = await qinglongFixture();
    if (kind === 'illegal') f.lib.filter.filterTarget = () => false;
    if (kind === 'optional') f.event.selectTarget = [0, 1];
    if (kind === 'multiple') f.event.selectTarget = [1, 2];
    if (kind === 'otherComplex') f.event.logSkill = 'other_skill';
    if (kind === 'differentSource') {
      f.event.sourcex = extraTarget(3);
      f.event.filterTarget = (_card, _player, target) => target === f.target;
    }
    f.click(f.cards[0]);
    assert.equal(f.ui.selected.targets.length, 0, kind);
    assert.equal(f.confirm().includes('o'), false, kind);
    assert.equal(f.commits(), 0, kind);
  }
});

test('Snatch preselection obeys native gainable-card and distance checks', () => {
  const f = fixture({ uniqueTarget: true });
  const standardSource = readFileSync(new URL('../../apps/core/card/standard.js', import.meta.url), 'utf8')
    .replace(/^import .*?;\r?\n/gm, '').replace(/^export const type = .*?;\r?\n/gm, '').replace('export default', 'return');
  const standard = new Function('lib', 'game', 'ui', 'get', 'ai', '_status', standardSource)(f.lib, f.game, f.ui, f.get, {}, f._status);
  const filterSource = readFileSync(new URL('../../apps/core/noname/library/index.js', import.meta.url), 'utf8');
  const inRange = method(filterSource, 'targetInRange(card, player, target)', '\n\t\t/**', [f.lib, f.game, f.ui, f.get, f._status, class {}]);
  f.get.info = card => standard.card[card?.name];
  f.get.is.single = () => false;
  f.get.distance = (_player, target) => target.distance;
  f.game.checkMod = () => 'unchanged';
  f.lib.filter.canBeGained = card => card.gainable;
  const configure = (target, distance, gainable) => Object.assign(target, {
    distance, cards: gainable.map(value => ({ gainable: value })), hasSkill: () => false,
    hasCard(filter, position) { assert.equal(position, 'hej'); return this.cards.some(filter); },
  });
  configure(f.player, 0, [true]);
  configure(f.target, 1, [true]);
  const empty = configure(extraTarget(3), 1, []);
  const far = configure(extraTarget(4), 2, [true]);
  const protectedTarget = configure(extraTarget(5), 1, [false]);
  f.game.players.push(empty, far, protectedTarget);
  f.cards[0].name = 'shunshou';
  f.event.filterTarget = (card, player, target) => !!card
    && standard.card.shunshou.filterTarget(card, player, target) && inRange(card, player, target);
  f.game.check();
  f.click(f.cards[0]);
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  assert.equal(f.commits(), 0);
  f.clickTarget(f.target);
  f.game.check();
  assert.equal(f.ui.selected.targets.length, 0, 'manual cancellation survives native rechecking');
  f.click(f.cards[0]);
  f.target.cards = [{ gainable: false }];
  empty.cards = [{ gainable: true }];
  // Board changes occur between native choice events; a live choice caches its
  // target checks. Start a fresh event rather than overriding native legality.
  f._status.event = { ...f._status.event, _targetChoice: undefined };
  f.game.check();
  f.click(f.cards[0]);
  assert.deepEqual([...f.ui.selected.targets], [empty], 'a new choice uses current native gain permission');
  f.click(f.cards[0]);
  f.target.cards = [{ gainable: true }];
  f._status.event = { ...f._status.event, _targetChoice: undefined };
  f.game.check();
  f.click(f.cards[0]);
  assert.equal(f.ui.selected.targets.length, 0, 'two gainable in-range targets still require a choice');
  assert.equal(f.commits(), 0);
});

test('native effective-card resolution supports a simple one-card trick conversion', () => {
  const f = fixture({ uniqueTarget: true, skill: 'qixi' });
  f.lib.skill.qixi = { viewAs: { name: 'guohe' } };
  f.get.autoViewAs = (card, cards) => ({ ...card, cards });
  const getSource = readFileSync(new URL('../../apps/core/noname/get/index.js', import.meta.url), 'utf8');
  f.get.card = method(getSource, 'card(original)', '\n\t/**', [f.lib, f.game, f.ui, f.get, f._status, class {}]);
  f.click(f.cards[0]);
  assert.equal(f.cards[0].name, 'sha');
  assert.equal(f.get.card().name, 'guohe');
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  assert.equal(f.commits(), 0);
});

test('single-target basic, trick and delay cards preselect the sole native target without committing', () => {
  for (const name of ['sha', 'shunshou', 'guohe', 'juedou', 'huogong', 'lebu']) {
    const f = fixture({ uniqueTarget: true });
    f.cards[0].name = name;
    f.click(f.cards[0]);
    assert.deepEqual([...f.ui.selected.cards], [f.cards[0]]);
    assert.deepEqual([...f.ui.selected.targets], [f.target]);
    assert.equal(f.target.classList.contains('selected'), true);
    assert.equal(f._status.clicked, true, 'preserve the native card click propagation guard');
    assert.equal(f.player.getCards().length, 3);
    assert.equal(f.commits(), 0);
    f.clickTarget(f.target);
    assert.equal(f.ui.selected.targets.length, 0, 'manual target deselection must stay deselected');
    f.game.check();
    f.click(f.cards[2]);
    assert.equal(f.ui.selected.targets.length, 0, 'rechecks and illegal card clicks cannot select it again');
    f.click(f.cards[0]);
    assert.equal(f.ui.selected.cards.length, 0);
    f.click(f.cards[0]);
    assert.deepEqual([...f.ui.selected.targets], [f.target], 'a fresh card selection can assist again');
    assert.equal(f.commits(), 0);
  }
});

test('zero, multiple or self-only legal targets remain a manual choice', () => {
  for (const name of ['sha', 'shunshou']) {
    for (const count of [0, 2]) {
      const f = fixture({ uniqueTarget: true });
      f.cards[0].name = name;
      if (!count) f.event.filterTarget = () => false;
      else f.game.players.push(extraTarget(3));
      f.click(f.cards[0]);
      assert.equal(f.ui.selected.targets.length, 0);
      assert.equal(f.commits(), 0);
    }
  }
  const selfLegal = fixture({ uniqueTarget: true });
  selfLegal.event.filterTarget = () => true;
  selfLegal.click(selfLegal.cards[0]);
  assert.equal(selfLegal.ui.selected.targets.length, 0, 'a special legal self-target also counts as a choice');
  const selfOnly = fixture({ uniqueTarget: true });
  selfOnly.event.filterTarget = (_card, player, target) => target === player;
  selfOnly.click(selfOnly.cards[0]);
  assert.equal(selfOnly.ui.selected.targets.length, 0);
});

test('auto selection follows native restrictions and refreshes the target when switching cards', () => {
  const f = fixture({ uniqueTarget: true });
  const second = extraTarget(3), out = extraTarget(4);
  out.isOut = () => true;
  f.game.players.push(second, out);
  f.cards[1].name = 'sha'; f.cards[1].nature = 'fire';
  f.event.filterTarget = (card, _player, target) => target === out || target === (card === f.cards[0] ? f.target : second);
  f.click(f.cards[0]);
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  assert.equal(second.classList.contains('selectable'), false);
  assert.equal(out.classList.contains('selectable'), false);
  f.click(f.cards[1]);
  assert.deepEqual([...f.ui.selected.targets], [second]);
  assert.equal(f.target.classList.contains('selected'), false);
  f.cards[0].name = 'huogong';
  f.click(f.cards[0]);
  assert.deepEqual([...f.ui.selected.targets], [f.target], 'switching to a trick uses its own sole legal target');
  assert.equal(second.classList.contains('selected'), false);
  assert.equal(f.commits(), 0);
});

test('simple view-as Slash uses its effective name rather than the printed hand card', () => {
  const f = fixture({ uniqueTarget: true, skill: 'longdan' });
  f.cards[2].legal = true;
  f.get.card = () => f.ui.selected.cards.length ? { name: 'sha' } : undefined;
  f.game.check();
  f.click(f.cards[2]);
  assert.equal(f.cards[2].name, 'shan');
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  assert.equal(f.commits(), 0);
});

test('responses, AI, active skills, multi-card costs and complex or optional choices stay native', () => {
  for (const kind of ['response', 'ai', 'otherPlayer', 'unknownCard', 'noTarget', 'cardMultiTarget', 'activeSkill', 'multiCard', 'optionalCard', 'optional', 'multiple', 'all', 'complexCard', 'complexTarget', 'complexSelect', 'customCard', 'customTarget', 'customTargetAdd']) {
    const f = fixture({ uniqueTarget: true });
    if (kind === 'response') f.event.name = 'chooseToRespond';
    if (kind === 'ai') f.event.isMine = () => false;
    if (kind === 'otherPlayer') f.game.me = {};
    if (kind === 'unknownCard') f.get.card = () => undefined;
    if (kind === 'noTarget') f.get.info = () => ({ notarget: true });
    if (kind === 'cardMultiTarget') f.get.info = () => ({ multitarget: true });
    if (kind === 'activeSkill') f.event.skill = 'active_skill_with_card_cost';
    if (kind === 'multiCard') f.event.selectCard = [2, 2];
    if (kind === 'optionalCard') f.event.selectCard = [0, 1];
    if (kind === 'optional') f.event.selectTarget = [0, 1];
    if (kind === 'multiple') f.event.selectTarget = [1, 2];
    if (kind === 'all') f.event.selectTarget = [1, -1];
    if (kind.startsWith('complex')) f.event[kind] = true;
    if (kind === 'customCard') f.event.custom.add.card = () => {};
    if (kind === 'customTarget') f.event.custom.replace.target = () => {};
    if (kind === 'customTargetAdd') f.event.custom.add.target = () => {};
    f.click(f.cards[0]);
    if (kind === 'multiCard') f.click(f.cards[1]);
    // Negative selectTarget is selected by the original engine itself.
    assert.equal(f.ui.selected.targets.length, kind === 'all' ? 1 : 0, kind);
    assert.equal(f.commits(), 0, kind);
  }
});
