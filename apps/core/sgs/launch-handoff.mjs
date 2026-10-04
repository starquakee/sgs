import { launchKey, normalizeLaunch } from './launch-config.mjs';

const prefix = '#sgs-launch=';
export function launchURL(input, preferences) {
  return './index.html?sgs=1' + prefix + encodeURIComponent(JSON.stringify({ ...normalizeLaunch(input),
    ...(input.fromBattleRecord === true ? { fromBattleRecord: true } : {}), preferences }));
}
export function readLaunch({ location = globalThis.location, session = () => globalThis.sessionStorage } = {}) {
  try {
    if (location.hash?.startsWith(prefix) && location.hash.length < 4096) {
      const value = JSON.parse(decodeURIComponent(location.hash.slice(prefix.length)));
      if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    }
    const value = JSON.parse(session().getItem(launchKey) || '{}');
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch { return {}; }
}
export function retainLaunch(input, preferences, { history = globalThis.history } = {}) {
  // Keep the normalized carrier on this page for retry/restart, but consume the
  // history replay intent once. Fragments are never sent to the local server.
  history.replaceState(null, '', launchURL(normalizeLaunch(input), preferences));
}
export function createLaunchHandoff({ session = () => globalThis.sessionStorage, navigate = url => { location.href = url; } } = {}) {
  let navigating = false;
  return (config, preferences, beforeNavigate = () => {}) => {
    if (navigating) return false;
    navigating = true;
    try {
      try { session().setItem(launchKey, JSON.stringify(config)); } catch {}
      beforeNavigate();
      navigate(launchURL(config, preferences));
      return true;
    } catch (error) { navigating = false; throw error; }
  };
}
