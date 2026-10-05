// Observe the real native hand container. Rules and card placement stay native.
export function installHandLayout(update, { ResizeObserver = globalThis.ResizeObserver,
  requestAnimationFrame = globalThis.requestAnimationFrame, cancelAnimationFrame = globalThis.cancelAnimationFrame } = {}) {
  let target, frame = null, disposed = false;
  const cancel = () => { if (frame !== null) cancelAnimationFrame(frame); frame = null; };
  // Native updatehl can alter scrollbar geometry. Never make that layout write
  // while the browser is still delivering resize observations for this frame.
  const observer = new ResizeObserver(entries => {
    if (disposed || frame !== null || !entries.some(entry => entry.target === target)) return;
    frame = requestAnimationFrame(() => { frame = null; if (!disposed && target) update(); });
  });
  return {
    observe(next) { if (disposed || next === target) return; cancel(); observer.disconnect(); target = next; if (target) observer.observe(target); },
    dispose() { disposed = true; cancel(); observer.disconnect(); target = null; }
  };
}
