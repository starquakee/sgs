import { normalizeLaunch, engineSettings, attachInitialIdentity } from './launch-config.mjs';
import { installManualConfirmation, applyPortraits, installTargetHints } from './experience.mjs';
import { installTwoPlayerTeamMode } from './team-mode.mjs';
import { installDoudizhuMode } from './doudizhu-mode.mjs';
import { installCardAudio } from './card-audio.mjs';
import { installCharacterAudio } from './character-audio.mjs';
import { installTeammateHand } from './teammate-hand.mjs';
import { installOpeningHand } from './opening-hand.mjs';
import { installHandLayout } from './hand-layout.mjs';
import { installCardSelectionSwitch, installUniqueCardTarget } from './card-selection.mjs';
import { installSelectedTiesuoRecast } from './card-recast.mjs';
import { installTableActions, readTableAction, visiblePlayerName } from './table-actions.mjs';
import { installPublicStates, publicBattleLog } from './table-reference.mjs';
import { createProblemReports, installProblemReportUI } from './problem-report.mjs';
import { installRuntimeErrors } from './runtime-errors.mjs';
import { createPreferences } from './preferences.mjs';
import { installTableSession } from './table-session.mjs';
import { installBattleFeedback } from './battle-feedback.mjs';
import { installBattleResults } from './results.mjs';
import { consumeRecordReplay } from './battle-records.mjs';
import { readLaunch, retainLaunch } from './launch-handoff.mjs';
import { persistentStorage, saveNativeSettings, storageNotice } from './storage.mjs';
import { loadRosterAssets, loadAudioAssets } from './loading.mjs';

