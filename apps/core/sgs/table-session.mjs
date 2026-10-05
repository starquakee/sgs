import { installOwnedPause } from './pause.mjs';
import { applyMotionPreference, volumePreferences } from './preferences.mjs';
import { createClientDialogs, openClientSettings } from './settings.mjs';

export function installTableSession({ game, ui, lib, _status, hud, preferences, audio,
  document = globalThis.document, navigate = restart => {
    window.onbeforeunload = null;
    if (restart) location.reload(); else location.href = './sgs.html';
  } }) {
  const pause = installOwnedPause({ game, _status });
  const dialogs = createClientDialogs({ document, pause });
  const buttons = [];
  const listeners = [];
  const listen = (node, name, handler) => { node.addEventListener(name, handler); listeners.push(() => node.removeEventListener(name, handler)); };
  let manual, background, resultActions, faultActions;
  function button(label, className, handler) {
    const node = document.createElement('button');
    node.type = 'button'; node.textContent = label; node.className = className;
    listen(node, 'click', event => { event.stopPropagation(); handler(); });
    hud.insertBefore(node, hud.querySelector('.sgs-audio'));
    buttons.push(node);
    return node;
  }
  function showPause() {
    if (faultActions) { faultActions.show(); return; }
    dialogs.open('pause', `<h2>对局已暂停</h2><p class="sgs-pause-reason"></p><div class="sgs-dialog-actions"><button type="button" data-settings>便捷设置</button><button type="button" data-continue data-primary>继续对局</button></div>`, (dialog, close) => {
      dialog.querySelector('.sgs-pause-reason').textContent = background ? '离开页面后已暂停，准备好后继续。' : '牌局等待继续，当前选择会保留。';
      dialog.querySelector('[data-settings]').onclick = () => openClientSettings(dialogs, preferences);
      dialog.querySelector('[data-continue]').onclick = close;
    }, () => {
      manual?.(); background?.(); manual = background = undefined;
      refresh();
    });
  }
  const pauseButton = button('暂停', 'sgs-session-button', () => {
    if (faultActions) { faultActions.show(); return; }
    if (resultActions) { resultActions.show(); return; }
    manual ||= pause.acquire('manual');
    showPause(); refresh();
  });
  const autoButton = button('托管', 'sgs-session-button', () => {
    // The native handler owns switching choice to AI, restoring its event and
    // closing confirmations. Do not force auto while native UI forbids it.
    if (!autoButton.disabled) ui.click.auto.call(ui.auto);
    refresh();
  });
  button('设置', 'sgs-session-button', () => openClientSettings(dialogs, preferences));
  function askLeave(restart) {
    if (faultActions) { faultActions.show(); return; }
    if (resultActions) { resultActions[restart ? 'replay' : 'leave'](); return; }
    dialogs.open(restart ? 'restart' : 'leave', `<h2>${restart ? '重新开局' : '返回点将台'}</h2><p>当前对局的进度将结束。${restart ? '使用相同的武将和设置开启新对局。' : '你可以重新选择武将与对局设置。'}</p><div class="sgs-dialog-actions"><button type="button" data-stay>继续对局</button><button type="button" data-leave data-primary>${restart ? '确认重开' : '返回选将'}</button></div>`, (dialog, close) => {
      dialog.querySelector('[data-stay]').onclick = close;
      // Keep paused until navigation actually leaves this document.
      dialog.querySelector('[data-leave]').onclick = () => navigate(restart);
    });
  }
  for (const [selector, restart] of [['.sgs-return', false], ['.sgs-restart', true]]) listen(hud.querySelector(selector), 'click', event => {
    event.preventDefault(); event.stopPropagation(); askLeave(restart);
  });
  const apply = value => {
    lib.config.game_speed = value.speed === 'fast' ? 'vfast' : 'fast';
    if (audio.status().enabled !== value.sound) audio.setEnabled(value.sound);
    for (const [channel, key] of Object.entries(volumePreferences)) audio.setVolume(channel, value[key]);
    applyMotionPreference(document, value);
  };
  const unsubscribe = preferences.subscribe(apply);
  apply(preferences.get());
  function visibility() {
    if (document.hidden && preferences.get().backgroundPause && !_status.over) background ||= pause.acquire('background');
    if (!document.hidden && background) showPause();
    refresh();
  }
  function refresh() {
    pause.elapsedMs();
    pauseButton.textContent = faultActions ? '异常已暂停' : resultActions ? '结算' : manual || background ? '继续' : '暂停';
    pauseButton.disabled = !!_status.over && !resultActions && !faultActions;
    autoButton.textContent = _status.auto ? '取消托管' : '托管';
    autoButton.setAttribute('aria-pressed', String(!!_status.auto));
    autoButton.disabled = !!faultActions || !!_status.over || !!_status.paused2 || !ui.auto || ui.auto.classList.contains('hidden');
  }
  listen(document, 'visibilitychange', visibility);
  visibility();
  return { refresh, dialogs, elapsedMs: pause.elapsedMs, navigate, acquirePause: pause.acquire, setFaultActions(actions) {
    faultActions = actions;
    if (actions) dialogs.closeAll();
    refresh();
  }, setResultActions(actions) {
    resultActions = actions;
    hud.querySelector('.sgs-restart').textContent = '再来一局';
    refresh();
  }, dispose() {
    for (const remove of listeners) remove();
    unsubscribe(); dialogs.dispose(); manual?.(); background?.(); pause.dispose();
    for (const node of buttons) node.remove();
  } };
}
