// Measure only the native action container. Its absolute side-skill rails do
// not contribute to offsetHeight; card choices and custom dialogs stay native.
export function installPromptLayout(arena, { ResizeObserver = globalThis.ResizeObserver,
  requestAnimationFrame = globalThis.requestAnimationFrame, cancelAnimationFrame = globalThis.cancelAnimationFrame } = {}) {
  const property = '--sgs-control-height';
  const previous = arena.style.getPropertyValue(property);
  const priority = arena.style.getPropertyPriority(property);
  let target = null, frame = null, generation = 0, disposed = false, ownedValue;
  const cancel = () => {
    generation++;
    if (frame !== null) cancelAnimationFrame(frame);
    frame = null;
  };
  const restore = () => {
    if (ownedValue !== undefined && arena.style.getPropertyValue(property) === ownedValue) {
      if (previous) arena.style.setProperty(property, previous, priority);
      else arena.style.removeProperty(property);
    }
    ownedValue = undefined;
  };
  const schedule = () => {
    if (disposed || !target || frame !== null) return;
    const revision = generation;
    frame = requestAnimationFrame(() => {
      if (disposed || revision !== generation) return;
      frame = null;
      // offsetHeight is in unscaled CSS pixels, unlike the viewport rectangle.
      // Hidden/detached controls retain the existing single-row prompt spacing.
      const height = target.isConnected ? target.offsetHeight : 0;
      const value = `${Math.max(50, Number.isFinite(height) ? height : 0)}px`;
      if (arena.style.getPropertyValue(property) === value) return;
      arena.style.setProperty(property, value);
      ownedValue = value;
    });
  };
  // Never write layout while the browser is delivering resize observations.
  const observer = new ResizeObserver(entries => {
    if (entries.some(entry => entry.target === target)) schedule();
  });
  return {
    observe(next) {
      if (disposed || next === target) return;
      cancel();
      observer.disconnect();
      target = next || null;
      if (target) { observer.observe(target, { box: 'border-box' }); schedule(); }
      else restore();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      cancel();
      observer.disconnect();
      target = null;
      restore();
    },
  };
}
