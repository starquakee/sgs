import { persistentStorage } from './storage.mjs';
export const preferencesKey = 'sgs.preferences.v1';
const audioKey = 'sgs.card-audio.enabled';
const speedValue = value => ['normal', 'fast'].includes(value);
export const volumePreferences = { card: 'cardVolume', hero: 'heroVolume', effect: 'effectVolume', music: 'musicVolume' };

// Storage access itself can throw (private browsing / denied site storage).
export function createPreferences(getStorage = persistentStorage, fallback = {}) {
  const read = key => { try { return getStorage().getItem(key); } catch { return null; } };
  const parse = raw => { try { return JSON.parse(raw); } catch { return null; } };
  const json = key => parse(read(key));
  const legacy = json('sgs.settings.v1');
  const defaults = { speed: speedValue(fallback.speed) ? fallback.speed : speedValue(legacy?.speed) ? legacy.speed : 'normal',
    sound: read(audioKey) !== 'false', backgroundPause: true, reducedMotion: false,
    cardVolume: 1, heroVolume: 1, effectVolume: 1, musicVolume: 0.25 };
  const sanitize = (input, base) => Object.fromEntries(Object.entries(base).map(([key, value]) => {
    const next = input?.[key];
    if (Object.values(volumePreferences).includes(key)) return [key,
      typeof next === 'number' && Number.isFinite(next) ? Math.max(0, Math.min(1, next)) : value];
    return [key, (key === 'speed' ? speedValue(next) : typeof next === 'boolean') ? next : value];
  }));
  let storedText = read(preferencesKey);
  const stored = parse(storedText);
  let value = sanitize(stored?.version === 1 ? stored : null, defaults);
  const listeners = new Set();
  return {
    get: () => ({ ...value }),
    refresh() {
      const nextText = read(preferencesKey);
      // A failed write can leave an older readable record behind. Do not let
      // that unchanged record overwrite current in-memory choices (e.g. mute).
      if (nextText === storedText) return;
      const nextStored = parse(nextText);
      if (!nextStored || Array.isArray(nextStored) || nextStored.version !== 1) return;
      storedText = nextText;
      const next = sanitize(nextStored, value);
      if (Object.keys(value).every(key => next[key] === value[key])) return;
      value = next;
      for (const listener of listeners) listener({ ...value });
    },
    set(patch) {
      value = sanitize(patch, value);
      let saved = true;
      const write = (key, data) => { try {
        getStorage().setItem(key, data);
        if (key === preferencesKey) storedText = data;
      } catch { saved = false; } };
      write(preferencesKey, JSON.stringify({ version: 1, ...value }));
      // Keep the old mute and launch-speed preferences compatible. Never replace
      // the user's general/mode/role or write to native rule configuration here.
      write(audioKey, String(value.sound));
      if (Object.hasOwn(patch, 'speed')) {
        const previous = json('sgs.settings.v1');
        write('sgs.settings.v1', JSON.stringify({ ...(previous && !Array.isArray(previous) && typeof previous === 'object' ? previous : {}), speed: value.speed }));
      }
      for (const listener of listeners) listener({ ...value }, saved);
      return saved;
    },
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener); },
  };
}

export function applyMotionPreference(document, preferences) {
  document.documentElement.classList.toggle('sgs-reduced-motion', preferences.reducedMotion);
}
