// Presentation only. Native video calls mark actual phase/damage/death visuals;
// check/uncheck hooks expose the engine's completed target selection decisions.
export function installBattleFeedback({ lib, game, ui, get, _status, preferences,
  document = globalThis.document, timers = globalThis }) {
  const nativeAddVideo = game.addVideo;
  const marked = new Map();
  const seenDamage = new WeakSet(), seenDeath = new WeakSet();
  let disposed = false;
  const reduced = () => preferences.get().reducedMotion;
  function view(player) {
    if (!player || player.parentNode !== ui.arena) return null;
    if (!marked.has(player)) {
      const frame = document.createElement('span'), flash = document.createElement('span');
      frame.className = 'sgs-battle-frame'; flash.className = 'sgs-battle-flash';
      frame.setAttribute('aria-hidden', 'true'); flash.setAttribute('aria-hidden', 'true');
      player.append(frame, flash);
      marked.set(player, { frame, flash, active: false, aim: '', timer: null });
    }
    return marked.get(player);
  }
  function clearPulse(entry) {
    if (entry.timer !== null) timers.clearTimeout(entry.timer);
    entry.timer = null; delete entry.flash.dataset.kind;
  }
  function pulse(player, kind) {
    const entry = view(player);
    if (!entry || reduced() || disposed) return;
    // A later real event replaces a still-visible pulse; no playback backlog.
    clearPulse(entry);
    void entry.flash.offsetWidth;
    entry.flash.dataset.kind = kind;
    entry.timer = timers.setTimeout(() => clearPulse(entry), 240);
  }
  function refresh(event = _status.event) {
    if (disposed) return;
    const mine = !_status.over && !_status.auto && event?.isMine?.() && event.filterTarget;
    const players = new Set([...game.players, ...game.dead]);
    for (const [player, entry] of marked) {
      if (!players.has(player) || player.parentNode !== ui.arena) {
        clearPulse(entry); entry.frame.remove(); entry.flash.remove();
        delete player.dataset.sgsActing; delete player.dataset.sgsAim; marked.delete(player);
      }
    }
    for (const player of players) {
      const entry = view(player);
      if (!entry) continue;
      const alive = !player.classList.contains('dead');
      const active = alive && !_status.over && _status.currentPhase === player;
      const aim = alive && mine ? player.classList.contains('selected') ? 'selected'
        : player.classList.contains('selectable') ? 'legal' : '' : '';
      if (active) player.dataset.sgsActing = 'true'; else delete player.dataset.sgsActing;
      if (aim) player.dataset.sgsAim = aim; else delete player.dataset.sgsAim;
      if (active && !entry.active) pulse(player, 'acting');
      if (aim && aim !== entry.aim) pulse(player, aim);
      entry.active = active; entry.aim = aim;
    }
  }
  function addVideo(type, player, ...args) {
    const result = nativeAddVideo.call(this, type, player, ...args);
    if (disposed || _status.video) return result;
    if (type === 'phaseChange') refresh();
    const event = get.event();
    // $damage records only the native animation path, after all prevention and
    // modification. Respect animate:false, unreal/zero/canceled and victim ID.
    if (type === 'damage' && event?.name === 'damage' && event.player === player
      && event.num > 0 && !event.unreal && !event._cancelled && !seenDamage.has(event)) {
      seenDamage.add(event); pulse(player, 'hit');
    }
    // diex precedes mode victory checks, after native dead/roster mutation.
    if (type === 'diex' && event?.name === 'die' && event.player === player
      && !event._cancelled && !event.reserveOut && player.classList.contains('dead') && !seenDeath.has(event)) {
      seenDeath.add(event); refresh(); pulse(player, 'death');
    }
    return result;
  }
  const checked = event => refresh(event);
  const unchecked = () => refresh();
  lib.hooks.checkEnd.push(checked); lib.hooks.uncheckEnd.push(unchecked);
  game.addVideo = addVideo;
  const unsubscribe = preferences.subscribe(() => {
    if (reduced()) for (const entry of marked.values()) clearPulse(entry);
  });
  refresh();
  return { refresh, dispose() {
    if (disposed) return;
    disposed = true; unsubscribe();
    if (game.addVideo === addVideo) game.addVideo = nativeAddVideo;
    for (const [name, fn] of [['checkEnd', checked], ['uncheckEnd', unchecked]]) {
      const index = lib.hooks[name].indexOf(fn);
      if (index !== -1) lib.hooks[name].splice(index, 1);
    }
    for (const [player, entry] of marked) {
      clearPulse(entry); entry.frame.remove(); entry.flash.remove();
      delete player.dataset.sgsActing; delete player.dataset.sgsAim;
    }
    marked.clear();
  } };
}
