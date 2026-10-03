import { launchKey, normalizeLaunch, engineSettings, attachInitialIdentity } from './launch-config.mjs';
import { installManualConfirmation, applyPortraits, installTargetHints } from './experience.mjs';
import { installTwoPlayerTeamMode } from './team-mode.mjs';
import { installDoudizhuMode } from './doudizhu-mode.mjs';
import { installCardAudio } from './card-audio.mjs';
import { installCharacterAudio } from './character-audio.mjs';
import { installTeammateHand } from './teammate-hand.mjs';
import { installOpeningHand } from './opening-hand.mjs';
import { installCardSelectionSwitch } from './card-selection.mjs';

async function saveSettings(prefix, settings) {
  const db = await new Promise((resolve, reject) => {
    const request = indexedDB.open(`${prefix}data`, 4);
    request.onupgradeneeded = () => {
      for (const name of ['video', 'image', 'audio', 'config', 'data']) {
        if (!request.result.objectStoreNames.contains(name)) request.result.createObjectStore(name, name === 'video' ? { keyPath: 'time' } : undefined);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise((resolve, reject) => {
    const tx = db.transaction('config', 'readwrite');
    for (const [key, value] of Object.entries(settings)) tx.objectStore('config').put(value, key);
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

export async function prepareSinglePlayer({ lib, game, ui, get, _status }) {
  let saved;
  try { saved = JSON.parse(sessionStorage.getItem(launchKey) || '{}'); } catch { saved = {}; }
  const launch = normalizeLaunch(saved);
  const response = await fetch('./sgs/roster.json');
  if (!response.ok) throw new Error('武将名册载入失败，请返回选将。');
  const roster = await response.json();
  const portraitResponse = await fetch('./sgs/portraits.json');
  if (!portraitResponse.ok) throw new Error('武将头像载入失败，请返回选将。');
  const { portraits } = await portraitResponse.json();
  const audioResponse = await fetch('./sgs/card-audio.json');
  if (!audioResponse.ok) throw new Error('卡牌语音载入失败，请返回选将。');
  const audioManifest = await audioResponse.json();
  const characterAudioResponse = await fetch('./sgs/character-audio.json');
  if (!characterAudioResponse.ok) throw new Error('武将语音载入失败，请返回选将。');
  const characterAudioManifest = await characterAudioResponse.json();
  const damageAudioResponse = await fetch('./sgs/damage-audio.json');
  if (!damageAudioResponse.ok) throw new Error('受击音效载入失败，请返回选将。');
  const damageAudioManifest = await damageAudioResponse.json();
  const selected = roster.characters.find(c => c.id === launch.generalId && c.pack === launch.pack && !c.isUnseen);
  if (!selected) throw new Error('武将配置无效，请返回选将。');
  const allowed = new Set(roster.characters.filter(c => ['decade', 'common'].includes(c.version.category) && !c.isUnseen).map(c => c.id));
  allowed.add(selected.id);
  lib.configprefix = 'sgs_local_v1_';
  await saveSettings(lib.configprefix, engineSettings(launch));
  localStorage.setItem(`${lib.configprefix}directstart`, 'true');
  localStorage.setItem(`${lib.configprefix}loadtime`, '60000');
  document.title = '三国杀 · 单机对局';
  document.documentElement.classList.add('sgs-game');
  installManualConfirmation(lib, ui);
  installCardSelectionSwitch({ lib, game, ui, get, _status });
  installTargetHints({ lib, ui, get });
  const style = document.createElement('link');
  style.rel = 'stylesheet'; style.href = './sgs/table.css'; document.head.append(style);

  lib.onload.push(() => {
    applyPortraits(lib.imported.character || {}, portraits);
    // All upstream packs are imported for cross-pack skill references; only the
    // enabled packs take part in selection. Keep variant IDs distinct.
    const all = Object.values(lib.imported.character || {}).flatMap(pack => Object.keys(pack.character || {}));
    lib.config.forbidai_user = all.filter(id => !allowed.has(id));
    if (!all.includes(launch.generalId)) throw new Error(`武将 ${launch.generalId} 未加载，请返回选将。`);
  });

  lib.arenaReady.push(() => {
    // chooseCharacter schedules but does not return its event.
    const teams = launch.mode === 'versus';
    const landlord = launch.mode === 'doudizhu';
    if (teams) installTwoPlayerTeamMode({ lib, game, get, _status }, launch, allowed);
    else if (landlord) installDoudizhuMode({ lib, game, _status }, launch, allowed);
    else attachInitialIdentity(game, launch.identity);
    installOpeningHand({ lib, game, _status });
    const hud = document.createElement('header');
    hud.className = 'sgs-hud';
    hud.innerHTML = `<a href="./sgs.html" class="sgs-return">‹ 点将台</a><strong>三国杀 <span>${landlord ? '斗地主' : teams ? '双人对抗 · 2v2' : '身份军争'}</span></strong><span class="sgs-table-state">单机 AI 对局</span><span class="sgs-turn" aria-live="polite">准备开局</span><span class="sgs-table-clock" aria-label="对局进度"></span><button type="button" class="sgs-audio">语音：开</button><details class="sgs-tools"><summary>牌桌工具</summary></details><button type="button" class="sgs-restart">重新开局</button>`;
    document.documentElement.classList.toggle('sgs-teams', teams || landlord);
    document.documentElement.classList.toggle('sgs-landlord', landlord);
    const startedAt = Date.now();
    const label = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    const askLeave = (restart = false) => {
      const dialog = document.createElement('dialog');
      dialog.className = 'sgs-leave-dialog';
      dialog.innerHTML = `<h2>${restart ? '重新开局' : '返回点将台'}</h2><p>当前对局的进度将结束。${restart ? '使用相同的武将和设置开启新对局。' : '你可以重新选择武将与对局设置。'}</p><div><button type="button" data-stay>继续对局</button><button type="button" data-leave>${restart ? '确认重开' : '返回选将'}</button></div>`;
      document.body.append(dialog);
      dialog.querySelector('[data-stay]').onclick = () => dialog.close();
      dialog.querySelector('[data-leave]').onclick = () => {
        window.onbeforeunload = null;
        if (restart) location.reload(); else location.href = './sgs.html';
      };
      dialog.addEventListener('close', () => dialog.remove(), {once:true});
      dialog.showModal();
    };
    hud.querySelector('a').addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); askLeave(); }, true);
    hud.querySelector('.sgs-restart').addEventListener('click', event => { event.preventDefault(); event.stopPropagation(); askLeave(true); }, true);
    document.body.append(hud);
    const audioButton = hud.querySelector('.sgs-audio');
    let audioEnabled = localStorage.getItem('sgs.card-audio.enabled') !== 'false';
    const updateAudio = status => {
      label(audioButton, status.enabled ? status.blocked ? '点击开启声音' : '声音：开' : '声音：关');
      audioButton.setAttribute('aria-pressed', String(status.enabled));
      audioButton.title = status.lastError || (status.lastClip ? `最近播放：${status.lastLabel || get.translation(status.lastClip.split('/').at(-1))}` : '卡牌、已收录武将语音及受击音效');
      audioButton.dataset.played = status.played;
      audioButton.dataset.lastClip = status.lastClip || '';
      audioButton.dataset.audioState = status.contextState;
      audioButton.dataset.effects = status.effectPlayed;
      audioButton.dataset.lastEffect = status.lastEffect || '';
      audioButton.dataset.lastEffectLabel = status.lastEffectLabel || '';
    };
    const cardAudio = installCardAudio({ lib, game, get }, audioManifest, { enabled: audioEnabled, characterManifest: characterAudioManifest, damageManifest: damageAudioManifest, baseURL: new URL('./sgs/', location.href), onStateChange: updateAudio });
    installCharacterAudio({ lib, game }, characterAudioManifest);
    updateAudio(cardAudio.status());
    let unlockClick = false;
    const rememberAudioIntent = () => { unlockClick = cardAudio.status().blocked; };
    audioButton.addEventListener('pointerdown', rememberAudioIntent);
    audioButton.addEventListener('keydown', rememberAudioIntent);
    audioButton.addEventListener('click', () => {
      if (unlockClick || cardAudio.status().blocked) { unlockClick = false; void cardAudio.unlock(); return; }
      audioEnabled = cardAudio.setEnabled(!cardAudio.status().enabled);
      localStorage.setItem('sgs.card-audio.enabled', String(audioEnabled));
    });
    // Reuse the real engine toolbar, including its menus and click handlers.
    const toolMenu = hud.querySelector('.sgs-tools');
    if (ui.system) toolMenu.append(ui.system);
    toolMenu.addEventListener('click', event => {
      if (event.target.closest('[data-sgs-tool]')) queueMicrotask(() => { toolMenu.open = false; });
    }, true);
    if (ui.volumn) ui.volumn.style.display = 'none';
    const sortHandButton = document.createElement('button');
    sortHandButton.type = 'button';
    sortHandButton.className = 'sgs-sort-hand';
    sortHandButton.textContent = '整理手牌';
    sortHandButton.title = '整理当前手牌';
    sortHandButton.disabled = true;
    sortHandButton.addEventListener('pointerdown', event => event.stopPropagation());
    sortHandButton.addEventListener('click', event => {
      event.stopPropagation();
      // Same native action as the toolbar; preserve custom sorting and skill restrictions.
      game.me?.sortHandcardOL(_status.tempHandcardSort);
    });
    ui.arena.append(sortHandButton);
    const closeTools = event => { if (!toolMenu.contains(event.target)) toolMenu.open = false; };
    document.addEventListener('pointerdown', closeTools);
    const decorateControls = () => {
      for (const button of ui.system?.querySelectorAll(':scope > div > div') || []) {
        const name = button.textContent.trim();
        if (button.getAttribute('aria-label') !== name) button.setAttribute('aria-label', name);
        if (button.dataset.sgsTool) continue;
        button.dataset.sgsTool = 'true';
        button.setAttribute('role', 'button');
        button.tabIndex = 0;
        button.addEventListener('keydown', event => {
          if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); button.click(); }
        });
      }
      [ui.skills, ui.skills2, ui.skills3].filter(Boolean).forEach((control, index) => {
        control.classList.add('sgs-skill-control');
        control.style.setProperty('--sgs-skill-row', index);
      });
      for (const button of ui.control?.querySelectorAll('.control > div') || []) {
        if (button.link === 'ok' || button.link === 'cancel') button.dataset.sgsAction = button.link;
        else delete button.dataset.sgsAction;
        if (_status.event?.sgsOpeningHandChoice && ['ok', 'cancel'].includes(button.link)) {
          label(button, button.link === 'ok' ? '换一手' : '开始对局');
          button.dataset.sgsMulligan = button.link === 'ok' ? 'replace' : 'start';
        } else delete button.dataset.sgsMulligan;
      }
    };
    const controlsObserver = new MutationObserver(decorateControls);
    if (ui.control) controlsObserver.observe(ui.control, { childList: true, subtree: true });
    let equipmentOwner;
    let handContainer;
    const handResizeObserver = new ResizeObserver(() => ui.updatehl());
    const teammateHand = installTeammateHand({ game, ui, get }, launch.mode);
    const decorate = () => {
      if (ui.handcards1Container && handContainer !== ui.handcards1Container) {
        handResizeObserver.disconnect();
        handContainer = ui.handcards1Container;
        handResizeObserver.observe(handContainer);
      }
      if (game.me?.name && equipmentOwner !== game.me) {
        // Render the engine's own empty equipment slots; no equipment is added.
        game.me.$handleEquipChange();
        equipmentOwner = game.me;
      }
      for (const slot of game.me?.node.equips.children || []) {
        if (slot.classList.contains('emptyequip') && !slot.extraEquip && slot.node?.name2) {
          label(slot.node.name2, `${get.translation(`equip${get.equipNum(slot)}`)} · 空`);
        }
      }
      for (const player of [...game.players, ...game.dead]) {
        if (!player.name) continue;
        const hidden = player.classList.contains('unseen');
        const visibleName = hidden ? '未知武将' : get.translation(player.name).replace(/<[^>]*>/g, '');
        player.dataset.sgsName = visibleName;
        player.dataset.sgsGroup = get.translation(player.group);
        player.dataset.sgsFaction = hidden ? '' : player.group;
        let faction = player.querySelector(':scope > .sgs-faction');
        if (!faction) { faction = document.createElement('span'); faction.className = 'sgs-faction'; faction.setAttribute('aria-hidden', 'true'); player.append(faction); }
        label(faction, hidden ? '' : get.translation(player.group));
        let seat = player.querySelector(':scope > .sgs-seat');
        if (!seat) { seat = document.createElement('span'); seat.className = 'sgs-seat'; player.append(seat); }
        const seatNumber = teams || landlord ? player.sgsSeat : Number(player.dataset.position) || launch.playerCount;
        const relation = player === game.me ? '你' : player.side === game.me.side ? '队友' : '敌方';
        const seatName = `${['零','一','二','三','四','五','六','七','八'][seatNumber] || seatNumber}号位`;
        const roleName = player.identity === 'zhu' ? '地主' : '农民';
        if (landlord && player.node.identity.firstChild) label(player.node.identity.firstChild, roleName);
        const seatLabel = landlord ? `${seatName} · ${roleName}${player === game.me ? ' · 你' : ''}` : `${seatName}${teams || player === game.me ? ` · ${relation}` : ''}`;
        label(seat, seatLabel);
        if (teams || landlord) player.dataset.sgsTeam = player.side === game.me.side ? 'friend' : 'enemy';
        if (landlord) player.dataset.sgsRole = player.identity === 'zhu' ? 'landlord' : 'farmer';
        player.setAttribute('aria-label', `${seatLabel}，${visibleName}，体力 ${player.hp}/${player.maxHp}，手牌 ${player.countCards('h')}`);
      }
      const state = hud.querySelector('.sgs-table-state');
      if (game.me?.name) label(state, landlord ? game.me.identity === 'zhu' ? '你是地主 · 一对二' : '你是农民 · 协力破敌' : teams ? '我方 1·4 ｜ 敌方 2·3' : `${get.translation(game.me.identity + '2')} · ${launch.playerCount}人局`);
      const active = _status.currentPhase;
      const yourTurn = active === game.me && !_status.over;
      hud.dataset.yourTurn = String(yourTurn);
      label(hud.querySelector('.sgs-turn'), _status.over ? '对局结束' : _status.event?.sgsOpeningHandChoice ? '开局换牌' : yourTurn ? '你的回合' : active?.name ? `${get.translation(active.name).replace(/<[^>]*>/g, '')}的回合` : '准备开局');
      const elapsed = Math.floor((Date.now() - startedAt) / 1000);
      const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
      label(hud.querySelector('.sgs-table-clock'), `牌堆 ${ui.cardPile?.childElementCount ?? 0} · 第${game.roundNumber || 1}轮 ${clock}`);
      decorateControls();
      teammateHand.refresh();
      sortHandButton.disabled = !game.me?.name || _status.over || !game.me.isAlive()
        || game.me.countCards('h') < 2 || game.me.hasSkillTag('noSortCard');
    };
    const timer = setInterval(decorate, 700);
    window.addEventListener('pagehide', () => { clearInterval(timer); controlsObserver.disconnect(); handResizeObserver.disconnect(); teammateHand.dispose(); document.removeEventListener('pointerdown',closeTools); }, { once: true });
    decorate();
  });
}
