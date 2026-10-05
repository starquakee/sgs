import test from 'node:test';
import assert from 'node:assert/strict';
import { createAudioLoader } from '../../apps/core/sgs/audio-loads.mjs';
const response = { ok: true, arrayBuffer: async () => new ArrayBuffer(1) };
const context = { decodeAudioData: async () => ({ duration:1 }) };
const tick = () => new Promise(resolve => setImmediate(resolve));
function clock() {
  const tasks = new Map(); let id = 0;
  return { tasks, setTimeout(fn, delay) { assert.equal(delay,8000);tasks.set(++id,fn);return id; },clearTimeout(id){tasks.delete(id);},fire(){for(const fn of [...tasks.values()])fn();} };
}
function loader(fetcher, timers = clock()) { return { timers, loader:createAudioLoader({fetcher,timers,baseURL:new URL('http://localhost/sgs/')}) }; }

test('one eight-second deadline settles permanently hung fetch, body and decode and aborts the transport', async () => {
  for (const stage of ['fetch','body','decode']) {
    let signal;
    const never = () => new Promise(()=>{});
    const {loader:l,timers} = loader((_url,request)=>{signal=request.signal;return stage==='fetch'?never():stage==='body'?{ok:true,arrayBuffer:never}:response;});
    const pending=l.load('clip.mp3',stage==='decode'?{decodeAudioData:never}:context);
    const check=assert.rejects(pending,{name:'TimeoutError'});await tick();timers.fire();await check;
    assert.equal(signal.aborted,true);assert.equal(l.pending,0);assert.equal(l.size,0);assert.equal(timers.tasks.size,0);
  }
});

test('cancel immediately settles pending work even when fetch ignores abort; late results cannot replace a new cache entry',async()=>{
  let release, count=0;
  const {loader:l,timers}=loader(()=>++count===1?new Promise(r=>release=r):response);
  const old=l.load('clip.mp3',context);const check=assert.rejects(old,{name:'AbortError'});l.cancel();await check;
  const fresh=l.load('clip.mp3',context);await fresh;release(response);await tick();
  assert.equal(l.load('clip.mp3',context),fresh);assert.equal(count,2);assert.equal(l.pending,0);assert.equal(timers.tasks.size,0);
  l.dispose();assert.equal(l.size,0);
});

test('HTTP, decode and synchronous fetch failures are evicted and retryable without retaining timers',async()=>{
  for(const stage of ['http','decode','sync']){
    let attempts=0;
    const {loader:l,timers}=loader(()=>{attempts++;if(attempts>1)return response;if(stage==='sync')throw Error('sync');return stage==='http'?{ok:false,status:404}:response;});
    await assert.rejects(l.load('clip.mp3',stage==='decode'?{decodeAudioData:()=>Promise.reject(Error('decode'))}:context));
    await l.load('clip.mp3',context);assert.equal(attempts,2);assert.equal(l.pending,0);assert.equal(timers.tasks.size,0);
  }
});

test('shared successful loads decode once and dispose aborts every pending resource',async()=>{
  let loads=0,decodes=0;const signals=[];
  const {loader:l}=loader((_url,{signal})=>{signals.push(signal);loads++;return loads===1?response:new Promise(()=>{});});
  const ctx={decodeAudioData:async()=>{decodes++;return {};}};
  const first=l.load('ok',ctx);assert.equal(l.load('ok',ctx),first);await first;assert.equal(decodes,1);
  const second=l.load('b',ctx),third=l.load('c',ctx);const checks=[assert.rejects(second,{name:'AbortError'}),assert.rejects(third,{name:'AbortError'})];
  l.dispose();await Promise.all(checks);assert.equal(l.pending,0);assert.equal(l.size,0);assert.ok(signals.slice(1).every(s=>s.aborted));
});
