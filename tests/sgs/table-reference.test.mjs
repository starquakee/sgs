import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dom, Node } from './helpers/client-dom.mjs';
import { createClientDialogs } from '../../apps/core/sgs/settings.mjs';
import { publicPlayerStates, installPublicStates, publicBattleLog, openBattleLog, openPlayGuide } from '../../apps/core/sgs/table-reference.mjs';

test('public state labels follow native link/turn-over methods, never a card or hidden information', () => {
  const source = readFileSync(new URL('../../apps/core/noname/library/element/player.js', import.meta.url), 'utf8');
  const get = { is: { linked2: () => true } };
  const player = new Node();
  for (const key of ['isLinked', 'isTurnedOver']) {
    const method = source.match(new RegExp(`\\t${key}\\(\\) \\{[\\s\\S]*?\\n\\t\\}`))[0];
    player[key] = new Function('get', `return ({${method}}).${key};`)(get);
  }
  for (const key of ['identity', 'storage', 'handcards']) Object.defineProperty(player, key, { get() { throw new Error('private'); } });
  assert.deepEqual(publicPlayerStates(player), []);
  player.classList.add('linked');
  assert.deepEqual(publicPlayerStates(player), [], 'wrong layout class must not invent a linked state');
  player.classList.add('linked2'); player.classList.add('turnedover'); player.hujia = 2;
  assert.deepEqual(publicPlayerStates(player), [['linked', '连环'], ['turned', '翻面'], ['armor', '护甲 2']]);
  player.classList.remove('linked2');
  assert.deepEqual(publicPlayerStates(player), [['turned', '翻面'], ['armor', '护甲 2']]);
  player.classList.add('unseen');
  assert.deepEqual(publicPlayerStates(player), []);
});

test('state overlays update existing nodes, remove cleared/dead states and clean up detached players', () => {
  const document = dom(), arena = new Node(), player = new Node(); arena.append(player);
  Object.assign(player, { isLinked: () => player.classList.contains('linked2'), isTurnedOver: () => false, hujia: 0 });
  const game = { players: [player], dead: [] };
  const api = installPublicStates({ game, ui: { arena } }, document);
  api.refresh(); const overlay = player.children[0]; assert.equal(overlay.hidden, true);
  player.classList.add('linked2'); api.refresh(); const label = overlay.children[0];
  assert.equal(label.textContent, '连环'); api.refresh(); assert.equal(overlay.children[0], label);
  player.classList.add('dead'); api.refresh(); assert.equal(overlay.hidden, true);
  player.remove(); api.refresh(); assert.equal(player.children.length, 0);
  api.dispose(); api.dispose();
});

test('battle log shows only public DOM text, searches safely and closes its owned pause without changing selection', () => {
  const document = dom(); let held = 0;
  const dialogs = createClientDialogs({ document, pause: { acquire() { held++; return () => held--; } } });
  const ui = { sidebar: { children: [{ textContent: '陆抗发动了【谦节】' }, { textContent: '乐小乔受到火属性伤害' }, { textContent: '<img onerror=secret>作为文字' }] }, selected: { cards: [{}], targets: [{}] } };
  const selected = structuredClone(ui.selected);
  const dialog = openBattleLog(dialogs, ui, document);
  assert.equal(held, 1); assert.deepEqual(ui.selected, selected);
  assert.equal(dialog.querySelector('ol').children[2].textContent, '<img onerror=secret>作为文字');
  const input = dialog.querySelector('input'); input.value = '谦节'; input.emit('input');
  assert.deepEqual(dialog.querySelector('ol').children.map(n => n.textContent), ['陆抗发动了【谦节】']);
  input.value = '不存在'; input.emit('input'); assert.equal(dialog.querySelector('ol').children.length, 0);
  assert.match(dialog.querySelector('.sgs-log-count').textContent, /没有找到/);
  dialog.emit('keydown', { key: 'Escape', isComposing: true }); assert.equal(held, 1);
  dialog.emit('keydown', { key: 'Escape' }); assert.equal(held, 0); assert.deepEqual(ui.selected, selected);
  assert.equal(publicBattleLog({ sidebar: { children: Array.from({ length: 320 }, (_, i) => ({ textContent: String(i) })) } }).length, 300);
  assert.deepEqual(publicBattleLog({}), []);
});

test('help and logs share nested dialog pause ownership with a working Escape exit', () => {
  const document = dom(); let held = 0;
  const dialogs = createClientDialogs({ document, pause: { acquire() { held++; return () => held--; } } });
  const guide = openPlayGuide(dialogs, 'doudizhu', document);
  assert.equal(openPlayGuide(dialogs, 'doudizhu', document), guide);
  const log = openBattleLog(dialogs, {}, document); assert.equal(held, 2);
  log.emit('cancel'); assert.equal(held, 1);
  guide.querySelector('[data-close]').onclick(); assert.equal(held, 0);
  dialogs.dispose(); assert.equal(held, 0);
});
