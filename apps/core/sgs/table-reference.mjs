// Read-only presentation of states/logs already public on the native table.
export function publicPlayerStates(player) {
  if (player.classList.contains('dead') || player.classList.contains('unseen')) return [];
  const states = [];
  if (player.isLinked()) states.push(['linked', '连环']);
  if (player.isTurnedOver()) states.push(['turned', '翻面']);
  if (Number.isFinite(player.hujia) && player.hujia > 0) states.push(['armor', `护甲 ${player.hujia}`]);
  return states;
}

export function installPublicStates({ game, ui }, document = globalThis.document) {
  const entries = new Map();
  return {
    refresh() {
      const players = new Set([...game.players, ...game.dead]);
      for (const [player, entry] of entries) if (!players.has(player) || player.parentNode !== ui.arena) {
        entry.node.remove(); entries.delete(player);
      }
      for (const player of players) {
        if (player.parentNode !== ui.arena) continue;
        const states = publicPlayerStates(player), signature = JSON.stringify(states);
        let entry = entries.get(player);
        if (!entry) {
          const node = document.createElement('div'); node.className = 'sgs-public-states';
          node.setAttribute('aria-label', '公开状态'); player.append(node);
          entries.set(player, entry = { node });
        }
        if (entry.signature === signature) continue;
        entry.signature = signature; entry.node.replaceChildren(); entry.node.hidden = !states.length;
        for (const [key, label] of states) {
          const item = document.createElement('span'); item.dataset.state = key; item.textContent = label;
          entry.node.append(item);
        }
      }
    },
    dispose() { for (const entry of entries.values()) entry.node.remove(); entries.clear(); },
  };
}

export function publicBattleLog(ui) {
  // Native game.log writes newest first. Do not reconstruct events, names or cards.
  const rows = [];
  for (const node of ui.sidebar?.children || []) {
    const text = node.textContent.trim();
    if (text) rows.push(text);
    if (rows.length === 300) break;
  }
  return rows;
}

export function openBattleLog(dialogs, ui, document = globalThis.document) {
  const rows = publicBattleLog(ui);
  return dialogs.open('battle-log', `<h2>对局记录</h2><p class="sgs-dialog-note">最新记录在前 · 展示最近300条公开记录</p>
    <label class="sgs-log-search">查找记录<input type="search" placeholder="武将、技能或卡牌名称" autocomplete="off"></label>
    <p class="sgs-log-count" role="status"></p><ol class="sgs-log-list" tabindex="0" aria-label="本局公开记录"></ol>
    <div class="sgs-dialog-actions"><button type="button" data-close data-primary>返回牌局</button></div>`, (dialog, close) => {
    dialog.classList.add('sgs-reference-dialog');
    const input = dialog.querySelector('input'), list = dialog.querySelector('ol'), count = dialog.querySelector('.sgs-log-count');
    const render = () => {
      const query = input.value.trim().toLocaleLowerCase();
      const found = rows.filter(text => text.toLocaleLowerCase().includes(query));
      count.textContent = !rows.length ? '还没有对局记录。' : !found.length ? '没有找到匹配的记录，请换个关键词。' : `${found.length} 条记录${query ? '符合搜索' : ''}`;
      list.replaceChildren();
      for (const text of found) { const item = document.createElement('li'); item.textContent = text; list.append(item); }
    };
    input.value = ''; input.addEventListener('input', render); render();
    dialog.querySelector('[data-close]').onclick = close;
  });
}

export function openPlayGuide(dialogs, mode, document = globalThis.document) {
  const goal = mode === 'doudizhu' ? '地主击败两名农民获胜；农民合力击败地主获胜。'
    : mode === 'versus' ? '一、四号位同队，二、三号位同队。击败敌方两人获胜。'
    : '主公与忠臣保护主公、击败反贼和内奸；反贼击败主公；内奸须成为最后的生存者。';
  return dialogs.open('play-guide', `<h2>操作帮助</h2><p class="sgs-dialog-note">需要时随时查看，关闭后继续当前选择。</p>
    <div class="sgs-guide-content" tabindex="0">
      <section><h3>本局目标</h3><p>${goal}</p></section>
      <section><h3>选牌 → 选目标 → 确定</h3><p>亮起的牌可以选择，灰暗的牌当前不可用。普通单牌选择可直接换另一张亮牌；金框表示已选。</p><p>只有一个合法目标的单目标牌会预选。仍需点击“确定”才会出牌；再次点击已选的牌或角色可取消。技能、多目标与弃牌按中央提示操作。</p></section>
      <section><h3>看清状态与结算</h3><p>“连环”表示角色已横置。火焰、雷电等可传导属性伤害在命中后影响其他连环角色；普通伤害、失去体力不触发传导。防止横置或伤害的技能可能改变结果，以技能说明为准。</p><p>“翻面”表示武将牌背面朝上；“护甲”显示当前护甲数。通过“武将说明”查看场上明置武将，通过“对局记录”追溯技能、伤害与状态变化。</p></section>
      <section><h3>暂停与重新开局</h3><p>查看帮助、记录或设置时牌局暂停，关闭后保留选择。后台自动暂停开启时，返回页面后需手动继续。托管会让AI代替你操作，可随时取消。</p><p>返回点将台或重新开局会结束当前进度；提前离开不计胜负，关闭页面后不提供续玩。</p></section>
    </div><div class="sgs-dialog-actions"><button type="button" data-close data-primary>知道了</button></div>`, (dialog, close) => {
    dialog.classList.add('sgs-reference-dialog'); dialog.querySelector('[data-close]').onclick = close;
  });
}
