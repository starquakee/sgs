import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { engineSettings, normalizeLaunch } from '../../apps/core/sgs/launch-config.mjs';
import { installDoudizhuMode, seatDoudizhuPlayers } from '../../apps/core/sgs/doudizhu-mode.mjs';

// Execute functions from the pinned upstream mode rather than duplicate its rules.
const nativeSource = readFileSync(new URL('../../apps/core/mode/doudizhu.js', import.meta.url), 'utf8')
  .replace(/^import .*?;\r?\n/gm, '').replace('export const type = "mode";', '').replace('export default', 'return');

function fixture(role = 'landlord') {
  const launch = normalizeLaunch({ mode: 'doudizhu', landlordRole: role, generalId: 'caocao' });
  const settings = engineSettings(launch);
  const players = Array.from({ length: 3 }, () => ({
    node: { identity: { classList: { remove() {} } }, nameol: { innerHTML: '' } }, ai: {}, skills: [],
    init(id) { this.name1 = id; this.name = id; this.hp = 4; this.maxHp = 4; },
    showIdentity() { this.identityShown = true; this.ai.shown = 1; },
    setIdentity() {}, isInitFilter() { return false; }, update() {}, showGiveup() {},
    addSkill(ids) { this.skills.push(...[ids].flat()); }, isAlive() { return game.players.includes(this); },
  }));
  players.forEach((player, index) => { player.next = players[(index + 1) % 3]; player.previous = players[(index + 2) % 3]; });
  const game = {
    players, me: players[0], globals: [], outcomes: [],
    addRecentCharacter(id) { this.recent = id; },
    createEvent(name) { return this.selectionEvent = { name, setContent(fn) { this.content = fn; } }; },
    addGlobalSkill(id) { this.globals.push(id); }, broadcast() {}, syncState() {}, addVideo() {},
    gameDraw(player) { this.drawStart = player; return {}; }, phaseLoop(player) { this.turnStart = player; },
    over(result) { this.outcomes.push(result); },
  };
  const lib = { character: { caocao: {}, a: {}, b: {}, disabled: {} }, filter: { characterDisabled: id => id === 'disabled' },
    init: { onfree() {} }, playerOL: {}, sort: {} };
  const _status = { mode: 'normal' };
  const get = { config: key => settings[`${key}_mode_config_doudizhu`], players: () => [...game.players], prompt: skill => skill };
  const mode = new Function('lib', 'game', 'ui', 'get', 'ai', '_status', 'html', nativeSource)(lib, game, {}, get, {}, _status, String.raw);
  game.showIdentity = mode.game.showIdentity;
  game.checkResult = mode.game.checkResult;
  return { lib, game, get, _status, launch, settings, mode, players };
}

async function choose(f) {
  installDoudizhuMode(f, f.launch, new Set(Object.keys(f.lib.character)));
  f.game.chooseCharacter();
  await f.game.selectionEvent.content();
}

test('explicit modes normalize their counts while old four-player preferences keep 2v2', () => {
  assert.equal(normalizeLaunch({ playerCount: 4 }).mode, 'versus');
  assert.equal(normalizeLaunch({ mode: 'versus', playerCount: 8 }).playerCount, 4);
  assert.equal(normalizeLaunch({ mode: 'doudizhu', playerCount: 8 }).playerCount, 3);
  assert.equal(normalizeLaunch({ mode: 'identity', playerCount: 4 }).playerCount, 8);
  assert.equal(normalizeLaunch({ mode: 'identity', playerCount: 6 }).playerCount, 6);
  assert.equal(normalizeLaunch({ mode: 'doudizhu', landlordRole: 'admin' }).landlordRole, 'landlord');
  const { settings } = fixture('farmer');
  assert.equal(settings.mode, 'doudizhu');
  assert.equal(settings.doudizhu_mode_mode_config_doudizhu, 'normal');
  assert.equal(settings.feiyang_version_mode_config_doudizhu, 'decade');
  assert.equal(settings.enhance_dizhu_mode_config_doudizhu, 'disabled');
  assert.equal(settings.enhance_nongmin_mode_config_doudizhu, 'decade');
  assert.equal(settings.double_character_mode_config_doudizhu, false);
  assert.equal(settings.change_card_mode_config_doudizhu, 'disabled');
  assert.equal(settings.auto_confirm, false);
  assert.equal(settings.enable_drag, false);
  assert.equal(settings.fold_card, true);
  assert.deepEqual(settings.doudizhu_bannedcards, ['muniu']);
  assert.ok(settings.hiddenModePack.includes('connect'));
  assert.ok(!settings.hiddenModePack.includes('doudizhu'));
});

test('both chosen roles preserve the exact human general, distinct AI, public seats and native HP bonus', async () => {
  for (const role of ['landlord', 'farmer']) {
    const f = fixture(role);
    await choose(f);
    const { game, _status } = f;
    assert.equal(game.me.name1, 'caocao');
    assert.equal(game.recent, 'caocao');
    assert.equal(game.me.identity, role === 'landlord' ? 'zhu' : 'fan');
    assert.equal(game.me.sgsSeat, role === 'landlord' ? 1 : 3);
    assert.equal(game.zhu.sgsSeat, 1);
    assert.equal(game.zhu, _status.firstAct);
    assert.equal(game.zhu.hp, 5);
    assert.equal(game.zhu.maxHp, 5);
    for (const player of game.players) {
      assert.equal(player.identityShown, true);
      assert.equal(player.ai.shown, 1);
      assert.equal(player.isZhu, player === game.zhu);
      if (player !== game.zhu) assert.equal(player.hp, 4);
    }
    assert.deepEqual(new Set(game.players.map(player => player.name1)), new Set(['caocao', 'a', 'b']));
    assert.deepEqual(_status.characterlist, []);
  }
});

