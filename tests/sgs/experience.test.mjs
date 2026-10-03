import test from 'node:test';
import assert from 'node:assert/strict';
import { installManualConfirmation, applyPortraits } from '../../apps/core/sgs/experience.mjs';

test('human cards, responses and direct skills require confirmation while AI and unrelated choices retain engine behavior', () => {
  const calls = [];
  function autoConfirm(event) { calls.push(event.name); }
  const otherHook = () => {};
  const lib = { hooks: { checkEnd: [autoConfirm, otherHook] } };
  const ui = { selected: { cards: [] } };
  installManualConfirmation(lib, ui);
  const check = (name, mine = true) => lib.hooks.checkEnd[0]({name, isMine: () => mine, skill: 'direct_view_as'}, {ok:true, auto:true, autoConfirm:true});
  check('chooseToUse');
  check('chooseToRespond');
  assert.deepEqual(calls, []);
  ui.selected.cards.push({});
  check('chooseCard');
  assert.deepEqual(calls, []);
  check('chooseToUse', false);
  ui.selected.cards.length = 0;
  check('chooseControl');
  assert.deepEqual(calls, ['chooseToUse', 'chooseControl']);
  assert.equal(lib.hooks.checkEnd[1], otherHook);
});

test('portraits use local assets for object and legacy character formats without changing rules or hidden state', () => {
  const modern = { skills:['rende'], isUnseen:true, img:'missing.jpg' };
  const legacy = ['male','shu',4,['longdan'],['img:old.jpg','hiddenSkill']];
  const packs = { standard:{character:{liubei:modern,zhaoyun:legacy}}, unavailable:{character:{npc:{skills:[]}}} };
  applyPortraits(packs, {liubei:{file:'liu.webp'},zhaoyun:{file:'zhao.webp'}});
  assert.equal(modern.img, 'sgs/portraits/liu.webp');
  assert.deepEqual(modern.skills, ['rende']);
  assert.equal(modern.isUnseen, true);
  assert.deepEqual(legacy[4], ['img:sgs/portraits/zhao.webp', 'hiddenSkill']);
  assert.deepEqual(legacy[3], ['longdan']);
});
