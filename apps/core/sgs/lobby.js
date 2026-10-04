import { normalizeLaunch } from './launch-config.mjs';
import { createRecentGenerals } from './recent-generals.mjs';
import { createPreferences, applyMotionPreference } from './preferences.mjs';
import { createClientDialogs, openClientSettings } from './settings.mjs';
import { createBattleRecords } from './battle-records.mjs';
import { openBattleRecords } from './records-dialog.mjs';
import { createLaunchHandoff } from './launch-handoff.mjs';
import { loadRosterAssets } from './loading.mjs';
import { canPersist, storageNotice } from './storage.mjs';

const $ = id => document.getElementById(id);
const preferences = createPreferences();
const settingsDialogs = createClientDialogs({ document });
const handoff = createLaunchHandoff();
let catalogState = 'loading', catalogRequest;
const catalogListeners = new Set();
const notifyCatalog = () => { for (const listener of catalogListeners) listener(); };
const warnStorage = () => { $('storage-notice').textContent = storageNotice; $('storage-notice').hidden = false; };
if (!canPersist()) warnStorage();
const applyPreferences = (value, saved) => { $('speed').value = value.speed; applyMotionPreference(document, value); if (saved === false) warnStorage(); };
applyPreferences(preferences.get());
const unsubscribePreferences = preferences.subscribe(applyPreferences);
window.addEventListener('pagehide', () => { settingsDialogs.dispose(); unsubscribePreferences(); catalogListeners.clear(); }, { once: true });
const factionNames = { wei: '魏', shu: '蜀', wu: '吴', qun: '群', jin: '晋', shen: '神', key: '异' };
const text = value => String(value ?? '').replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
const displayName = value => text(value).replace(/^新杀/, '');
const escape = value => text(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let catalog, portraits, selected, recent, currentPage = 1, faction = 'all', collection = 'all';
let activeMode = 'identity';
let favorites;
try { favorites = new Set(JSON.parse(localStorage.getItem('sgs.favorites.v1') || '[]')); } catch { favorites = new Set(); }
const preferred = ['caocao','liubei','sunquan','guanyu','zhaoyun','zhangfei','dc_sb_zhouyu','dc_sb_lusu','caoyi','shen_zhangfei','dc_sb_zhugeliang','dc_caochun','shen_huangzhong','dc_shen_sunquan'];
const pageSize = () => innerWidth < 540 ? 9 : innerWidth >= 1450 ? 12 : 8;
const packName = id => catalog?.packs.find(p => p.id === id)?.name || id;

function showInfo(title, html) {
  $('dialog-title').textContent = title; $('dialog-content').innerHTML = html; $('info-dialog').showModal();
}
function toast(message) { $('toast').textContent = message; $('toast').hidden = false; setTimeout(() => $('toast').hidden = true, 2200); }
function eligible(character) {
  const version = $('version').value;
  const category = character.version.category;
  return !character.isUnseen && (version === 'all' || (version === 'target' ? ['decade','common'].includes(category) : category === version));
}
function list() {
  const query = $('search').value.trim().toLocaleLowerCase();
  const recentKeys = recent.keys();
  const source = collection === 'recent' ? recentKeys.map(key => catalog.characters.find(c => c.key === key)) : catalog.characters;
  return source.filter(c => eligible(c) && (collection !== 'favorites' || favorites.has(c.key)) && (faction === 'all' || c.faction === faction || c.factions.includes(faction)) && ($('pack').value === 'all' || c.pack === $('pack').value) && (!query || c.searchText.includes(query)));
}
function render(resetScroll = false) {
  if (!catalog || !portraits) return;
  const scrollTop = $('general-grid').scrollTop;
  const results = list(), size = pageSize(), pages = Math.max(1, Math.ceil(results.length / size));
  currentPage = Math.min(currentPage, pages);
  const rows = results.slice((currentPage - 1) * size, currentPage * size);
  $('result-count').textContent = `${collection === 'recent' ? '最近使用' : collection === 'favorites' ? '已收藏' : '可选武将'} ${results.length} 位${faction !== 'all' ? ` · ${factionNames[faction]}势力` : ''}`;
  $('general-grid').innerHTML = rows.length ? rows.map(c => `<button type="button" class="general-card${selected?.key === c.key ? ' selected' : ''}" data-key="${escape(c.key)}" data-faction="${escape(c.faction)}" aria-label="选择${escape(c.name)}" aria-pressed="${selected?.key === c.key}">${portraits[c.id] ? `<img class="card-portrait" src="./sgs/portraits/${portraits[c.id].file}" alt="" width="96" height="128" loading="lazy" decoding="async">` : ''}<span class="card-mark" aria-hidden="true">${factionNames[c.faction] || '将'}</span><span class="card-faction">${factionNames[c.faction] || c.faction}</span><span class="card-hp">${c.hp}${c.maxHp !== c.hp ? '/' + c.maxHp : ''} 体力</span><span class="card-name${text(c.name).length > 4 ? ' long' : ''}">${escape(displayName(c.name))}</span>${favorites.has(c.key) ? '<span class="card-star" aria-label="已收藏">★</span>' : ''}<span class="card-pack">${escape(c.groups[0]?.name || packName(c.pack))}</span></button>`).join('') : '<div class="empty">没有找到符合条件的武将<button id="empty-reset">清除筛选，重新点将</button></div>';
  $('previous').disabled = currentPage === 1; $('next').disabled = currentPage === pages;
  $('page-number').textContent = `${currentPage} / ${pages}`;
  $('favorite-count').textContent = favorites.size;
  if (!rows.length && collection === 'recent' && !recent.keys().length) $('general-grid').innerHTML = '<div class="empty">还没有出战记录<p>出战后，这里会保留最近使用的 8 位武将。</p><button id="empty-reset">返回点将台</button></div>';
  $('general-grid').scrollTop = resetScroll ? 0 : scrollTop;
  $('empty-reset')?.addEventListener('click', reset);
}
function select(character) {
  const listScroll = $('general-grid').scrollTop;
  selected = character;
  $('detail-image').hidden = !portraits[character.id];
  if (portraits[character.id]) $('detail-image').src = `./sgs/portraits/${portraits[character.id].file}`;
  $('detail-image').alt = `${displayName(character.name)}画像`;
  $('portrait-note').textContent = portraits[character.id]?.note || '';
  $('portrait-note').hidden = !portraits[character.id]?.note;
  $('detail-name').textContent = displayName(character.name);
  $('detail-faction').textContent = factionNames[character.faction] || '将';
  $('detail-group').textContent = text(character.groups[0]?.name || packName(character.pack));
  $('detail-pack').textContent = `${factionNames[character.faction] || character.faction} · ${packName(character.pack)}`;
  $('detail-hp').textContent = character.maxHp <= 8 ? '●'.repeat(Math.max(0, Math.floor(character.hp))) + '○'.repeat(Math.max(0, Math.floor(character.maxHp-character.hp))) : `${character.hp}/${character.maxHp}`;
  $('detail-hp').setAttribute('aria-label', `体力 ${character.hp}，体力上限 ${character.maxHp}`);
  $('skill-list').innerHTML = character.skills.length ? character.skills.map(skill => `<section class="skill"><h3>${escape(skill.name)}</h3><p>${escape(skill.description || '此技能为动态描述，请在对局中查看完整说明。')}</p>${skill.status === 'unresolved' ? '<small>静态依赖待核验，沿用引擎实现</small>' : ''}</section>`).join('') : '<section class="skill"><p>此武将无初始技能。</p></section>';
  $('skill-list').scrollTop = 0;
  $('favorite-toggle').disabled = false;
  $('favorite-toggle').textContent = favorites.has(character.key) ? '★' : '☆';
  $('favorite-toggle').setAttribute('aria-label', `${favorites.has(character.key) ? '取消收藏' : '收藏'}${text(character.name)}`);
  $('start-game').disabled = false;
  $('launch-general').textContent = displayName(character.name);
  $('launch-version').textContent = text(character.groups[0]?.name || packName(character.pack));
  try { localStorage.setItem('sgs.selected.v1', character.key); } catch { warnStorage(); }
  render();
  $('general-grid').scrollTop = listScroll;
}
function reset() { $('search').value = ''; $('pack').value = 'all'; $('version').value = 'target'; faction = 'all'; collection = 'all'; currentPage = 1; syncTabs(); render(true); }
function syncTabs() {
  document.querySelectorAll('.factions button').forEach(button => { const active = button.dataset.faction === faction; button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active)); });
  for (const [id, value] of [['all-generals', 'all'], ['favorites', 'favorites'], ['recent-generals', 'recent']]) {
    const active = collection === value;
    $(id).classList.toggle('active', active);
    $(id).setAttribute('aria-pressed', String(active));
  }
}
$('general-grid').addEventListener('click', event => { const button = event.target.closest('[data-key]'); if (button) { select(catalog.characters.find(c => c.key === button.dataset.key)); if (innerWidth < 1000) document.querySelector('.general-detail').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth',block:'start'}); } });
document.querySelectorAll('.factions button').forEach(button => button.onclick = () => { faction = button.dataset.faction; currentPage = 1; syncTabs(); render(true); });
for (const id of ['search','version','pack']) $(id).addEventListener(id === 'search' ? 'input' : 'change', () => { currentPage = 1; render(true); });
$('clear-filters').onclick = reset;
$('previous').onclick = () => { currentPage--; render(true); };
$('next').onclick = () => { currentPage++; render(true); };
$('favorites').onclick = () => { collection = 'favorites'; currentPage = 1; $('version').value = 'all'; syncTabs(); render(true); };
$('recent-generals').onclick = () => { collection = 'recent'; currentPage = 1; $('version').value = 'all'; syncTabs(); render(true); };
$('all-generals').onclick = () => { collection = 'all'; currentPage = 1; syncTabs(); render(true); };
$('favorite-toggle').onclick = () => { if(!selected) return; favorites.has(selected.key) ? favorites.delete(selected.key) : favorites.add(selected.key); try { localStorage.setItem('sgs.favorites.v1', JSON.stringify([...favorites])); } catch { warnStorage(); } select(selected); };
$('close-dialog').onclick = () => $('info-dialog').close();
$('info-dialog').addEventListener('click', event => { if(event.target === $('info-dialog')) { const r = event.target.getBoundingClientRect(); if(event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) event.target.close(); } });
$('rules-button').onclick = () => showInfo('落座之前', '<p><strong>斗地主</strong>：三人对局，可自选地主或农民。地主先手，体力及上限加一；跋扈在准备阶段摸一张，出杀次数加一；十周年版飞扬可在判定阶段弃两张手牌，移除自己判定区全部牌。地主击败两名农民获胜；农民合力击败地主获胜。</p><p><strong>双人对抗</strong>：一、四号位同队，二、三号位同队。你固定四号位，一号位先手；沿用四号位保护与飞扬。</p><p><strong>身份军争</strong>：五至八人。主公与忠臣同队；反贼以击败主公为目标；内奸须成为最后的生存者。</p><ol><li>选择武将与玩法，再选择身份及 AI 速度。</li><li>点击手牌与合法目标，最后点击确定；选牌不发声，出牌和响应时播放卡牌语音。</li><li>选择杀后，能攻击的目标保持深色，不能选择的目标淡化。距离、坐骑和技能均由原引擎判定。</li><li>顶部“牌桌工具”可查看牌堆、托管或暂停。右键或长按武将可查看技能。</li></ol><p>所有单机模式禁用木牛流马。同名武将可能来自不同版本；“已收录”不代表已与官方规则逐项核验。</p>');
function syncMode() {
  const teams = activeMode === 'versus', landlord = activeMode === 'doudizhu';
  $('mode-name').textContent = landlord ? '三人对局' : teams ? '四人对局' : '身份军争';
  document.querySelectorAll('[data-mode]').forEach(button => button.setAttribute('aria-pressed',String(button.dataset.mode===activeMode)));
  $('identity-setting').hidden = teams || landlord;
  $('count-setting').hidden = teams || landlord;
  $('identity').disabled = teams || landlord;
  $('team-setting').hidden = !teams;
  $('landlord-setting').hidden = !landlord;
  $('landlord-rules').hidden = !landlord;
  const role = document.querySelector('[name="landlord-role"]:checked').value;
  $('mode-summary').textContent = landlord ? role === 'landlord' ? '你是地主，击败两名农民即可获胜。' : '你是农民，与另一名农民合力击败地主。' : teams ? '一四同队，二三同队。击败敌方两人获胜。' : '选择自己的身份，其余席位由 AI 执掌。';
  $('start-label').textContent = landlord ? role === 'landlord' ? '以地主身份出战' : '以农民身份出战' : '整装出征';
  $('launch-mode').textContent = landlord ? `斗地主 · ${role === 'landlord' ? '地主' : '农民'}` : teams ? '双人对抗 · 四号位' : `身份军争 · ${$('player-count').value}人 · ${{random:'随机身份', zhu:'主公', zhong:'忠臣', fan:'反贼', nei:'内奸'}[$('identity').value]}`;
}
document.querySelectorAll('[data-mode]').forEach(button=>button.addEventListener('click',()=>{activeMode=button.dataset.mode;syncMode()}));
document.querySelectorAll('[name="landlord-role"]').forEach(input=>input.addEventListener('change',syncMode));
$('player-count').addEventListener('change', syncMode);
$('identity').addEventListener('change', syncMode);
$('settings-link').onclick = () => openClientSettings(settingsDialogs, preferences);
$('records-button').onclick = () => openBattleRecords(settingsDialogs, createBattleRecords(), {
  document, getCatalog: () => ({ characters: catalog?.characters, status: catalogState, retry: init }),
  subscribeCatalog(listener) { catalogListeners.add(listener); return () => catalogListeners.delete(listener); },
  launch(config) {
    // Use only an exact catalog version from the stored completed match. The
    // session handoff starts a new native game; no saved board state is loaded.
    preferences.set({ speed: config.speed });
    return startMatch({ ...config, fromBattleRecord: true });
  },
});
$('speed').addEventListener('change', () => { if (!preferences.set({ speed: $('speed').value })) toast('速度已在本次生效，但未能保存到浏览器。'); });
$('coverage-button').onclick = () => { if(!catalog) return; const counts = ['decade','common','pending','other'].map(type => [type, catalog.characters.filter(c => c.version.category === type).length]); showInfo('武将覆盖与规则来源', `<p>当前锁定无名杀 1.11.7 的源码清单，包含 ${catalog.characters.length} 个武将版本。不同版本保留独立 ID。</p><dl>${counts.map(([type,n]) => `<dt>${escape(catalog.categories[type])}</dt><dd>${n}</dd>`).join('')}</dl><p>已收录表示有源代码；技能定义可解析也不等于行为已经验证。官方全量分母尚待逐项对账，因此不展示百分比。</p><p><a href="./sgs/catalog.json" target="_blank">下载完整来源清单</a> · <a href="https://github.com/libnoname/noname" target="_blank" rel="noreferrer">查看上游源码</a></p>`); };
$('start-game').onclick = () => {
  if (!selected || catalogState !== 'ready' || $('start-game').disabled) return;
  const config = normalizeLaunch({generalId:selected.id,pack:selected.pack,mode:activeMode,landlordRole:document.querySelector('[name="landlord-role"]:checked').value,playerCount:$('player-count').value,identity:$('identity').value,speed:$('speed').value});
  const error = startMatch(config);
  if (error) toast(error);
};
function startMatch(config) {
  if (catalogState !== 'ready') return '武将名册尚未就绪，请载入后重试。';
  try {
    handoff(config, preferences.get(), () => {
      try {
        localStorage.setItem('sgs.settings.v1', JSON.stringify(normalizeLaunch(config)));
        localStorage.setItem('sgs.selected.v1', `${config.pack}:${config.generalId}`);
      } catch { warnStorage(); }
      recent.record(`${config.pack}:${config.generalId}`);
      $('start-game').disabled = true;
      $('start-label').textContent = '正在进入牌局';
    });
    return '';
  } catch {
    $('start-game').disabled = false; syncMode();
    return '未能进入牌局，请重试或重新载入页面。';
  }
}
document.addEventListener('keydown', event => { if(event.key === '/' && !['INPUT','TEXTAREA'].includes(document.activeElement.tagName) && !$('info-dialog').open && !settingsDialogs.has('records') && !settingsDialogs.has('settings')) { event.preventDefault(); $('search').focus(); } });
window.addEventListener('resize', () => render());
function init() {
  if (catalogRequest) return catalogRequest;
  catalogState = 'loading'; catalog = undefined; portraits = undefined;
  $('start-game').disabled = true;
  notifyCatalog();
  catalogRequest = (async () => { try {
    const assets = await loadRosterAssets({ stage(message) {
      $('result-count').textContent = message;
      $('general-grid').innerHTML = `<p class="lobby-load-status" role="status">${escape(message)}</p>`;
    } });
    catalog = assets.catalog; portraits = assets.portraits;
    recent = createRecentGenerals(catalog.characters);
    catalog.characters.forEach(c => c.searchText = text([c.name,c.id,...c.skills.flatMap(s => [s.name,s.description])].join(' ')).toLocaleLowerCase());
    catalog.characters.sort((a,b) => { const rank = c => {const i=preferred.indexOf(c.id);return i<0?999:i}; return rank(a)-rank(b) || text(a.name).localeCompare(text(b.name),'zh-CN'); });
    $('total-count').textContent = catalog.characters.length.toLocaleString('zh-CN');
    $('pack').innerHTML = '<option value="all">全部武将包</option>' + catalog.packs.map(p => `<option value="${escape(p.id)}">${escape(p.name)} · ${p.characterCount}</option>`).join('');
    let saved, chosen;
    try { saved=JSON.parse(localStorage.getItem('sgs.settings.v1')||'{}'); chosen=localStorage.getItem('sgs.selected.v1'); } catch { saved={}; }
    if (!saved || typeof saved !== 'object' || Array.isArray(saved)) saved = {};
    const settings=normalizeLaunch(saved); activeMode=settings.mode || (settings.playerCount===4?'versus':'identity'); $('player-count').value=[5,6,8].includes(settings.playerCount)?settings.playerCount:8; $('identity').value=settings.identity; $('speed').value=preferences.get().speed;
    document.querySelector(`[name="landlord-role"][value="${settings.landlordRole || 'landlord'}"]`).checked=true;
    syncMode();
    select(catalog.characters.find(c=>c.key===chosen) || catalog.characters.find(c=>c.id==='caocao') || catalog.characters[0]);
    syncTabs();
    catalogState = 'ready';
  } catch (error) {
    catalogState = 'failed'; catalog = undefined; portraits = undefined;
    $('result-count').textContent = '武将名册未能载入';
    $('general-grid').innerHTML = `<div class="empty">${escape(error.message)}<button id="retry-load">重试名册</button></div>`;
    $('retry-load').onclick = init;
  } finally { catalogRequest = null; notifyCatalog(); } })();
  return catalogRequest;
}
init();
