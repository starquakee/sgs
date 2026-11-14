import test from 'node:test';
import assert from 'node:assert/strict';
import { installPromptLayout } from '../../apps/core/sgs/prompt-layout.mjs';

const property = '--sgs-control-height';
const control = height => ({ offsetHeight: height, isConnected: true });

function fixture(initial = '') {
  let notify, next = 0, delivering = false;
  const frames = new Map(), cancelled = [], observations = [], writes = [];
  const values = new Map(initial ? [[property, initial]] : []);
  const priorities = new Map(initial ? [[property, 'important']] : []);
  let disconnects = 0;
  const arena = { style: {
    getPropertyValue: name => values.get(name) || '',
    getPropertyPriority: name => priorities.get(name) || '',
    setProperty(name, value, priority = '') {
      assert.equal(delivering, false, 'style writes must not run inside ResizeObserver delivery');
      writes.push([name, value, priority]); values.set(name, value); priorities.set(name, priority);
    },
    removeProperty(name) {
      assert.equal(delivering, false);
      writes.push([name, null]); values.delete(name); priorities.delete(name);
    },
  } };
  const api = installPromptLayout(arena, {
    ResizeObserver: class {
      constructor(fn) { notify = fn; }
      observe(node, options) { observations.push({ node, options }); }
      disconnect() { disconnects++; }
    },
    requestAnimationFrame(fn) { frames.set(++next, fn); return next; },
    cancelAnimationFrame(id) { cancelled.push(frames.get(id)); frames.delete(id); },
  });
  return { api, arena, frames, cancelled, observations, writes,
    height: () => values.get(property), disconnects: () => disconnects,
    notify(...targets) { delivering = true; try { notify(targets.map(target => ({ target }))); } finally { delivering = false; } },
    flush() { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(); },
  };
}

test('prompt layout measures the real control after resize delivery and coalesces notifications', () => {
  const f = fixture(), node = control(50);
  f.api.observe(node);
  assert.deepEqual(f.observations, [{ node, options: { box: 'border-box' } }]);
  assert.equal(f.writes.length, 0, 'initial sizing must also wait until a frame');
  f.notify(node); f.notify(node);
  assert.equal(f.frames.size, 1);
  node.offsetHeight = 114;
  f.flush();
  assert.equal(f.height(), '114px', 'read the latest rendered size, not a stale resize entry');
  node.offsetHeight = 178;
  f.notify(node); f.notify(node);
  assert.equal(f.height(), '114px');
  f.flush(); assert.equal(f.height(), '178px');
  node.offsetHeight = 50;
  f.notify(node); f.flush(); assert.equal(f.height(), '50px');
  f.api.dispose();
});

test('unchanged controls do not resubscribe or rewrite styles on repeated notifications', () => {
  const f = fixture(), node = control(114);
  f.api.observe(node); f.flush();
  const subscriptions = f.observations.length, writes = f.writes.length;
  f.api.observe(node);
  assert.equal(f.frames.size, 0);
  assert.equal(f.observations.length, subscriptions);
  f.notify(node); f.flush(); f.notify(node); f.flush();
  assert.equal(f.writes.length, writes);
  f.notify(control(900)); assert.equal(f.frames.size, 0, 'unrelated resize entries are ignored');
  f.api.dispose();
});

test('prompt clearance uses CSS layout height and never measures transformed rectangles or side rails', () => {
  const f = fixture(), node = control(114);
  node.getBoundingClientRect = () => { throw new Error('scaled viewport geometry must not be read'); };
  Object.defineProperty(node, 'children', { get() { throw new Error('absolute skill rails must not be counted separately'); } });
  f.api.observe(node); f.flush();
  assert.equal(f.height(), '114px');
  f.api.dispose();
});

test('hidden, detached and invalid measurements retain single-row clearance and recover on resize', () => {
  const f = fixture(), node = control(114);
  f.api.observe(node); f.flush();
  for (const height of [0, 44, -1, NaN, Infinity]) {
    node.offsetHeight = height;
    f.notify(node); f.flush(); assert.equal(f.height(), '50px');
  }
  node.offsetHeight = 178; node.isConnected = false;
  f.notify(node); f.flush(); assert.equal(f.height(), '50px');
  node.isConnected = true;
  f.notify(node); f.flush(); assert.equal(f.height(), '178px');
  f.api.dispose();
});

test('rebinding cancels pending measurement and rejects stale frames without losing the new frame', () => {
  const f = fixture(), first = control(178), second = control(50);
  f.api.observe(first);
  const stale = [...f.frames.values()][0];
  f.api.observe(second);
  assert.equal(f.cancelled.length, 1);
  assert.equal(f.frames.size, 1);
  stale();
  assert.equal(f.writes.length, 0);
  assert.equal(f.frames.size, 1);
  f.notify(first); assert.equal(f.frames.size, 1);
  f.flush(); assert.equal(f.height(), '50px');
  assert.deepEqual(f.observations.map(row => row.node), [first, second]);
  f.api.dispose();
});

test('unbinding restores the existing style and allows a fresh control to be observed', () => {
  const f = fixture('80px'), first = control(114), second = control(178);
  f.api.observe(first); f.flush(); assert.equal(f.height(), '114px');
  f.notify(first);
  const stale = [...f.frames.values()][0];
  f.api.observe(null);
  assert.equal(f.height(), '80px');
  assert.equal(f.arena.style.getPropertyPriority(property), 'important');
  stale(); f.notify(first); f.flush(); assert.equal(f.height(), '80px');
  f.api.observe(second); f.flush(); assert.equal(f.height(), '178px');
  f.api.dispose(); assert.equal(f.height(), '80px');
});

test('disposal removes owned styles once and rejects late resize, cancelled frames and rebinding', () => {
  const f = fixture(), node = control(114);
  f.api.observe(node); f.flush();
  node.offsetHeight = 178; f.notify(node);
  const stale = [...f.frames.values()][0];
  f.api.dispose();
  assert.equal(f.height(), undefined);
  assert.equal(f.frames.size, 0);
  const writes = f.writes.length, subscriptions = f.observations.length, disconnects = f.disconnects();
  stale(); f.notify(node); f.api.observe(control(242)); f.flush(); f.api.dispose();
  assert.equal(f.writes.length, writes);
  assert.equal(f.observations.length, subscriptions);
  assert.equal(f.disconnects(), disconnects);
});

test('cleanup preserves a style changed by another owner and does not claim unchanged initial values', () => {
  const f = fixture(), node = control(114);
  f.api.observe(node); f.flush();
  f.arena.style.setProperty(property, '200px');
  f.api.dispose(); assert.equal(f.height(), '200px');
  const alreadySized = fixture('114px');
  alreadySized.api.observe(node); alreadySized.flush();
  assert.equal(alreadySized.writes.length, 0);
  alreadySized.api.dispose();
  assert.equal(alreadySized.height(), '114px');
  assert.equal(alreadySized.arena.style.getPropertyPriority(property), 'important');
  assert.equal(alreadySized.writes.length, 0);
});
