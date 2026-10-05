import test from 'node:test';
import assert from 'node:assert/strict';
import { createProblemReports, summarizeProblem, downloadProblemReport, installProblemReportUI } from '../../apps/core/sgs/problem-report.mjs';
import { createClientDialogs } from '../../apps/core/sgs/settings.mjs';
import { Node, dom } from './helpers/client-dom.mjs';
const base = {upstream:{commit:'7fcf23ed54d8a7ce2b49ae2c15a054123891a52a'},engineVersion:'1.11.7',launch:{mode:'identity',playerCount:8,pack:'xianding',generalId:'v_dongzhuo'},now:()=>Date.parse('2026-10-05T00:00:00Z')};

test('report snapshots only allowlisted context and bounded public log/error records, never native objects',()=>{
  const secret={privateHand:'secret-hand',identity:'secret-role',event:'secret-event'};
  const report=createProblemReports({...base,launch:{...base.launch,...secret},build:{commit:'123',channel:'test',builtAt:'today',...secret},readAction:()=> '选择目标',readLog:()=>Array.from({length:310},(_,i)=>`公开${i}`)});
  for(let i=0;i<25;i++)report.record(Object.assign(new Error(`错误${i}`),secret),'promise');
  const data=report.snapshot();assert.equal(data.schemaVersion,1);assert.equal(data.errors.length,20);assert.equal(data.publicLog.length,300);
  assert.equal(data.errors[0].message,'错误5');assert.equal(data.action,'选择目标');assert.equal(data.match.general.id,'v_dongzhuo');
  assert.ok(!JSON.stringify(data).includes('secret-'));assert.ok(!('identity' in data.match));
  data.errors[0].message='modified';assert.equal(report.snapshot().errors[0].message,'错误5');
  report.dispose();assert.equal(report.snapshot().errors.length,0);
});

test('error summaries cannot invoke rejected-object getters/toString or include absolute path/query debug dumps',()=>{
  let reads=0;const unsafe={get message(){reads++;throw Error('getter');},get stack(){reads++;},toString(){reads++;return 'secret';}};
  const summary=summarizeProblem(unsafe);assert.equal(reads,0);assert.match(summary.message,/原始对象未收集/);
  const error=new TypeError('failed https://example.test/secret?token=private\nhidden native state');
  Object.defineProperty(error, 'stack', {value:'TypeError: failed\n at fn (http://localhost/noname/library/element/gameEvent.js:12:8)\n at (C:/Users/private/file.js:8:2)'});
  const result=summarizeProblem(error);
  assert.equal(result.name,'TypeError');assert.equal(result.message,'failed [资源地址]');
  assert.deepEqual(result.frames,[{file:'noname/library/element/gameEvent.js',line:12,column:8}]);
  assert.ok(!JSON.stringify(result).includes('private'));
});

test('faulty or unavailable public UI readers still yield a readable report and text is length-bounded',()=>{
  const report=createProblemReports({...base,readAction(){throw Error('broken UI');},readLog(){throw Error('broken log');}});
  assert.equal(report.snapshot().action,'');assert.deepEqual(report.snapshot().publicLog,[]);
  const bounded=createProblemReports({...base,readAction:()=> 'x'.repeat(2000),readLog:()=>['a'.repeat(2000),{}]});
  assert.equal(bounded.snapshot().action.length,500);assert.equal(bounded.snapshot().publicLog[0].length,1000);assert.equal(bounded.snapshot().publicLog.length,1);
});

test('download produces JSON, removes the temporary link and revokes URLs after success or failure',async()=>{
  const created=[],revoked=[],anchors=[];let finish;
  const document=dom();document.createElement=()=>{const a=new Node('a');a.click=()=>anchors.push(a);return a;};
  const urls={createObjectURL(blob){created.push(blob);return 'blob:report';},revokeObjectURL:url=>revoked.push(url)};
  const report=createProblemReports(base).snapshot();
  const cleanup=downloadProblemReport(report,{document,urls,timers:{setTimeout(fn){finish=fn;return 1;},clearTimeout(){}}});
  assert.equal(document.body.children.length,0);assert.match(anchors[0].download,/^sgs-problem-.*\.json$/);
  assert.deepEqual(JSON.parse(await created[0].text()),report);finish();cleanup();assert.deepEqual(revoked,['blob:report']);
  document.createElement=()=>{const a=new Node('a');a.click=()=>{throw Error('blocked');};return a;};
  assert.throws(()=>downloadProblemReport(report,{document,urls}),/blocked/);assert.equal(document.body.children.length,0);assert.equal(revoked.length,2);
});

test('report dialog owns only its pause, download failure stays recoverable, retry succeeds and disposal removes its button',async()=>{
  const document=dom(), menu=new Node(), opener=new Node();let leases=1,attempts=0,disposed=0;
  const dialogs=createClientDialogs({document,pause:{acquire(){leases++;let active=true;return()=>{if(active){active=false;leases--;}};}}});
  const reports=createProblemReports({...base,readLog:()=>['真实公开记录']});
  const ui=installProblemReportUI({reports,dialogs,menu,returnFocus:opener,document,download(){if(++attempts===1)throw Error('blocked');return()=>disposed++;}});
  let stopped=0;
  menu.children[0].emit('pointerdown',{stopPropagation(){stopped++;}});
  menu.children[0].emit('click',{stopPropagation(){stopped++;}});
  const dialog=document.body.children[0];assert.equal(leases,2);assert.equal(opener.focused,true);assert.equal(stopped,2,'report actions must not reach native card-selection handlers');
  dialog.querySelector('[data-download]').emit('click');assert.match(dialog.querySelector('[data-report-status]').textContent,/未能下载/);assert.equal(leases,2);
  dialog.querySelector('[data-download]').emit('click');assert.match(dialog.querySelector('[data-report-status]').textContent,/已请求下载/);
  dialog.querySelector('[data-close]').emit('click');await Promise.resolve();assert.equal(leases,1);
  ui.dispose();dialogs.dispose();assert.equal(disposed,1);assert.equal(menu.children.length,0);
});
