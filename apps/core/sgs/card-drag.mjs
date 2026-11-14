// Desktop drag is an explicit confirmation gesture. The engine still owns every
// card/target check and the final choice result; ordinary clicks stay untouched.
export function installCardDrag({ lib, game, ui, get, _status }, { document = globalThis.document, host = globalThis.window } = {}) {
  let gesture, line, frame, clickTimer, dragEvent, suppressClick = false, draggedSequence = false;
  let disposed = false, changing = false;
  const exactOne = value => get.select(value).every(count => count === 1);
  const simpleInfo = info => info && !info.notarget && !info.multitarget
    && !info.complexTarget && !info.complexSelect && !info.singleCard;
  const available = event => !disposed && !document.hidden && !_status.auto && !_status.over
    && !_status.paused2 && !_status.dragged && !ui.intro && !event?.finished
    && event?.isMine?.() && event.player === game.me && event.name === 'chooseToUse'
    && event.type === 'phase' && !event.skill && !event._get_card
    && !event.complexCard && !event.complexTarget && !event.complexSelect && !event.multitarget
    && !event.filterButton && !ui.selected.buttons.length
    && typeof event.filterCard === 'function' && typeof event.filterTarget === 'function'
    && (typeof event.selectTarget === 'function' ? event.selectTarget === lib.filter.selectTarget : exactOne(event.selectTarget))
    && exactOne(event.selectCard)
    && !['add', 'replace'].some(kind => Object.values(event.custom?.[kind] || {}).some(value => typeof value === 'function'));
  const sameChoice = state => state && _status.event === state.event && available(state.event)
    && state.card.name === state.name && state.event.player.getCards('h').includes(state.card)
    && simpleInfo(get.info(state.card));
  const selectedChoice = state => sameChoice(state) && ui.selected.cards.length === 1
    && ui.selected.cards[0] === state.card && state.card.classList.contains('selected')
    && exactOne(state.event.selectTarget) && simpleInfo(get.info(get.card()));
  const callClick = (kind, node) => {
    const clicked = _status.clicked;
    _status.clicked = false;
    try { return ui.click[kind].call(node); }
    finally { _status.clicked = clicked; }
  };
  const clearClickSuppression = () => {
    suppressClick = false;
    if (clickTimer !== undefined) host.clearTimeout(clickTimer);
    clickTimer = undefined;
  };
  const finish = () => {
    if (gesture?.card) delete gesture.card.dataset.sgsDragging;
    gesture = null;
    line?.remove(); line = null;
    if (frame !== undefined) host.cancelAnimationFrame(frame);
    frame = undefined;
  };
  const clearTargets = state => {
    if (!sameChoice(state)) return false;
    game.uncheck('target');
    if (!sameChoice(state)) return false;
    game.check();
    return sameChoice(state);
  };
  const cancel = (clear = false) => {
    const state = gesture;
    const ownsSelection = clear && state?.active && selectedChoice(state);
    finish();
    // A pause, replacement card or new event owns its selection. Never clear it.
    if (ownsSelection && selectedChoice(state)) {
      changing = true;
      try { clearTargets(state); } finally { changing = false; }
    }
  };
  const refresh = () => {
    if (changing || !gesture) return;
    if (!sameChoice(gesture) || (gesture.active && !selectedChoice(gesture))) cancel();
  };
  const monitor = () => {
    frame = undefined;
    refresh();
    if (gesture?.active) frame = host.requestAnimationFrame(monitor);
  };
  const nativeNode = (source, type) => {
    for (let node = source; node; node = node.parentNode) if (get.itemtype(node) === type) return node;
    return null;
  };
  const targetAt = event => {
    const target = nativeNode(document.elementFromPoint(event.clientX, event.clientY), 'player');
    if (!game.players.includes(target)) return null;
    // Native player children can overflow (for example the teammate hand list).
    // Only the actual portrait bounds count as a drop, in viewport CSS pixels.
    const box = target.getBoundingClientRect();
    return event.clientX >= box.left && event.clientX <= box.right
      && event.clientY >= box.top && event.clientY <= box.bottom ? target : null;
  };
  const draw = (state, event) => {
    if (!line) {
      line = document.createElement('div'); line.className = 'sgs-card-drag-line';
      line.setAttribute('aria-hidden', 'true'); document.body.append(line);
    }
    const dx = event.clientX - state.x, dy = event.clientY - state.y;
    Object.assign(line.style, { left: `${state.x}px`, top: `${state.y}px`, width: `${Math.hypot(dx, dy)}px`, transform: `rotate(${Math.atan2(dy, dx)}rad)` });
    line.dataset.legal = String(!!state.target);
  };
  const chooseTarget = (state, target) => {
    if (state.target === target && (!target || ui.selected.targets[0] === target)) return;
    state.target = null;
    if (!clearTargets(state) || !selectedChoice(state) || !target) return;
    // Unlike game.check's cached pass, this native pass tests current legality.
    game.Check.target(state.event, false);
    if (!target.classList.contains('selectable') || !selectedChoice(state)) return;
    callClick('target', target);
    if (selectedChoice(state) && ui.selected.targets.length === 1 && ui.selected.targets[0] === target) state.target = target;
  };
  const down = event => {
    clearClickSuppression(); draggedSequence = false; dragEvent = null;
    cancel();
    const choice = _status.event;
    if (event.button !== 0 || lib.config.touchscreen || !available(choice)) return;
    const card = nativeNode(event.target, 'card');
    if (!card || !game.me.getCards('h').includes(card) || card.classList.contains('noclick')
      || !(card.classList.contains('selectable') || card.dataset.sgsSwitchable === 'true')
      || !simpleInfo(get.info(card)) || !exactOne(lib.filter.selectTarget(card, game.me)) || _status.event !== choice) return;
    gesture = { event: choice, card, name: card.name, x: event.clientX, y: event.clientY, active: false, target: null };
  };
  const move = event => {
    if (!gesture) return;
    if (!(event.buttons & 1)) { cancel(true); return; }
    refresh();
    const state = gesture;
    if (!state || (!state.active && Math.hypot(event.clientX - state.x, event.clientY - state.y) < 8)) return;
    changing = true;
    try {
      if (!state.active) {
        state.active = true; draggedSequence = true; dragEvent = state.event;
        if (!(ui.selected.cards.length === 1 && ui.selected.cards[0] === state.card)) callClick('card', state.card);
        if (!selectedChoice(state)) { cancel(); return; }
        if (!clearTargets(state)) { cancel(); return; }
        state.card.dataset.sgsDragging = 'true';
        frame = host.requestAnimationFrame(monitor);
      }
      chooseTarget(state, targetAt(event));
      if (gesture === state && selectedChoice(state)) draw(state, event);
      else cancel();
    } finally { changing = false; }
    // Stop native hover introductions while the button is held, without using
    // native drag flags or changing ordinary pointer/click handling.
    event.preventDefault(); event.stopImmediatePropagation();
  };
  const up = event => {
    if (event.button !== 0) { cancel(); return; }
    const state = gesture;
    const completedDrag = draggedSequence, sequenceEvent = dragEvent;
    if (draggedSequence) {
      suppressClick = true;
      clickTimer = host.setTimeout(clearClickSuppression, 0);
      draggedSequence = false; dragEvent = null;
    }
    if (!state?.active) {
      finish();
      if (completedDrag && _status.event === sequenceEvent && available(sequenceEvent)) game.check();
      return;
    }
    changing = true;
    try {
      const target = targetAt(event);
      if (!selectedChoice(state) || !target) { cancel(true); return; }
      // Selected nodes retain "selectable" even when an engine check rejects
      // them. Clear both, then run uncached native checks before each click.
      game.uncheck('card', 'target');
      if (!sameChoice(state)) { cancel(); return; }
      game.Check.card(state.event, false);
      if (!sameChoice(state)) { cancel(); return; }
      if (!state.card.classList.contains('selectable')) { cancel(); game.check(); return; }
      callClick('card', state.card);
      if (!selectedChoice(state)) { cancel(); return; }
      if (!clearTargets(state)) { cancel(); return; }
      game.Check.target(state.event, false);
      if (!selectedChoice(state) || !target.classList.contains('selectable')) { cancel(true); return; }
      callClick('target', target);
      if (!selectedChoice(state) || ui.selected.targets.length !== 1 || ui.selected.targets[0] !== target
        || game.check() !== true || !selectedChoice(state)
        || ui.selected.targets.length !== 1 || ui.selected.targets[0] !== target) { cancel(true); return; }
      finish();
      ui.confirm?.close();
      ui.click.ok();
    } finally { changing = false; finish(); }
  };
  const click = event => {
    if (!suppressClick || event.detail === 0) return;
    clearClickSuppression(); event.preventDefault(); event.stopImmediatePropagation();
  };
  const key = event => {
    if (event.key !== 'Escape' || event.isComposing || !gesture?.active) return;
    cancel(true); event.preventDefault(); event.stopImmediatePropagation();
  };
  const hidden = () => { if (document.hidden) cancel(); };
  const blur = () => cancel();
  document.addEventListener('mousedown', down, true);
  document.addEventListener('mousemove', move, true);
  // Install at arenaReady, after native document listeners. Native mouseup first
  // resets mousedown/force and card transforms, so native confirms remain fresh.
  document.addEventListener('mouseup', up);
  document.addEventListener('click', click, true);
  document.addEventListener('keydown', key, true);
  document.addEventListener('visibilitychange', hidden);
  host.addEventListener('blur', blur);
  lib.hooks.checkEnd.push(refresh);
  return {
    get selecting() { return !!gesture?.active; }, refresh,
    dispose() {
      if (disposed) return;
      disposed = true; finish(); clearClickSuppression(); draggedSequence = false; dragEvent = null;
      for (const [type, listener, capture] of [['mousedown', down, true], ['mousemove', move, true], ['mouseup', up, false], ['click', click, true], ['keydown', key, true], ['visibilitychange', hidden, false]]) document.removeEventListener(type, listener, capture);
      host.removeEventListener('blur', blur);
      const index = lib.hooks.checkEnd.indexOf(refresh);
      if (index >= 0) lib.hooks.checkEnd.splice(index, 1);
    },
  };
}
