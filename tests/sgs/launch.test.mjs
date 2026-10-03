import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLaunch, engineSettings, attachInitialIdentity } from '../../apps/core/sgs/launch-config.mjs';
test('invalid saved state cannot select unavailable counts, roles or resource paths', () => {
  assert.deepEqual(normalizeLaunch({generalId:'../secrets',pack:'../../',playerCount:999,identity:'admin',speed:'invalid'}), {generalId:'caocao',pack:'standard',playerCount:8,identity:'random',mode:'identity',landlordRole:'landlord',speed:'normal'});
  assert.equal(normalizeLaunch({generalId:'dc_zhouxuān'}).generalId, 'dc_zhouxuān');
});
test('fresh identity configuration includes AI candidate counts and disables the duplicate native opening prompt', () => {
  const settings = engineSettings(normalizeLaunch({generalId:'dc_sb_zhouyu',pack:'xianding',playerCount:8,identity:'zhu'}));
  assert.equal(settings.mode, 'identity');
  assert.equal(settings.player_number_mode_config_identity, '8');
  assert.deepEqual(settings.continue_name, ['dc_sb_zhouyu']);
  for (const identity of ['zhu','zhong','fan','nei']) assert.ok(settings[`choice_${identity}_mode_config_identity`] >= 1);
  assert.equal(settings.change_card_mode_config_identity, 'disabled');
  assert.equal(settings.new_tutorial, true);
  assert.equal(settings.auto_confirm, false);
  assert.equal(settings.enable_drag, false);
  assert.deepEqual(settings.cards, ['standard','extra']);
  assert.ok(settings.characters.includes('xianding'));
});
test('identity is attached to scheduled selection even when chooseCharacter returns nothing, then factory is restored',()=>{
  const scheduled=[];
  const game={createEvent(name){const event={name};scheduled.push(event);return event},chooseCharacter(){this.createEvent('chooseCharacter')}};
  const original=game.createEvent;
  attachInitialIdentity(game,'fan');
  assert.equal(game.createEvent('unrelated').identity,undefined);
  assert.equal(game.chooseCharacter(),undefined);
  assert.equal(scheduled[1].identity,'fan');
  assert.equal(game.createEvent,original);
  assert.equal(game.createEvent('chooseCharacter').identity,undefined);
  attachInitialIdentity(game,'random');
  assert.equal(game.createEvent,original);
});
