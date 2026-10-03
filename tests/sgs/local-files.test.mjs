import test from 'node:test';
import assert from 'node:assert/strict';
import { localFiles } from '../../scripts/sgs/local-files.mjs';
import { fileURLToPath } from 'node:url';
const middleware = localFiles(fileURLToPath(new URL('../../apps/core/', import.meta.url)));
const request = (url, method='GET') => new Promise((resolve,reject) => {
  const res = {statusCode:200,setHeader(){},end(value){resolve({status:this.statusCode,body:JSON.parse(value)})}};
  middleware({url,method},res,()=>resolve({next:true})).catch(reject);
});
test('game-file bridge finds real resources and missing optional files',async()=>{
  assert.deepEqual(await request('/checkFile?fileName=noname.js'),{status:200,body:{success:true,data:'file'}});
  assert.deepEqual(await request('/checkFile?fileName=does-not-exist.json'),{status:200,body:{success:true,data:null}});
});
test('game-file bridge cannot traverse out of the game or mutate files',async()=>{
  assert.equal((await request('/readFile?fileName=../../AGENTS.md')).status,403);
  assert.equal((await request('/writeFile','POST')).status,405);
  assert.equal((await request('/removeDir?dir=character')).status,405);
  assert.deepEqual(await request('/sgs.html'),{next:true});
});
