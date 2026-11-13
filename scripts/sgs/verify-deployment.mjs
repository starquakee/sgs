// Verify static output or a deployment against this checkout, not a remote manifest.
// HTTP mode downloads bytes for validation only; it never plays or unlocks audio.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repository = fileURLToPath(new URL('../../', import.meta.url));
const upstream = '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a';
const audioCounts = { 'card-audio.json': 160, 'character-audio.json': 276, 'damage-audio.json': 14 };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const textBytes = bytes => Buffer.from(bytes.toString('utf8').replace(/\r+\n/g, '\n'));
const mime = { '.html': ['text/html'], '.json': ['application/json'], '.js': ['text/javascript', 'application/javascript'], '.mjs': ['text/javascript', 'application/javascript'], '.css': ['text/css'], '.webp': ['image/webp'], '.mp3': ['audio/mpeg'], '.ogg': ['audio/ogg'] };

function normalizedBytes(body, asset) {
  if (asset.sourceHashes) {
    // Fingerprints still have to match this exact source file. Only checkout EOL
    // variants are equivalent; unknown hashes survive and fail the comparison.
    const data = JSON.parse(body.toString());
    return Buffer.from(JSON.stringify(data, (key, value) => key === 'sha256' && asset.sourceHashes[value] ? asset.sourceHashes[value] : value));
  }
  return asset.normalize ? textBytes(body) : body;
}

async function sourceFingerprintVariants(document, root) {
  const files = new Map();
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    if (typeof value.file === 'string' && /^[a-f\d]{64}$/.test(value.sha256)) {
      if (!files.has(value.file)) files.set(value.file, new Set());
      files.get(value.file).add(value.sha256);
    }
    for (const nested of Object.values(value)) visit(nested);
  }
  visit(document);
  const hashes = {};
  for (const [file, claimedHashes] of files) {
    assert.match(file, /^apps\/core\/[\w/.-]+$/);
    assert.ok(!file.includes('..'));
    const bytes = await readFile(resolve(root, file));
    const lf = textBytes(bytes);
    const canonical = digest(lf);
    const variants = [bytes, lf, Buffer.from(lf.toString().replaceAll('\n', '\r\n'))].map(digest);
    for (const claimed of claimedHashes) assert.ok(variants.includes(claimed), `${file}: source fingerprint is stale`);
    for (const hash of variants) hashes[hash] = canonical;
  }
  return hashes;
}

export async function deploymentInventory(root = repository, { nativeEntryBytes } = {}) {
  const assets = new Map();
  const add = (path, metadata) => {
    assert.ok(!assets.has(path), `Duplicate asset: ${path}`);
    assert.ok(!path.includes('..') && !path.startsWith('/'), `Unsafe asset path: ${path}`);
    assets.set(path, { path, ...metadata });
  };
  const sourceAsset = async (path, source, normalize = false) => {
    let bytes = await readFile(resolve(root, source));
    if (normalize) bytes = textBytes(bytes);
    add(path, { bytes: bytes.length, sha256: digest(bytes), normalize });
    return JSON.parse(extname(path) === '.json' ? bytes.toString() : 'null');
  };
  await sourceAsset('sgs.html', 'apps/core/sgs.html', true);
  // The generated native entry stays distinct from the custom lobby, including ?sgs=1.
  const nativeEntry = textBytes(nativeEntryBytes ?? await readFile(resolve(root, 'apps/core/dist/index.html')));
  add('index.html', { bytes: nativeEntry.length, sha256: digest(nativeEntry), normalize: true });
  for (const path of ['lobby.js', 'runtime.js', 'lobby.css', 'table.css']) {
    await sourceAsset(`sgs/${path}`, `apps/core/sgs/${path}`, true);
  }
  const catalog = await sourceAsset('sgs/catalog.json', 'apps/core/sgs/catalog.json', true);
  const roster = await sourceAsset('sgs/roster.json', 'apps/core/sgs/roster.json', true);
  const rosterAsset = assets.get('sgs/roster.json');
  rosterAsset.sourceHashes = await sourceFingerprintVariants(roster, root);
  const rosterBytes = normalizedBytes(Buffer.from(JSON.stringify(roster)), rosterAsset);
  rosterAsset.bytes = rosterBytes.length;
  rosterAsset.sha256 = digest(rosterBytes);
  const portraits = await sourceAsset('sgs/portraits.json', 'apps/core/sgs/portraits.json', true);
  assert.equal(catalog.upstream.commit, upstream);
  assert.equal(roster.upstream.commit, upstream);
  assert.equal(portraits.upstreamCommit, upstream);
  assert.equal(portraits.mappedCharacters, catalog.characters.length);
  assert.equal(roster.characters.length, catalog.characters.length);
  const uniquePortraits = new Map(Object.values(portraits.portraits).map(row => [row.file, row]));
  assert.equal(uniquePortraits.size, portraits.uniqueImages);
  for (const row of uniquePortraits.values()) add(`sgs/portraits/${row.file}`, { bytes: row.bytes, sha256: row.sha256 });
  let audioBytes = 0;
  for (const [file, count] of Object.entries(audioCounts)) {
    const manifest = await sourceAsset(`sgs/${file}`, `apps/core/sgs/${file}`, true);
    assert.equal(manifest.upstreamCommit, upstream);
    assert.equal(manifest.uniqueFiles, count);
    assert.equal(Object.keys(manifest.clips).length, count);
    const total = Object.values(manifest.clips).reduce((sum, row) => sum + row.bytes, 0);
    assert.equal(total, manifest.totalBytes);
    audioBytes += total;
    for (const row of Object.values(manifest.clips)) add(`sgs/${row.file}`, { bytes: row.bytes, sha256: row.sha256 });
  }
  assert.equal(audioBytes, 28381860);
  return { assets: [...assets.values()], audioFiles: 450, audioBytes, portraits: uniquePortraits.size };
}

