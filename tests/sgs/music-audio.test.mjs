import test from 'node:test';
import assert from 'node:assert/strict';
import { installCardAudio } from '../../apps/core/sgs/card-audio.mjs';
import { createPreferences, preferencesKey } from '../../apps/core/sgs/preferences.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const musicClip = { key: 'background/music_default', file: 'audio/background/music_default.mp3' };
const musicManifest = { clips: { [musicClip.key]: musicClip } };
const cardClip = { key: 'card/male/sha', file: 'audio/card/male/sha.mp3' };
const response = music => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(music ? 1 : 2) });
const tick = () => new Promise(resolve => setImmediate(resolve));

function harness({ enabled = true, fetcher, timers, decode, createContext, withMusic = true } = {}) {
  const starts = [], stops = [], requests = [], listeners = new Map();
  const context = {
    state: 'suspended', currentTime: 10, destination: {}, resumes: 0,
    async resume() { this.resumes++; this.state = 'running'; },
    async close() { this.state = 'closed'; },
    decodeAudioData: decode || (async bytes => ({ duration: bytes.byteLength === 1 ? 100 : 0.8 })),
    createGain() { return { gain: {}, connect() {}, disconnect() { this.disconnected = true; } }; },
    createBufferSource() {
      return { connect(gain) { this.gain = gain; }, disconnect() { this.disconnected = true; },
        start(at, offset = 0) { starts.push({ source: this, at, offset }); },
        stop() { stops.push(this); } };
    },
  };
  let contexts = 0;
  const lib = { config: { volumn_audio: 6 }, skill: {} };
  const game = { playAudio() {}, playCardAudio() { this.playAudio('card/male/sha'); }, addGlobalSkill() {}, removeGlobalSkill() {} };
  const controller = installCardAudio({ lib, game, get: { type: () => 'basic' } }, { clips: { [cardClip.key]: cardClip } }, {
    host: {}, surface: { addEventListener(name, fn) { listeners.set(name, fn); }, removeEventListener(name) { listeners.delete(name); } },
    baseURL: new URL('http://localhost/sgs/'), enabled, musicManifest: withMusic ? musicManifest : undefined, timers,
    createContext: () => { contexts++; return createContext ? createContext(context) : context; },
    fetch: async (url, options) => {
      const music = String(url).includes('/background/');
      requests.push({ music, url: String(url), signal: options.signal });
      return fetcher ? fetcher(music, options, requests) : response(music);
    },
  });
  return { controller, context, game, starts, stops, requests, listeners, contexts: () => contexts,
    music: () => starts.filter(row => row.source.loop), cards: () => starts.filter(row => !row.source.loop) };
}

test('first allowed gesture starts one low-volume loop on the existing voice context', async () => {
  const h = harness();
  try {
    assert.equal(h.contexts(), 0);
    assert.equal(h.requests.length, 0);
    await h.controller.unlock(); await h.controller.whenIdle();
    assert.equal(h.music().length, 1);
    assert.equal(h.contexts(), 1);
    assert.equal(h.music()[0].source.gain.gain.value, 0.25);
    await h.controller.unlock(); await h.controller.unlock(); await h.controller.whenIdle();
    h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: {} });
    await h.controller.whenIdle();
    assert.equal(h.music().length, 1);
    assert.equal(h.cards().length, 1);
    assert.equal(h.contexts(), 1);
    assert.equal(h.controller.status().played, 1, 'music must not consume voice/effect counters');
  } finally { h.controller.dispose(); }
});

test('stored mute never creates or downloads music until explicitly enabled', async () => {
  const h = harness({ enabled: false });
  try {
    h.listeners.get('pointerdown')(); await h.controller.unlock();
    assert.equal(h.contexts(), 0); assert.equal(h.requests.length, 0);
    h.controller.setEnabled(true); await tick(); await h.controller.whenIdle();
    assert.equal(h.music().length, 1);
    h.controller.setEnabled(false);
    assert.equal(h.stops.length, 1);
  } finally { h.controller.dispose(); }
});

