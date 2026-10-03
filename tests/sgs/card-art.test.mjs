import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

test('classic elemental Slash images are unchanged official-site scans with traceable pages', async () => {
  const base = new URL('../../apps/core/sgs/', import.meta.url);
  const manifest = JSON.parse(await readFile(new URL('card-art.json', base), 'utf8'));
  assert.deepEqual(manifest.records.map(record => record.nature), ['fire', 'thunder']);
  for (const record of manifest.records) {
    assert.equal(new URL(record.page).hostname, 'guozhan.sanguosha.com');
    assert.equal(new URL(record.sourceUrl).hostname, 'guozhan.sanguosha.com');
    assert.match(record.sourceUrl, /\/uploads\/allimg\/130130\//);
    assert.match(record.file, /^cards\/official-source\/(fire|thunder)-slash\.jpg$/);
    const bytes = await readFile(new URL(record.file, base));
    assert.equal(bytes.length, record.bytes);
    assert.equal(bytes[0], 255); assert.equal(bytes[1], 216);
    assert.equal(createHash('sha256').update(bytes).digest('hex'), record.sha256);
  }
});
