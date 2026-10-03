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
