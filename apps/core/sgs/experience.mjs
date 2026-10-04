// SGS presentation policy; card legality and resolution stay in the engine.
export function installManualConfirmation(lib, ui) {
  const index = lib.hooks.checkEnd.findIndex(hook => hook.name === 'autoConfirm');
  if (index < 0) throw new Error('未找到出牌确认接口，请检查引擎版本。');
  const autoConfirm = lib.hooks.checkEnd[index];
  lib.hooks.checkEnd[index] = function sgsManualConfirm(event, state) {
    const humanSelection = event.isMine() && (
      ['chooseToUse', 'chooseToRespond'].includes(event.name) || ui.selected.cards.length > 0
    );
    // direct view-as skills otherwise bypass auto_confirm=false. Preserve the
    // upstream hook for AI, forced effects and unrelated choice dialogs.
    if (!humanSelection) return autoConfirm.call(this, event, state);
  };
}

export function applyPortraits(packs, portraits) {
  for (const pack of Object.values(packs)) {
    for (const [id, character] of Object.entries(pack.character || {})) {
      const portrait = portraits[id];
      if (!portrait) continue;
      const path = `sgs/portraits/${portrait.file}`;
      if (Array.isArray(character)) {
        character[4] = (character[4] || []).filter(tag => !tag.startsWith('img:'));
        character[4].unshift(`img:${path}`);
      } else {
        character.img = path;
      }
    }
    // changeSkin builds temporary characters from this metadata. Keep the
    // native form IDs and audio/hidden tags; only supply an existing local image.
    for (const [id, substitutes] of Object.entries(pack.characterSubstitute || {})) {
      for (const substitute of substitutes) {
        const portrait = portraits[substitute[0]] || portraits[id];
        if (!portrait) continue;
        substitute[1] = (substitute[1] || []).filter(tag => typeof tag !== 'string' || !tag.startsWith('img:'));
        // Native metadata can use the first tag for groupInGuozhan.
        substitute[1].push(`img:sgs/portraits/${portrait.file}`);
      }
    }
  }
}

export function installTargetHints({ lib, ui, get }) {
  const marked = new Set();
  const clear = () => {
    for (const target of marked) {
      delete target.dataset.sgsTarget;
      const hint = target.querySelector(':scope > .sgs-target-hint');
      if (hint) hint.hidden = true;
    }
    marked.clear();
  };
  lib.hooks.checkBegin.push(clear);
  lib.hooks.uncheckBegin.push(clear);
  lib.hooks.checkTarget.push((target, event) => {
    if (!event.isMine() || event.name !== 'chooseToUse' || !event.filterTarget || target === event.player) return;
    const card = get.card();
    if (!card || get.info(card)?.notarget || get.select(event.selectTarget)[1] <= 0) return;
    // This hook runs after the engine checks distance, equipment, skills and
    // target restrictions. Never infer legality from seat numbers or team.
    const state = target.classList.contains('selected') ? 'selected'
      : target.classList.contains('selectable') ? 'available' : 'unavailable';
    target.dataset.sgsTarget = state;
    const hint = target.querySelector(':scope > .sgs-target-hint') || ui.create.div('.sgs-target-hint', target);
    hint.textContent = state === 'selected' ? '已选中'
      : card.name === 'sha' ? state === 'available' ? '可杀' : '不可杀'
      : state === 'available' ? '可选目标' : '不可选';
    hint.hidden = false;
    marked.add(target);
  });
}
