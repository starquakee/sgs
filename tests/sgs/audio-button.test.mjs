import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Node, dom } from './helpers/client-dom.mjs';
import { installAudioButton } from '../../apps/core/sgs/runtime.js';
import { installCardAudio } from '../../apps/core/sgs/card-audio.mjs';
import { createPreferences, preferencesKey } from '../../apps/core/sgs/preferences.mjs';
import { installTableSession } from '../../apps/core/sgs/table-session.mjs';

const damageManifest = JSON.parse(await readFile(new URL('../../apps/core/sgs/damage-audio.json', import.meta.url), 'utf8'));
const settle = () => new Promise(resolve => setImmediate(resolve));

function harness({ enabled = true, warmDamage = false } = {}) {
  const document = dom(), hud = new Node('header'), values = new Map(), writes = [], fetched = [], starts = [], states = [];
  for (const name of ['sgs-return', 'sgs-restart', 'sgs-audio']) {
    const node = new Node('button'); node.className = name; node.ownerDocument = document; hud.append(node);
  }
  const button = hud.querySelector('.sgs-audio');
  const storage = { getItem: key => values.get(key) ?? null, setItem(key, value) { values.set(key, value); writes.push([key, value]); } };
  const preferences = createPreferences(() => storage);
  preferences.set({ sound: enabled, cardVolume: .3, heroVolume: .6, effectVolume: .8 });
  let failure = null, resume;
  const ctx = {
    state: 'suspended', resumes: 0, currentTime: 1, destination: {},
    resume() {
      this.resumes++;
      if (failure === 'resume-throw') throw new Error('resume failed');
      if (failure === 'resume-reject') return Promise.reject(new Error('resume failed'));
      if (resume) return resume();
      this.state = 'running'; return Promise.resolve();
    },
    async close() { this.state = 'closed'; },
    async decodeAudioData() { return { duration: .1 }; },
    createGain() { return { gain: {}, connect() {}, disconnect() {} }; },
    createBufferSource() { return { connect() {}, disconnect() {}, start() { starts.push(true); }, stop() {} }; },
  };
  const lib = { config: {}, skill: {} }, _status = { paused2: false };
  const game = {
    playAudio() {}, playCardAudio() {}, addGlobalSkill() {}, removeGlobalSkill() {},
    pause2() { _status.paused2 = true; }, resume2() { _status.paused2 = false; },
  };
  const ui = { auto: new Node('button'), click: { auto() {} } };
  // Match runtime registration order: remember intent before the audio module's
  // document capture listener can resolve an unlock and change blocked state.
  let audio;
  const controls = installAudioButton(button, preferences, () => audio);
  audio = installCardAudio({ lib, game, get: {} }, { clips: {} }, {
    enabled, surface: document, host: {},
    createContext() { if (failure === 'construct') throw new Error('device unavailable'); return ctx; },
    damageManifest: warmDamage ? damageManifest : undefined,
    fetch: async url => { fetched.push(String(url)); return { ok: true, arrayBuffer: async () => new ArrayBuffer(1) }; },
    onStateChange: state => states.push(state),
  });
  const session = installTableSession({ game, ui, lib, _status, hud, preferences, audio, document, navigate() {} });
  return {
    document, button, preferences, storage, writes, audio, ctx, lib, fetched, starts, states, controls,
    fail: value => { failure = value; }, deferResume: value => { resume = value; },
    settingsMute() {
      hud.children.find(node => node.textContent === '设置').emit('click');
      const dialog = document.body.children.at(-1), sound = dialog.querySelector('[name="sound"]');
      sound.checked = false; sound.emit('change');
      dialog.querySelector('[data-close]').emit('click');
    },
    async gesture(type, checkpoint = false, target = button, properties = {}) {
      // Exercise actual registered capture handlers in order. Both same-stack
      // dispatch and a microtask checkpoint between callbacks are significant.
      const event = { type, target, key: 'Enter', ...properties };
      for (const callback of document.listeners.get(type) || []) {
        callback(event);
        if (checkpoint) await settle();
      }
      target.emit(type, event);
    },
    dispose() { controls.dispose(); audio.dispose(); session.dispose(); },
  };
}

for (const failure of ['construct', 'resume-throw', 'resume-reject']) {
  test(`toolbar re-enables persisted sound after ${failure}, settings mute and device recovery`, async t => {
    const h = harness(); t.after(() => h.dispose());
    h.fail(failure); assert.equal(await h.audio.unlock(), false);
    h.settingsMute(); await settle();
    assert.equal(h.audio.status().enabled, false); assert.equal(h.audio.status().blocked, true);
    h.fail(null);
    await h.gesture('pointerdown', true); h.button.emit('click'); await settle();
    assert.equal(h.preferences.get().sound, true);
    assert.equal(JSON.parse(h.storage.getItem(preferencesKey)).sound, true);
    assert.equal(h.storage.getItem('sgs.card-audio.enabled'), 'true');
    assert.equal(h.audio.status().enabled, true); assert.equal(h.audio.status().blocked, false);
    assert.equal(h.ctx.state, 'running'); assert.equal(h.lib.config.equip_audio, false);
    assert.deepEqual(h.audio.status().volumes, { card: .3, hero: .6, effect: .8 });
    assert.equal(h.starts.length, 0, 'enabling sound must not replay old events');
    h.button.emit('click');
    assert.equal(h.preferences.get().sound, false, 'the retry intent is consumed by the first click');
  });
}

