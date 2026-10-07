// SGS adapter, GPL-3.0. Preserve native resolution for the curated local voices.
export function resolveCharacterAudio(path, manifest) {
  const key = String(path).replace(/^audio\//, '').replace(/\.mp3$/i, '');
  return /^(skill|die)\/[a-z0-9_]+$/.test(key) && Object.hasOwn(manifest?.clips || {}, key) ? manifest.clips[key] : null;
}

// These are the pinned skills' explicit recipient paths, not a general licence
// to announce another character's skills. The native actor remains the speaker.
const recipientVoices = {
  dcliexiang_backup: { id: 'v_liubei', pack: 'xianding', ancestor: 'dcrengou_global', owner: event => event.target,
    recipient: (event, player) => event.player === player },
  dcdianlun: { id: 'v_caopi', pack: 'xianding', ancestor: 'dcjiwei_global', owner: event => event.target || event.targets?.[0],
    recipient: (event, player) => event.player === player },
  dcwoheng: { id: 'v_sunquan', pack: 'xianding', ancestor: 'dcyuhui_buff', owner: event => event.indexedData,
    recipient: (event, player) => event.player === player },
  dczhifeng: { id: 'v_sunce', pack: 'newjiang', ancestor: 'dcweijing', owner: event => event.player,
    recipient: (event, player) => event.targets?.includes(player) },
};

export function installCharacterAudio({ lib, game, get }, manifest, options = {}) {
  const host = options.host || globalThis;
  const nativeSkill = game.trySkillAudio;
  const nativeDie = game.tryDieAudio;
  const names = player => typeof player === 'string' ? [player] : [player?.name, player?.name1, player?.name2];
  const supported = player => names(player)
    .filter(id => Object.hasOwn(manifest?.characters || {}, id)).map(id => manifest.characters[id]);
  const curated = (id, pack, skill) => manifest?.characters?.[id]?.pack === pack && manifest.characters[id].skills.includes(skill);
  const ownerMatches = (owner, policy, skill) => owner && typeof owner === 'object' && names(owner).includes(policy.id)
    && curated(policy.id, policy.pack, skill);
  let inherited = new WeakMap(), disposed = false;
  const mark = 'dcjunhe_effect', hookName = '_sgs_character_audio_grants';
  const sourcePolicy = { id: 'v_caocao', pack: 'xianding' };
  const liveEffect = (player, shown) => player?.hasSkill?.(mark) && player.countMark?.(mark) > 0
    && Array.isArray(shown) && shown.length > 0 && player.getStorage?.('dcjunhe_shown') === shown;
  function inheritedVoice(player) {
    const grant = inherited.get(player);
    if (grant && curated(sourcePolicy.id, sourcePolicy.pack, mark) && liveEffect(player, grant.shown)) return true;
    inherited.delete(player);
    return false;
  }
  function recipientVoice(skill, player) {
    if (!player || typeof player !== 'object') return false;
    if (skill === mark) return inheritedVoice(player);
    const policy = recipientVoices[skill];
    if (!policy) return false;
    const ancestor = get?.event?.()?.getParent?.(policy.ancestor, true, true);
    const owner = ancestor && policy.owner(ancestor);
    return ancestor && owner !== player && policy.recipient(ancestor, player) && ownerMatches(owner, policy, skill);
  }
  const removedSkill = (skill, player) => { if (skill === mark) inherited.delete(player); };
  // Native addMark queues an emptyEvent with its actual recipient and direct
  // parent. dcxiongwei synchronously copies shown data and adds the skill before
  // that queued event runs. This also works when the skill remains at zero marks.
  // A useSkillAfter listener would miss this triggered skill entirely.
  const grantHook = {
    trigger: { global: ['addMark', 'removeMark'] }, forced: true, silent: true, popup: false,
    charlotte: true, firstDo: true, priority: 10000, forceDie: true, forceOut: true,
    filter(event, player) { return !disposed && event.player === player && event.markName === mark; },
    async content(event, trigger) {
      const player = trigger.player;
      if (disposed) return;
      if (trigger.name === 'removeMark') { inheritedVoice(player); return; }
      const parent = trigger.getParent(1, true), owner = parent?.player;
      const shown = player.getStorage?.('dcjunhe_shown');
      if (parent?.name === 'dcxiongwei' && owner !== player && Number.isFinite(trigger.num) && trigger.num > 0
        && ownerMatches(owner, sourcePolicy, mark) && curated(sourcePolicy.id, sourcePolicy.pack, 'dcxiongwei')
        && shown === owner.getStorage?.('dcjunhe_shown') && liveEffect(player, shown)) {
        inherited.set(player, { owner, shown });
      } else inherited.delete(player);
    },
  };
  const trackGrants = !!get?.event && curated(sourcePolicy.id, sourcePolicy.pack, mark);
  const previousHook = lib.skill[hookName];
  if (trackGrants) {
    lib.skill[hookName] = grantHook;
    game.addGlobalSkill(hookName);
    lib.hooks?.removeSkillCheck?.push(removedSkill);
  }
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
    if (disposed || (!supported(player).some(character => character.skills.includes(skill)) && !recipientVoice(skill, player))) return;
    return runNative(nativeSkill, this, [skill, player, ...rest]);
  }
  function tryDieAudio(player) {
    if (disposed || !supported(player).length) return;
    return runNative(nativeDie, this, [player]);
  }
  function dispose() {
    if (disposed) return;
    disposed = true; inherited = new WeakMap();
    if (trackGrants) {
      if (lib.skill[hookName] === grantHook) {
        game.removeGlobalSkill(hookName);
        if (previousHook) lib.skill[hookName] = previousHook; else delete lib.skill[hookName];
      }
      const hooks = lib.hooks?.removeSkillCheck, index = hooks?.indexOf(removedSkill) ?? -1;
      if (index !== -1) hooks.splice(index, 1);
    }
    if (game.trySkillAudio === trySkillAudio) game.trySkillAudio = nativeSkill;
    if (game.tryDieAudio === tryDieAudio) game.tryDieAudio = nativeDie;
    host.removeEventListener?.('pagehide', dispose);
  }
  game.trySkillAudio = trySkillAudio;
  game.tryDieAudio = tryDieAudio;
  host.addEventListener?.('pagehide', dispose, { once: true });
  return { dispose };
}
