// Presentation only: native events, selected arrays and checked target classes
// remain the authority. Never run a filter, skill prompt or selection callback.
import { openBattleLog, openPlayGuide } from './table-reference.mjs';
const choices = new Set(['chooseToUse', 'chooseToRespond', 'chooseToDiscard',
  'chooseCard', 'chooseTarget', 'chooseCardTarget', 'chooseButton', 'chooseBool',
  'chooseControl', 'choosePlayerCard', 'discardPlayerCard', 'gainPlayerCard']);
const plain = value => String(value ?? '').replace(/<[^>]*>/g, '');

export function visiblePlayerName(player, get) {
  if (!player?.name || player.classList?.contains('unseen')) return '未知武将';
  return plain(get.translation(player.name));
}

export function readTableAction({ game, ui, get, _status }) {
  const event = _status.event;
  if (_status.over) return { kind: 'over', title: '对局结束', detail: '结算请查看原生面板', counts: '' };
  const humanChoice = !_status.auto && !event?.finished && event?.player === game.me
    && event.isMine?.() && (choices.has(event.name) || event.choosing);
  if (!humanChoice) {
    const actor = event?.player || _status.currentPhase;
    if (!_status.gameStarted && !_status.currentPhase) {
      return { kind: 'opening', title: '准备开局', detail: '等待原生发牌与开局选择', counts: '' };
    }
    return { kind: 'waiting', title: _status.auto ? '托管中' : actor && actor !== game.me ? 'AI 行动' : '结算中',
      detail: actor ? `${visiblePlayerName(actor, get)} · 正在结算` : '正在结算，请稍候', counts: '' };
  }
  if (event.sgsOpeningHandChoice) {
    return { kind: 'opening', title: '开局换牌', detail: '可反复换一手，满意后点击开始对局', counts: '' };
  }
  const counts = [['Card', 'cards', '牌'], ['Target', 'targets', '目标'], ['Button', 'buttons', '项']]
    .filter(([type]) => event[`filter${type}`])
    .map(([, key, label]) => `${ui.selected[key]?.length || 0} ${label}`).join(' · ');
  const selected = counts ? `已选 ${counts}` : '';
  // Native multi-card discard installs its own selection callbacks. Keep the
  // explicit phase label while leaving those callbacks and its dialog native.
  if (event.name === 'chooseToDiscard') return { kind: 'discard', title: '弃牌', detail: '按原生提示选择弃牌并确认', counts: selected };
  // Do not copy/reinterpret rich skill text, hidden buttons or custom dialogs.
  const custom = event.custom && ['add', 'replace'].some(type =>
    Object.values(event.custom[type] || {}).some(value => typeof value === 'function'));
  if (custom || event.complexCard || event.complexTarget || event.complexSelect
    || !['chooseToUse', 'chooseToRespond', 'chooseToDiscard', 'chooseCard', 'chooseTarget', 'chooseCardTarget'].includes(event.name)) {
    return { kind: 'choice', title: '选择中', detail: '请按牌桌中央提示完成选择', counts: selected };
  }
  const targets = event.filterTarget && (ui.selected.targets.length > 0
    || [...game.players, ...(event.deadTarget ? game.dead : [])].some(player => player.classList.contains('selectable')));
  const responding = event.name === 'chooseToRespond' || (event.name === 'chooseToUse' && event.type !== 'phase');
  if (targets) return { kind: 'target', title: responding ? '响应 · 选择目标' : '选择目标', detail: '选好后手动确认；点击已选目标可取消', counts: selected };
  if (responding) return { kind: 'respond', title: '响应', detail: '按原生提示选择响应牌或技能', counts: selected };
  if (event.name === 'chooseToUse') return { kind: 'play', title: '出牌', detail: '选择牌或技能，选好后手动确认', counts: selected };
  return { kind: 'choice', title: event.name === 'chooseTarget' ? '选择目标' : '选择卡牌', detail: '请按原生提示操作', counts: selected };
}

// Recheck ownership when opening a description: a card may have moved since the
// menu was painted. Only human-owned, face-up hand/equipment nodes are exposed.
export function ownDescriptionCards(game) {
  return (game.me?.getCards('he') || []).filter(card => !card._nointro && !card.classList.contains('infohidden'));
}

