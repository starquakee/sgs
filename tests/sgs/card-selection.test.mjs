import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { installCardSelectionSwitch, installUniqueCardTarget } from '../../apps/core/sgs/card-selection.mjs';
import { installManualConfirmation } from '../../apps/core/sgs/experience.mjs';
import { installSelectedTiesuoRecast } from '../../apps/core/sgs/card-recast.mjs';
import { installCardDrag } from '../../apps/core/sgs/card-drag.mjs';
import { Node } from './helpers/client-dom.mjs';

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

// Use pinned native skill entry, skill/ok/cancel handlers and event backup/restore.
function recastFixture() {
  const f = fixture({ uniqueTarget: true });
  const scope = [f.lib, f.game, f.ui, f.get, f._status, class {}];
  const skillSource = readFileSync(new URL('../../apps/core/noname/library/skill.js', import.meta.url), 'utf8');
  const entry = skillSource.slice(skillSource.indexOf('\t_recasting: {'), skillSource.indexOf('\t_lianhuan: {'));
  f.lib.skill._recasting = new Function('lib', 'game', 'get', '_status', `return ({${entry}})._recasting;`)(f.lib, f.game, f.get, f._status);
  f.lib.skill.global.push('_recasting');
  const librarySource = readFileSync(new URL('../../apps/core/noname/library/index.js', import.meta.url), 'utf8');
  f.lib.filter.filterEnable = method(librarySource, 'filterEnable(event, player, skill)', '\n\t\t/**', scope);
  const eventSource = readFileSync(new URL('../../apps/core/noname/library/element/gameEvent.ts', import.meta.url), 'utf8');
  f.event.backup = method(eventSource, 'backup(skill)', '\n\trestore()', scope);
  f.event.restore = method(eventSource, 'restore()', '\n\t// #endregion', scope);
  f.event.type = 'phase';
  f.event.selectTarget = [1, 2];
  f.player.storage = {};
  f.player.hasCard = filter => f.player.getCards('h').some(filter);
  f.player.canRecast = card => card.recastAllowed === true;
  f.cards[0].name = 'tiesuo';
  f.cards[0].recastAllowed = true;
  for (const card of f.cards) card.recheck = () => {};
  f.get.name = card => card.effectiveName || card.name;
  f.get.filter = value => value;
  f.get.translation = value => value;
  f.get.event = () => f._status.event;
  f.get.links = () => [];
  f.get.objtype = value => value?.close ? 'div' : undefined;
  f.lib.dynamicTranslate = {}; f.lib.translate = {};
  f.ui.create.dialog = () => ({ close() {} });
  f.ui.create.skills2 = () => {};
  for (const [signature, end] of [['skill(skill)', '\n\tok(node)'], ['ok(node)', '\n\tcancel(node)'], ['cancel(node)', '\n\tlogv(e)']]) {
    f.ui.click[signature.split('(')[0]] = method(clickSource, signature, end, scope);
  }
  const controls = [];
  let resumed = 0;
  f.game.resume = () => resumed++;
  f.ui.create.control = (text, custom) => {
    const button = { attributes: {}, listeners: {}, setAttribute(key, value) { this.attributes[key] = value; }, addEventListener(key, fn) { this.listeners[key] = fn; }, click: () => custom() };
    const control = { text, custom, firstChild: button, classList: classes(), open: true,
      close() { this.open = false; }, remove() { this.open = false; } };
    controls.push(control);
    return control;
  };
  const controller = installSelectedTiesuoRecast(f);
  f.game.check();
  return { ...f, controller, controls, active: () => controls.filter(control => control.open), resumed: () => resumed };
}

