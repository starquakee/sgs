import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { visibleTeammate } from '../../apps/core/sgs/teammate-hand.mjs';

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
