// Observe native recovery at the synchronous HP update, before later skills.
// The native recover sound request occurs before changeHp and is not proof of
// healing: changeHp can still be prevented or changed by its Before/Begin hooks.
export function installRecoveryAudio({ lib, game, get, _status = {} }, onRecovered) {
  let disposed = false;
  const before = new WeakMap();
  const seen = new WeakSet();
  const valid = (event, recovery) => event?.name === 'changeHp' && recovery?.name === 'recover'
    && event.player === recovery.player && event.num > 0 && recovery.num > 0
    && !event._cancelled && !recovery._cancelled && !event.unreal && !recovery.unreal
    && event.audio !== false && recovery.audio !== false && !_status.video;
  function changing(event, { state }) {
    if (disposed) return;
    if (state === 'end') { before.delete(event); return; }
    if (state !== 'begin' || get.event() !== event) return;
    const recovery = event.getParent();
    if (valid(event, recovery) && Number.isFinite(event.player?.hp)) {
      before.set(event, { recovery, player: event.player, hp: event.player.hp });
    }
  }
  function updated(player) {
    if (disposed) return;
    const event = get.event();
    const previous = before.get(event);
    if (!previous || previous.player !== player) return;
    // Content.changeHp's first update is its actual HP write. Consume even a
    // zero delta so later callbacks cannot supply unrelated healing evidence.
    before.delete(event);
    const recovery = event.getParent();
    if (recovery !== previous.recovery || !valid(event, recovery) || seen.has(recovery)
      || !Number.isFinite(player.hp) || !(player.hp > previous.hp)) return;
    seen.add(recovery);
    // Audio remains optional presentation and cannot interrupt native HP rules.
    try { onRecovered(recovery); } catch {}
  }
  game.globalEventHandlers.pushHandler('changeHp', 'onChangeHp', changing);
  lib.hooks.checkUpdate.push(updated);
  return { dispose() {
    if (disposed) return;
    disposed = true;
    game.globalEventHandlers.removeHandler('changeHp', 'onChangeHp', changing);
    const index = lib.hooks.checkUpdate.indexOf(updated);
    if (index !== -1) lib.hooks.checkUpdate.splice(index, 1);
  } };
}