test('selecting Iron Chain exposes recast without changing native targets, then hands the same card to native confirmation', () => {
  const f = recastFixture();
  assert.equal(f.active().length, 0);
  f.click(f.cards[0]);
  assert.equal(f.active().length, 1);
  assert.equal(f.active()[0].text, '重铸此牌');
  assert.equal(f.event.skill, undefined);
  assert.equal(f.ui.selected.targets.length, 0, 'Iron Chain keeps its native optional target choice');
  f.selectTarget();
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  f.game.check();
  assert.equal(f.active().length, 1, 'repeated checks do not duplicate the action');
  assert.equal(f.confirm().includes('o'), true, 'normal linking still has native confirmation');
  f._status.clicked = true; // Native control click has already set this guard.
  f.active()[0].custom();
  assert.equal(f.event.skill, '_recasting');
  assert.deepEqual([...f.ui.selected.cards], [f.cards[0]], 'no need to select the same card again');
  assert.equal(f.ui.selected.targets.length, 0, 'native skill entry clears former link targets');
  assert.equal(f.confirm().includes('o'), true);
  assert.equal(f.active().length, 0);
  assert.equal(f.commits(), 0);
  assert.equal(f.resumed(), 0);
  assert.equal(f._status.clicked, true);
  f.ui.click.ok();
  assert.equal(f.resumed(), 1, 'only a separate manual confirmation submits the native action');
  assert.equal(f.event.result.skill, '_recasting');
  assert.deepEqual(f.event.result.cards, [f.cards[0]]);
  assert.equal(f.event.result.targets.length, 0);
  f.controller.dispose();
});

test('canceling native recast restores normal Iron Chain selection, switching or deselecting removes the shortcut', () => {
  const f = recastFixture();
  f.click(f.cards[0]); f.active()[0].custom();
  f.ui.click.cancel();
  assert.equal(f.event.skill, undefined);
  assert.equal(f.ui.selected.cards.length, 0);
  assert.equal(f.resumed(), 0);
  f.click(f.cards[0]);
  const stale = f.active()[0];
  f.click(f.cards[1]);
  assert.equal(f.active().length, 0);
  stale.custom();
  assert.deepEqual([...f.ui.selected.cards], [f.cards[1]]);
  assert.equal(f.event.skill, undefined);
  f.click(f.cards[0]); f.click(f.cards[0]);
  assert.equal(f.active().length, 0);
  f.controller.dispose();
});

test('Iron Chain shortcut obeys native recast restrictions and excludes response, AI, view-as and custom/multiple costs', () => {
  for (const kind of ['forbidden', 'skillBanned', 'response', 'ai', 'auto', 'viewAs', 'effectiveName', 'multiple', 'complex', 'custom', 'notInHand']) {
    const f = recastFixture();
    f.click(f.cards[0]);
    const stale = f.active()[0];
    if (kind === 'forbidden') f.cards[0].recastAllowed = false;
    if (kind === 'skillBanned') f.player.storage.temp_ban__recasting = true;
    if (kind === 'response') f.event.type = 'respond';
    if (kind === 'ai') f.event.isMine = () => false;
    if (kind === 'auto') f._status.auto = true;
    if (kind === 'viewAs') f.event.skill = 'other_view_as';
    if (kind === 'effectiveName') f.cards[0].effectiveName = 'sha';
    if (kind === 'multiple') f.event.selectCard = [1, 2];
    if (kind === 'complex') f.event.complexCard = true;
    if (kind === 'custom') f.event.custom.add.card = () => {};
    if (kind === 'notInHand') f.player.getCards = () => f.cards.slice(1);
    stale.custom();
    assert.equal(f.active().length, 0, kind);
    assert.notEqual(f.event.skill, '_recasting', kind);
    assert.equal(f.resumed(), 0, kind);
    f.controller.dispose();
  }
});

test('recast entry never marks an illegal card selectable and disposal removes its hooks and stale actions', () => {
  const f = recastFixture();
  f.click(f.cards[0]);
  const stale = f.active()[0];
  f.cards[0].respondable = false; // Native Check.card may reject after the skill backup.
  stale.custom();
  assert.equal(f.event.skill, '_recasting');
  assert.equal(f.ui.selected.cards.length, 0);
  assert.equal(f.cards[0].classList.contains('selectable'), false);
  assert.equal(f.resumed(), 0);
  f.ui.click.cancel(); f.cards[0].respondable = true; f.game.check(); f.click(f.cards[0]);
  const end = f.lib.hooks.checkEnd.length, uncheck = f.lib.hooks.uncheckBegin.length;
  f.controller.dispose(); f.controller.dispose();
  assert.equal(f.lib.hooks.checkEnd.length, end - 1);
  assert.equal(f.lib.hooks.uncheckBegin.length, uncheck - 1);
  assert.equal(f.active().length, 0);
  stale.custom();
  assert.equal(f.resumed(), 0);
});

