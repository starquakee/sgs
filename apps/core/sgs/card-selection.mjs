// A single-card choice can be replaced by another card that the native checker
// allowed before the selection filled up. Multi-card and custom choices stay native.
export function installCardSelectionSwitch({ lib, game, ui, get, _status }) {
  const choices = new WeakMap();
  const marked = new Set();
  const clearMarks = () => {
    for (const card of marked) delete card.dataset.sgsSwitchable;
    marked.clear();
  };
  const eligible = event => event?.isMine() && event.player === game.me
    && ['chooseToUse', 'chooseToRespond', 'chooseCard'].includes(event.name)
    && typeof event.filterCard === 'function' && !event.complexCard
    && !event.custom?.replace?.card && !event.custom?.add?.card
    && get.select(event.selectCard)[1] === 1;
  lib.hooks.checkBegin.push(event => {
    clearMarks();
    if (eligible(event) && !ui.selected.cards.length) {
      choices.set(event, { skill: event.skill, cards: new Set() });
    }
  });
  lib.hooks.checkCard.push((card, event) => {
    const state = choices.get(event);
    if (state && state.skill === event.skill && !ui.selected.cards.length && card.classList.contains('selectable')) {
      state.cards.add(card);
    }
    if (eligible(event) && state?.skill === event.skill && state?.cards.has(card)
      && ui.selected.cards.length === 1 && ui.selected.cards[0] !== card
      && event.player.getCards('h').includes(card)) {
      card.dataset.sgsSwitchable = 'true';
      marked.add(card);
    }
  });
  lib.hooks.uncheckBegin.push(clearMarks);
  const nativeClick = ui.click.card;
  ui.click.card = function (...args) {
    const event = _status.event;
    const state = choices.get(event);
    const selected = ui.selected.cards;
    const canSwitch = !_status.dragged && !_status.clicked && !ui.intro && eligible(event)
      && selected.length === 1 && selected[0] !== this
      && state?.skill === event.skill && state?.cards.has(this)
      && event.player.getCards('h').includes(this);
    if (canSwitch) {
      const previousCard = selected[0];
      const previousTargets = [...ui.selected.targets];
      game.uncheck('card', 'target');
      game.check();
      if (_status.event !== event) return;
      if (!this.classList.contains('selectable')) {
        // A skill may have changed legality since the initial check. Restore the
        // user's selection rather than replacing it with an unusable card.
        selected.push(previousCard);
        previousCard.classList.add('selected');
        previousCard.updateTransform(true);
        for (const target of previousTargets) {
          ui.selected.targets.push(target);
          target.classList.add('selected');
        }
        game.check();
      }
    }
    return nativeClick.apply(this, args);
  };
}

// Assist a newly selected single-target card. Native target clicks perform the actual
// selection/recheck; confirmation and any later manual target edit stay human.
export function installUniqueCardTarget({ game, ui, get, _status }) {
  const nativeCardClick = ui.click.card;
  ui.click.card = function (...args) {
    const event = _status.event;
    const previous = [...ui.selected.cards];
    const eligibleClick = !_status.dragged && !_status.clicked && !ui.intro;
    const result = nativeCardClick.apply(this, args);
    // Qinglong uses complex selection to require the defender of the missed
    // Slash first. Its ordinary one-target follow-up still has no target choice.
    const qinglongFollowup = event?.logSkill === 'qinglong_skill' && event.targetRequired && event.sourcex;
    if (!eligibleClick || _status.event !== event || !event?.isMine() || event.player !== game.me
      || event.name !== 'chooseToUse' || typeof event.filterTarget !== 'function'
      || event.complexCard || ((event.complexTarget || event.complexSelect) && !qinglongFollowup)
      || event.custom?.replace?.card || event.custom?.add?.card
      || event.custom?.replace?.target || event.custom?.add?.target
      || ui.selected.targets.length || !ui.selected.cards.includes(this)
      || (previous.length === ui.selected.cards.length && previous.every((card, index) => card === ui.selected.cards[index]))) return result;
    // Active skills may expose their cost card through get.card(). Only normal
    // one-card uses and simple one-card view-as choices receive this assistance.
    if (ui.selected.cards.length !== 1 || get.select(event.selectCard).some(count => count !== 1)
      || (event.skill && !get.info(event.skill)?.viewAs)) return result;
    const card = get.card();
    const info = card && get.info(card);
    if (!card?.name || !info || info.notarget || info.multitarget) return result;
    if (qinglongFollowup && card.name !== 'sha') return result;
    const [min, max] = get.select(event.selectTarget);
    if (min !== 1 || max !== 1) return result;
    const players = [...game.players, ...(event.deadTarget || info?.deadTarget ? game.dead : [])];
    // These classes already include native distance, equipment, skill and
    // event restrictions. Do not substitute AI attitude or recalculate range.
    const candidates = players.filter(target => target.classList.contains('selectable'));
    if (candidates.length !== 1 || candidates[0] === game.me) return result;
    if (qinglongFollowup && candidates[0] !== event.sourcex) return result;
    const clicked = _status.clicked;
    _status.clicked = false;
    try { ui.click.target.call(candidates[0]); }
    finally { _status.clicked = clicked; }
    return result;
  };
}