test('old preference records gain quiet music without changing mute or any existing volume', () => {
  const values = new Map([[preferencesKey, JSON.stringify({ version: 1, sound: false, cardVolume: 0.4, heroVolume: 0.25, effectVolume: 0.6 })]]);
  const storage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const preferences = createPreferences(() => storage);
  assert.equal(preferences.get().musicVolume, 0.25);
  assert.equal(preferences.get().sound, false);
  assert.equal(preferences.get().cardVolume, 0.4);
  assert.equal(preferences.get().heroVolume, 0.25);
  assert.equal(preferences.get().effectVolume, 0.6);
  preferences.set({ musicVolume: 0 });
  assert.equal(createPreferences(() => storage).get().musicVolume, 0);
});

test('music pauses at its loop offset, ignores old ended callbacks and adjusts independently of voices', async () => {
  const h = harness();
  try {
    await h.controller.unlock(); await h.controller.whenIdle();
    const first = h.music()[0].source, oldEnded = first.onended;
    h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: {} }); await h.controller.whenIdle();
    h.context.currentTime = 127;
    h.controller.setMusicState({ paused: true });
    assert.equal(h.controller.status().music.offset, 17);
    assert.equal(h.stops.length, 1);
    assert.equal(first.disconnected, true); assert.equal(first.gain.disconnected, true);
    assert.equal(h.cards()[0].source.gain.gain.value, 0.75);
    h.context.currentTime = 210;
    h.controller.setMusicState({ paused: false }); await h.controller.whenIdle();
    assert.equal(h.music().length, 2); assert.equal(h.music()[1].offset, 17);
    assert.equal(h.requests.filter(row => row.music).length, 1, 'one decoded track is reused');
    oldEnded();
    assert.equal(h.controller.status().music.playing, true, 'old callbacks cannot stop the replacement');
    h.controller.setVolume('music', 0.1);
    assert.equal(h.music()[1].source.gain.gain.value, 0.1);
    assert.equal(h.cards()[0].source.gain.gain.value, 0.75);
    h.context.currentTime = 215; h.controller.setVolume('music', 0);
    assert.equal(h.controller.status().music.state, 'silent');
    assert.equal(h.stops.length, 2);
    h.context.currentTime = 240; h.controller.setVolume('music', 0.6); await h.controller.whenIdle();
    assert.equal(h.music()[2].offset, 22);
    assert.equal(h.music()[2].source.gain.gain.value, 0.6);
    assert.equal(h.context.resumes, 1, 'music never suspends or independently unlocks the context');
  } finally { h.controller.dispose(); }
});

test('music-only cancellation leaves a pending voice loader and its queue intact', async () => {
  let releaseMusic, releaseCard, musicRequests = 0;
  const h = harness({ fetcher: music => music
    ? ++musicRequests === 1 ? new Promise(resolve => { releaseMusic = resolve; }) : response(true)
    : new Promise(resolve => { releaseCard = resolve; }) });
  try {
    await h.controller.unlock();
    h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: {} });
    await tick();
    h.controller.setMusicState({ paused: true });
    assert.equal(h.requests.find(row => row.music).signal.aborted, true);
    assert.equal(h.requests.find(row => !row.music).signal.aborted, false);
    releaseCard(response(false)); await h.controller.whenIdle();
    assert.equal(h.cards().length, 1); assert.equal(h.music().length, 0);
    releaseMusic(response(true)); await tick(); assert.equal(h.music().length, 0);
    h.controller.setMusicState({ paused: false }); await h.controller.whenIdle();
    assert.equal(h.music().length, 1); assert.equal(h.cards().length, 1);
  } finally { h.controller.dispose(); }
});