// Exercise the production mouse listeners with the pinned native choice checker,
// card/target/ok handlers and the native compatibility mousedown/mouseup sequence.
function dragFixture() {
  const f = fixture();
  f.event.type = 'phase';
  f.lib.config.enable_drag = false;
  const document = new Node('document'), host = new Node('window');
  document.body = new Node('body'); document.hidden = false;
  document.createElement = tag => Object.assign(new Node(tag), { style: {} });
  let hit, controller, resumed = 0, nextTask = 0;
  const tasks = new Map(), frames = new Map(), listeners = [];
  host.setTimeout = fn => { tasks.set(++nextTask, fn); return nextTask; };
  host.clearTimeout = id => tasks.delete(id);
  host.requestAnimationFrame = fn => { frames.set(++nextTask, fn); return nextTask; };
  host.cancelAnimationFrame = id => frames.delete(id);
  document.addEventListener = (type, fn, capture) => listeners.push({ type, fn, capture: !!capture });
  document.removeEventListener = (type, fn) => { const i = listeners.findIndex(x => x.type === type && x.fn === fn); if (i >= 0) listeners.splice(i, 1); };
  document.elementFromPoint = () => hit;
  document.querySelectorAll = () => [];
  const rect = (left, top, width = 100, height = 150) => ({ left, top, right: left + width, bottom: top + height, width, height });
  f.cards.forEach((card, i) => { card.getBoundingClientRect = () => rect(100 + i * 110, 400); });
  f.game.players.forEach((player, i) => { player.getBoundingClientRect = () => rect(100 + i * 300, 50); });
  f.ui.window = { querySelectorAll: () => [] }; f.ui.controls = [];
  f.ui.shortcut = { classList: classes() }; f.ui.shortcut.classList.add('hidden');
  f.game.closePopped = () => {}; f.game.documentZoom = 1.25;
  f.game.resume = () => { resumed++; };
  f.game.checkMod = () => {};
  f.get.event = () => f._status.event;
  f.get.links = () => [];
  f.get.autoViewAs = card => ({ name: card.name, cards: [card] });
  f.get.copy = value => value && structuredClone(value);
  f.get.player = () => f.player;
  f.get.utc = () => 1;
  f.get.itemtype = item => f.cards.includes(item) ? 'card' : f.game.players.includes(item) ? 'player' : Array.isArray(item) ? 'select' : undefined;
  const cardInfo = { filterTarget: true, selectTarget: 1 };
  f.get.info = item => typeof item === 'string' ? f.lib.skill[item] || {} : cardInfo;
  const scope = [f.lib, f.game, f.ui, f.get, f._status, class {}];
  const librarySource = readFileSync(new URL('../../apps/core/noname/library/index.js', import.meta.url), 'utf8');
  f.lib.filter.selectTarget = method(librarySource, 'selectTarget(card, player)', '\n\t\t/**', scope);
  f.ui.click.ok = method(clickSource, 'ok(node)', '\n\tcancel(node)', scope);
  f.ui.click.window = method(clickSource, 'window()', '\n\ttoggle()', scope);
  for (const [name, end] of [['windowmousedown', '\n\tcardtouchstart('], ['windowmouseup', '\n\tmousemove(']]) {
    const start = clickSource.indexOf(`\t${name}(`), finish = clickSource.indexOf(end, start);
    f.ui.click[name] = new Function('lib', 'game', 'ui', 'get', '_status', 'document', 'window', `return {${clickSource.slice(start, finish)}}.${name}`)(f.lib, f.game, f.ui, f.get, f._status, document, host);
  }
  installUniqueCardTarget({ ...f, isDragging: () => !!controller?.selecting });
  document.addEventListener('mousedown', f.ui.click.windowmousedown);
  document.addEventListener('mouseup', f.ui.click.windowmouseup);
  controller = installCardDrag(f, { document, host });
  const emit = (type, node, properties = {}) => {
    hit = node;
    const box = node?.getBoundingClientRect?.() || rect(750, 300);
    const event = { type, target: node, button: 0, buttons: type === 'mouseup' ? 0 : 1, detail: 1,
      clientX: box.left + box.width / 2, clientY: box.top + box.height / 2,
      preventDefault() { this.defaultPrevented = true; }, stopImmediatePropagation() { this.stopped = true; }, stopPropagation() { this.stopped = true; }, ...properties };
    for (const capture of [true, false]) {
      if (!capture && type === 'click' && !event.stopped) {
        if (f.cards.includes(node)) f.ui.click.card.call(node);
        else if (f.game.players.includes(node)) f.ui.click.target.call(node, event);
        f.ui.click.window();
      }
      for (const listener of [...listeners]) if (!event.stopped && listener.type === type && listener.capture === capture) listener.fn(event);
    }
    return event;
  };
  const tick = () => { for (const [id, fn] of [...frames]) { frames.delete(id); fn(); } };
  const flush = () => { for (const [id, fn] of [...tasks]) { tasks.delete(id); fn(); } };
  const ordinaryClick = card => { emit('mousedown', card); emit('mouseup', card); emit('click', card); flush(); };
  return { ...f, document, host, controller, emit, tick, flush, ordinaryClick, cardInfo,
    resumed: () => resumed, listeners, frames,
    down: card => emit('mousedown', card), move: target => emit('mousemove', target), up: target => emit('mouseup', target) };
}

