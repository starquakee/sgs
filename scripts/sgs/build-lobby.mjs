import { readFile, writeFile } from 'node:fs/promises';
import { classifyBrowsePack, classifyRelease, validateRosterPolicy } from './roster-metadata.mjs';
import { matchOfficialRating, validateOfficialRatingMap } from './official-ratings.mjs';
import { loadDescriptionReader } from './skill-descriptions.mjs';
const root = new URL('../../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('apps/core/sgs/catalog.json', root), 'utf8'));
const descriptions = await loadDescriptionReader(root);
const policy = JSON.parse(await readFile(new URL('scripts/sgs/roster-policy.json', root), 'utf8'));
const history = JSON.parse(await readFile(new URL('scripts/sgs/roster-history.json', root), 'utf8'));
const audio = JSON.parse(await readFile(new URL('scripts/sgs/character-audio-selection.json', root), 'utf8'));
validateRosterPolicy(catalog, policy);
const ratings = JSON.parse(await readFile(new URL('scripts/sgs/official-ratings-source.json', root), 'utf8'));
const ratingMap = JSON.parse(await readFile(new URL('scripts/sgs/official-rating-map.json', root), 'utf8'));
validateOfficialRatingMap(catalog, ratings, ratingMap);
const roster = {
  schemaVersion: catalog.schemaVersion, upstream: catalog.upstream, officialBaseline: catalog.officialBaseline,
  browsePacks: policy.browsePacks,
  ratingSource: ratings.source,
  releasePolicy: { cutoffYear: policy.cutoffYear, unknownBehavior: policy.unknownBehavior, evidence: policy.evidence,
    historicalSources: history.sources, historicalCommit: history.commit, historicalDate: history.sourceDate },
  categories: catalog.categories, packs: catalog.packs.map(({ id, name, characterCount }) => ({id, name, characterCount})),
  characters: catalog.characters.map(({ key, id, name, pack, version, faction, factions, hp, maxHp, isUnseen, groups, skills }) => ({
    key, id, name, pack, version, faction, factions, hp, maxHp, isUnseen, groups,
    browsePack: classifyBrowsePack({key, pack, groups}, policy),
    searchAliases: policy.searchAliases[key] || [],
    release: classifyRelease({key, id, pack, groups, skills}, policy, history, audio),
    officialRating: matchOfficialRating({key, id, name, pack, faction, maxHp, skills, isUnseen}, ratings, ratingMap),
    skills: skills.map(({id,name,description,status}) => ({id,name,description,status, help: descriptions.describe(pack, id)})),
  })),
};
await writeFile(new URL('apps/core/sgs/roster.json', root), JSON.stringify(roster));
console.log(`Launcher index: ${roster.characters.length} character variants; full traceability remains in catalog.json.`);
