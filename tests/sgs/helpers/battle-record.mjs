import { normalizeLaunch } from '../../../apps/core/sgs/launch-config.mjs';

export function completedBattle(patch = {}) {
  return { sessionId: 'test-match', completedAt: 1791043200000, outcome: 'win', title: '战斗胜利',
    general: '曹操', secondGeneral: '', role: '忠臣', dead: false, rounds: 7, elapsedMs: 125000,
    stats: { damage: 5, damaged: 3, gain: 6, cards: 4, kill: 2 },
    replay: normalizeLaunch({ generalId: 'caocao', pack: 'standard', mode: 'identity', identity: 'zhong', speed: 'fast' }),
    ...patch };
}