test('dragging a physical Slash or single-target trick commits only through the actual native ok handler on release', () => {
  for (const name of ['sha', 'shunshou', 'lebu']) {
    const f = dragFixture(); f.cards[0].name = name;
    f.event.selectTarget = f.lib.filter.selectTarget;
    f.down(f.cards[0]);
    assert.equal(f.ui.selected.cards.length, 0, 'press alone leaves native click behavior intact');
    f.move(f.target);
    assert.deepEqual([...f.ui.selected.cards], [f.cards[0]]);
    assert.deepEqual([...f.ui.selected.targets], [f.target]);
    assert.equal(f.resumed(), 0, 'hover is not a commit');
    f.up(f.target);
    assert.equal(f.resumed(), 1);
    assert.equal(f.event.result.bool, true);
    assert.equal(f.event.result.card.name, name);
    assert.deepEqual(f.event.result.cards, [f.cards[0]]);
    assert.deepEqual(f.event.result.targets, [f.target]);
    assert.equal(f.ui.selected.cards.length, 0, 'native ok unchecks selection');
    assert.equal(f._status.mousedown, false, 'native mouseup bookkeeping still runs');
    assert.equal(f.document.body.children.length, 0, 'owned drag visual is removed');
    f.controller.dispose();
  }
});

test('empty and illegal drag endpoints never use the preselected sole target', () => {
  for (const endpoint of ['empty', 'self', 'outside']) {
    const f = dragFixture(); f.down(f.cards[0]); f.move(f.target);
    const node = endpoint === 'self' ? f.player : endpoint === 'outside' ? f.target : null;
    f.emit('mouseup', node, endpoint === 'outside' ? { clientX: 900, clientY: 300 } : {});
    assert.equal(f.resumed(), 0, endpoint);
    assert.equal(f.ui.selected.targets.length, 0, endpoint);
    assert.equal(f.document.body.children.length, 0, endpoint);
    f.controller.dispose();
  }
});

test('hovering the same target does not toggle it, and moving to another target uses only the release target', () => {
  const f = dragFixture(), other = extraTarget(3);
  other.getBoundingClientRect = () => ({ left: 700, top: 50, right: 800, bottom: 200, width: 100, height: 150 });
  f.game.players.push(other); f.game.check();
  f.down(f.cards[0]); f.move(f.target); f.move(f.target);
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  f.move(other);
  assert.deepEqual([...f.ui.selected.targets], [other]);
  f.up(other);
  assert.deepEqual(f.event.result.targets, [other]);
  assert.equal(f.resumed(), 1);
  f.controller.dispose();
});

