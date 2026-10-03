import test from 'node:test';
import assert from 'node:assert/strict';
import { engineSettings, normalizeLaunch } from '../../apps/core/sgs/launch-config.mjs';
import { seatTwoPlayerTeams, installTwoPlayerTeamMode } from '../../apps/core/sgs/team-mode.mjs';
import { readFileSync } from 'node:fs';

function fixture() {
  const players = Array.from({length:4}, () => ({node:{identity:{firstChild:{},dataset:{}}}, skills:[], init(id){this.name1=id}, isIn(){return true}, addSkill(id){this.skills.push(id)}, showGiveup(){}}));
  players.forEach((player,i)=>{player.next=players[(i+1)%4];player.previous=players[(i+3)%4]});
  const game={players,me:players[0],addRecentCharacter(){},addGlobalSkill(){},createEvent(){return {setContent(fn){game.content=fn}}}};
  return {game,_status:{mode:'two'}};
}

function nativeMode(game, status) {
  const source=readFileSync(new URL('../../apps/core/mode/versus.js',import.meta.url),'utf8')
    .replace(/^import .*?;\r?\n/,'').replace('export const type = "mode";','').replace('export default','return');
  return new Function('lib','game','ui','get','ai','_status',source)({storage:{}},game,{}, {convertedCharacter:value=>value},{},status)();
}

test('four-player launch must use the real 2v2 engine instead of hidden identities', () => {
  const settings = engineSettings(normalizeLaunch({playerCount:4}));
  assert.equal(settings.mode, 'versus');
  assert.equal(settings.versus_mode_mode_config_versus, 'two');
  assert.equal(settings.two_phaseswap_mode_config_versus, false);
  assert.equal(settings.replace_character_two_mode_config_versus, false);
});

test('fixed seats drive actual upstream AI attitudes: 1+4 and 2+3',()=>{
  const {game,_status}=fixture();
  const seats=seatTwoPlayerTeams(game,_status);
  assert.equal(seats[3],game.me);
  assert.equal(_status.firstAct,seats[0]);
  assert.deepEqual(seats.map(p=>p.sgsSeat),[1,2,3,4]);
  const mode=nativeMode(game,_status);
  for(const from of seats) for(const to of seats) {
    assert.equal(Math.sign(mode.get.rawAttitude(from,to)),from.side===to.side?1:-1);
  }
});

test('native team death logic ends only after the whole opposing team is defeated',()=>{
  for(const ownTeamDies of [false,true]) {
    const {game,_status}=fixture();
    const seats=seatTwoPlayerTeams(game,_status);
    const mode=nativeMode(game,_status);
    const outcomes=[];game.over=result=>outcomes.push(result);
    const targets=ownTeamDies?[seats[3],seats[0]]:[seats[1],seats[2]];
    game.players=game.players.filter(p=>p!==targets[0]);
    mode.element.player.dieAfter.call(targets[0]);
    assert.deepEqual(outcomes,[]);
    game.players=game.players.filter(p=>p!==targets[1]);
    mode.element.player.dieAfter.call(targets[1]);
    assert.deepEqual(outcomes,[!ownTeamDies]);
  }
});

test('lobby general initializes once, AI picks distinct allowed characters and native fourth-seat skill remains',async()=>{
  const {game,_status}=fixture();
  let freed=false;
  const lib={character:{caocao:{},a:{},b:{},c:{},disabled:{}},filter:{characterDisabled:id=>id==='disabled'},init:{onfree(){freed=true}}};
  installTwoPlayerTeamMode({lib,game,_status,get:{config:()=>true}}, {playerCount:4,generalId:'caocao'},new Set(Object.keys(lib.character)));
  game.chooseCharacterTwo();await game.content();
  assert.equal(game.me.name1,'caocao');
  assert.deepEqual(new Set(game.players.map(p=>p.name1)),new Set(['caocao','a','b','c']));
  assert.ok(game.me.skills.includes('olfeiyang'));
  assert.deepEqual(_status.characterlist,[]);
  assert.ok(freed);
});

test('larger tables retain the identity game', () => {
  for (const playerCount of [5,6,8]) {
    assert.equal(engineSettings(normalizeLaunch({playerCount})).mode, 'identity');
  }
});
