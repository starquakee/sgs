import { launchKey, normalizeLaunch } from './launch-config.mjs';
import { createClientDialogs } from './settings.mjs';
import { createBattleRecords, createBattleSessionId } from './battle-records.mjs';

// Match game.over's columns, including all turns and every native card counter.
export function summarizeStats(stat = []) {
  const total = { damage: 0, damaged: 0, gain: 0, cards: 0, kill: 0 };
  const number = value => typeof value === 'number' && Number.isFinite(value) ? value : 0;
  for (const turn of stat) {
    for (const key of ['damage', 'damaged', 'gain', 'kill']) total[key] += number(turn[key]);
    for (const count of Object.values(turn.card || {})) total.cards += number(count);
  }
  return total;
}

export function captureBattleResult({ result, nativeText, game, get, launch, elapsedMs }) {
  const me = game.me._trueMe || game.me;
  const replay = normalizeLaunch(launch);
  const identity = me.identity;
  // A randomly assigned identity becomes the actual role for this rematch.
  if (replay.mode === 'identity' && ['zhu', 'zhong', 'fan', 'nei'].includes(identity)) replay.identity = identity;
  if (replay.mode === 'doudizhu') replay.landlordRole = me === game.zhu ? 'landlord' : 'farmer';
  const role = replay.mode === 'versus' ? '己方 · 四号位' : replay.mode === 'doudizhu'
    ? me === game.zhu ? '地主' : '农民'
    : ({ zhu: '主公', zhong: '忠臣', mingzhong: '忠臣', fan: '反贼', nei: '内奸', commoner: '平民' }[identity] || get.translation(identity) || '身份未定');
  return {
    outcome: result === true ? 'win' : result === false ? 'loss' : 'ended',
    title: result === true ? '战斗胜利' : result === false ? '战斗失败' : nativeText || '战斗结束',
    general: get.translation(me.name1 || me.name || replay.generalId),
    secondGeneral: me.name2 ? get.translation(me.name2) : '',
    role, dead: game.dead.includes(me),
    rounds: Number.isFinite(game.roundNumber) ? game.roundNumber : null,
    elapsedMs: Math.max(0, elapsedMs), stats: summarizeStats(me.stat), replay,
  };
}

function duration(milliseconds) {
  const seconds = Math.floor(milliseconds / 1000);
  return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
}

export function installBattleResults({ lib, game, get, _status, launch, preferences, elapsedMs, navigate, onReady = () => {},
  document = globalThis.document, storage = () => globalThis.sessionStorage, retainReplay = () => {},
  records = createBattleRecords(), sessionId = createBattleSessionId(), now = Date.now }) {
  const dialogs = createClientDialogs({ document });
  const previous = game.addOverDialog;
  const hadOwn = Object.hasOwn(game, 'addOverDialog');
  let nativeDialog, nativeText, snapshot, recordNotice = '', disposed = false, navigating = false;
  // This native presentation hook supplies the exact result dialog before
  // onover reduces all non-booleans to null. Leave its DOM/handlers intact.
  function addOverDialog(dialog, result) {
    const returned = previous?.apply(this, arguments);
    nativeDialog = dialog;
    nativeText = dialog.content?.querySelector('.caption')?.textContent?.trim()
      || (typeof result === 'string' ? result : '战斗结束');
    return returned;
  }
  game.addOverDialog = addOverDialog;

  function replay() {
    if (!snapshot || disposed || navigating) return;
    const config = normalizeLaunch({ ...snapshot.replay, speed: preferences.get().speed });
    retainReplay(config);
    try {
      storage().setItem(launchKey, JSON.stringify(config));
    } catch { /* SGS runtime also retains the current configuration in the URL fragment. */ }
    navigating = true;
    navigate(true);
  }
  function leave() {
    if (disposed || navigating) return;
    navigating = true;
    navigate(false);
  }
  function show() {
    if (!snapshot || disposed) return null;
    return dialogs.open('result', `<h2></h2><div class="sgs-result-content" tabindex="0" role="region" aria-label="本局结算详情">
      <p class="sgs-result-player"></p><p class="sgs-result-context"></p>
      <div class="sgs-result-stats" aria-label="你的本局统计"></div>
      <p class="sgs-result-note">摸牌包含通过技能或其他角色获得的牌。</p>
      <p data-result-status role="status"></p>
      </div><div class="sgs-dialog-actions"><button type="button" data-details>本局详情</button><button type="button" data-return>返回点将台</button><button type="button" data-replay data-primary>再来一局</button></div>`, (dialog, close) => {
      dialog.classList.add('sgs-result-dialog');
      dialog.dataset.outcome = snapshot.outcome;
      dialog.querySelector('h2').textContent = snapshot.title;
      dialog.querySelector('.sgs-result-player').textContent = `${[snapshot.general, snapshot.secondGeneral].filter(Boolean).join(' / ')} · ${snapshot.role} · ${snapshot.dead ? '已阵亡' : '存活'}`;
      const mode = snapshot.replay.mode === 'versus' ? '双人对抗 · 2v2' : snapshot.replay.mode === 'doudizhu' ? '斗地主' : `${snapshot.replay.playerCount}人身份军争`;
      dialog.querySelector('.sgs-result-context').textContent = `${mode}　｜　${snapshot.rounds === null ? '轮数未提供' : `第 ${snapshot.rounds} 轮`}　｜　局时 ${duration(snapshot.elapsedMs)}`;
      const stats = dialog.querySelector('.sgs-result-stats');
      dialog.querySelector('[data-result-status]').textContent = recordNotice;
      for (const [key, label] of Object.entries({ damage: '伤害', damaged: '受伤', gain: '摸牌', cards: '出牌', kill: '杀敌' })) {
        const cell = document.createElement('div'), value = document.createElement('strong'), caption = document.createElement('span');
        value.textContent = snapshot.stats[key]; caption.textContent = label;
        cell.append(value, caption); stats.append(cell);
      }
      dialog.querySelector('[data-details]').onclick = () => { close(); nativeDialog?.open(); };
      dialog.querySelector('[data-details]').disabled = !nativeDialog;
      dialog.querySelector('[data-return]').onclick = leave;
      dialog.querySelector('[data-replay]').onclick = replay;
    });
  }
  function onover(result) {
    if (disposed || snapshot || !_status.over) return;
    snapshot = captureBattleResult({ result, nativeText, game, get, launch, elapsedMs: elapsedMs() });
    recordNotice = records.record({ ...snapshot, sessionId, completedAt: now(),
      replay: normalizeLaunch({ ...snapshot.replay, speed: preferences.get().speed }) }).notice;
    onReady({ show, replay, leave });
    // Let the rest of the native result hooks and record writing finish first.
    queueMicrotask(() => { if (!disposed) show(); });
  }
  lib.onover.push(onover);
  return { show, dispose() {
    if (disposed) return;
    disposed = true;
    const index = lib.onover.indexOf(onover);
    if (index !== -1) lib.onover.splice(index, 1);
    if (game.addOverDialog === addOverDialog) {
      if (hadOwn) game.addOverDialog = previous; else delete game.addOverDialog;
    }
    dialogs.dispose(); nativeDialog = null;
  } };
}
