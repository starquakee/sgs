import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { parseSource, defaultObject, fields, binding } from '../../scripts/sgs/catalog-source.mjs';
import { installCharacterAudio } from '../../apps/core/sgs/character-audio.mjs';

const read = path => readFileSync(new URL(`../../${path}`, import.meta.url), 'utf8');
const manifest = JSON.parse(read('apps/core/sgs/character-audio.json'));
const xianding = parseSource('xianding.js', read('apps/core/character/xianding/skill.js'));
const playerSource = parseSource('player.js', read('apps/core/noname/library/element/player.js'));
const eventSource = parseSource('event.ts', read('apps/core/noname/library/element/gameEvent.ts'));
const contentSource = parseSource('content.ts', read('apps/core/noname/library/element/content.ts'));
const playerClass = playerSource.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'Player');
const eventClass = eventSource.statements.find(node => ts.isClassDeclaration(node) && node.name.text === 'GameEvent');
const method = (object, name) => object.properties.find(node => node.name?.getText() === name);
function nativeMethod(node, context) {
  const compiled = ts.transpileModule(`const value = ({${node.getText()}});`, { compilerOptions: { target: ts.ScriptTarget.ES2022 } }).outputText;
  return new Function(...Object.keys(context), `${compiled}\nreturn value[${JSON.stringify(node.name.getText())}];`)(...Object.values(context));
}
const getParent = nativeMethod(eventClass.members.find(node => node.name?.getText() === 'getParent' && node.body), { game: { online: false } });
const event = (name, properties = {}) => ({ name, next: [], getParent, ...properties });
const grantName = '_sgs_character_audio_grants';
const markName = 'dcjunhe_effect';
const policies = [
  { owner: 'v_liubei', skill: 'dcliexiang_backup', ancestor: 'dcrengou_global', attach: (owner, recipient) => ({ player: recipient, target: owner }) },
  { owner: 'v_caopi', skill: 'dcdianlun', ancestor: 'dcjiwei_global', attach: (owner, recipient) => ({ player: recipient, targets: [owner] }) },
  { owner: 'v_sunquan', skill: 'dcwoheng', ancestor: 'dcyuhui_buff', attach: (owner, recipient) => ({ player: recipient, indexedData: owner }) },
  { owner: 'v_sunce', skill: 'dczhifeng', ancestor: 'dcweijing', attach: (owner, recipient) => ({ player: owner, targets: [recipient] }) },
];

function harness(data = structuredClone(manifest)) {
  let current, numberResult = { bool: true, numbers: [2] };
  const calls = [], globalSkills = new Set(), listeners = new Map();
  const lib = { config: { background_speak: false }, skill: {}, hooks: { removeSkillCheck: [] } };
  const game = {
    trySkillAudio(...args) { calls.push({ receiver: this, args, enabled: lib.config.background_speak }); return 'native-skill'; },
    tryDieAudio(...args) { calls.push({ args, death: true }); },
    addGlobalSkill: name => globalSkills.add(name), removeGlobalSkill: name => globalSkills.delete(name),
    log() {},
    createEvent(name, _trigger, parent = current) {
      const next = event(name, { parent,
        set(key, value) { this[key] = value; return this; },
        setContent(content) { this.contentName = content; return this; },
        async forResult() { this.result = numberResult; return this.result; },
        async trigger(name) {
          const hook = lib.skill[grantName];
          if (globalSkills.has(grantName) && hook.trigger.global.includes(name) && hook.filter(this, this.player)) {
            await hook.content({ triggername: name }, this, this.player);
          }
        },
      });
      parent.next.push(next);
      return next;
    },
  };
  const get = { event: () => current, info: name => lib.skill[name], position: () => 'd',
    translation: value => value.name || String(value), evtprompt(next, prompt) { next.prompt = prompt; },
    is: { object: value => !!value && typeof value === 'object' }, itemtype: () => null };
  const context = { game, lib, get };
  const methods = Object.fromEntries(['addMark', 'removeMark', 'countMark', 'setStorage', 'getStorage', 'chooseNumbers'].map(name => [name,
    nativeMethod(playerClass.members.find(node => node.name?.getText() === name), context)]));
  lib.skill[markName] = {};
  const xiongwei = fields(defaultObject(xianding)).get('dcxiongwei');
  const nativeGrant = nativeMethod(method(xiongwei, 'content'), context);
  lib.skill.dcxiongwei = { getList: nativeMethod(method(xiongwei, 'getList'), context) };
  const emptyEvent = nativeMethod(method(binding(contentSource, 'Content'), 'emptyEvent'), {});
  const host = { addEventListener: (name, fn) => listeners.set(name, fn), removeEventListener: (name, fn) => { if (listeners.get(name) === fn) listeners.delete(name); } };
  const originalSkill = game.trySkillAudio, originalDie = game.tryDieAudio;
  const audio = installCharacterAudio(context, data, { host });
  function player(name) {
    return { name, group: 'wei', storage: {}, skills: new Set(), ...methods,
      hasSkill(skill) { return this.skills.has(skill); }, hasMark(skill) { return this.countMark(skill) > 0; },
      addSkill(skill) { this.skills.add(skill); }, removeSkill(skill) { this.skills.delete(skill); for (const fn of lib.hooks.removeSkillCheck) fn(skill, this); },
      isIn: () => true, async gain() {}, line() {}, syncStorage() {}, markSkill() {}, unmarkSkill() {} };
  }
  async function flush(parent) {
    for (const next of parent.next.splice(0)) if (next.contentName === 'emptyEvent') await emptyEvent(next);
  }
  async function grant(owner, recipient, result = { bool: true, numbers: [2] }) {
    numberResult = result;
    const compare = event('chooseToCompare', { player: owner, target: recipient, card1: {}, card2: {} });
    const source = event('dcxiongwei', { player: owner, _trigger: compare });
    current = source;
    await nativeGrant(source, compare, owner);
    await flush(source);
    current = event('damage');
    return source;
  }
  return { game, lib, calls, globalSkills, listeners, audio, player, grant, flush, originalSkill, originalDie,
    setEvent: value => { current = value; }, manifest: data };
}

