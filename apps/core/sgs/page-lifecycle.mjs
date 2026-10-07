import { installOwnedPause } from './pause.mjs';
import { createClientDialogs } from './settings.mjs';

// BFCache preserves a document, including its old native event stack, while
// pagehide tears down the SGS adapters. Such a table cannot safely continue.
export function installTablePageLifecycle({ game, _status, cleanup,
  host = globalThis.window, document = globalThis.document,
  navigate = restart => {
    host.onbeforeunload = null;
    if (restart) host.location.reload(); else host.location.href = './sgs.html';
  } }) {
  let stopped = false, disposed = false, leaving = false, pause, dialogs, style;
  function stop() {
    if (stopped) return;
    stopped = true;
    // Mark this as a native-held pause before disposing the session so its
    // cleanup cannot resolve the native gate while the document is freezing.
    game.pause2();
    try { cleanup(); } finally {
      pause = installOwnedPause({ game, _status });
      pause.acquire('history-return');
    }
  }
  function show(event) {
    if (!event.persisted || disposed) return;
    stop();
    game.pause2();
    leaving = false;
    if (!dialogs) {
      // This also covers a page cached before table.css was loaded.
      style = document.createElement('link'); style.rel = 'stylesheet'; style.href = './sgs/theme.css';
      document.head.append(style);
      dialogs = createClientDialogs({ document });
    }
    const dialog = dialogs.open('history-return', '<h2>请重新开启对局</h2><p>你通过浏览器返回了已离开的牌桌。原对局已停止，当前进度无法继续。</p><p data-history-message>可以沿用本局武将与设置开启全新牌局，或返回点将台。</p><div class="sgs-dialog-actions"><button type="button" data-lobby>返回点将台</button><button type="button" data-restart data-primary>同配置重新开局</button></div>', node => {
      const act = restart => {
        if (leaving) return;
        leaving = true;
        for (const button of node.querySelectorAll('button')) button.disabled = true;
        try { navigate(restart); } catch {
          leaving = false;
          for (const button of node.querySelectorAll('button')) button.disabled = false;
          node.querySelector('[data-history-message]').textContent = '未能离开此页面，请重试重新开局或返回点将台。';
        }
      };
      node.querySelector('[data-restart]').onclick = () => act(true);
      node.querySelector('[data-lobby]').onclick = () => act(false);
    }, () => {}, { dismissible: false });
    for (const button of dialog.querySelectorAll('button')) button.disabled = false;
    dialog.querySelector('[data-restart]').focus();
  }
  function hide(event) {
    if (disposed) return;
    stop();
    if (event.persisted) return;
    disposed = true;
    // Keep the native gate held through real departure as well. No synthetic
    // game result, selection changes, or saved-board state are produced.
    game.pause2();
    dialogs?.dispose(); pause.dispose(); style?.remove();
    host.removeEventListener('pagehide', hide);
    host.removeEventListener('pageshow', show);
  }
  host.addEventListener('pagehide', hide);
  host.addEventListener('pageshow', show);
  return { get stopped() { return stopped; } };
}