export async function prepareSinglePlayer({ lib, game, ui, get, _status }, loading) {
  const saved = readLaunch();
  const launch = normalizeLaunch(saved);
  const preferences = createPreferences(persistentStorage, launch);
  if (saved.preferences) preferences.set(saved.preferences);
  consumeRecordReplay(saved, preferences);
  launch.speed = preferences.get().speed;
  retainLaunch(launch, preferences.get());
  const keepLaunch = preferences.subscribe(value => retainLaunch({ ...launch, speed: value.speed }, value));
  window.addEventListener('pagehide', keepLaunch, { once: true });
  const { catalog: roster, portraits } = await loadRosterAssets(loading);
  const { audioManifest, characterAudioManifest, damageAudioManifest } = await loadAudioAssets(loading);
  const selected = roster.characters.find(c => c.id === launch.generalId && c.pack === launch.pack && !c.isUnseen);
  if (!selected) throw new Error('武将配置无效，请返回选将。');
  const allowed = new Set(roster.characters.filter(c => ['decade', 'common'].includes(c.version.category) && !c.isUnseen).map(c => c.id));
  allowed.add(selected.id);
  lib.configprefix = 'sgs_local_v1_';
  loading?.stage('正在准备本局配置');
  if (!await saveNativeSettings(lib.configprefix, engineSettings(launch))) loading?.warn(storageNotice);
  localStorage.setItem(`${lib.configprefix}directstart`, 'true');
  localStorage.setItem(`${lib.configprefix}loadtime`, '60000');
  document.title = '三国杀 · 单机对局';
  document.documentElement.classList.add('sgs-game');
  installManualConfirmation(lib, ui);
  installCardSelectionSwitch({ lib, game, ui, get, _status });
  installUniqueCardTarget({ game, ui, get, _status });
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
    const selectedRecast = installSelectedTiesuoRecast({ lib, game, ui, get, _status });
    // chooseCharacter schedules but does not return its event.
    const teams = launch.mode === 'versus';
    const landlord = launch.mode === 'doudizhu';
    if (teams) installTwoPlayerTeamMode({ lib, game, get, _status }, launch, allowed);
    else if (landlord) installDoudizhuMode({ lib, game, _status }, launch, allowed);
    else attachInitialIdentity(game, launch.identity);
    installOpeningHand({ lib, game, _status });
    const hud = document.createElement('header');
    hud.className = 'sgs-hud';
    hud.innerHTML = `<a href="./sgs.html" class="sgs-return">‹ 点将台</a><strong>三国杀 <span>${landlord ? '斗地主' : teams ? '双人对抗 · 2v2' : '身份军争'}</span></strong><span class="sgs-table-state">单机 AI 对局</span><span class="sgs-turn" aria-live="polite">准备开局</span><span class="sgs-table-clock" aria-label="对局进度"></span><button type="button" class="sgs-audio">语音：开</button><details class="sgs-tools"><summary>牌桌工具</summary><div class="sgs-tools-panel"><div class="sgs-tool-reference"></div><div class="sgs-tool-commands"><button type="button" class="sgs-restart">重新开局</button></div><details class="sgs-native-tools"><summary>原生工具</summary></details></div></details>`;
    document.documentElement.classList.toggle('sgs-teams', teams || landlord);
    document.documentElement.classList.toggle('sgs-landlord', landlord);
    const label = (node, value) => { if (node.textContent !== value) node.textContent = value; };
    document.body.append(hud);
    const toolMenu = hud.querySelector('.sgs-tools');
    const audioButton = hud.querySelector('.sgs-audio');
    const audioEnabled = preferences.get().sound;
    const updateAudio = status => {
      if (status.lastError) loading?.warn('部分声音暂时无法播放，已跳过；不影响出牌与结算。可重新开局重试声音。');
      label(audioButton, status.enabled ? status.blocked ? '点击开启声音' : '声音：开' : '声音：关');
      audioButton.setAttribute('aria-pressed', String(status.enabled));
      audioButton.title = status.lastError || (status.lastClip ? `最近播放：${status.lastLabel || get.translation(status.lastClip.split('/').at(-1))}` : '卡牌、已收录武将语音及受击音效');
      audioButton.dataset.played = status.played;
      audioButton.dataset.lastClip = status.lastClip || '';
      audioButton.dataset.audioState = status.contextState;
      audioButton.dataset.effects = status.effectPlayed;
      audioButton.dataset.lastEffect = status.lastEffect || '';
      audioButton.dataset.lastEffectLabel = status.lastEffectLabel || '';
      for (const channel of ['card', 'hero']) {
        const last = status.channels[channel];
        audioButton.dataset[`${channel}Clip`] = last?.clip || '';
        audioButton.dataset[`${channel}Start`] = last?.start ?? '';
        audioButton.dataset[`${channel}End`] = last?.end ?? '';
      }
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
      preferences.set({ sound: !cardAudio.status().enabled });
    });
    const session = installTableSession({ lib, game, ui, _status, hud, preferences, audio: cardAudio });
    const tableActions = installTableActions({ lib, game, ui, get, _status }, { dialogs: session.dialogs, mode: launch.mode,
      toolsHost: hud.querySelector('.sgs-tool-reference'), toolsMenu: toolMenu });
    const publicStates = installPublicStates({ game, ui });
    const results = installBattleResults({ lib, game, get, _status, launch, preferences,
      retainReplay: config => retainLaunch(config, preferences.get()),
      elapsedMs: session.elapsedMs, navigate: session.navigate, onReady: session.setResultActions });
    const battleFeedback = installBattleFeedback({ lib, game, ui, get, _status, preferences });
    // Reuse the real engine toolbar, including its menus and click handlers.
    if (ui.system) hud.querySelector('.sgs-native-tools').append(ui.system);
    const reports = createProblemReports({ upstream: roster.upstream, engineVersion: lib.version, build: lib.buildInfo, launch,
      readAction: () => {
        const action = readTableAction({ game, ui, get, _status });
        return [action.title, action.counts, action.detail].filter(Boolean).join(' · ');
      }, readLog: () => publicBattleLog(ui) });
    const reportUI = installProblemReportUI({ reports, dialogs: session.dialogs, menu: hud.querySelector('.sgs-tool-commands'), returnFocus: toolMenu.querySelector('summary'), closeMenu: () => { toolMenu.open = false; } });
    const runtimeErrors = installRuntimeErrors({ session, reports, reportUI });
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
    const handLayout = installHandLayout(() => ui.updatehl());
    const teammateHand = installTeammateHand({ game, ui, get }, launch.mode);
    const decorate = () => {
      handLayout.observe(ui.handcards1Container);
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
      label(hud.querySelector('.sgs-turn'), _status.over ? '对局结束' : _status.event?.sgsOpeningHandChoice ? '开局换牌' : yourTurn ? '你的回合' : active?.name ? `${visiblePlayerName(active, get)}的回合` : '准备开局');
      session.refresh();
      const elapsed = Math.floor(session.elapsedMs() / 1000);
      const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
      label(hud.querySelector('.sgs-table-clock'), `牌堆 ${ui.cardPile?.childElementCount ?? 0} · 第${game.roundNumber || 1}轮 ${clock}`);
      decorateControls();
      teammateHand.refresh();
      battleFeedback.refresh();
      publicStates.refresh();
      sortHandButton.disabled = !game.me?.name || _status.over || !game.me.isAlive()
        || game.me.countCards('h') < 2 || game.me.hasSkillTag('noSortCard');
    };
    const timer = setInterval(decorate, 700);
    window.addEventListener('pagehide', () => { clearInterval(timer); controlsObserver.disconnect(); selectedRecast.dispose(); handLayout.dispose(); teammateHand.dispose(); tableActions.dispose(); publicStates.dispose(); battleFeedback.dispose(); results.dispose(); runtimeErrors.dispose(); reportUI.dispose(); reports.dispose(); session.dispose(); }, { once: true });
    decorate();
    loading?.ready();
  });
}
