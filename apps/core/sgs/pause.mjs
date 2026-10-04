// pause2 is a native boolean gate, not a reference counter. Keep native calls
// boolean too, while giving each SGS dialog/background/manual pause its own lease.
// Never call resume/uncheck/check: the native human choice and selection survive.
export function installOwnedPause({ game, _status, now = () => performance.now() }) {
  const nativePause = game.pause2;
  const nativeResume = game.resume2;
  const owners = new Set();
  let nativeHeld = !!_status.paused2, disposed = false;
  let last = now(), elapsed = 0, wasPaused = !!_status.paused2, ended = !!_status.over;
  function sample() {
    const current = now();
    if (!wasPaused && !ended) elapsed += Math.max(0, current - last);
    last = current;
    wasPaused = nativeHeld || owners.size > 0;
    ended ||= !!_status.over;
    return elapsed;
  }
  function change(action) {
    sample();
    const result = action();
    wasPaused = nativeHeld || owners.size > 0;
    return result;
  }
  let resumeQueued = false;
  function releaseGate() {
    if (resumeQueued) return;
    resumeQueued = true;
    // Native Deferred.resolve clears asynchronously. Coalesce close/open in the
    // same turn before asking it to resolve, so a new dialog retains the gate.
    queueMicrotask(() => {
      resumeQueued = false;
      if (!disposed && !nativeHeld && !owners.size) nativeResume.call(game);
    });
  }
  function pause2(...args) {
    return change(() => { nativeHeld = true; return nativePause.apply(this, args); });
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
      change(() => { owners.add(token); if (!_status.paused2) nativePause.call(game); });
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
      owners.clear();
      if (!nativeHeld) change(() => nativeResume.call(game));
      if (game.pause2 === pause2) game.pause2 = nativePause;
      if (game.resume2 === resume2) game.resume2 = nativeResume;
      disposed = true;
    },
  };
}
