import { volumePreferences } from './preferences.mjs';

// HTML dialogs sit above native dialogs and trap focus without touching the
// engine's selected cards/targets. Every child is styled in normal flow.
export function createClientDialogs({ document, pause }) {
  const opened = new Map();
  let disposed = false;
  function open(kind, html, setup = () => {}, onClose = () => {}, { dismissible = true } = {}) {
    if (disposed) return null;
    if (opened.has(kind)) return opened.get(kind).dialog;
    const returnFocus = document.activeElement;
    const dialog = document.createElement('dialog');
    dialog.className = 'sgs-client-dialog';
    dialog.innerHTML = html;
    dialog.setAttribute('aria-labelledby', `sgs-dialog-${kind}`);
    const title = dialog.querySelector('h2');
    if (title) title.id = `sgs-dialog-${kind}`;
    const release = pause?.acquire(kind) || (() => {});
    const close = () => {
      if (!opened.has(kind)) return;
      opened.delete(kind);
      if (dialog.open) dialog.close();
      dialog.remove();
      try { onClose(); } finally {
        release();
        if (returnFocus?.isConnected) returnFocus.focus();
      }
    };
    opened.set(kind, { dialog, close });
    dialog.addEventListener('cancel', event => { event.preventDefault(); if (dismissible) close(); });
    dialog.addEventListener('close', close);
    dialog.addEventListener('click', event => event.stopPropagation());
    dialog.addEventListener('pointerdown', event => event.stopPropagation());
    dialog.addEventListener('keydown', event => {
      event.stopPropagation();
      // Search inputs consume Escape to clear text before dialog cancellation.
      // Keep the modal exit consistent, while leaving IME cancellation alone.
      if (event.key === 'Escape' && !event.isComposing) { event.preventDefault(); if (dismissible) close(); }
    });
    document.body.append(dialog);
    try { setup(dialog, close); dialog.showModal(); } catch (error) { close(); throw error; }
    return dialog;
  }
  const closeAll = () => { for (const entry of [...opened.values()].reverse()) entry.close(); };
  return { open, has: kind => opened.has(kind), close: kind => opened.get(kind)?.close(), closeAll, dispose() {
    disposed = true;
    closeAll();
  } };
}

export function openClientSettings(dialogs, preferences) {
  let unsubscribe = () => {};
  return dialogs.open('settings', `<h2>便捷设置</h2><p class="sgs-dialog-note">更改即时生效，并记住下次的选择。</p>
    <label class="sgs-setting-row"><span>AI 行动速度<small>调整AI行动之间的等待时间</small></span><select name="speed"><option value="normal">适中</option><option value="fast">快速</option></select></label>
    <label class="sgs-setting-row"><span>游戏声音<small>卡牌、武将语音与受击音效</small></span><input type="checkbox" name="sound"></label>
    <fieldset class="sgs-volume-settings"><legend>独立音量</legend>
      ${Object.entries(volumePreferences).map(([channel, key]) => `<label class="sgs-volume-row"><span>${{ card: '卡牌报音', hero: '武将语音', effect: '受击音效' }[channel]}</span><input type="range" name="${key}" min="0" max="1" step="0.01"><output data-volume="${key}"></output></label>`).join('')}
    </fieldset>
    <label class="sgs-setting-row"><span>后台自动暂停<small>离开页面时暂停，回来后手动继续</small></span><input type="checkbox" name="backgroundPause"></label>
    <label class="sgs-setting-row"><span>减少动态效果<small>关闭战斗闪动，缩短界面和卡牌动画</small></span><input type="checkbox" name="reducedMotion"></label>
    <p class="sgs-save-status" role="status"></p><div class="sgs-dialog-actions"><button type="button" data-close data-primary>完成</button></div>`, (dialog, close) => {
    const render = (value, saved) => {
      for (const key of ['speed', 'sound', 'backgroundPause', 'reducedMotion']) {
        const input = dialog.querySelector(`[name="${key}"]`);
        if (key === 'speed') input.value = value[key]; else input.checked = value[key];
      }
      for (const key of Object.values(volumePreferences)) {
        dialog.querySelector(`[name="${key}"]`).value = value[key];
        dialog.querySelector(`[data-volume="${key}"]`).textContent = `${Math.round(value[key] * 100)}%`;
      }
      dialog.querySelector('.sgs-save-status').textContent = saved === false ? '设置已在本次生效，但未能保存到浏览器。' : saved === true ? '已保存' : '';
    };
    render(preferences.get());
    unsubscribe = preferences.subscribe(render);
    for (const input of dialog.querySelectorAll('input,select')) {
      const volume = Object.values(volumePreferences).includes(input.name);
      input.addEventListener(volume ? 'input' : 'change', () => {
        preferences.set({ [input.name]: volume ? Number(input.value) : input.name === 'speed' ? input.value : input.checked });
      });
    }
    dialog.querySelector('[data-close]').onclick = close;
  }, () => unsubscribe());
}
