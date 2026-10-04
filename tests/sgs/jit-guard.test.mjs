import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { canStartJit, guardSgsJit } from '../../scripts/sgs/jit-guard.mjs';

test('SGS production JIT tolerates unavailable storage without changing ordinary entry', async () => {
  const source = await readFile(new URL('../../packages/jit/src/entry.ts', import.meta.url), 'utf8');
  const plugin = guardSgsJit({ transformIndexHtml: () => ({ html: 'native', tags: [{ tag: 'script', children: source }] }) });
  const guarded = plugin.transformIndexHtml('native');
  const host = { location: { search: '?sgs=1' } };
  Object.defineProperty(host, 'sessionStorage', { get() { throw Error('denied'); } });
  // Executes the locked native initializer: with denied storage it must not
  // access service workers, throw a global error, or create a reload loop.
  await vm.runInNewContext(guarded.tags[0].children, { ...host, globalThis: host, URLSearchParams });
  assert.equal(guarded.html, 'native');
  host.location.search = '';
  assert.equal(canStartJit(host), true, 'ordinary entry must not probe or alter browser storage');
});

test('working session storage retains native JIT and preserves existing probe values', () => {
  const entries = new Map([['sgs.jit-storage-probe', 'old']]);
  const host = { location: { search: '?sgs=1' }, sessionStorage: {
    getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key),
  } };
  assert.equal(canStartJit(host), true);
  assert.equal(entries.get('sgs.jit-storage-probe'), 'old');
  entries.delete('sgs.jit-storage-probe');
  assert.equal(canStartJit(host), true);
  assert.equal(entries.size, 0);
  host.sessionStorage.setItem = () => { throw Error('quota'); };
  assert.equal(canStartJit(host), false);
});

test('healthy SGS and ordinary entry still run the locked native service-worker initializer', async () => {
  const source = await readFile(new URL('../../packages/jit/src/entry.ts', import.meta.url), 'utf8');
  const plugin = guardSgsJit({ transformIndexHtml: () => ({ tags: [{ tag: 'script', children: source }] }) });
  for (const search of ['?sgs=1', '']) {
    const entries = new Map([['isJITReloaded', 'true'], ['canUseTs', 'true']]);
    const registered = [];
    const context = {
      URL, URLSearchParams,
      location: { search, href: `http://127.0.0.1:8083/index.html${search}` },
      sessionStorage: {
        getItem: key => entries.get(key) ?? null, setItem: (key, value) => entries.set(key, value), removeItem: key => entries.delete(key),
      },
      navigator: { serviceWorker: { register: async (url, options) => registered.push([url, options]), addEventListener() {} } },
    };
    await vm.runInNewContext(plugin.transformIndexHtml('').tags[0].children, context);
    assert.equal(registered.length, 1);
    assert.equal(registered[0][0], 'http://127.0.0.1:8083/service-worker.js');
    assert.equal(entries.size, 2);
  }
});
