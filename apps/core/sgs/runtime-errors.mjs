import { summarizeProblem } from './problem-report.mjs';

const installed = new WeakMap();
export function installRuntimeErrors({ session, reports, reportUI, host = globalThis.window }) {
  if (installed.has(host)) return installed.get(host);
  const previousError = host.onerror, previousRejection = host.onunhandledrejection;
  const objects = new WeakSet(), fingerprints = new Set();
  let disposed = false, handling = false, release, first, navigating = false;
  const navigate = restart => {
    if (disposed || navigating) return;
    navigating = true;
    try { session.navigate(restart); }
    catch { navigating = false; const dialog = show(); if (dialog) dialog.querySelector('[data-fault-status]').textContent = '页面未能跳转，请重试。当前牌局仍保持暂停。'; }
  };
  function show() {
    if (disposed || !first) return null;
    return session.dialogs.open('runtime-fault', '<h2>牌局遇到异常</h2><p>对局已暂停，当前进度无法安全继续。你可以下载问题报告，或用相同配置重新开局。</p><details class="sgs-fault-details"><summary>错误摘要</summary><p data-fault-message></p></details><p data-fault-status role="status"></p><div class="sgs-dialog-actions"><button type="button" data-report>问题报告</button><button type="button" data-return>返回点将台</button><button type="button" data-restart data-primary>同配置重开</button></div>', dialog => {
      dialog.classList.add('sgs-fault-dialog');
      dialog.querySelector('[data-fault-message]').textContent = `${first.name}：${first.message}`;
      dialog.querySelector('[data-report]').onclick = () => reportUI.open({ backLabel: '返回异常提示' });
      dialog.querySelector('[data-return]').onclick = () => navigate(false);
      dialog.querySelector('[data-restart]').onclick = () => navigate(true);
    }, () => { if (!disposed && !navigating) queueMicrotask(show); }, { dismissible: false });
  }
  function handle(error, kind, location) {
    if (disposed || handling) return;
    const object = error !== null && (typeof error === 'object' || typeof error === 'function');
    if (object && objects.has(error)) return;
    handling = true;
    try {
      if (object) objects.add(error);
      const summary = summarizeProblem(error, kind, Date.now, location);
      const fingerprint = JSON.stringify([summary.name, summary.message, summary.frames]);
      if (!fingerprints.has(fingerprint)) {
        fingerprints.add(fingerprint);
        if (fingerprints.size > 20) fingerprints.delete(fingerprints.values().next().value);
        reports.record(error, kind, location);
      }
      if (!first) {
        first = summary;
        // Hold this lease before closing any existing modal. Closing an old
        // settings/manual/native reference dialog must not briefly resume AI.
        release = session.acquirePause('runtime-fault');
        session.setFaultActions({ show });
        show();
      }
    } finally { handling = false; }
  }
  function onerror(message, filename, line, column, error) {
    // Resource element errors are handled by their existing nonfatal paths.
    if (error || typeof message === 'string') handle(error || new Error(message), 'script', { filename, line, column });
    return false; // Keep the browser's original console evidence.
  }
  function rejection(event) { handle(event.reason, 'promise'); }
  host.onerror = onerror; host.onunhandledrejection = rejection;
  const controller = { show, get failed() { return !!first; }, dispose() {
    if (disposed) return;
    disposed = true;
    if (host.onerror === onerror) host.onerror = previousError;
    if (host.onunhandledrejection === rejection) host.onunhandledrejection = previousRejection;
    installed.delete(host); fingerprints.clear(); session.dialogs.close('runtime-fault'); release?.(); session.setFaultActions(null);
  } };
  installed.set(host, controller);
  return controller;
}