test('already selected cards and bright direct-switch candidates can be dragged without forcing selectable', () => {
  for (const switchCard of [false, true]) {
    const f = dragFixture(); f.ordinaryClick(f.cards[0]);
    const card = f.cards[switchCard ? 1 : 0];
    if (switchCard) {
      assert.equal(card.classList.contains('selectable'), false);
      assert.equal(card.dataset.sgsSwitchable, 'true');
    }
    f.down(card); f.move(f.target); f.up(f.target);
    assert.equal(f.resumed(), 1);
    assert.deepEqual(f.event.result.cards, [card]);
    f.controller.dispose();
  }
});

test('ordinary click and tiny motion retain sole-target assistance and manual confirmation', () => {
  const f = dragFixture(); f.down(f.cards[0]);
  const box = f.cards[0].getBoundingClientRect();
  f.emit('mousemove', f.cards[0], { clientX: box.left + box.width / 2 + 3 });
  f.up(f.cards[0]); f.emit('click', f.cards[0]);
  assert.deepEqual([...f.ui.selected.cards], [f.cards[0]]);
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  assert.equal(f.resumed(), 0);
  f.ordinaryClick(f.cards[0]);
  assert.equal(f.ui.selected.cards.length, 0);
  f.controller.dispose();
});

test('release checks current native card and target legality even after the original choice cache is populated', () => {
  for (const kind of ['cardFilter', 'cardRespondable', 'targetFilter', 'targetOut', 'filterOk']) {
    const f = dragFixture(); f.down(f.cards[0]); f.move(f.target);
    const caches = [f.event._cardChoice, f.event._targetChoice];
    assert.ok(caches.every(Boolean));
    if (kind === 'cardFilter') f.cards[0].legal = false;
    if (kind === 'cardRespondable') f.cards[0].respondable = false;
    if (kind === 'targetFilter') f.event.filterTarget = () => false;
    if (kind === 'targetOut') f.target.isOut = () => true;
    if (kind === 'filterOk') f.event.filterOk = () => false;
    assert.equal(f.cards[0].classList.contains('selected'), true);
    assert.equal(f.target.classList.contains('selected'), true);
    f.up(f.target);
    assert.equal(f.resumed(), 0, kind);
    assert.equal(f.event.result, undefined, kind);
    assert.equal(f.ui.selected.targets.length, 0, kind);
    assert.equal(f.event._cardChoice, caches[0], 'do not rewrite native caches');
    assert.equal(f.event._targetChoice, caches[1], 'do not rewrite native caches');
    f.controller.dispose();
  }
});

test('the generated drag click is consumed while the next independent mouse or keyboard click remains usable', () => {
  const f = dragFixture(); f.down(f.cards[0]); f.move(f.target); f.up(null);
  assert.equal(f.emit('click', f.cards[0]).stopped, true);
  assert.deepEqual([...f.ui.selected.cards], [f.cards[0]]);
  assert.notEqual(f._status.clicked, true);
  f.ordinaryClick(f.cards[0]);
  assert.equal(f.ui.selected.cards.length, 0, 'a new mousedown clears any suppression');
  f.down(f.cards[0]); f.move(f.target); f.up(null);
  assert.notEqual(f.emit('click', f.cards[0], { detail: 0 }).stopped, true, 'keyboard click is not a drag-generated click');
  assert.equal(f.ui.selected.cards.length, 0);
  f.flush();
  assert.notEqual(f.emit('click', f.cards[0]).stopped, true, 'suppression expires when no click follows the drag');
  assert.deepEqual([...f.ui.selected.cards], [f.cards[0]]);
  assert.equal(f.resumed(), 0);
  f.controller.dispose();
});

