import { recordLaunch } from './battle-records.mjs';

const modeName = config => config.mode === 'versus' ? '双人对抗 · 2v2' : config.mode === 'doudizhu' ? '斗地主' : `${config.playerCount}人身份军争`;
const duration = ms => `${Math.floor(ms / 60000)}分${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}秒`;
const date = ms => new Date(ms).toLocaleString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' });

export function openBattleRecords(dialogs, records, { characters, getCatalog = () => ({ characters, status: characters ? 'ready' : 'loading' }),
  subscribeCatalog = () => () => {}, launch, document = globalThis.document }) {
  let unsubscribe = () => {};
  return dialogs.open('records', `<h2>本地战绩</h2><p class="sgs-dialog-note">最近 50 场已完成对局 · 仅保存在当前浏览器</p>
    <p data-record-status role="status"></p><div class="sgs-record-content" tabindex="0" role="region" aria-label="战绩列表与详情"></div>
    <div class="sgs-dialog-actions"><button type="button" data-back hidden>返回列表</button><button type="button" data-close>关闭战绩</button><button type="button" data-catalog-retry hidden>重试名册</button><button type="button" data-launch data-primary hidden>按此配置开局</button></div>`, (dialog, close) => {
    dialog.classList.add('sgs-record-dialog');
    const content = dialog.querySelector('.sgs-record-content');
    const status = dialog.querySelector('[data-record-status]');
    const back = dialog.querySelector('[data-back]'), start = dialog.querySelector('[data-launch]');
    const state = records.get();
    const retry = dialog.querySelector('[data-catalog-retry]');
    let currentRecord, navigating = false;
    function availability() {
      const catalog = getCatalog();
      retry.hidden = !currentRecord || catalog.status !== 'failed';
      if (!currentRecord) return;
      const config = recordLaunch(currentRecord, catalog.characters);
      start.disabled = navigating || catalog.status !== 'ready' || !config;
      status.textContent = catalog.status === 'failed' ? '武将名册载入失败；战绩仍可查看，重试名册后即可开局。'
        : catalog.status !== 'ready' ? '武将名册正在载入；战绩仍可查看，就绪后可按此配置开局。'
        : !config ? '此武将版本已不在当前名册中；仍可查看战绩，无法按此配置开局。' : state.notice;
    }
    retry.onclick = () => { if (getCatalog().status === 'failed') getCatalog().retry?.(); };
    status.textContent = state.notice;
    function node(tag, text, className) {
      const element = document.createElement(tag);
      if (text !== undefined) element.textContent = text;
      if (className) element.className = className;
      return element;
    }
    function detail(record) {
      content.innerHTML = '';
      content.scrollTop = 0;
      dialog.querySelector('h2').textContent = '战绩详情';
      back.hidden = false; start.hidden = false;
      currentRecord = record; availability();
      const heading = node('p', record.title, 'sgs-record-outcome');
      heading.dataset.outcome = record.outcome;
      content.append(heading,
        node('p', `${[record.general, record.secondGeneral].filter(Boolean).join(' / ')} · ${record.role} · ${record.dead ? '已阵亡' : '存活'}`, 'sgs-record-general'),
        node('p', `${modeName(record.replay)}　｜　${record.rounds === null ? '轮数未提供' : `第 ${record.rounds} 轮`}　｜　${duration(record.elapsedMs)}`),
        node('p', `${date(record.completedAt)}　｜　AI ${record.replay.speed === 'fast' ? '快速' : '适中'}`, 'sgs-record-meta'),
        node('p', `出战版本：${record.replay.pack}:${record.replay.generalId}`, 'sgs-record-meta'));
      const stats = node('div', undefined, 'sgs-record-stats');
      for (const [key, caption] of Object.entries({ damage: '伤害', damaged: '受伤', gain: '摸牌', cards: '出牌', kill: '杀敌' })) {
        const cell = node('div'); cell.append(node('strong', record.stats[key]), node('span', caption)); stats.append(cell);
      }
      content.append(stats, node('p', '统计保存自本局原生结算。按此配置开局会重新发牌、生成对手。', 'sgs-record-meta'));
      start.onclick = () => {
        const config = recordLaunch(record, getCatalog().characters);
        if (!config || start.disabled || getCatalog().status !== 'ready') return;
        navigating = true;
        start.disabled = true;
        const error = launch(config);
        if (error) { status.textContent = error; start.disabled = false; navigating = false; }
      };
      back.focus();
    }
    function list() {
      currentRecord = null; retry.hidden = true;
      content.innerHTML = ''; content.scrollTop = 0;
      dialog.querySelector('h2').textContent = '本地战绩';
      status.textContent = state.notice;
      back.hidden = true; start.hidden = true; start.onclick = null;
      if (!state.records.length) {
        content.append(node('p', state.notice ? '暂无可读取的战绩' : '还没有完成的对局', 'sgs-record-empty'),
          node('p', '对局结束后会自动记录。提前返回或重开不计胜负。', 'sgs-record-meta'));
        return;
      }
      for (const record of state.records) {
        const row = node('button', undefined, 'sgs-record-row');
        row.type = 'button'; row.dataset.outcome = record.outcome;
        row.append(node('strong', record.title), node('span', `${record.general} · ${record.role}`),
          node('span', `${modeName(record.replay)} · ${duration(record.elapsedMs)}`, 'sgs-record-meta'),
          node('span', `${date(record.completedAt)} · 查看详情 ›`, 'sgs-record-meta'));
        row.onclick = () => detail(record);
        content.append(row);
      }
    }
    back.onclick = () => { list(); content.focus(); };
    dialog.querySelector('[data-close]').onclick = close;
    unsubscribe = subscribeCatalog(availability);
    list();
  }, () => unsubscribe());
}
