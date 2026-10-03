import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('every catalog character has a local, attributed thumbnail within the size budget', async () => {
  const base = new URL('../../apps/core/sgs/', import.meta.url);
  const [catalog, manifest] = await Promise.all(['catalog.json','portraits.json'].map(async file => JSON.parse(await readFile(new URL(file,base),'utf8'))));
  assert.equal(manifest.upstreamCommit, catalog.upstream.commit);
  assert.deepEqual(manifest.missing, []);
  assert.deepEqual(manifest.failures, []);
  assert.equal(manifest.mappedCharacters, catalog.characters.length);
  const files = new Map();
  for (const character of catalog.characters) {
    const portrait = manifest.portraits[character.id];
    assert.ok(portrait, `Missing ${character.id}`);
    assert.equal(portrait.characterKey, character.key);
    assert.match(portrait.file, /^[a-f\d]{20}\.webp$/);
    assert.ok(['upstream','same-person-variant','network'].includes(portrait.kind));
    assert.ok(portrait.source);
    if (portrait.kind === 'network') assert.match(portrait.sourcePage, /^https:\/\//);
    assert.equal(portrait.width, 96);
    assert.equal(portrait.height, 128);
    assert.ok(portrait.bytes <= 4096);
    files.set(portrait.file, portrait);
  }
  let total = 0;
  for (const [file, portrait] of files) {
    const bytes = await readFile(new URL(`portraits/${file}`,base));
    assert.equal(bytes.length, portrait.bytes);
    assert.equal(bytes.subarray(0,4).toString(), 'RIFF');
    assert.equal(bytes.subarray(8,12).toString(), 'WEBP');
    assert.equal(createHash('sha256').update(bytes).digest('hex'), portrait.sha256);
    total += bytes.length;
  }
  assert.equal(files.size, manifest.uniqueImages);
  assert.equal(total, manifest.totalBytes);
  assert.equal((await readdir(new URL('portraits/',base))).length, files.size);
});
