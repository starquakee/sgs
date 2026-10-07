// Browsing categories are independent of native pack IDs and official-version verification.
export function classifyBrowsePack(character, policy) {
  return policy.characterOverrides[character.key]
    || character.groups.map(group => policy.groupOverrides[`${character.pack}:${group.id}`]).find(Boolean)
    || policy.sourcePacks[character.pack] || 'other';
}

export function classifyRelease(character, policy, history, audioSelection) {
  const override = policy.releaseOverrides[character.key];
  if (override) return { ...override, basis: 'official-announcement' };
  const audio = audioSelection[character.id];
  // Availability at an official event is not proof of the initial release year.
  if (audio?.releaseDate && character.pack === (audio.pack || 'xianding')) {
    const year = Number(audio.releaseDate.slice(0, 4));
    return { era: year >= policy.cutoffYear ? 'recent' : 'old', year, basis: 'official-announcement', url: audio.evidenceUrl };
  }
  // Only the three explicitly dated source tables can supply a version year.
  const group = policy.datedSourcePacks.includes(character.pack) && character.groups.find(group => /_(?:19|20)\d{2}$/.test(group.id));
  if (group) {
    const year = Number(group.id.slice(-4));
    return { era: year >= policy.cutoffYear ? 'recent' : 'old', year, basis: 'source-edition', group: group.id };
  }
  const series = policy.recentSeries[classifyBrowsePack(character, policy)];
  if (series) return { era: 'recent', basis: 'series-debut', evidence: series };
  const ids = character.skills.map(skill => skill.id).sort().join('|');
  // A stable native pack:id identifies an edition despite later balance/skill
  // renames. For a moved pack, also require the same initial skill IDs.
  const historical = history.characters.find(old => old.id === character.id && (old.pack === character.pack || [...old.skills].sort().join('|') === ids));
  if (historical) return { era: 'old', basis: 'historical-source', sourcePack: historical.pack, line: historical.line };
  return { era: 'unknown', basis: 'unverified' };
}

export function validateRosterPolicy(catalog, policy) {
  const groups = new Set(catalog.characters.flatMap(c => c.groups.map(g => `${c.pack}:${g.id}`)));
  const keys = new Set(catalog.characters.map(c => c.key));
  const categories = new Set(policy.browsePacks.map(p => p.id));
  for (const key of Object.keys(policy.groupOverrides)) if (!groups.has(key)) throw new Error(`Stale browse group: ${key}`);
  for (const key of [...Object.keys(policy.characterOverrides), ...Object.keys(policy.releaseOverrides), ...Object.keys(policy.searchAliases)]) if (!keys.has(key)) throw new Error(`Stale roster key: ${key}`);
  for (const id of [...Object.values(policy.sourcePacks), ...Object.values(policy.groupOverrides), ...Object.values(policy.characterOverrides)]) if (!categories.has(id)) throw new Error(`Unknown browse pack: ${id}`);
  for (const rule of Object.values(policy.releaseOverrides)) {
    if (!policy.evidence[rule.evidence]?.url || rule.era !== (rule.year >= policy.cutoffYear ? 'recent' : 'old')) throw new Error('Invalid dated release rule');
  }
  if (policy.cutoffYear !== 2021 || policy.unknownBehavior !== 'keep-and-label') throw new Error('Review the accepted year-filter policy before changing it');
}