test('one eight-second music deadline covers fetch, body and decode without blocking later voices or auto-retrying', async () => {
  for (const stage of ['fetch', 'body', 'decode']) {
    const tasks = new Map(); let timer = 0, failing = true;
    const timers = { setTimeout(fn, delay) { assert.equal(delay, 8000); tasks.set(++timer, fn); return timer; }, clearTimeout(id) { tasks.delete(id); } };
    const never = () => new Promise(() => {});
    const h = harness({ timers,
      fetcher: music => music && failing && stage === 'fetch' ? never()
        : music && failing && stage === 'body' ? { ok: true, arrayBuffer: never } : response(music),
      decode: async bytes => bytes.byteLength === 1 && failing && stage === 'decode' ? never() : { duration: bytes.byteLength === 1 ? 100 : 0.8 },
    });
    try {
      await h.controller.unlock(); await tick();
      h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: {} }); await tick();
      assert.equal(h.cards().length, 1); assert.equal(h.music().length, 0);
      assert.equal(tasks.size, 1);
      for (const fire of [...tasks.values()]) fire();
      await h.controller.whenIdle();
      assert.equal(h.controller.status().music.state, 'failed');
      assert.match(h.controller.status().music.lastError, /超时/);
      assert.equal(h.requests.find(row => row.music).signal.aborted, true);
      assert.equal(tasks.size, 0);
      for (let i = 0; i < 20; i++) {
        await h.controller.unlock();
        h.controller.setMusicState({ paused: false });
      }
      h.controller.setMusicState({ paused: true }); h.controller.setMusicState({ paused: false });
      assert.equal(h.requests.filter(row => row.music).length, 1, 'gestures, refresh and modal closure cannot retry a failed track');
      failing = false;
      h.controller.setEnabled(false); h.controller.setEnabled(true); await tick(); await h.controller.whenIdle();
      assert.equal(h.music().length, 1); assert.equal(h.controller.status().music.lastError, null);
    } finally { h.controller.dispose(); }
  }
});

test('late music decoding is inert after mute, zero volume, pause, result or disposal', async () => {
  for (const action of ['mute', 'zero', 'pause', 'end', 'dispose']) {
    let release, decodes = 0;
    const h = harness({ decode: async bytes => bytes.byteLength === 1 && ++decodes === 1
      ? new Promise(resolve => { release = resolve; }) : { duration: 100 } });
    await h.controller.unlock(); await tick();
    if (action === 'mute') h.controller.setEnabled(false);
    else if (action === 'zero') h.controller.setVolume('music', 0);
    else if (action === 'pause') h.controller.setMusicState({ paused: true });
    else if (action === 'end') h.controller.setMusicState({ ended: true });
    else h.controller.dispose();
    await h.controller.whenIdle();
    assert.equal(h.requests[0].signal.aborted, true);
    release({ duration: 100 }); await tick();
    assert.equal(h.music().length, 0);
    if (action === 'mute') h.controller.setEnabled(true);
    else if (action === 'zero') h.controller.setVolume('music', 0.25);
    else h.controller.setMusicState({ paused: false, ended: false });
    await h.controller.unlock(); await h.controller.whenIdle();
    assert.equal(h.music().length, ['end', 'dispose'].includes(action) ? 0 : 1);
    h.controller.dispose();
  }
});

test('obsolete decoding cannot overwrite a newer resumed music source or cache entry', async () => {
  let release, decodes = 0;
  const h = harness({ decode: async () => ++decodes === 1 ? new Promise(resolve => { release = resolve; }) : { duration: 40 } });
  try {
    await h.controller.unlock(); await tick();
    h.controller.setMusicState({ paused: true });
    h.controller.setMusicState({ paused: false }); await h.controller.whenIdle();
    assert.equal(h.music().length, 1); assert.equal(h.music()[0].source.buffer.duration, 40);
    release({ duration: 999 }); await tick();
    assert.equal(h.music().length, 1); assert.equal(h.music()[0].source.buffer.duration, 40);
    h.controller.setMusicState({ paused: true }); h.controller.setMusicState({ paused: false }); await h.controller.whenIdle();
    assert.equal(h.music()[1].source.buffer.duration, 40); assert.equal(h.requests.length, 2);
  } finally { h.controller.dispose(); }
});

test('a pending context unlock cannot start music behind a menu or after terminal cleanup', async () => {
  for (const action of ['pause', 'end', 'dispose']) {
    const h = harness(); let release;
    h.context.resume = () => new Promise(resolve => { release = () => { h.context.state = 'running'; resolve(); }; });
    const unlocking = h.controller.unlock();
    if (action === 'dispose') h.controller.dispose();
    else h.controller.setMusicState(action === 'pause' ? { paused: true } : { ended: true });
    release(); await unlocking; await h.controller.whenIdle();
    assert.equal(h.requests.length, 0); assert.equal(h.music().length, 0);
    h.controller.setMusicState({ paused: false, ended: false }); await h.controller.whenIdle();
    assert.equal(h.music().length, action === 'pause' ? 1 : 0);
    h.controller.dispose();
  }
});

