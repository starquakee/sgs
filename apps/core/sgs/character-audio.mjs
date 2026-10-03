// SGS adapter, GPL-3.0. Preserve native resolution for the curated local voices.
export function resolveCharacterAudio(path, manifest) {
  const key = String(path).replace(/^audio\//, '').replace(/\.mp3$/i, '');
  return /^(skill|die)\/[a-z0-9_]+$/.test(key) && Object.hasOwn(manifest?.clips || {}, key) ? manifest.clips[key] : null;
}

export function installCharacterAudio({ lib, game }, manifest, options = {}) {
  const host = options.host || globalThis;
  const nativeSkill = game.trySkillAudio;
  const nativeDie = game.tryDieAudio;
  const supported = player => (typeof player === 'string' ? [player] : [player?.name, player?.name1, player?.name2])
    .filter(id => Object.hasOwn(manifest?.characters || {}, id)).map(id => manifest.characters[id]);
  function runNative(method, receiver, args) {
    // The native methods synchronously resolve and enqueue audio. Keep their
    // direct/global-skill guards and random variants, without enabling the
    // unpackaged hero sound tree for the rest of the match.
    const previous = lib.config.background_speak;
    lib.config.background_speak = true;
    try { return method.apply(receiver, args); }
    finally { lib.config.background_speak = previous; }
  }
  function trySkillAudio(skill, player, ...rest) {
    if (!supported(player).some(character => character.skills.includes(skill))) return;
    return runNative(nativeSkill, this, [skill, player, ...rest]);
  }
  function tryDieAudio(player) {
    if (!supported(player).length) return;
    return runNative(nativeDie, this, [player]);
  }
  function dispose() {
    if (game.trySkillAudio === trySkillAudio) game.trySkillAudio = nativeSkill;
    if (game.tryDieAudio === tryDieAudio) game.tryDieAudio = nativeDie;
    host.removeEventListener?.('pagehide', dispose);
  }
  game.trySkillAudio = trySkillAudio;
  game.tryDieAudio = tryDieAudio;
  host.addEventListener?.('pagehide', dispose, { once: true });
  return { dispose };
}
