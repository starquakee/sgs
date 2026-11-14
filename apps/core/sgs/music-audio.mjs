import { createAudioLoader } from './audio-loads.mjs';

// One loop owns its source and loader, but never creates, suspends or closes the
// shared voice context. Pausing music must not cancel a pending card or effect.
export function createBackgroundMusic({ clip, fetcher, baseURL, timeout = 8000, timers = globalThis,
  enabled = true, volume = 0.25, onStateChange = () => {} }) {
  const buffers = createAudioLoader({ fetcher, baseURL, timeout, timers });
  let context, active, pending, offset = 0, generation = 0;
  let paused = false, ended = false, disposed = false, failed = false, lastError = null;
  const ready = () => clip && enabled && volume > 0 && !paused && !ended && !disposed && !failed && context?.state === 'running';
  const position = () => active ? (active.offset + Math.max(0, context.currentTime - active.startedAt)) % active.duration : offset;
  const disconnect = source => {
    try { source.node.disconnect(); } catch {}
    try { source.gain.disconnect(); } catch {}
    try { source.node.buffer = null; } catch {}
  };
  function stop() {
    generation++;
    buffers.cancel();
    pending = undefined;
    if (!active) return;
    offset = position();
    const previous = active;
    active = undefined;
    previous.node.onended = null;
    try { previous.node.stop(); } catch {}
    disconnect(previous);
  }
  function start() {
    if (!ready() || active || pending) return;
    const token = generation, ctx = context;
    const current = () => token === generation && ready() && context === ctx;
    const job = buffers.load(clip.file, ctx).then(buffer => {
      if (!current()) return;
      if (!(buffer.duration > 0) || !Number.isFinite(buffer.duration)) throw new Error('背景音乐内容无法播放。');
      let node, gain;
      try {
        node = ctx.createBufferSource(); gain = ctx.createGain();
        node.buffer = buffer; node.loop = true;
        gain.gain.value = volume;
        node.connect(gain); gain.connect(ctx.destination);
        const source = { node, gain, duration: buffer.duration, offset: offset % buffer.duration, startedAt: ctx.currentTime };
        node.onended = () => {
          if (active !== source) return;
          offset = position(); active = undefined; disconnect(source);
          failed = true; lastError = '背景音乐已停止，可关闭再开启声音重试。';
          onStateChange();
        };
        node.start(source.startedAt, source.offset);
        active = source;
        lastError = null;
      } catch (error) {
        if (node) { node.onended = null; try { node.stop(); } catch {} }
        disconnect({ node, gain });
        throw error;
      }
    }).catch(error => {
      if (!current()) return;
      // A refresh, repeated key press or modal close cannot create a retry
      // storm. An explicit off/on starts a fresh attempt in this same match.
      failed = true;
      lastError = error?.message || '背景音乐暂时无法播放。';
    }).finally(() => {
      if (pending !== job) return;
      pending = undefined;
      onStateChange();
    });
    pending = job;
    onStateChange();
  }
  return {
    status: () => ({ state: disposed ? 'disposed' : ended ? 'ended' : !clip ? 'unavailable' : !enabled ? 'muted'
      : paused ? 'paused' : volume === 0 ? 'silent' : failed ? 'failed' : active ? 'playing' : pending ? 'loading' : 'waiting',
      playing: !!active, pending: !!pending, offset: position(), lastError }),
    unlocked(ctx) {
      if (disposed || ended) return;
      context = ctx;
      start();
    },
    setEnabled(value) {
      if (disposed || ended || enabled === value) return;
      enabled = value;
      if (!enabled) stop();
      else { failed = false; lastError = null; start(); }
      onStateChange();
    },
    setVolume(value) {
      if (disposed || ended || volume === value) return;
      volume = value;
      if (volume === 0) stop();
      else if (active) active.gain.gain.value = volume;
      else start();
      onStateChange();
    },
    setActivity(value) {
      if (disposed || ended) return;
      const nextPaused = !!value.paused, nextEnded = !!value.ended;
      if (paused === nextPaused && !nextEnded) return;
      paused = nextPaused; ended = nextEnded;
      if (paused || ended) stop(); else start();
      if (ended) { buffers.dispose(); context = undefined; }
      onStateChange();
    },
    whenIdle: () => pending || Promise.resolve(),
    dispose() {
      if (disposed) return;
      disposed = true; stop(); buffers.dispose(); context = undefined;
      onStateChange();
    },
  };
}
