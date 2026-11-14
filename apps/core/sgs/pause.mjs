// pause2 is a native boolean gate, not a reference counter. Keep native calls
// boolean too, while giving each SGS dialog/background/manual pause its own lease.
// Never call resume/uncheck/check: the native human choice and selection survive.
export function installOwnedPause({ game, _status, now = () => performance.now(), onChange }) {
  const nativePause = game.pause2;
  const nativeResume = game.resume2;
  const owners = new Set();
  let nativeHeld = !!_status.paused2, disposed = false;
  let resumeTimer = null;
  let last = now(), elapsed = 0, wasPaused = !!_status.paused2, ended = !!_status.over;
  let notifiedPaused = wasPaused;
  function notify() {
    const paused = nativeHeld || owners.size > 0 || resumeTimer !== null || !!_status.paused2;
    if (disposed || paused === notifiedPaused) return;
    notifiedPaused = paused;
    // Observers cannot affect native pause ownership or its return value.
    try { onChange?.(paused); } catch {}
  }
  function sample() {
    const current = now();
    if (!wasPaused && !ended) elapsed += Math.max(0, current - last);
    last = current;
    wasPaused = nativeHeld || owners.size > 0 || resumeTimer !== null;
    ended ||= !!_status.over;
    return elapsed;
  }
  function change(action) {
    sample();
    const result = action();
    wasPaused = nativeHeld || owners.size > 0 || resumeTimer !== null;
    // Native Deferred.resolve clears isStarted asynchronously. Observe its
    // completion, then recheck current ownership; a newer modal or disposal
    // must make the old completion inert. Never resolve the gate ourselves.
    if (!wasPaused && _status.paused2 && _status.pauseManager?.pause2) {
      Promise.resolve(_status.pauseManager.pause2).then(notify, () => {});
    } else notify();
    return result;
  }
  function cancelRelease() {
    if (resumeTimer !== null) clearTimeout(resumeTimer);
    resumeTimer = null;
  }
  function releaseGate() {
    if (resumeTimer !== null) return;
    // Native Deferred.resolve cannot be undone once called. Wait for all current
    // microtasks, including nested promise handoffs, before releasing the gate.
    resumeTimer = setTimeout(() => change(() => {
      resumeTimer = null;
      if (!disposed && !nativeHeld && !owners.size) nativeResume.call(game);
    }), 0);
  }
  function pause2(...args) {
    return change(() => { cancelRelease(); nativeHeld = true; return nativePause.apply(this, args); });
  }
  function resume2() {
    change(() => { nativeHeld = false; if (!owners.size) releaseGate(); });
    // Do not briefly resolve the native promise and then pause again: resolving
    // it could allow an AI event to advance while a modal is still open.
  }
  game.pause2 = pause2;
  game.resume2 = resume2;
  return {
    acquire(reason) {
      if (disposed) return () => {};
      const token = { reason };
      change(() => { cancelRelease(); owners.add(token); if (!_status.paused2) nativePause.call(game); });
      let released = false;
      return () => {
        if (released || disposed) return;
        released = true;
        change(() => { owners.delete(token); if (!owners.size && !nativeHeld) releaseGate(); });
      };
    },
    elapsedMs: sample,
    reasons: () => [...owners].map(owner => owner.reason),
    dispose() {
      if (disposed) return;
      change(() => {
        cancelRelease(); owners.clear();
        if (!nativeHeld) nativeResume.call(game);
      });
      if (game.pause2 === pause2) game.pause2 = nativePause;
      if (game.resume2 === resume2) game.resume2 = nativeResume;
      disposed = true;
    },
  };
}
