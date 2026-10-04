const storageKey = 'sgs.recent-generals.v1';
const limit = 8;

// Native recentCharacter stores bare IDs; the lobby must preserve pack variants.
export function createRecentGenerals(characters, getStorage = () => globalThis.localStorage) {
  const available = new Set(characters
    .filter(character => !character.isUnseen && character.key === `${character.pack}:${character.id}`)
    .map(character => character.key));
  const clean = keys => Array.isArray(keys)
    ? [...new Set(keys.filter(key => typeof key === 'string' && available.has(key)))].slice(0, limit)
    : [];
  let keys = [];
  try {
    const saved = JSON.parse(getStorage().getItem(storageKey) || 'null');
    if (saved?.version === 1) keys = clean(saved.keys);
  } catch { /* Missing or damaged history must not prevent selecting a general. */ }

  return {
    keys: () => [...keys],
    record(key) {
      if (!available.has(key)) return false;
      keys = clean([key, ...keys]);
      try {
        getStorage().setItem(storageKey, JSON.stringify({ version: 1, keys }));
        return true;
      } catch { return false; }
    },
  };
}
