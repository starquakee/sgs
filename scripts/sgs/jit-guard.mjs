// Production SGS uses the already-built JavaScript rules. The optional native
// JIT helper runs before the SGS entry and otherwise throws/reloads when browser
// session storage is unavailable. Keep its ordinary-entry behavior unchanged.
export function canStartJit(host = globalThis) {
  if (new URLSearchParams(host.location.search).get('sgs') !== '1') return true;
  try {
    const storage = host.sessionStorage;
    const key = 'sgs.jit-storage-probe', previous = storage.getItem(key);
    storage.setItem(key, '1');
    if (previous === null) storage.removeItem(key); else storage.setItem(key, previous);
    return true;
  } catch { return false; }
}

export function guardSgsJit(plugin) {
  const transform = plugin.transformIndexHtml;
  if (typeof transform !== 'function') throw new Error('Unexpected native JIT HTML hook');
  return {
    ...plugin,
    transformIndexHtml(...args) {
      const result = transform.apply(this, args);
      if (!result?.tags) return result;
      return { ...result, tags: result.tags.map(tag => tag.tag === 'script' && typeof tag.children === 'string'
        ? { ...tag, children: `if ((${canStartJit.toString()})(globalThis)) {\n${tag.children}\n}` }
        : tag) };
    },
  };
}