export function verifyAsset(asset, body, contentType) {
  const types = mime[extname(asset.path)];
  assert.ok(types, `Unrecognized content type: ${asset.path}`);
  if (contentType !== undefined) {
    const actual = contentType.split(';', 1)[0].trim().toLowerCase();
    assert.ok(types.includes(actual), `${asset.path}: content-type ${actual || '(missing)'}, expected ${types.join(' or ')}`);
  }
  if (extname(asset.path) !== '.html') {
    assert.ok(!/^\s*(?:<!doctype\s+html|<html\b)/i.test(body.subarray(0, 256).toString()), `${asset.path}: HTML returned as an asset`);
  }
  const bytes = normalizedBytes(body, asset);
  assert.equal(bytes.length, asset.bytes, `${asset.path}: byte length`);
  assert.equal(digest(bytes), asset.sha256, `${asset.path}: SHA-256`);
}

async function eachAsset(assets, work) {
  let next = 0;
  const failures = [];
  await Promise.all(Array.from({ length: 8 }, async () => {
    while (next < assets.length && failures.length < 12) {
      const asset = assets[next++];
      try { await work(asset); } catch (error) { failures.push(error); }
    }
  }));
  if (failures.length) throw new AggregateError(failures, `${failures.length} deployment checks failed:\n${failures.slice(0, 12).map(error => error.message).join('\n')}`);
}

export async function verifyOutput(directory, inventory) {
  await eachAsset(inventory.assets, async asset => verifyAsset(asset, await readFile(resolve(directory, asset.path))));
  for (const path of ['tests', 'test', '.git']) {
    assert.equal(await stat(resolve(directory, path)).then(() => true, error => { if (error.code === 'ENOENT') return false; throw error; }), false, `Do not ship ${path}`);
  }
  return inventory;
}

export async function verifyHttp(base, inventory, { fetcher = fetch } = {}) {
  const origin = new URL(base);
  assert.ok(['http:', 'https:'].includes(origin.protocol));
  assert.equal(origin.pathname, '/', 'Pass a deployment origin without a path');
  assert.ok(!origin.username && !origin.password && !origin.search && !origin.hash);
  const request = path => fetcher(new URL(path, origin), { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  const home = await request('/');
  assert.equal(home.status, 307, 'Homepage must temporarily redirect only / to /sgs.html');
  assert.equal(new URL(home.headers.get('location'), origin).href, new URL('/sgs.html', origin).href);
  await home.body?.cancel();
  for (const path of ['/sgs/__missing-deployment-asset__.mp3', '/sgs/__missing-deployment-asset__.json', '/__missing-deployment-page__.html', '/checkFile?fileName=noname.js']) {
    const response = await request(path);
    assert.equal(response.status, 404, `${path}: missing assets/file API must stay 404`);
    await response.body?.cancel();
  }
  const nativeEntry = inventory.assets.find(asset => asset.path === 'index.html');
  const targets = [...inventory.assets, { ...nativeEntry, path: 'index.html?sgs=1', assetPath: 'index.html' }];
  await eachAsset(targets, async asset => {
    const response = await request(`/${asset.path}`);
    assert.equal(response.status, 200, `${asset.path}: HTTP status`);
    const body = Buffer.from(await response.arrayBuffer());
    verifyAsset(asset.assetPath ? { ...asset, path: asset.assetPath } : asset, body, response.headers.get('content-type') || '');
  });
  return inventory;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  assert.ok(args.length === 0 || args.length === 2 && ['--url', '--output'].includes(args[0]), 'Usage: node scripts/sgs/verify-deployment.mjs [--url https://host | --output directory]');
  const inventory = await deploymentInventory();
  if (args[0] === '--url') await verifyHttp(args[1], inventory);
  else await verifyOutput(resolve(args[1] || resolve(repository, 'dist-sgs')), inventory);
  console.log(JSON.stringify({ verified: args[1] || 'dist-sgs', assets: inventory.assets.length, audioFiles: inventory.audioFiles, audioBytes: inventory.audioBytes, portraits: inventory.portraits }));
}
