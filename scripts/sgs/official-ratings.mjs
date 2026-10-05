const clean = value => String(value || '').replace(/<[^>]*>/g, '').replace(/^新杀/, '').trim();
const signature = names => [...new Set(names.map(clean))].sort().join('|');
const countries = { wei: 1, shu: 2, wu: 3, qun: 4, shen: 5, jin: 6 };
const scopeKeys = { '5:0': 'overall', '4:6': 'landlord', '4:5': 'farmer', '2:7': 'first', '2:8': 'second',
  '1:1': 'lord', '1:2': 'loyalist', '1:3': 'rebel', '1:4': 'spy' };

export function officialScores(record) {
  const scores = {};
  for (const row of record.rawScores) {
    const scope = scopeKeys[`${row.mode}:${row.role}`];
    if (!scope) continue;
    if (!Number.isFinite(row.score) || Object.hasOwn(scores, scope)) throw new Error(`Invalid score: ${record.id}/${scope}`);
    scores[scope] = Math.min(10, Math.max(0, row.score));
  }
  return scores;
}

export function matchOfficialRating(character, snapshot, policy) {
  if (!policy.sourcePacks.includes(character.pack) || character.isUnseen) return { status: 'unmatched', reason: 'outside-target' };
  if (policy.excludedVersions?.[character.key]) return { status: 'unmatched', reason: 'different-skill-edition' };
  const override = policy.overrides[character.key];
  const localSkills = character.skills.map(s => clean(s.name)).filter(name => !override?.additionalGrantedSkills?.includes(name));
  const sameVersion = r => signature(r.skillNames) === signature(localSkills) && r.country === countries[character.faction] && r.hp === character.maxHp;
  const candidates = override
    ? snapshot.records.filter(r => r.id === override.officialId && sameVersion(r))
    : snapshot.records.filter(r => clean(r.name) === clean(character.name) && sameVersion(r));
  if (override && candidates.length !== 1) throw new Error(`Rating override no longer matches: ${character.key}`);
  if (candidates.length !== 1) return { status: 'unmatched', reason: candidates.length ? 'ambiguous-version' : 'version-not-matched' };
  const record = candidates[0];
  return { status: 'matched', officialId: record.id, officialName: record.name, scores: officialScores(record),
    match: override ? 'reviewed-alias' : 'name-country-initial-skills' };
}

export function validateOfficialRatingMap(catalog, snapshot, policy) {
  const keys = new Set(catalog.characters.map(c => c.key));
  const ids = new Set(snapshot.records.map(c => c.id));
  if (ids.size !== snapshot.records.length) throw new Error('Duplicate official rating ID');
  for (const [key, rule] of Object.entries(policy.overrides)) {
    if (!keys.has(key) || !ids.has(rule.officialId) || !rule.note) throw new Error(`Stale rating mapping: ${key}`);
  }
  for (const [key, rule] of Object.entries(policy.excludedVersions || {})) {
    if (!keys.has(key) || !rule.note || policy.overrides[key]) throw new Error(`Invalid excluded rating version: ${key}`);
  }
  for (const row of snapshot.records) officialScores(row);
  const mapped = new Map();
  for (const character of catalog.characters) {
    const rating = matchOfficialRating(character, snapshot, policy);
    if (rating.status !== 'matched') continue;
    if (mapped.has(rating.officialId)) throw new Error(`Review competing editions for official rating ${rating.officialId}: ${mapped.get(rating.officialId)}, ${character.key}`);
    mapped.set(rating.officialId, character.key);
  }
}
