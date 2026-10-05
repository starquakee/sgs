// Offer the native recast action after selecting a physical Iron Chain card.
// The engine still owns eligibility, skill backup, card selection and confirmation.
const skill = '_recasting';

export function selectedTiesuoRecast({ lib, game, ui, get, _status }) {
  const event = _status.event;
  if (_status.auto || _status.over || _status.paused2 || event?.finished
    || !event?.isMine?.() || event.player !== game.me
    || event.name !== 'chooseToUse' || event.type !== 'phase' || event.skill
    || event.complexCard || event.complexSelect || event.complexTarget
    || ['add', 'replace'].some(kind => Object.values(event.custom?.[kind] || {}).some(value => typeof value === 'function'))
    || get.select(event.selectCard).some(count => count !== 1)
    || ui.selected.buttons.length || ui.selected.cards.length !== 1) return null;
  const card = ui.selected.cards[0];
  if (card.name !== 'tiesuo' || get.name(card, event.player) !== 'tiesuo'
    || !event.player.getCards('h').includes(card) || !card.classList.contains('selected')) return null;
  const info = get.info(skill);
  if (!info?.filterCard || !lib.filter.filterEnable(event, event.player, skill)
    || !info.filterCard(card, event.player, event)) return null;
  return { event, card };
}

export function installSelectedTiesuoRecast(context) {
  const { lib, game, ui, _status } = context;
  let control, choice, disposed = false;
  const close = () => {
    const previous = control;
    control = choice = null;
    if (previous) { previous.close(); previous.remove(); }
  };
  const refresh = () => {
    const next = disposed ? null : selectedTiesuoRecast(context);
    if (!next) { close(); return; }
    if (control && choice?.event === next.event && choice.card === next.card) return;
    close();
    choice = next;
    control = ui.create.control('重铸此牌', () => {
      // Revalidate a stale click after a card switch, pause, or native skill mod.
      const current = disposed ? null : selectedTiesuoRecast(context);
      if (!current || current.event !== next.event || current.card !== next.card) { refresh(); return; }
      close();
      const clicked = _status.clicked;
      try {
        ui.click.skill(skill);
        if (_status.event === next.event && next.event.skill === skill
          && next.event.player.getCards('h').includes(next.card) && next.card.classList.contains('selectable')) {
          _status.clicked = false;
          ui.click.card.call(next.card);
        }
      } finally { _status.clicked = clicked; }
      // No ok()/resume()/recast(): native confirmation remains a separate click.
    });
    control.classList.add('sgs-recast-control');
    const button = control.firstChild;
    button.setAttribute('role', 'button');
    button.setAttribute('aria-label', '重铸此牌');
    button.title = '重铸选中的铁索连环；确认后弃置并摸一张牌';
    button.tabIndex = 0;
    button.addEventListener('keydown', event => {
      if (!event.isComposing && ['Enter', ' '].includes(event.key)) { event.preventDefault(); button.click(); }
    });
  };
  lib.hooks.checkEnd.push(refresh);
  lib.hooks.uncheckBegin.push(close);
  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      close();
      for (const [hooks, hook] of [[lib.hooks.checkEnd, refresh], [lib.hooks.uncheckBegin, close]]) {
        const index = hooks.indexOf(hook);
        if (index >= 0) hooks.splice(index, 1);
      }
    },
  };
}