test('recipient skill voices require each exact native grant ancestor, edition and actor relationship', () => {
  const h = harness();
  try {
    for (const policy of policies) {
      const owner = h.player(policy.owner), recipient = h.player('caocao'), unrelated = h.player('liubei');
      const source = event(policy.ancestor, policy.attach(owner, recipient));
      h.setEvent(event('useSkill', { parent: source, player: recipient, skill: policy.skill }));
      const args = [true, null, null, { preserved: true }], before = h.calls.length;
      assert.equal(h.game.trySkillAudio(policy.skill, recipient, ...args), 'native-skill', policy.skill);
      assert.deepEqual(h.calls.at(-1).args, [policy.skill, recipient, ...args]);
      assert.equal(h.calls.at(-1).enabled, true);
      assert.equal(h.lib.config.background_speak, false);
      h.game.trySkillAudio(policy.skill, unrelated);
      owner.name = policy.owner.replace(/^v_/, '');
      h.game.trySkillAudio(policy.skill, recipient);
      owner.name = policy.owner;
      h.setEvent(event('unrelated', { player: recipient }));
      h.game.trySkillAudio(policy.skill, recipient);
      assert.equal(h.calls.length, before + 1, 'wrong actor, old edition and unrelated event remain silent');
    }
  } finally { h.audio.dispose(); }
});

test('grants do not borrow missing, wrong-pack or unallowlisted manifest entries, and native owners still work', () => {
  for (const change of [data => delete data.characters.v_liubei, data => { data.characters.v_liubei.pack = 'standard'; },
    data => { data.characters.v_liubei.skills = data.characters.v_liubei.skills.filter(skill => skill !== 'dcliexiang_backup'); }]) {
    const data = structuredClone(manifest); change(data); const h = harness(data);
    try {
      const recipient = h.player('caocao'), owner = h.player('v_liubei');
      h.setEvent(event('useSkill', { parent: event('dcrengou_global', { player: recipient, target: owner }) }));
      h.game.trySkillAudio('dcliexiang_backup', recipient);
      assert.equal(h.calls.length, 0);
    } finally { h.audio.dispose(); }
  }
  const h = harness();
  try {
    h.game.trySkillAudio('dcliexiang_backup', 'v_liubei');
    h.game.tryDieAudio('v_liubei');
    assert.equal(h.calls.length, 2);
    assert.equal(h.lib.config.background_speak, false);
  } finally { h.audio.dispose(); }
});

test('the pinned dcxiongwei content grants recipient audio through its real queued mark event, surviving source death', async () => {
  const h = harness();
  try {
    const owner = h.player('v_caocao'), recipient = h.player('caocao');
    owner.storage[markName] = 3; owner.storage.dcjunhe_shown = ['red', 'basic'];
    await h.grant(owner, recipient);
    assert.equal(owner.countMark(markName), 1);
    assert.equal(recipient.countMark(markName), 2);
    assert.equal(recipient.getStorage('dcjunhe_shown'), owner.getStorage('dcjunhe_shown'));
    owner.isIn = () => false;
    h.game.trySkillAudio(markName, recipient);
    assert.equal(h.calls.length, 1);
    assert.equal(h.calls[0].args[1], recipient, 'native speaker remains the recipient');
    h.game.trySkillAudio(markName, h.player('liubei'));
    assert.equal(h.calls.length, 1);
  } finally { h.audio.dispose(); }
});

test('canceled and old-edition dcxiongwei grants cannot authorize an otherwise uncurated recipient', async () => {
  for (const [sourceId, result] of [['caocao', { bool: true, numbers: [2] }], ['v_caocao', { bool: false }]]) {
    const h = harness();
    try {
      const owner = h.player(sourceId), recipient = h.player('liubei');
      owner.storage[markName] = 3; owner.storage.dcjunhe_shown = ['red', 'basic'];
      await h.grant(owner, recipient, result);
      h.game.trySkillAudio(markName, recipient);
      assert.equal(h.calls.length, 0);
    } finally { h.audio.dispose(); }
  }
});