for (const type of ['pointerdown', 'keydown']) for (const checkpoint of [false, true]) {
  test(`${type} retry survives capture unlock before click (between-listener checkpoint: ${checkpoint})`, async t => {
    const h = harness(); t.after(() => h.dispose());
    h.fail('construct'); await h.audio.unlock(); h.fail(null);
    const writes = h.writes.length;
    await h.gesture(type, checkpoint); await settle();
    assert.equal(h.audio.status().blocked, false);
    h.button.emit('click'); await settle();
    assert.equal(h.preferences.get().sound, true);
    assert.equal(h.audio.status().enabled, true);
    assert.equal(h.writes.length, writes, 'retrying unlock does not toggle or rewrite preferences');
    await h.gesture(type, checkpoint); h.button.emit('click');
    assert.equal(h.preferences.get().sound, false, 'the next ordinary gesture still mutes');
  });
}

test('ordinary toolbar toggles use settings preferences, and failed enabled retries remain recoverable', async t => {
  const h = harness({ enabled: false }); t.after(() => h.dispose());
  h.fail('construct');
  await h.gesture('keydown', true); h.button.emit('click'); await settle();
  assert.equal(h.preferences.get().sound, true); assert.equal(h.audio.status().blocked, true);
  const writes = h.writes.length;
  h.button.emit('click'); await settle();
  assert.equal(h.preferences.get().sound, true); assert.equal(h.writes.length, writes);
  h.fail(null); h.button.emit('click'); await settle();
  assert.equal(h.audio.status().blocked, false); assert.equal(h.writes.length, writes);
  h.button.emit('click'); assert.equal(h.preferences.get().sound, false);
  await h.gesture('pointerdown', true); h.button.emit('click'); await settle();
  assert.equal(h.audio.status().enabled, true); assert.equal(h.lib.config.equip_audio, false);
  assert.deepEqual(h.audio.status().volumes, { card: .3, hero: .6, effect: .8 });
});

test('a settings mute between retry intent and click still enables once and clears the intent', async t => {
  const h = harness(); t.after(() => h.dispose());
  h.fail('construct'); await h.audio.unlock(); await h.gesture('pointerdown');
  h.settingsMute(); h.fail(null); h.button.emit('click'); await settle();
  assert.equal(h.preferences.get().sound, true);
  h.button.emit('click'); assert.equal(h.preferences.get().sound, false);
});

test('repeated Space keydown preserves retry intent until the corresponding click', async t => {
  const h = harness(); t.after(() => h.dispose());
  h.fail('construct'); await h.audio.unlock(); h.fail(null);
  await h.gesture('keydown', true, h.button, { key: ' ' });
  assert.equal(h.audio.status().blocked, false);
  await h.gesture('keydown', true, h.button, { key: ' ', repeat: true });
  h.button.emit('click');
  assert.equal(h.preferences.get().sound, true);
  await h.gesture('keydown', true, h.button, { key: ' ' }); h.button.emit('click');
  assert.equal(h.preferences.get().sound, false);
});

for (const cancellation of ['pointercancel', 'blur']) {
  test(`${cancellation} clears retry intent without changing the sound preference`, async t => {
    const h = harness(); t.after(() => h.dispose());
    h.fail('construct'); await h.audio.unlock(); h.fail(null);
    await h.gesture('pointerdown', true); h.button.emit(cancellation);
    assert.equal(h.preferences.get().sound, true);
    h.button.emit('click');
    assert.equal(h.preferences.get().sound, false, 'cancelled intent cannot affect a later activation');
  });
}

test('early listener registration is inert until the audio controller is initialized', () => {
  const document = dom(), button = new Node('button'); button.ownerDocument = document;
  let writes = 0;
  const controls = installAudioButton(button, { set() { writes++; } }, () => undefined);
  try {
    assert.doesNotThrow(() => document.emit('pointerdown', { type: 'pointerdown', target: button }));
    assert.doesNotThrow(() => button.emit('click'));
    assert.equal(writes, 0);
  } finally { controls.dispose(); }
});

for (const action of ['mute', 'dispose']) for (const outcome of ['resolve', 'reject']) {
  test(`toolbar unlock cannot preload or replay after ${action}/${outcome}`, async t => {
    const h = harness({ enabled: false, warmDamage: true }); t.after(() => h.dispose());
    let finish;
    h.deferResume(() => new Promise((resolve, reject) => { finish = () => {
      if (outcome === 'reject') reject(new Error('late device failure'));
      else { if (h.ctx.state !== 'closed') h.ctx.state = 'running'; resolve(); }
    }; }));
    h.button.emit('click'); assert.equal(h.ctx.resumes, 1);
    if (action === 'mute') h.button.emit('click'); else h.dispose();
    const notifications = h.states.length, writes = h.writes.length;
    finish(); await settle(); await h.audio.whenIdle();
    assert.equal(h.fetched.length, 0); assert.equal(h.starts.length, 0);
    assert.equal(h.states.length, notifications, 'obsolete unlock cannot update current status');
    if (action === 'dispose') {
      await h.gesture('pointerdown', true); h.button.emit('click');
      assert.equal(h.writes.length, writes, 'disposed controls cannot alter the next session preferences');
      assert.equal(h.document.listeners.get('pointerdown').size, 0);
      assert.equal(h.document.listeners.get('keydown').size, 0);
    } else assert.equal(h.preferences.get().sound, false);
  });
}