test('Escape cancels the gesture, preserves IME composition and restores native confirm controls after mouseup', () => {
  const f = dragFixture(); f.down(f.cards[0]); f.move(f.target);
  f.emit('keydown', null, { key: 'Escape', isComposing: true });
  assert.equal(f.controller.selecting, true);
  const cancelled = f.emit('keydown', null, { key: 'Escape' });
  assert.equal(cancelled.defaultPrevented, true);
  assert.equal(f.controller.selecting, false);
  assert.equal(f.ui.selected.targets.length, 0);
  f.up(f.target);
  assert.equal(f._status.mousedown, false);
  assert.equal(f.confirm().includes('o'), false, 'an invalid partial choice cannot keep an old ok button');
  assert.equal(f.confirm(), '', 'native incomplete-card confirmation replaces the previous controls');
  assert.equal(f.emit('click', f.target).stopped, true, 'release after cancellation does not reselect a target');
  assert.equal(f.resumed(), 0);
  f.controller.dispose();
});

test('pause, visibility, blur, selection changes and disposal remove drag visuals without committing or clearing a new choice', () => {
  for (const kind of ['pause', 'auto', 'over', 'hidden', 'blur', 'event', 'skill', 'card', 'cardName', 'lostCard', 'lostButton', 'dispose']) {
    const f = dragFixture(); f.down(f.cards[0]); f.move(f.target);
    assert.equal(f.document.body.children.length, 1);
    if (kind === 'pause') f._status.paused2 = true;
    if (kind === 'auto') f._status.auto = true;
    if (kind === 'over') f._status.over = true;
    if (kind === 'hidden') { f.document.hidden = true; f.emit('visibilitychange', null); }
    if (kind === 'blur') f.host.emit('blur');
    if (kind === 'event') f._status.event = { ...f.event };
    if (kind === 'skill') f.event.skill = 'longdan';
    if (kind === 'card') f.ui.selected.cards.splice(0, 1, f.cards[1]);
    if (kind === 'cardName') f.cards[0].name = 'shan';
    if (kind === 'lostCard') f.player.getCards = () => f.cards.slice(1);
    if (kind === 'lostButton') f.emit('mousemove', null, { buttons: 0 });
    if (kind === 'dispose') f.controller.dispose();
    const before = [...f.ui.selected.cards];
    f.tick(); f.up(f.target);
    assert.equal(f.resumed(), 0, kind);
    assert.equal(f.controller.selecting, false, kind);
    assert.equal(f.document.body.children.length, 0, kind);
    assert.deepEqual([...f.ui.selected.cards], before, `${kind}: cancellation leaves the native card choice alone`);
    f.controller.dispose();
    assert.equal(f.frames.size, 0, kind);
    assert.equal(f.listeners.length, 2, 'only original native mouse listeners remain');
  }
});

test('responses, skills, complex/multiple/custom choices, other mouse buttons and non-hand cards stay outside drag handling', () => {
  for (const kind of ['response', 'notPhase', 'skill', 'viewAs', 'complexCard', 'complexTarget', 'complexSelect', 'multitarget', 'multiCard', 'multiTarget', 'optionalTarget', 'allTarget', 'targetFunction', 'cardComplexTarget', 'cardComplexSelect', 'cardMultitarget', 'notarget', 'singleCard', 'customCard', 'customTarget', 'customConfirm', 'filterButton', 'selectedButton', 'virtual', 'notHand', 'illegal', 'noclick', 'ai', 'right', 'middle', 'touchscreen']) {
    const f = dragFixture();
    if (kind === 'response') f.event.name = 'chooseToRespond';
    if (kind === 'notPhase') f.event.type = 'respond';
    if (kind === 'skill' || kind === 'viewAs') f.event.skill = 'longdan';
    if (['complexCard', 'complexTarget', 'complexSelect', 'multitarget'].includes(kind)) f.event[kind] = true;
    if (kind === 'multiCard') f.event.selectCard = [1, 2];
    if (kind === 'multiTarget') f.event.selectTarget = [1, 2];
    if (kind === 'optionalTarget') f.event.selectTarget = [0, 1];
    if (kind === 'allTarget') f.event.selectTarget = [1, -1];
    if (kind === 'targetFunction') f.event.selectTarget = () => [1, 1];
    if (kind.startsWith('card')) f.cardInfo[kind.slice(4, 5).toLowerCase() + kind.slice(5)] = true;
    if (['notarget', 'singleCard'].includes(kind)) f.cardInfo[kind] = true;
    if (kind.startsWith('custom')) f.event.custom.add[kind.slice(6).toLowerCase()] = () => {};
    if (kind === 'filterButton') f.event.filterButton = () => true;
    if (kind === 'selectedButton') f.ui.selected.buttons.push({});
    if (kind === 'virtual') f.event._get_card = { name: 'sha' };
    if (kind === 'notHand') f.player.getCards = zone => zone === 'h' ? f.cards.slice(1) : f.cards;
    if (kind === 'illegal') f.cards[0].classList.remove('selectable');
    if (kind === 'noclick') f.cards[0].classList.add('noclick');
    if (kind === 'ai') f.event.isMine = () => false;
    if (kind === 'touchscreen') f.lib.config.touchscreen = true;
    f.emit('mousedown', f.cards[0], { button: kind === 'right' ? 2 : kind === 'middle' ? 1 : 0 });
    const moved = f.move(f.target);
    f.up(f.target);
    assert.equal(f.resumed(), 0, kind);
    assert.equal(f.ui.selected.cards.length, 0, kind);
    assert.equal(f.document.body.children.length, 0, kind);
    assert.notEqual(moved.stopped, true, kind);
    f.controller.dispose();
  }
});