test('native start grants only decade Feiyang and Bahu and begins draw and turns at landlord', async () => {
  for (const role of ['landlord', 'farmer']) {
    const f = fixture(role);
    await choose(f);
    await f.mode.start[3]({ trigger(name) { assert.equal(name, 'gameStart'); } });
    assert.deepEqual(f.game.zhu.skills, ['dcfeiyang', 'bahu']);
    for (const player of f.game.players) if (player !== f.game.zhu) assert.deepEqual(player.skills, []);
    assert.equal(f.game.drawStart, f.game.zhu);
    assert.equal(f.game.turnStart, f.game.zhu);
    assert.deepEqual(f.game.globals, ['doudizhu_viewHandcard']);
  }
});

test('native general initialization exceptions remain effective', async () => {
  const f = fixture();
  f.game.me.isInitFilter = name => ['noZhuHp', 'noZhuSkill'].includes(name);
  await choose(f);
  await f.mode.start[3]({ trigger() {} });
  assert.equal(f.game.zhu.hp, 4);
  assert.equal(f.game.zhu.maxHp, 4);
  assert.deepEqual(f.game.zhu.skills, []);
});

test('native Bahu draws one in preparation and adds one Slash use only for landlord', async () => {
  const f = fixture();
  const [landlord, farmer] = seatDoudizhuPlayers(f.game, f._status, 'landlord');
  const skill = f.mode.skill.bahu;
  assert.deepEqual(skill.trigger, { player: 'phaseZhunbeiBegin' });
  assert.equal(skill.forced, true);
  assert.equal(skill.filter({}, landlord), true);
  assert.equal(skill.filter({}, farmer), false);
  let draws = 0;
  landlord.draw = (count = 1) => { draws += count; };
  await skill.content({}, {}, landlord);
  assert.equal(draws, 1);
  assert.equal(skill.mod.cardUsable({ name: 'sha' }, landlord, 1), 2);
  assert.equal(skill.mod.cardUsable({ name: 'sha' }, landlord, 2), 3);
  assert.equal(skill.mod.cardUsable({ name: 'sha' }, farmer, 1), undefined);
  assert.equal(skill.mod.cardUsable({ name: 'tao' }, landlord, 1), undefined);
});

test('native decade Feiyang requires two hand cards, pays those cards and clears every judge', async () => {
  const f = fixture();
  const [landlord, farmer] = seatDoudizhuPlayers(f.game, f._status, 'landlord');
  const skill = f.mode.skill.dcfeiyang;
  assert.deepEqual(skill.trigger, { player: 'phaseJudgeBegin' });
  let hand = 1, judges = 2;
  landlord.hasCards = zone => zone === 'j' && judges > 0;
  landlord.countCards = zone => ({ h: hand, e: 5, he: hand + 5, j: judges })[zone];
  assert.equal(skill.filter({}, landlord), false, 'equipment cannot supply the hand-card payment');
  hand = 2;
  assert.equal(skill.filter({}, landlord), true);
  assert.equal(skill.filter({}, farmer), false);
  judges = 0;
  assert.equal(skill.filter({}, landlord), false);
  judges = 2;
  landlord.hasSkillTag = () => false;
  landlord.hasSkill = () => false;
  landlord.hasCard = () => true;
  let payment;
  landlord.chooseToDiscard = (...args) => {
    payment = args;
    return { set() { return this; }, async forResult() { return { bool: true }; } };
  };
  const event = { skill: 'dcfeiyang' };
  await skill.cost(event, {}, landlord);
  assert.deepEqual(payment.slice(0, 2), ['h', 2]);
  assert.equal(event.result.bool, true);
  let removal;
  landlord.discardPlayerCard = (...args) => { removal = args; };
  await skill.content(event, {}, landlord);
  assert.deepEqual(removal, [landlord, 'j', true, 2]);
});

test('native attitudes ally the farmers and native death rules settle both roles correctly', () => {
  for (const role of ['landlord', 'farmer']) {
    for (const landlordDies of [true, false]) {
      const f = fixture(role);
      const [landlord, farmer1, farmer2] = seatDoudizhuPlayers(f.game, f._status, role);
      for (const from of f.game.players) for (const to of f.game.players) {
        assert.equal(Math.sign(f.mode.get.rawAttitude(from, to)), from.identity === to.identity ? 1 : -1);
      }
      f.game.players = f.game.players.filter(player => player !== farmer1);
      f.mode.element.player.dieAfter.call(farmer1);
      assert.deepEqual(f.game.outcomes, [], 'one dead farmer must not end the game');
      const victim = landlordDies ? landlord : farmer2;
      f.game.players = f.game.players.filter(player => player !== victim);
      f.mode.element.player.dieAfter.call(victim);
      assert.deepEqual(f.game.outcomes, [landlordDies ? role === 'farmer' : role === 'landlord']);
    }
  }
});
