import { launchKey, normalizeLaunch } from './launch-config.mjs';
import { persistentStorage } from './storage.mjs';

export const battleRecordsKey = 'sgs.battle-records.v1';
const limit = 50;
const count = value => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const label = value => typeof value === 'string' && value.length <= 500;

// A fresh native match gets a fresh ID, including reloads/rematches. Never put
// this ID in launch settings, which intentionally outlive an individual match.
export function createBattleSessionId() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

function cleanRecord(value) {
  if (!value || typeof value !== 'object' || !label(value.sessionId) || !value.sessionId
    || !count(value.completedAt) || value.completedAt > 8.64e15
    || !['win', 'loss', 'ended'].includes(value.outcome)
    || !['title', 'general', 'secondGeneral', 'role'].every(key => label(value[key]))
    || typeof value.dead !== 'boolean' || !count(value.elapsedMs)
    || !(value.rounds === null || (count(value.rounds) && Number.isInteger(value.rounds)))
    || !value.stats || !['damage', 'damaged', 'gain', 'cards', 'kill'].every(key => count(value.stats[key]))
    || !value.replay || typeof value.replay !== 'object') return null;
  const replay = normalizeLaunch(value.replay);
  // Reject damaged configurations rather than silently substituting Cao Cao or
  // another role. Pack + ID remain exact even if that version is later removed.
  if (Object.keys(replay).some(key => value.replay[key] !== replay[key])) return null;
  return {
    sessionId: value.sessionId, completedAt: value.completedAt,
    outcome: value.outcome, title: value.title, general: value.general,
    secondGeneral: value.secondGeneral, role: value.role, dead: value.dead,
    rounds: value.rounds, elapsedMs: value.elapsedMs,
    stats: Object.fromEntries(['damage', 'damaged', 'gain', 'cards', 'kill'].map(key => [key, value.stats[key]])), replay,
  };
}

function unique(records) {
  const seen = new Set();
  return records.filter(record => !seen.has(record.sessionId) && seen.add(record.sessionId))
    .sort((a, b) => b.completedAt - a.completedAt).slice(0, limit);
}

export function createBattleRecords(getStorage = persistentStorage) {
  function read() {
    try {
      const raw = getStorage().getItem(battleRecordsKey);
      if (raw === null) return { records: [], notice: '' };
      const data = JSON.parse(raw);
      if (data && Number.isInteger(data.version) && data.version !== 1) {
        return { records: [], protected: true, notice: '战绩版本暂不支持；本次战绩未保存，原记录已保留。' };
      }
      if (data?.version !== 1 || !Array.isArray(data.records)) throw new Error('invalid records');
      const valid = data.records.map(cleanRecord).filter(Boolean);
      return { records: unique(valid), notice: valid.length === data.records.length ? '' : '部分战绩已损坏，无法读取；其余记录仍可查看。' };
    } catch {
      return { records: [], notice: '无法读取本地战绩，可能已损坏或存储不可用；不影响本局游玩。' };
    }
  }
  let state = read();
  return {
    get: () => ({ records: state.records.map(cleanRecord), notice: state.notice }),
    record(snapshot) {
      const record = cleanRecord(snapshot);
      if (!record) return { saved: false, notice: '本次战绩未保存：结算数据不完整。' };
      const latest = read();
      // Re-read before writing so another completed match in this browser is
      // retained. Keep in-memory records too if a previous write was denied.
      state = { ...latest, records: unique([...latest.records, ...state.records, record]) };
      if (latest.protected) return { saved: false, notice: latest.notice };
      try {
        getStorage().setItem(battleRecordsKey, JSON.stringify({ version: 1, records: state.records }));
        state.notice = '';
        return { saved: true, notice: '本局战绩已保存。' };
      } catch {
        state.notice = '本次战绩未保存到浏览器；本页仍可查看结算、再战或返回。';
        return { saved: false, notice: state.notice };
      }
    },
  };
}

export function recordLaunch(record, characters) {
  const valid = cleanRecord(record);
  if (!valid || !characters?.some(character => !character.isUnseen
    && character.key === `${valid.replay.pack}:${valid.replay.generalId}`
    && character.pack === valid.replay.pack && character.id === valid.replay.generalId)) return null;
  return { ...valid.replay };
}

// A history replay explicitly chooses its stored speed. Apply it in memory too
// when local preferences cannot be written, then consume the one-shot marker so
// subsequent table restarts continue to use the player's current preferences.
export function consumeRecordReplay(saved, preferences, getStorage = () => globalThis.sessionStorage) {
  if (saved?.fromBattleRecord !== true) return;
  const config = normalizeLaunch(saved);
  preferences.set({ speed: config.speed });
  try { getStorage().setItem(launchKey, JSON.stringify(config)); } catch {}
}