test('HTTP and audio device failures stay local to music and require an explicit retry', async () => {
  for (const failure of ['http', 'decode', 'source', 'start']) {
    let failing = true;
    const h = harness({ fetcher: music => music && failing && failure === 'http' ? { ok: false, status: 404 } : response(music),
      decode: async bytes => { if (bytes.byteLength === 1 && failing && failure === 'decode') throw Error('decoder failure'); return { duration: 100 }; } });
    const create = h.context.createBufferSource;
    h.context.createBufferSource = () => {
      if (failing && failure === 'source') throw Error('source failure');
      const source = create();
      const start = source.start;
      source.start = function (...args) { if (failing && failure === 'start') throw Error('start failure'); start.apply(this, args); };
      return source;
    };
    try {
      await h.controller.unlock(); await h.controller.whenIdle();
      assert.equal(h.controller.status().music.state, 'failed'); assert.equal(h.music().length, 0);
      const requested = h.requests.length;
      failing = false;
      await h.controller.unlock(); await h.controller.whenIdle();
      assert.equal(h.requests.length, requested, 'a new gesture cannot retry a failed track');
      h.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: {} }); await h.controller.whenIdle();
      assert.equal(h.cards().length, 1, 'voice playback survives the music failure');
      h.controller.setEnabled(false); h.controller.setEnabled(true); await tick(); await h.controller.whenIdle();
      assert.equal(h.music().length, 1);
    } finally { h.controller.dispose(); }
  }
});

test('missing music manifests and unsupported devices never block the table or request upstream music', async () => {
  const unavailable = harness({ withMusic: false });
  try {
    await unavailable.controller.unlock(); await unavailable.controller.whenIdle();
    assert.equal(unavailable.controller.status().music.state, 'unavailable');
    assert.equal(unavailable.requests.length, 0);
    unavailable.controller.playCommitted({ name: 'useCard', card: { name: 'sha' }, player: {} }); await unavailable.controller.whenIdle();
    assert.equal(unavailable.cards().length, 1);
  } finally { unavailable.controller.dispose(); }
  let failures = true;
  const h = harness({ createContext: context => { if (failures) throw Error('no device'); return context; } });
  try {
    assert.equal(await h.controller.unlock(), false); assert.equal(h.requests.length, 0);
    failures = false;
    await h.controller.unlock(); await h.controller.whenIdle(); assert.equal(h.music().length, 1);
  } finally { h.controller.dispose(); }
});

test('the only music asset is byte-identical to the pinned upstream default battle recording', async () => {
  const base = new URL('../../apps/core/sgs/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('music-audio.json', base), 'utf8'));
  assert.equal(manifest.upstreamCommit, '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a');
  assert.equal(manifest.uniqueFiles, 1); assert.equal(manifest.totalBytes, 3543457);
  assert.deepEqual(Object.keys(manifest.clips), ['background/music_default']);
  const clip = manifest.clips['background/music_default'];
  assert.equal(clip.file, 'audio/background/music_default.mp3');
  assert.equal(clip.sourceUrl, `https://raw.githubusercontent.com/libnoname/noname/${manifest.upstreamCommit}/apps/core/audio/background/music_default.mp3`);
  const bytes = await readFile(new URL(clip.file, base));
  assert.equal(bytes.length, clip.bytes); assert.equal(bytes.length, 3543457);
  assert.equal(createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex'), 'eaccd4570b89a824cf5300e5d8601d605828c054');
  assert.equal(clip.sourceGitBlob, 'eaccd4570b89a824cf5300e5d8601d605828c054');
  assert.equal(createHash('sha256').update(bytes).digest('hex'), clip.sha256);
  assert.equal(clip.sha256, '5fcefad6d89c2471c2aae05735c7d0cf6faeba015c2679bc6060afb85f8fef9d');
  assert.deepEqual(await readdir(new URL('audio/background/', base)), ['music_default.mp3']);
});