test('a skill name, matching marks or a nested unrelated mark event cannot invent grant provenance', async () => {
  const h = harness();
  try {
    const owner = h.player('v_caocao'), recipient = h.player('liubei');
    owner.storage.dcjunhe_shown = ['red', 'basic'];
    recipient.storage.dcjunhe_shown = owner.storage.dcjunhe_shown;
    recipient.addSkill(markName); recipient.storage[markName] = 2;
    const source = event('dcxiongwei', { player: owner });
    h.setEvent(source); h.game.trySkillAudio(markName, recipient);
    assert.equal(h.calls.length, 0, 'a dcxiongwei ancestor alone does not grant later audio');
    const nested = event('unrelated', { parent: source });
    h.setEvent(nested); recipient.addMark(markName, 1, false); await h.flush(nested);
    h.game.trySkillAudio(markName, recipient);
    assert.equal(h.calls.length, 0);
    const hook = h.lib.skill[grantName];
    assert.equal(hook.filter({ player: recipient, markName }, owner), false, 'only the actual mark recipient handles the global notification');
    assert.equal(hook.filter({ player: recipient, markName: 'other' }, recipient), false);
  } finally { h.audio.dispose(); }
});

test('persistent grant voices also require the curated source edition and its permitted effect in the manifest', async () => {
  for (const change of [data => delete data.characters.v_caocao, data => { data.characters.v_caocao.pack = 'standard'; },
    data => { data.characters.v_caocao.skills = data.characters.v_caocao.skills.filter(skill => skill !== markName); }]) {
    const data = structuredClone(manifest); change(data); const h = harness(data);
    try {
      const owner = h.player('v_caocao'), recipient = h.player('liubei');
      owner.storage[markName] = 3; owner.storage.dcjunhe_shown = ['red', 'basic'];
      await h.grant(owner, recipient);
      h.game.trySkillAudio(markName, recipient);
      assert.equal(h.calls.length, 0);
    } finally { h.audio.dispose(); }
  }
});

test('inherited audio expires with native skill, marks or shown data and cannot be revived by unrelated marks', async () => {
  for (const loss of ['skill', 'marks', 'shown']) {
    const h = harness();
    try {
      const owner = h.player('v_caocao'), recipient = h.player('liubei');
      owner.storage[markName] = 3; owner.storage.dcjunhe_shown = ['red', 'basic'];
      await h.grant(owner, recipient);
      if (loss === 'skill') recipient.removeSkill(markName);
      if (loss === 'marks') { const source = event('dcjunhe_effect'); h.setEvent(source); recipient.removeMark(markName, 2, false); await h.flush(source); }
      if (loss === 'shown') recipient.storage.dcjunhe_shown = ['red', 'basic'];
      h.game.trySkillAudio(markName, recipient);
      assert.equal(h.calls.length, 0, loss);
      recipient.skills.add(markName); recipient.storage[markName] = 2; recipient.storage.dcjunhe_shown = owner.storage.dcjunhe_shown;
      const unrelated = event('unrelated'); h.setEvent(unrelated); recipient.addMark(markName, 1, false); await h.flush(unrelated);
      h.game.trySkillAudio(markName, recipient);
      assert.equal(h.calls.length, 0, `${loss}: unrelated renewal must not restore provenance`);
    } finally { h.audio.dispose(); }
  }
});

test('a later genuine grant can authorize the still-installed native effect again after marks run out', async () => {
  const h = harness();
  try {
    const owner = h.player('v_caocao'), recipient = h.player('caocao');
    owner.storage[markName] = 4; owner.storage.dcjunhe_shown = ['black', 'trick'];
    await h.grant(owner, recipient);
    const source = event('dcjunhe_effect'); h.setEvent(source); recipient.removeMark(markName, 2, false); await h.flush(source);
    assert.equal(recipient.hasSkill(markName), true);
    await h.grant(owner, recipient);
    h.game.trySkillAudio(markName, recipient);
    assert.equal(h.calls.length, 1);
  } finally { h.audio.dispose(); }
});

test('disposal removes only owned grant hooks and restores the original audio methods', async () => {
  const h = harness(), other = () => {};
  h.lib.hooks.removeSkillCheck.push(other);
  assert.equal(h.globalSkills.has(grantName), true);
  assert.equal(h.lib.hooks.removeSkillCheck.length, 2);
  h.audio.dispose(); h.audio.dispose();
  assert.equal(h.game.trySkillAudio, h.originalSkill);
  assert.equal(h.game.tryDieAudio, h.originalDie);
  assert.equal(h.globalSkills.has(grantName), false);
  assert.equal(h.lib.skill[grantName], undefined);
  assert.deepEqual(h.lib.hooks.removeSkillCheck, [other]);
  assert.equal(h.listeners.size, 0);
});
