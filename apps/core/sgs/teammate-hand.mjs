// Presentation only: use the same visibility permission as the native hand viewer.
export function visibleTeammate(game, mode) {
  const me = game.me;
  if (!me?.name || game.observe || !['versus', 'doudizhu'].includes(mode)) return;
  return game.players.find(player => {
    if (player === me || !player.name || !player.isAlive()) return false;
    const teammate = mode === 'versus'
      ? typeof me.side === 'boolean' && player.side === me.side
      : me.identity === 'fan' && player.identity === 'fan';
    return teammate && me.hasSkillTag('viewHandcard', null, player, true);
  });
}

export function installTeammateHand({ game, ui, get }, mode) {
  const doc = ui.arena.ownerDocument;
  let owner, panel, heading, summary, list, empty, signature;
  let disposed = false;
  const observer = new MutationObserver(() => refresh());
  const text = value => String(value ?? '').replace(/<[^>]*>/g, '');
  const node = (tag, className, content) => {
    const element = doc.createElement(tag);
    element.className = className;
    if (content !== undefined) element.textContent = content;
    return element;
  };
  function remove() {
    observer.disconnect();
    panel?.remove();
    panel = owner = signature = undefined;
  }
  function refresh() {
    if (disposed) return;
    const teammate = visibleTeammate(game, mode);
    if (!teammate) { remove(); return; }
    if (teammate !== owner) {
      remove();
      owner = teammate;
      panel = node('aside', 'sgs-teammate-hand');
      panel.tabIndex = 0;
      heading = node('header', 'sgs-teammate-heading');
      summary = node('ul', 'sgs-teammate-summary');
      summary.setAttribute('aria-label', '队友手牌预览，最多五张');
      const detail = node('div', 'sgs-teammate-detail');
      list = node('ul', 'sgs-teammate-cards');
      list.tabIndex = 0;
      list.setAttribute('aria-label', '队友当前手牌');
      empty = node('p', 'sgs-teammate-empty', '暂无手牌');
      detail.append(list, empty);
      panel.append(heading, summary, detail);
      // Refresh permission before either pointer or keyboard reveals details.
      const inspect = () => { refresh(); panel?.removeAttribute('data-dismissed'); };
      panel.addEventListener('pointerenter', inspect);
      panel.addEventListener('focusin', event => {
        inspect();
        // Hold the reveal across the browser's focus transfer into the list.
        if (event.target.matches(':focus-visible')) panel?.setAttribute('data-keyboard-open', 'true');
      });
      panel.addEventListener('focusout', event => {
        if (!panel?.contains(event.relatedTarget)) panel?.removeAttribute('data-keyboard-open');
      });
      panel.addEventListener('keydown', event => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          panel?.focus({ preventScroll: true });
          panel?.removeAttribute('data-keyboard-open');
          panel?.setAttribute('data-dismissed', 'true');
        }
      });
      // These are read-only labels, never clones of selectable game cards.
      for (const type of ['click', 'dblclick', 'pointerdown', 'touchstart', 'contextmenu']) {
        panel.addEventListener(type, event => event.stopPropagation());
      }
      ui.arena.append(panel);
      for (const hand of [owner.node.handcards1, owner.node.handcards2]) {
        if (hand) observer.observe(hand, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['class'] });
      }
    }
    panel.dataset.position = teammate.dataset.position;
    const name = text(get.translation(teammate.name));
    const cards = teammate.getCards('h').map(card => ({
      id: card.name,
      nature: get.natureList(card, false).join(' '),
      name: text(get.translation({ name: card.name, nature: card.nature })),
      suit: get.suit(card, false),
      rank: get.strNumber(get.number(card, false), true) || '',
    }));
    const next = JSON.stringify([name, cards]);
    if (signature === next) return;
    signature = next;
    heading.replaceChildren(node('strong', '', `${name} · 手牌`), node('span', '', `${cards.length}张`));
    panel.setAttribute('aria-label', `队友${name}的手牌，共${cards.length}张；悬停或聚焦查看详情，Esc收起`);
    summary.replaceChildren(...cards.slice(0, 5).map(card => {
      const row = node('li', 'sgs-teammate-summary-card', card.name);
      row.title = card.name;
      return row;
    }));
    if (!cards.length) summary.append(node('li', 'sgs-teammate-summary-empty', '暂无手牌'));
    if (cards.length > 5) {
      const more = node('li', 'sgs-teammate-more', '…');
      more.setAttribute('aria-label', `还有${cards.length - 5}张，悬停查看全部手牌`);
      summary.append(more);
    }
    const scrollTop = list.scrollTop;
    list.replaceChildren(...cards.map(card => {
      const item = node('li', 'sgs-teammate-card');
      item.dataset.cardName = card.id;
      item.dataset.nature = card.nature;
      const symbol = ({ heart: '♥', diamond: '♦', spade: '♠', club: '♣' })[card.suit] || '';
      const info = node('span', 'sgs-teammate-rank', `${symbol}${card.rank}`);
      info.dataset.color = ['heart', 'diamond'].includes(card.suit) ? 'red' : 'black';
      item.append(info, node('span', 'sgs-teammate-card-name', card.name));
      item.title = `${text(get.translation(card.suit))}${card.rank} ${card.name}`;
      return item;
    }));
    list.scrollTop = scrollTop;
    list.hidden = !cards.length;
    empty.hidden = !!cards.length;
  }
  return { refresh, dispose() { disposed = true; remove(); } };
}
