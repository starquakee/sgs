// SGS adapter, GPL-3.0. Preserve native card-name/nature/sex resolution and
// committed use/respond timing, while serving only local, allowlisted audio.
import { resolveCharacterAudio } from './character-audio.mjs';
import { resolveDamageAudio } from './damage-audio.mjs';
export function resolveCardAudio(path, manifest) {
  const key = String(path).replace(/^audio\//, '').replace(/\.(mp3|ogg)$/i, '');
  if (!/^card\/(male|female|shared)\/[a-z0-9_]+$/i.test(key)) return null;
  const resolved = manifest.aliases?.[key] || key;
  return manifest.clips?.[resolved] || null;
}

export function installCardAudio({ lib, game, get }, manifest, options = {}) {
  const surface = options.surface || globalThis.document;
  const host = options.host || globalThis;
  const fetchAudio = options.fetch || globalThis.fetch.bind(globalThis);
  // Keep the directory expression dynamic so Vite does not treat './' as an
  // asset import and rewrite it to '/sgs' without the trailing slash.
  const moduleDirectory = './';
  const audioRoot = options.baseURL || new URL(moduleDirectory, import.meta.url);
  const createContext = options.createContext || (() => {
    const AudioContext = host.AudioContext || host.webkitAudioContext;
    return AudioContext ? new AudioContext() : null;
  });
  const nativePlayAudio = game.playAudio;
  const nativePlayCardAudio = game.playCardAudio;
  const skillName = '_sgs_local_card_audio';
  const seenEvents = new WeakSet();
  const seenDamageEvents = new WeakSet();
  const buffers = new Map();
  const playing = new Map();
  const volumes = { card: 1, hero: 1, effect: 1 };
  const jobs = new Set();
  const voices = {
    card: { nextStart: 0, queue: Promise.resolve(), last: null },
    hero: { nextStart: 0, queue: Promise.resolve(), last: null },
  };
  const state = { enabled: options.enabled !== false, played: 0, effectPlayed: 0, pending: 0, blocked: false, lastClip: null, lastLabel: null, lastEffect: null, lastEffectLabel: null, lastError: null };
  let context;
  let disposed = false;
  let generation = 0;
  let cardEvent = null;
  let preload;

  const changed = () => options.onStateChange?.(controller.status());
  function ensureContext() {
    if (!context && !disposed) context = createContext();
    return context;
  }
  function unlock() {
    if (!state.enabled || disposed) return Promise.resolve(false);
    const ctx = ensureContext();
    if (!ctx) {
      state.lastError = '当前浏览器不支持声音播放。';
      changed();
      return Promise.resolve(false);
    }
    // resume() is called synchronously from the click/key handler. One shared
    // context keeps subsequent AI clips unlocked across fresh buffer sources.
    const resumed = ctx.state === 'running' ? Promise.resolve() : ctx.resume();
    return Promise.resolve(resumed).then(() => {
      state.blocked = ctx.state !== 'running';
      if (!state.blocked && !preload && options.damageManifest) {
        // Warm the small hit pack after a user gesture. Loading never plays a
        // sound, and a failed warm-up can retry on the real damage request.
        preload = Promise.all(Object.values(options.damageManifest.clips).map(clip => load(clip).catch(() => null)));
      }
      changed();
      return !state.blocked;
    }).catch(error => {
      state.blocked = true;
      state.lastError = error.message;
      changed();
      return false;
    });
  }
  function load(clip) {
    if (!buffers.has(clip.file)) {
      buffers.set(clip.file, fetchAudio(new URL(clip.file, audioRoot)).then(async response => {
        if (!response.ok) throw new Error(`声音载入失败：${response.status}`);
        return context.decodeAudioData(await response.arrayBuffer());
      }).catch(error => { buffers.delete(clip.file); throw error; }));
    }
    return buffers.get(clip.file);
  }
  function stop() {
    generation++;
    for (const source of playing.keys()) {
      try { source.stop(); } catch {}
    }
    playing.clear();
    for (const voice of Object.values(voices)) {
      voice.nextStart = 0;
      voice.queue = Promise.resolve();
    }
  }
  function play(clip, event, audioOptions = {}, channel = 'card') {
    const immediate = channel === 'effect';
    const voice = voices[channel];
    const seen = immediate ? seenDamageEvents : seenEvents;
    if (!clip || !state.enabled || disposed || (event && seen.has(event))) return;
    const ctx = ensureContext();
    if (!ctx || ctx.state !== 'running') {
      state.blocked = true;
      changed();
      return;
    }
    if (event) seen.add(event);
    const token = generation;
    state.pending++;
    // Each voice category preserves invocation order without waiting on the
    // other's decoding or playback. Damage still starts immediately.
    const decoded = load(clip);
    decoded.catch(() => {});
    const schedule = async () => {
      try {
        const buffer = await decoded;
        if (disposed || token !== generation || !state.enabled) return;
        const source = ctx.createBufferSource();
        const gain = ctx.createGain();
        source.buffer = buffer;
        const baseGain = Math.max(0, Math.min(1, Number(lib.config.volumn_audio ?? 6) / 8));
        gain.gain.value = baseGain * volumes[channel];
        source.connect(gain);
        gain.connect(ctx.destination);
        source.onended = event => {
          playing.delete(source);
          source.disconnect();
          gain.disconnect();
          audioOptions.onEnded?.(event);
        };
        playing.set(source, { gain, channel, baseGain });
        const start = immediate ? ctx.currentTime : Math.max(ctx.currentTime, voice.nextStart);
        source.start(start);
        if (!immediate) {
          voice.nextStart = start + buffer.duration + 0.04;
          voice.last = { clip: clip.key, start, end: start + buffer.duration };
        }
        state.played++;
        state.lastClip = clip.key;
        state.lastLabel = clip.label || null;
        if (immediate) {
          state.effectPlayed++;
          state.lastEffect = clip.key;
          state.lastEffectLabel = clip.label;
        }
        state.lastError = null;
        state.blocked = false;
        audioOptions.onCanPlay?.();
        audioOptions.onPlay?.();
      } catch (error) {
        // A canceled load must not invoke the native fallback after unmuting.
        if (disposed || token !== generation || !state.enabled) return;
        state.lastError = error.message;
        audioOptions.onError?.(error);
      } finally {
        state.pending--;
        changed();
      }
    };
    const job = immediate ? schedule() : (voice.queue = voice.queue.catch(() => {}).then(schedule));
    jobs.add(job);
    job.then(() => jobs.delete(job), () => jobs.delete(job));
  }
  function currentCardEvent() {
    const event = cardEvent || get.event?.();
    return event && ['useCard', 'respond'].includes(event.name) ? event : null;
  }
  function playAudio(...args) {
    const audioOptions = args.length === 1 && args[0] && typeof args[0] === 'object'
      ? args[0] : { path: args.filter(arg => typeof arg === 'string' || typeof arg === 'number').join('/') };
    const clip = resolveCardAudio(audioOptions.path, manifest);
    // Hero lines have their own queue on the shared unlocked context, and do
    // not consume card-event deduplication when the same play triggers a skill.
    if (clip) play(clip, currentCardEvent(), audioOptions);
    else {
      const damageEvent = get.event?.();
      const impact = resolveDamageAudio(audioOptions.path, options.damageManifest, damageEvent);
      if (impact) play(impact, damageEvent, audioOptions, 'effect');
      else play(resolveCharacterAudio(audioOptions.path, options.characterManifest), null, audioOptions, 'hero');
    }
  }
  function playCardAudio(...args) {
    if (!state.enabled || disposed) return;
    return nativePlayCardAudio.apply(this, args);
  }
  function playCommitted(event) {
    if (!event?.card || event.audio === false || seenEvents.has(event)) return;
    const previous = cardEvent;
    cardEvent = event;
    try { game.playCardAudio(event.card, event.player); }
    finally { cardEvent = previous; }
  }
  const gesture = () => { void unlock(); };
  const controller = {
    status: () => ({ ...state, volumes: { ...volumes }, contextState: context?.state || 'uninitialized', loaded: buffers.size, scheduled: playing.size,
      channels: Object.fromEntries(Object.entries(voices).map(([name, voice]) => [name, voice.last && { ...voice.last }])) }),
    setVolume(channel, value) {
      if (!Object.hasOwn(volumes, channel)) return undefined;
      if (disposed || typeof value !== 'number' || !Number.isFinite(value)) return volumes[channel];
      volumes[channel] = Math.max(0, Math.min(1, value));
      // Update both sounding and future-scheduled sources without restarting
      // them or moving either voice queue's clock. Pending loads read on play.
      for (const source of playing.values()) {
        if (source.channel === channel) source.gain.gain.value = source.baseGain * volumes[channel];
      }
      changed();
      return volumes[channel];
    },
    setEnabled(enabled) {
      state.enabled = Boolean(enabled);
      lib.config.background_audio = state.enabled;
      lib.config.equip_audio = state.enabled;
      if (!state.enabled) stop();
      else void unlock();
      changed();
      return state.enabled;
    },
    unlock,
    // Used only by the committed engine trigger, also exposed for deterministic
    // adapter tests. UI card selection must never call this method.
    playCommitted,
    whenIdle: () => Promise.all([...jobs, preload]),
    dispose() {
      if (disposed) return;
      disposed = true;
      stop();
      surface?.removeEventListener('pointerdown', gesture, true);
      surface?.removeEventListener('keydown', gesture, true);
      host.removeEventListener?.('pagehide', controller.dispose);
      if (game.playAudio === playAudio) game.playAudio = nativePlayAudio;
      if (game.playCardAudio === playCardAudio) game.playCardAudio = nativePlayCardAudio;
      game.removeGlobalSkill?.(skillName);
      delete lib.skill[skillName];
      if (context && context.state !== 'closed') void context.close().catch(() => {});
    },
  };
  game.playAudio = playAudio;
  game.playCardAudio = playCardAudio;
  // Some native skill conversions suppress card voice in favor of a hero line.
  // Supplement card names only after the real engine commits use/respond.
  // A WeakSet prevents duplicates with the normal native path.
  lib.skill[skillName] = {
    trigger: { player: ['useCard1', 'respond'] }, forced: true, silent: true,
    popup: false, charlotte: true, firstDo: true, priority: 10000, forceDie: true,
    // Async content retains this adapter closure in Noname's compiler; legacy
    // synchronous "step" functions are stringified and lose lexical bindings.
    async content(event, trigger) { playCommitted(trigger); },
  };
  game.addGlobalSkill(skillName);
  surface?.addEventListener('pointerdown', gesture, true);
  surface?.addEventListener('keydown', gesture, true);
  host.addEventListener?.('pagehide', controller.dispose, { once: true });
  return controller;
}
