import test from 'node:test';
import assert from 'node:assert/strict';
import { createPreferences, preferencesKey } from '../../apps/core/sgs/preferences.mjs';

function storage() {
  const data = new Map(), writes = [];
  return { writes, getItem: key => data.get(key) ?? null,
    setItem(key, value) { writes.push(key); data.set(key, value); }, removeItem: key => data.delete(key) };
}

test('refresh adopts a newer canonical record once, preserves missing fields and never writes legacy mirrors', () => {
  const local = storage(), lobby = createPreferences(() => local), updates = [];
  lobby.set({ sound: false, heroVolume: 0.25 });
  lobby.subscribe((value, saved) => updates.push({ value, saved }));
  const table = createPreferences(() => local);
  table.set({ speed: 'fast', cardVolume: 0.4, effectVolume: 0.6, reducedMotion: true });
  const writes = local.writes.length;
  lobby.refresh();
  assert.deepEqual(lobby.get(), table.get());
  assert.deepEqual(updates, [{ value: table.get(), saved: undefined }]);
  lobby.refresh();
  assert.equal(updates.length, 1, 'unchanged records must not publish duplicate updates');
  assert.equal(local.writes.length, writes, 'refresh only reads');

  local.setItem(preferencesKey, JSON.stringify({ version: 1, speed: 'normal', sound: 'true', heroVolume: null }));
  lobby.refresh();
  assert.equal(lobby.get().speed, 'normal');
  assert.equal(lobby.get().sound, false, 'invalid or absent fields retain current values');
  assert.equal(lobby.get().heroVolume, 0.25);
  assert.equal(lobby.get().reducedMotion, true);
});

test('refresh keeps muted memory on denied, missing, malformed or unsupported storage', () => {
  for (const record of [null, '{broken', 'null', '[]', 'true', '{"version":2,"sound":true}']) {
    const local = storage(), preferences = createPreferences(() => local), updates = [];
    preferences.set({ sound: false, speed: 'fast', heroVolume: 0.25 });
    const expected = preferences.get();
    preferences.subscribe(value => updates.push(value));
    if (record === null) local.removeItem(preferencesKey); else local.setItem(preferencesKey, record);
    preferences.refresh();
    local.getItem = () => { throw new Error('read denied'); };
    preferences.refresh();
    assert.deepEqual(preferences.get(), expected);
    assert.equal(updates.length, 0);
  }
  let denied = false;
  const local = storage(), preferences = createPreferences(() => { if (denied) throw new Error('storage denied'); return local; });
  preferences.set({ sound: false }); denied = true; preferences.refresh();
  assert.equal(preferences.get().sound, false);
});

test('refresh does not resurrect an unchanged older record after a failed canonical write', () => {
  const local = storage(), preferences = createPreferences(() => local);
  preferences.set({ sound: true });
  const write = local.setItem;
  local.setItem = (key, value) => { if (key === preferencesKey) throw new Error('quota'); write(key, value); };
  assert.equal(preferences.set({ sound: false, speed: 'fast', heroVolume: 0.25 }), false);
  assert.equal(JSON.parse(local.getItem(preferencesKey)).sound, true, 'persisted data remains stale');
  const expected = preferences.get();
  preferences.refresh();
  assert.deepEqual(preferences.get(), expected, 'unsaved mute and other current settings survive');
  local.setItem = write;
  const table = createPreferences(() => local); table.set({ sound: false, speed: 'fast', heroVolume: 0.5 });
  preferences.refresh();
  assert.deepEqual(preferences.get(), table.get(), 'a genuinely newer canonical record can still be adopted');
});

test('legacy mirror write failures do not block a newer successfully saved canonical record', () => {
  const local = storage(), lobby = createPreferences(() => local);
  lobby.set({ sound: false });
  const write = local.setItem;
  local.setItem = (key, value) => { if (key !== preferencesKey) throw new Error('legacy denied'); write(key, value); };
  assert.equal(lobby.set({ speed: 'fast' }), false);
  const table = createPreferences(() => local);
  assert.equal(table.set({ heroVolume: 0.25 }), false);
  lobby.refresh();
  assert.deepEqual(lobby.get(), table.get());
});

test('existing muted preferences gain a quiet music default without rewriting the saved choices', () => {
  const local = storage();
  const old = { version: 1, speed: 'fast', sound: false, backgroundPause: false,
    reducedMotion: true, cardVolume: 0.4, heroVolume: 0.25, effectVolume: 0.6 };
  local.setItem(preferencesKey, JSON.stringify(old));
  local.setItem('sgs.settings.v1', '{"generalId":"wu_huangfusong","mode":"doudizhu"}');
  const writes = local.writes.length;
  const preferences = createPreferences(() => local);
  const { musicVolume, ...retained } = preferences.get();
  const { version, ...expected } = old;
  assert.equal(musicVolume, 0.25);
  assert.deepEqual(retained, expected);
  assert.equal(local.writes.length, writes, 'reading the new default must not rewrite saved settings');
  assert.equal(local.getItem('sgs.settings.v1'), '{"generalId":"wu_huangfusong","mode":"doudizhu"}');
});

test('music volume persists and refreshes independently, including a zero-volume preference', () => {
  const local = storage();
  const lobby = createPreferences(() => local);
  lobby.set({ sound: false, cardVolume: 0.4, heroVolume: 0.25, effectVolume: 0.6 });
  const table = createPreferences(() => local);
  for (const value of [0.37, 0]) {
    table.set({ musicVolume: value });
    lobby.refresh();
    assert.equal(lobby.get().musicVolume, value);
    assert.equal(createPreferences(() => local).get().musicVolume, value);
    assert.deepEqual([lobby.get().sound, lobby.get().cardVolume, lobby.get().heroVolume, lobby.get().effectVolume],
      [false, 0.4, 0.25, 0.6]);
  }
  for (const invalid of [null, '1', NaN, Infinity, undefined]) {
    table.set({ musicVolume: invalid });
    assert.equal(table.get().musicVolume, 0, 'invalid music values retain the explicit zero');
  }
  table.set({ musicVolume: 4 }); assert.equal(table.get().musicVolume, 1);
  table.set({ musicVolume: -1 }); assert.equal(table.get().musicVolume, 0);
  const write = local.setItem;
  local.setItem = () => { throw new Error('denied'); };
  assert.equal(table.set({ musicVolume: 0.15 }), false);
  table.refresh();
  assert.equal(table.get().musicVolume, 0.15, 'a stale saved record cannot undo a failed in-memory change');
  assert.equal(table.get().sound, false);
  local.setItem = write;
});
