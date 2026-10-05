export const clientVersion = 'reliability-1';
const text = (value, limit = 500) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').slice(0, limit) : '';
const attempt = (read, fallback) => { try { return read(); } catch { return fallback; } };
const ownText = (object, key) => attempt(() => text(Object.getOwnPropertyDescriptor(object, key)?.value), '');

export function summarizeProblem(error, kind = 'script', now = Date.now, location = {}) {
  // Never stringify an arbitrary rejected object: it may contain an event, a
  // private game snapshot, throwing getters, or cyclic references.
  const message = ownText(error, 'message').split('\n')[0]
    .replace(/https?:\/\/[^\s)]+/g, '[资源地址]').replace(/[A-Za-z]:[\\/][^\n]*/g, '[本地路径]');
  const stack = ownText(error, 'stack');
  const frames = [...stack.matchAll(/(?:^|[\s/(])((?:sgs|noname|character|card)\/[\w./-]+\.(?:m?js|ts)):(\d+):(\d+)/gm)]
    .slice(0, 8).map(([, file, line, column]) => ({ file, line: Number(line), column: Number(column) }));
  const file = text(location.filename).split(/[?#]/)[0].match(/(?:^|\/)((?:sgs|noname|character|card)\/[\w./-]+\.(?:m?js|ts))$/)?.[1];
  if (!frames.length && file && Number.isInteger(location.line) && Number.isInteger(location.column)) frames.push({ file, line: location.line, column: location.column });
  const name = ownText(error, 'name') || attempt(() => ownText(Object.getPrototypeOf(error), 'name'), '') || 'Error';
  return { at: new Date(now()).toISOString(), kind: kind === 'promise' ? 'promise' : 'script',
    name: text(name, 60), message: message || '发生了未处理的错误；原始对象未收集。', frames };
}

export function createProblemReports({ upstream, engineVersion, build, launch, readAction = () => '', readLog = () => [], now = Date.now }) {
  const errors = [];
  const match = { mode: ['identity', 'versus', 'doudizhu'].includes(launch.mode) ? launch.mode : 'unknown',
    playerCount: Number.isInteger(launch.playerCount) ? launch.playerCount : null,
    general: { pack: text(launch.pack, 80), id: text(launch.generalId, 100) } };
  const metadata = { client: { version: clientVersion, engineVersion: text(engineVersion, 80) || null,
    build: build ? { commit: text(build.commit, 80), channel: text(build.channel, 40), builtAt: text(build.builtAt, 80) } : null },
    upstream: { repository: 'https://github.com/libnoname/noname', commit: text(upstream?.commit, 80) || null } };
  return {
    record(error, kind, location) { const summary = summarizeProblem(error, kind, now, location); errors.push(summary); if (errors.length > 20) errors.shift(); return summary; },
    snapshot() {
      const rows = attempt(readLog, []);
      return { schemaVersion: 1, generatedAt: new Date(now()).toISOString(), ...structuredClone(metadata),
        match: structuredClone(match), action: text(attempt(readAction, ''), 500),
        errors: structuredClone(errors), publicLog: Array.isArray(rows) ? rows.slice(0, 300).map(row => text(row, 1000)).filter(Boolean) : [] };
    },
    dispose() { errors.length = 0; },
  };
}

export function downloadProblemReport(report, { document = globalThis.document, urls = globalThis.URL, Blob = globalThis.Blob,
  timers = globalThis, onDone = () => {} } = {}) {
  const url = urls.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  let timer, disposed = false;
  const dispose = () => { if (disposed) return; disposed = true; timers.clearTimeout(timer); urls.revokeObjectURL(url); onDone(); };
  const link = document.createElement('a');
  try {
    link.href = url; link.download = `sgs-problem-${report.generatedAt.replace(/[:.]/g, '-')}.json`;
    link.hidden = true; document.body.append(link); link.click();
    timer = timers.setTimeout(dispose, 1000);
  } catch (error) { dispose(); throw error; }
  finally { link.remove(); }
  return dispose;
}

export function installProblemReportUI({ reports, dialogs, menu, returnFocus, closeMenu = () => {}, document = globalThis.document, download = downloadProblemReport }) {
  const downloads = new Set(); let disposed = false;
  const button = document.createElement('button'); button.type = 'button'; button.className = 'sgs-report-tool';
  button.textContent = '问题报告'; button.dataset.sgsReport = 'true';
  const open = ({ backLabel = '返回牌局' } = {}) => {
    if (disposed) return null;
    returnFocus?.focus();
    closeMenu();
    return dialogs.open('problem-report', '<h2>问题报告</h2><div class="sgs-report-content" tabindex="0" role="region" aria-label="报告摘要"><p class="sgs-dialog-note">记录当前版本、玩法、操作提示和公开记录，便于排查问题。下载后可自行提供给排查人员。</p><p data-report-summary></p><p class="sgs-report-status" data-report-status role="status"></p></div><div class="sgs-dialog-actions"><button type="button" data-close>返回牌局</button><button type="button" data-download data-primary>下载问题报告</button></div>', (dialog, close) => {
      dialog.classList.add('sgs-report-dialog');
      const snapshot = reports.snapshot();
      dialog.querySelector('[data-report-summary]').textContent = `本局公开记录 ${snapshot.publicLog.length} 条 · 已记录错误 ${snapshot.errors.length} 条。报告只保存在你下载的文件中。`;
      dialog.querySelector('[data-close]').onclick = close;
      dialog.querySelector('[data-close]').textContent = backLabel;
      dialog.querySelector('[data-download]').onclick = () => {
        const status = dialog.querySelector('[data-report-status]');
        try {
          let cleanup;
          cleanup = download(reports.snapshot(), { document, onDone: () => downloads.delete(cleanup) });
          if (cleanup) downloads.add(cleanup);
          status.textContent = '已请求下载，请在浏览器下载列表中查看。';
        } catch { status.textContent = '报告未能下载，请重试或检查浏览器是否允许下载。牌局仍保持暂停。'; }
      };
    });
  };
  const stop = event => event.stopPropagation();
  const click = event => { event.preventDefault(); event.stopPropagation(); open(); };
  button.addEventListener('pointerdown', stop); button.addEventListener('click', click); menu.append(button);
  return { open, dispose() { disposed = true; dialogs.close('problem-report'); button.removeEventListener('pointerdown', stop); button.removeEventListener('click', click); button.remove(); for (const cleanup of downloads) cleanup(); downloads.clear(); } };
}
