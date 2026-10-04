export async function resourceJSON(path, validate, fetcher = globalThis.fetch, timeout = 12000) {
  const controller = new AbortController();
  let timer;
  try {
    const value = await Promise.race([(async () => {
      const response = await fetcher(`./sgs/${path}`, { signal: controller.signal });
      if (!response.ok) throw new Error(`${path} · HTTP ${response.status}`);
      return response.json();
    })(), new Promise((_, reject) => { timer = setTimeout(() => {
      controller.abort(); reject(new Error(`${path} · 请求超时`));
    }, timeout); })]);
    if (!validate(value)) throw new Error(`${path} · 内容不完整`);
    return value;
  } finally { clearTimeout(timer); }
}
const object = value => value && typeof value === 'object' && !Array.isArray(value);
const validRoster = value => object(value) && Array.isArray(value.packs) && Array.isArray(value.characters)
  && value.characters.some(c => !c.isUnseen) && value.characters.every(c => object(c) && typeof c.id === 'string'
    && typeof c.pack === 'string' && c.key === `${c.pack}:${c.id}` && object(c.version) && Array.isArray(c.skills) && Array.isArray(c.groups));
export async function loadRosterAssets({ stage = () => {}, fetcher } = {}) {
  stage('正在读取武将名册');
  const catalog = await resourceJSON('roster.json', validRoster, fetcher);
  stage('正在读取画像索引');
  const { portraits } = await resourceJSON('portraits.json', value => object(value?.portraits), fetcher);
  return { catalog, portraits };
}
export async function loadAudioAssets({ stage = () => {}, warn = () => {}, fetcher } = {}) {
  stage('正在读取声音清单');
  const result = await Promise.all(['card-audio.json', 'character-audio.json', 'damage-audio.json'].map(async (path, index) => {
    try {
      return await resourceJSON(path, value => object(value?.clips) && Object.values(value.clips).every(clip =>
        object(clip) && typeof clip.file === 'string') && (index !== 1 || object(value.characters)), fetcher);
    } catch {
      warn(`${['卡牌语音', '武将语音', '受击音效'][index]}清单无法载入，本局该类声音已静音；其余操作照常，可重新开局重试。`);
      return { clips: {}, aliases: {}, characters: {} };
    }
  }));
  return { audioManifest: result[0], characterAudioManifest: result[1], damageAudioManifest: result[2] };
}

export function createLoadingScreen({ document = globalThis.document, retry = () => location.reload(), back = () => { location.href = './sgs.html'; } } = {}) {
  const style = document.createElement('link'); style.rel = 'stylesheet'; style.href = './sgs/loading.css'; document.head.append(style);
  const root = document.createElement('section'); root.className = 'sgs-loading';
  root.setAttribute('aria-label', '对局加载');
  root.innerHTML = '<div class="sgs-loading-panel"><h2>正在准备牌局</h2><p data-stage role="status"></p><p data-warning></p><div class="sgs-loading-actions"><button type="button" data-back>返回点将台</button><button type="button" data-retry hidden>重新载入</button></div></div>';
  document.body.append(root);
  const stage = root.querySelector('[data-stage]'), warning = root.querySelector('[data-warning]'), again = root.querySelector('[data-retry]');
  const warnings = new Set();
  const notice = document.createElement('aside'); notice.className = 'sgs-load-notice'; notice.hidden = true;
  notice.innerHTML = '<p role="status"></p><button type="button">收起提示</button>';
  document.body.append(notice);
  notice.querySelector('button').onclick = () => { notice.hidden = true; };
  let finished = false, leaving = false, disposed = false, failed = false, restoreReset = () => {};
  const navigate = action => { if (!leaving && !disposed) { leaving = true; action(); } };
  root.querySelector('[data-back]').onclick = () => navigate(back);
  again.onclick = () => navigate(retry);
  return {
    watchNative(lib) {
      const original = lib.init.reset;
      const reset = () => { if (!finished && !failed) this.fail(new Error('原生引擎未能及时载入，请重试或返回点将台。')); };
      lib.init.reset = reset;
      restoreReset = () => { if (lib.init.reset === reset) lib.init.reset = original; };
    },
    stage(text) { if (!disposed && !failed) stage.textContent = text; },
    warn(text) {
      if (disposed || warnings.has(text)) return;
      warnings.add(text); warning.textContent = [...warnings].join(' ');
      notice.querySelector('p').textContent = warning.textContent;
      if (finished) notice.hidden = false;
    },
    fail(error) {
      if (disposed || failed) return;
      failed = true;
      root.hidden = false; notice.hidden = true;
      root.querySelector('h2').textContent = '牌局未能载入';
      stage.textContent = `停在「${stage.textContent || '准备入口'}」：${error?.message || String(error)}`;
      again.hidden = false; again.focus();
    },
    ready() { if (!disposed && !failed) { finished = true; restoreReset(); root.hidden = true; notice.hidden = !warnings.size; } },
    dispose() { disposed = true; restoreReset(); root.remove(); notice.remove(); style.remove(); },
  };
}
