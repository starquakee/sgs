import test from 'node:test';
import assert from 'node:assert/strict';
import { installRuntimeErrors } from '../../apps/core/sgs/runtime-errors.mjs';
import { createProblemReports } from '../../apps/core/sgs/problem-report.mjs';
import { createClientDialogs } from '../../apps/core/sgs/settings.mjs';
import { dom } from './helpers/client-dom.mjs';
const settle=()=>new Promise(r=>setImmediate(r));
function fixture() {
  const document=dom();let leases=0,actions,nativeCalls=0;const navigation=[];
  const host={onerror:()=>nativeCalls++,onunhandledrejection:()=>nativeCalls++};
  const original={...host};const acquirePause=()=>{leases++;let live=true;return()=>{if(live){live=false;leases--;}};};
  const dialogs=createClientDialogs({document,pause:{acquire:acquirePause}});
  const reports=createProblemReports({launch:{mode:'identity',pack:'standard',generalId:'caocao',playerCount:8}});
  const session={dialogs,acquirePause,setFaultActions(a){actions=a;if(a)dialogs.closeAll();},navigate:restart=>navigation.push(restart)};
  const reportUI={open:({backLabel})=>dialogs.open('problem-report',`<h2>报告</h2><button data-close>${backLabel}</button>`,(dialog,close)=>{dialog.querySelector('[data-close]').onclick=close;})};
  const controller=installRuntimeErrors({host,session,reports,reportUI});
  return {document,host,session,reports,controller,navigation,original,reportUI,get leases(){return leases;},get nativeCalls(){return nativeCalls;},get actions(){return actions;},dialog:()=>document.body.children.at(-1)};
}

test('script/rejection duplicates yield one nondismissible dialog and one report record; nested reporting cannot release the fault pause',async()=>{
  const f=fixture(),error=new TypeError('fixture failure');
  assert.equal(f.host.onerror('fixture','http://localhost/sgs/runtime.js',42,3,error),false);
  f.host.onunhandledrejection({reason:error});f.host.onerror('fixture','http://localhost/sgs/runtime.js',42,3,new TypeError('fixture failure'));
  assert.equal(f.document.body.children.length,1);assert.equal(f.reports.snapshot().errors.length,1);assert.equal(f.leases,2);
  const dialog=f.dialog();dialog.emit('cancel');dialog.emit('keydown',{key:'Escape'});assert.equal(dialog.open,true);assert.equal(f.leases,2);
  dialog.querySelector('[data-report]').emit('click');assert.equal(f.document.body.children.length,2);assert.equal(f.leases,3);
  f.dialog().querySelector('[data-close]').emit('click');await settle();assert.equal(f.dialog(),dialog);assert.equal(f.leases,2);
  f.controller.dispose();f.session.dialogs.dispose();await settle();assert.equal(f.leases,0);assert.equal(f.nativeCalls,0);
});

test('an existing modal is replaced only after acquiring the independent fatal lease',async()=>{
  const f=fixture();const release=f.session.acquirePause('external');
  f.session.dialogs.open('settings','<h2>设置</h2>');assert.equal(f.leases,2);
  f.host.onunhandledrejection({reason:new Error('fault')});assert.equal(f.leases,3);assert.equal(f.document.body.children.length,1);
  f.controller.dispose();f.session.dialogs.dispose();await settle();assert.equal(f.leases,1);release();assert.equal(f.leases,0);
});

test('recovery invokes exactly one requested navigation, never a native victory or continuation',()=>{
  for(const [selector,restart]of [['[data-restart]',true],['[data-return]',false]]){
    const f=fixture();f.host.onerror('failure','',0,0,new Error('failure'));
    f.dialog().querySelector(selector).emit('click');f.dialog().querySelector(selector).emit('click');
    assert.deepEqual(f.navigation,[restart]);assert.equal(f.leases,2);assert.equal(f.controller.failed,true);
    f.controller.dispose();f.session.dialogs.dispose();
  }
});

test('failed navigation remains paused with retry available',()=>{
  const f=fixture();f.session.navigate=()=>{throw Error('blocked')};f.host.onerror('failure','',0,0,new Error('failure'));
  f.dialog().querySelector('[data-restart]').emit('click');assert.match(f.dialog().querySelector('[data-fault-status]').textContent,/未能跳转/);
  assert.equal(f.leases,2);f.session.navigate=x=>f.navigation.push(x);f.dialog().querySelector('[data-restart]').emit('click');assert.deepEqual(f.navigation,[true]);
  f.controller.dispose();f.session.dialogs.dispose();
});

test('resource events remain nonfatal; install is idempotent and disposal restores only the handlers it owns',()=>{
  const f=fixture();f.host.onerror({target:{tagName:'IMG'}});assert.equal(f.controller.failed,false);assert.equal(f.reports.snapshot().errors.length,0);
  assert.equal(installRuntimeErrors({host:f.host,session:f.session,reports:f.reports,reportUI:f.reportUI}),f.controller);
  f.controller.dispose();assert.equal(f.host.onerror,f.original.onerror);assert.equal(f.host.onunhandledrejection,f.original.onunhandledrejection);
  const next=installRuntimeErrors({host:f.host,session:f.session,reports:f.reports,reportUI:f.reportUI});const replacement=()=>{};f.host.onerror=replacement;next.dispose();assert.equal(f.host.onerror,replacement);
  f.session.dialogs.dispose();
});

test('non-Error rejections are safely summarized and distinct errors stay bounded without opening more dialogs',()=>{
  const f=fixture();f.host.onunhandledrejection({reason:{privateHand:'DO_NOT_EXPORT'}});
  for(let i=0;i<30;i++)f.host.onunhandledrejection({reason:new Error(`failure${i}`)});
  assert.equal(f.document.body.children.length,1);assert.equal(f.reports.snapshot().errors.length,20);assert.ok(!JSON.stringify(f.reports.snapshot()).includes('DO_NOT_EXPORT'));
  f.controller.dispose();f.session.dialogs.dispose();
});
