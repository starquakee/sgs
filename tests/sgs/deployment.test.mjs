import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Writable } from 'node:stream';
import { deploymentInventory, verifyAsset, verifyOutput, verifyHttp } from '../../scripts/sgs/verify-deployment.mjs';
import { createSgsServer } from '../../scripts/sgs/serve.mjs';

const asset = (path, body, normalize = false) => ({ path, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex'), normalize });
const html = Buffer.from('<!doctype html><title>Native entry</title>');
const recording = Buffer.from('ID3fixture-recording');
const inventory = { assets: [asset('index.html', html, true), asset('sgs/audio/test.mp3', recording)] };

test('deployment inventory pins all existing recordings and portrait files to source checksums', async () => {
  const actual = await deploymentInventory(undefined, { nativeEntryBytes: html });
  assert.equal(actual.assets.length, 2956);
  assert.equal(actual.audioFiles, 451);
  assert.equal(actual.audioBytes, 28396074);
  assert.equal(actual.assets.filter(row => row.path.startsWith('sgs/audio/')).length, 451);
  assert.equal(actual.assets.filter(row => row.path.startsWith('sgs/portraits/')).length, 2491);
  const drag = Buffer.from((await readFile(new URL('../../apps/core/sgs/card-drag.mjs', import.meta.url), 'utf8')).replace(/\r\n/g, '\n'));
  assert.deepEqual(actual.assets.find(row => row.path === 'sgs/card-drag.mjs'), asset('sgs/card-drag.mjs', drag, true));
  const source = JSON.parse(await readFile(new URL('../../apps/core/sgs/card-audio.json', import.meta.url)));
  const clip = source.clips['card/female/sha'];
  assert.deepEqual(actual.assets.find(row => row.path === `sgs/${clip.file}`), { path: `sgs/${clip.file}`, bytes: clip.bytes, sha256: clip.sha256 });
  const rosterAsset = actual.assets.find(row => row.path === 'sgs/roster.json');
  const roster = await readFile(new URL('../../apps/core/sgs/roster.json', import.meta.url));
  const lfRoster = Buffer.from(roster.toString().replace(/[a-f\d]{64}/g, hash => rosterAsset.sourceHashes[hash] || hash));
  verifyAsset(rosterAsset, lfRoster, 'application/json');
  const known = Object.keys(rosterAsset.sourceHashes).find(hash => roster.includes(Buffer.from(hash)));
  assert.ok(known);
  const forged = Buffer.from(roster.toString().replace(known, '0'.repeat(64)));
  assert.throws(() => verifyAsset(rosterAsset, forged, 'application/json'), /SHA-256/);
});

test('resource verification rejects HTML fallbacks, wrong MIME, truncation and same-size corruption', () => {
  const clip = inventory.assets[1];
  verifyAsset(clip, recording, 'audio/mpeg');
  assert.throws(() => verifyAsset(clip, html, 'audio/mpeg'), /HTML returned/);
  assert.throws(() => verifyAsset(clip, recording, 'text/html'), /content-type/);
  assert.throws(() => verifyAsset(clip, recording.subarray(1), 'audio/mpeg'), /byte length/);
  assert.throws(() => verifyAsset(clip, Buffer.alloc(recording.length), 'audio/mpeg'), /SHA-256/);
  const source = Buffer.from('first\nsecond');
  verifyAsset(asset('entry.js', source, true), Buffer.from('first\r\nsecond'), 'text/javascript; charset=utf-8');
  verifyAsset(asset('index.html', source, true), Buffer.from('first\r\r\nsecond'), 'text/html');
});

test('output check fails on omitted assets and shipped test fixtures', async t => {
  const root = await mkdtemp(join(tmpdir(), 'sgs-deployment-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await writeFile(join(root, 'index.html'), html);
  await assert.rejects(verifyOutput(root, inventory), /deployment checks failed/);
  await mkdir(join(root, 'sgs/audio'), { recursive: true });
  await writeFile(join(root, 'sgs/audio/test.mp3'), recording);
  await verifyOutput(root, inventory);
  await mkdir(join(root, 'tests'));
  await assert.rejects(verifyOutput(root, inventory), /Do not ship tests/);
});

function host({ audioStatus = 200, audioBody = recording, audioType = 'audio/mpeg', missingStatus = 404, homeStatus = 307 } = {}) {
  const seen = [];
  return {
    seen,
    fetcher: async (url, options) => {
      seen.push(url.pathname + url.search);
      assert.equal(options.redirect, 'manual');
      assert.ok(options.signal);
      if (url.pathname === '/') return new Response(null, { status: homeStatus, headers: { location: '/sgs.html' } });
      if (url.pathname === '/index.html') return new Response(html, { headers: { 'content-type': 'text/html' } });
      if (url.pathname === '/sgs/audio/test.mp3') return new Response(audioBody, { status: audioStatus, headers: { 'content-type': audioType } });
      return new Response(null, { status: missingStatus });
    },
  };
}

test('HTTP check requires root 307, both native entries, explicit 404s and valid clip responses', async () => {
  const good = host();
  await verifyHttp('https://example.invalid', inventory, good);
  assert.ok(good.seen.includes('/index.html?sgs=1'));
  assert.ok(good.seen.includes('/checkFile?fileName=noname.js'));
  for (const bad of [{ homeStatus: 200 }, { missingStatus: 200 }, { audioStatus: 404 }, { audioBody: html }, { audioType: 'application/octet-stream' }, { audioBody: Buffer.alloc(recording.length) }]) {
    await assert.rejects(verifyHttp('https://example.invalid', inventory, host(bad)));
  }
});

function request(server, url, method = 'GET') {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const headers = {};
    const res = new Writable({ write(chunk, _encoding, done) { chunks.push(Buffer.from(chunk)); done(); } });
    res.statusCode = 200;
    res.setHeader = (name, value) => { headers[name.toLowerCase()] = value; };
    res.writeHead = (status, values = {}) => { res.statusCode = status; for (const [name, value] of Object.entries(values)) res.setHeader(name, value); return res; };
    res.on('error', reject);
    res.on('finish', () => resolve({ status: res.statusCode, headers, body: Buffer.concat(chunks) }));
    server.emit('request', { url, method }, res);
  });
}

test('static preview omits file API, redirects only root and serves native/audio paths without fallback', async t => {
  const root = await mkdtemp(join(tmpdir(), 'sgs-static-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await Promise.all([writeFile(join(root, 'sgs.html'), html), writeFile(join(root, 'index.html'), html), writeFile(join(root, 'clip.mp3'), recording)]);
  const server = createSgsServer({ root, staticOnly: true });
  const home = await request(server, '/?test=1');
  assert.equal(home.status, 307);
  assert.equal(home.headers.location, '/sgs.html?test=1');
  assert.equal((await request(server, '/index.html?sgs=1')).status, 200);
  assert.equal((await request(server, '/sgs.html')).status, 200);
  assert.equal((await request(server, '/checkFile?fileName=index.html')).status, 404);
  assert.equal((await request(server, '/missing.mp3')).status, 404);
  const clip = await request(server, '/clip.mp3');
  assert.equal(clip.headers['content-type'], 'audio/mpeg');
  assert.deepEqual(clip.body, recording);
  assert.equal((await request(server, '/clip.mp3', 'HEAD')).body.length, 0);
  assert.equal((await request(server, '/clip.mp3', 'POST')).status, 405);
  const original = createSgsServer({ root });
  assert.equal((await request(original, '/')).status, 200);
  const bridge = await request(original, '/checkFile?fileName=index.html');
  assert.equal(bridge.status, 200);
  assert.deepEqual(JSON.parse(bridge.body), { success: true, data: 'file' });
});