test('nested portrait children use viewport coordinates and released self-only cards honor native filters', () => {
  const f = dragFixture(), child = { parentNode: f.target };
  f.event.filterTarget = (_card, player, target) => target === player;
  f.event._targetChoice = undefined; f.game.check();
  f.down(f.cards[0]);
  const box = f.player.getBoundingClientRect();
  const event = { clientX: box.left + 20, clientY: box.top + 30 };
  child.parentNode = f.player;
  f.emit('mousemove', child, event); f.emit('mouseup', child, event);
  assert.equal(f.resumed(), 1);
  assert.deepEqual(f.event.result.targets, [f.player]);
  assert.equal(f.game.documentZoom, 1.25, 'coordinates were not rescaled by the engine zoom');
  f.controller.dispose();
});

test('an event change during a native release check cannot confirm or modify the replacement choice', () => {
  const f = dragFixture(); f.down(f.cards[0]); f.move(f.target);
  const next = { ...f.event };
  let changed = false;
  f.lib.hooks.checkCard.push(() => {
    if (!changed) { changed = true; f._status.event = next; }
  });
  f.up(f.target);
  assert.equal(f.resumed(), 0);
  assert.equal(next.result, undefined);
  assert.equal(f.event.result, undefined);
  assert.equal(f.ui.selected.cards.length, 0, 'release never clicks into the newer event');
  f.controller.dispose();
});

test('native target-uncheck callbacks cannot make drag release check or select into a replacement event', () => {
  const f = dragFixture(); f.down(f.cards[0]); f.move(f.target);
  const next = { ...f.event }, checked = [];
  const nativeCheck = f.game.check;
  f.game.check = function (...args) { checked.push(f._status.event); return nativeCheck.apply(this, args); };
  f.lib.hooks.uncheckBegin.push((_event, kinds) => {
    if (kinds.length === 1 && kinds[0] === 'target') f._status.event = next;
  });
  f.up(f.target);
  assert.equal(f.resumed(), 0);
  assert.equal(checked.includes(next), false, 'do not check the replacement event after an old selection hook');
  assert.equal(next.result, undefined);
  f.controller.dispose();
});

test('a replacement card selection immediately before release keeps its native targets', () => {
  const f = dragFixture(); f.down(f.cards[0]); f.move(f.target);
  f.ui.selected.cards.splice(0, 1, f.cards[1]);
  f.cards[0].classList.remove('selected'); f.cards[1].classList.add('selected');
  f.up(f.target); // No monitor tick: release must independently respect ownership.
  assert.equal(f.resumed(), 0);
  assert.deepEqual([...f.ui.selected.cards], [f.cards[1]]);
  assert.deepEqual([...f.ui.selected.targets], [f.target]);
  f.controller.dispose();
});
