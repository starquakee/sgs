import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { skillReadingHTML, descriptionHTML, closeReadingDetails } from '../../apps/core/sgs/skill-reading.mjs';
const roster = JSON.parse(await readFile(new URL('../../apps/core/sgs/roster.json', import.meta.url), 'utf8'));

test('Huangzhong reading exposes both complete terms with exact pinned sources and accessible native details', () => {
  const hero = roster.characters.find(c => c.key === 'xianding:shen_huangzhong');
  const html = skillReadingHTML(hero.skills, roster);
  for (const term of ['击伤', '力烽', '地机', '中枢', '气海', '天冲', '令其失去所有体力']) assert.ok(html.includes(term), term);
  assert.ok(html.includes('<ul><li>'));
  assert.ok(html.includes('<summary>击伤</summary>'));
  assert.ok(html.includes(`/blob/${roster.upstream.commit}/apps/core/character/xianding/translate.js#L238`));
  assert.ok(!html.includes('此技能为动态描述'));
  const xu = roster.characters.find(c => c.key === 'xianding:re_sunyi');
  const characterHTML = skillReadingHTML(xu.skills, roster);
  assert.ok(characterHTML.includes('关联武将 · 徐氏'));
});

test('reading never executes text, source URLs or unresolved expressions and labels initial dynamic rules', () => {
  const html = skillReadingHTML([{name: '<img onerror=evil()>', help: {text:'<script>evil()</script>',dynamic:true,source:{file:'javascript:evil()',line:1},terms:[{id:'bad',name:'<b>bad</b>',status:'unresolved'}]}}], {upstream:{commit:'invalid'}});
  assert.ok(!html.includes('<script>')); assert.ok(!html.includes('<img')); assert.ok(!html.includes('href='));
  assert.ok(html.includes('这里展示初始规则')); assert.ok(html.includes('暂未完整收录'));
  assert.equal(descriptionHTML('甲\n• 一\n• 二\n乙'), '<p>甲</p><ul><li>一</li><li>二</li></ul><p>乙</p>');
  assert.ok(skillReadingHTML([]).includes('无初始技能'));
});

test('Escape collapses only the nearest open reading term, restores its summary focus and preserves IME', () => {
  let focused = false, prevented = 0, stopped = 0;
  const details = {open:true,querySelector:()=>({focus(){focused=true;}})};
  const event = {key:'Escape',isComposing:true,target:{closest:()=>details},preventDefault(){prevented++;},stopPropagation(){stopped++;}};
  closeReadingDetails(event); assert.equal(details.open,true);
  event.isComposing=false;closeReadingDetails(event);
  assert.equal(details.open,false);assert.equal(focused,true);assert.equal(prevented,1);assert.equal(stopped,1);
});