export function visibleDescriptionPlayers(game) {
  return [...game.players, ...game.dead].filter(player => player.name && !player._nointro && !player.classList.contains('unseen'));
}

export function openNativeDescription({ game, ui, _status }, node, pointer) {
  if (!node || _status.paused2 || _status.dragged || _status.removePop) return false;
  if (node === game.me || visibleDescriptionPlayers(game).includes(node)) {
    if (!node.name || node._nointro || node.classList.contains('unseen')) return false;
  } else if (!ownDescriptionCards(game).includes(node)) return false;
  // These buttons live outside ui.window, whose bubbling click handler normally
  // clears this flag. Preserve it here so the next native card click still works.
  const clicked = _status.clicked;
  try { ui.click.intro.call(node, pointer)?.classList.add('sgs-readable-intro'); }
  finally { _status.clicked = clicked; }
  return true;
}

export function canOpenNativeRecord({ ui, _status, lib }) {
  return !!ui.pause && !ui.pause.classList.contains('hidden') && !!_status.gameStarted
    && !_status.paused2 && !_status.pausing && !_status.nopause && !lib.config.test_game;
}

export function installTableActions(context, { document = globalThis.document,
  setInterval = globalThis.setInterval, clearInterval = globalThis.clearInterval,
  queueMicrotask = globalThis.queueMicrotask, dialogs, mode } = {}) {
  const { game, ui, lib, _status, get } = context;
  const rail = document.createElement('section');
  rail.className = 'sgs-action-rail';
  rail.setAttribute('aria-label', '当前操作与说明');
  const state = document.createElement('div');
  state.className = 'sgs-action-state';
  state.setAttribute('role', 'status');
  state.setAttribute('aria-live', 'polite');
  state.setAttribute('aria-atomic', 'true');
  const title = document.createElement('strong');
  const counts = document.createElement('span');
  counts.className = 'sgs-action-counts';
  const detail = document.createElement('span');
  detail.className = 'sgs-action-detail';
  state.append(title, counts, detail);
  const button = (text, parent, listener) => {
    const node = document.createElement('button');
    node.type = 'button';
    node.textContent = text;
    node.addEventListener('click', event => { node.focus(); listener(event); });
    parent.append(node);
    return node;
  };
  const actions = document.createElement('nav');
  actions.setAttribute('aria-label', '对局参考');
  const position = (event, anchor) => {
    const rect = anchor.getBoundingClientRect();
    return { clientX: event.clientX || rect.left, clientY: event.clientY || rect.bottom };
  };
  const general = document.createElement('details'); general.className = 'sgs-card-help';
  const generalSummary = document.createElement('summary'); generalSummary.textContent = '武将说明';
  const generalMenu = document.createElement('div'); generalMenu.className = 'sgs-card-help-menu';
  const generalHint = document.createElement('p'); generalHint.textContent = '查看场上明置武将的技能与状态。';
  const generalList = document.createElement('div'); generalList.className = 'sgs-card-help-list';
  generalMenu.append(generalHint, generalList); general.append(generalSummary, generalMenu); actions.append(general);
  const cards = document.createElement('details');
  cards.className = 'sgs-card-help';
  const summary = document.createElement('summary');
  summary.textContent = '卡牌说明';
  const menu = document.createElement('div');
  menu.className = 'sgs-card-help-menu';
  const hint = document.createElement('p');
  hint.textContent = '点击查看自己的手牌或装备说明。也可直接右键牌面查看。';
  const list = document.createElement('div');
  list.className = 'sgs-card-help-list';
  const empty = document.createElement('p');
  empty.textContent = '当前没有可查看的手牌或装备。';
  menu.append(hint, list, empty);
  cards.append(summary, menu);
  actions.append(cards);
  const record = button('对局记录', actions, event => {
    event.stopPropagation();
    cards.open = false;
    general.open = false;
    if (!canOpenNativeRecord(context)) return;
    if (dialogs) openBattleLog(dialogs, ui, document); else ui.click.pause();
  });
  record.title = '查找本局已公开的技能、卡牌和伤害记录';
  const help = dialogs ? button('操作帮助', actions, event => {
    event.stopPropagation(); cards.open = general.open = false;
    openPlayGuide(dialogs, mode, document);
  }) : null;
  rail.append(state, actions);
  document.body.append(rail);
  const label = (node, text) => { if (node.textContent !== text) node.textContent = text; };
  let entries = null, generalEntries = null;
  let disposed = false;
  const refresh = () => {
    if (disposed) return;
    const action = readTableAction(context);
    rail.dataset.action = action.kind;
    label(title, action.title);
    label(counts, action.counts);
    counts.hidden = !action.counts;
    label(detail, action.detail);
    const ready = action.counts && ui.confirm?.parentNode && Array.from(ui.confirm.children).some(node => node.link === 'ok');
    if (ready) label(detail, '选择已就绪，点击“确定”继续');
    else if (action.kind === 'target' && ui.selected.cards.length && !ui.selected.targets.length) label(detail, '请点击亮起的角色，选好后再确定');
    // Modal content already makes the table inert. Keep its opener focusable so
    // focus can return before the asynchronous native pause gate is released.
    record.disabled = !canOpenNativeRecord(context) && !dialogs?.has('battle-log');
    if (help) help.disabled = !!_status.paused2 && !dialogs.has('play-guide');
    if (general.open) {
      const players = visibleDescriptionPlayers(game);
      const labels = players.map(player => `${visiblePlayerName(player, get)}${player === game.me ? ' · 我' : ''}${player.classList.contains('dead') ? ' · 已阵亡' : ''}`);
      if (!generalEntries || players.length !== generalEntries.length || generalEntries.some((entry, index) => entry.player !== players[index] || entry.label !== labels[index])) {
        generalList.replaceChildren();
        generalEntries = players.map((player, index) => {
          const entry = button(labels[index], generalList, event => {
            event.stopPropagation(); general.open = false;
            openNativeDescription(context, player, position(event, generalSummary));
          });
          entry.disabled = !!_status.paused2;
          return { player, label: labels[index] };
        });
      }
    }
    if (!cards.open) return;
    const owned = ownDescriptionCards(game);
    // Preserve focus and nodes while the menu remains unchanged.
    const labels = owned.map(card => plain(get.translation(card)));
    if (entries && entries.length === owned.length && entries.every((entry, i) => entry.card === owned[i] && entry.label === labels[i])) return;
    list.replaceChildren();
    entries = owned.map((card, index) => {
      const entry = button(labels[index], list, event => {
        event.stopPropagation();
        const pointer = position(event, summary);
        cards.open = false;
        openNativeDescription(context, card, pointer);
      });
      entry.disabled = !!_status.paused2;
      return { card, label: labels[index] };
    });
    empty.hidden = owned.length > 0;
  };
  const toggle = () => { if (cards.open) { general.open = false; entries = null; refresh(); } };
  const generalToggle = () => { if (general.open) { cards.open = false; generalEntries = null; refresh(); } };
  const outside = event => { if (!cards.contains(event.target)) cards.open = false; if (!general.contains(event.target)) general.open = false; };
  const escape = event => {
    if (event.key === 'Escape' && cards.open) { cards.open = false; summary.focus(); }
    if (event.key === 'Escape' && general.open) { general.open = false; generalSummary.focus(); }
  };
  cards.addEventListener('toggle', toggle);
  general.addEventListener('toggle', generalToggle);
  document.addEventListener('pointerdown', outside);
  document.addEventListener('keydown', escape);
  // Run after the native check/clear has settled; never alter its return value.
  const afterCheck = () => queueMicrotask(refresh);
  lib.hooks.checkEnd.push(afterCheck);
  lib.hooks.uncheckEnd.push(afterCheck);
  const timer = setInterval(refresh, 250);
  refresh();
  return { refresh, dispose() {
    if (disposed) return;
    disposed = true;
    clearInterval(timer);
    for (const hooks of [lib.hooks.checkEnd, lib.hooks.uncheckEnd]) {
      const index = hooks.indexOf(afterCheck);
      if (index >= 0) hooks.splice(index, 1);
    }
    cards.removeEventListener('toggle', toggle);
    general.removeEventListener('toggle', generalToggle);
    document.removeEventListener('pointerdown', outside);
    document.removeEventListener('keydown', escape);
    rail.remove();
  } };
}
