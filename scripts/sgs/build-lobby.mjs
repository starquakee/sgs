import { readFile, writeFile } from 'node:fs/promises';
const root = new URL('../../', import.meta.url);
const catalog = JSON.parse(await readFile(new URL('apps/core/sgs/catalog.json', root), 'utf8'));
const roster = {
  schemaVersion: catalog.schemaVersion, upstream: catalog.upstream, officialBaseline: catalog.officialBaseline,
  categories: catalog.categories, packs: catalog.packs.map(({ id, name, characterCount }) => ({id, name, characterCount})),
  characters: catalog.characters.map(({ key, id, name, pack, version, faction, factions, hp, maxHp, isUnseen, groups, skills }) => ({
    key, id, name, pack, version, faction, factions, hp, maxHp, isUnseen, groups,
    skills: skills.map(({id,name,description,status}) => ({id,name,description,status})),
  })),
};
await writeFile(new URL('apps/core/sgs/roster.json', root), JSON.stringify(roster));
console.log(`Launcher index: ${roster.characters.length} character variants; full traceability remains in catalog.json.`);
