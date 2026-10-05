import test from 'node:test';
import assert from 'node:assert/strict';
import { installHandLayout } from '../../apps/core/sgs/hand-layout.mjs';

function fixture(update) {
  let notify, observed, next = 0;
  const frames = new Map();
  const api = installHandLayout(update, {
    ResizeObserver: class { constructor(fn) { notify = fn; } observe(node) { observed = node; } disconnect() { observed = null; } },
    requestAnimationFrame: fn => { frames.set(++next, fn); return next; }, cancelAnimationFrame: id => frames.delete(id)
  });
  const flush = () => { const pending = [...frames.values()]; frames.clear(); for (const fn of pending) fn(); };
  return { api, frames, flush, notify: () => notify([{ target: observed }]) };
}

test('native hand reflow runs after resize delivery and coalesces repeated notifications', () => {
  let calls = 0;
  const f = fixture(() => { calls++; if (calls === 1) f.notify(); });
  f.api.observe({}); f.notify(); f.notify();
  assert.equal(calls, 0, 'must not write layout during ResizeObserver delivery');
  assert.equal(f.frames.size, 1);
  f.flush(); assert.equal(calls, 1); assert.equal(f.frames.size, 1);
  f.flush(); assert.equal(calls, 2); assert.equal(f.frames.size, 0);
  f.api.dispose();
});

test('switching hand containers or disposing cancels a pending native reflow', () => {
  let calls = 0;
  const f = fixture(() => calls++), first = {}, second = {};
  f.api.observe(first); f.notify(); f.api.observe(first);
  assert.equal(f.frames.size, 1);
  f.api.observe(second); f.flush(); assert.equal(calls, 0);
  f.notify(); f.api.dispose(); f.flush(); assert.equal(calls, 0);
  f.notify(); f.api.observe(first); f.flush(); assert.equal(calls, 0);
});
