// SGS adapter, GPL-3.0-only. Noname attribution and source remain in the repository.
import { readFile, readdir, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { ts, parseSource, defaultObject, binding, objectEntries, fields, literal, readText, location } from "./catalog-source.mjs";

const repositoryRoot = fileURLToPath(new URL("../../", import.meta.url));
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const byKey = (a, b) => compare(a.key, b.key);
const serialize = value => `${JSON.stringify(value, null, 2)}\n`;

export function classifyCharacter(policy, pack, id) {
  const configured = policy.packs[pack];
  if (!configured) throw new Error(`Unclassified pack: ${pack}`);
  const ruleId = policy.characterOverrides[`${pack}:${id}`]?.rule ?? configured.rule;
  const rule = policy.rules[ruleId];
  if (!rule || !policy.categories[rule.category] || !rule.basis || !rule.sources?.length) {
    throw new Error(`Invalid version rule: ${ruleId}`);
  }
  return { category: rule.category, rule: ruleId, officialStatus: "unverified" };
}

export function resolveSkill(id, definitionsById) {
  const candidates = definitionsById.get(id) ?? [];
  // Runtime pack loading order is not known here. Do not guess when definitions collide.
  return {
    id,
    status: candidates.length === 1 && candidates[0].definitionStatus === "parsed" ? "resolved" : "unresolved",
    reason: !candidates.length ? "missing-definition" : candidates.length > 1 ? "ambiguous-definition" :
      candidates[0].definitionStatus !== "parsed" ? "dynamic-definition" : null,
    definitionKeys: candidates.map(item => item.key).sort(compare),
  };
}

export async function createCatalog(root = repositoryRoot) {
  const diagnostics = [];
  const sourceManifest = new Map();
  async function source(file) {
    const raw = await readFile(path.join(root, file));
    sourceManifest.set(file, { file, sha256: createHash("sha256").update(raw).digest("hex") });
    return parseSource(file, raw.toString("utf8"));
  }
  const policyFile = "scripts/sgs/catalog-versions.json";
  const policyRaw = await readFile(path.join(root, policyFile));
  const policy = JSON.parse(policyRaw);
  sourceManifest.set(policyFile, { file: policyFile, sha256: createHash("sha256").update(policyRaw).digest("hex") });
  // Record every classification reference, including the accepted local PRD.
  for (const file of [...new Set(Object.values(policy.rules).flatMap(rule => rule.sources))].sort(compare)) {
    const raw = await readFile(path.join(root, file));
    sourceManifest.set(file, { file, sha256: createHash("sha256").update(raw).digest("hex") });
  }
  const packNames = (await readdir(path.join(root, "apps/core/character"), { withFileTypes: true }))
    .filter(item => item.isDirectory()).map(item => item.name).sort(compare);
  if (JSON.stringify(packNames) !== JSON.stringify(Object.keys(policy.packs).sort(compare))) {
    throw new Error("Source packs and version policy differ; classify new/missing packs explicitly");
  }
  const translations = new Map();
  const characters = [];
  const definitions = new Map();
  const packs = [];
  for (const pack of packNames) {
    const base = `apps/core/character/${pack}`;
    const version = classifyCharacter(policy, pack, "");
    const translateAst = await source(`${base}/translate.js`);
    translations.set(pack, new Map(objectEntries(defaultObject(translateAst), diagnostics, `${pack}:translations`).map(e => [e.id, e])));
    const sortAst = await source(`${base}/sort.js`);
    const groups = literal(binding(sortAst, "characterSort"));
    const groupNames = literal(binding(sortAst, "characterSortTranslate"));
    const charAst = await source(`${base}/character.js`);
    const charEntries = objectEntries(defaultObject(charAst), diagnostics, `${pack}:characters`);
    for (const entry of charEntries) {
      // Fail on an unsupported character shape instead of silently dropping a general.
      const data = literal(entry.node);
      // Character.skills defaults to [] in noname/library/element/character.js.
      data.skills ??= [];
      if (typeof data.group !== "string" || !Number.isFinite(data.hp) || !Array.isArray(data.skills) ||
          data.skills.some(id => typeof id !== "string")) throw new Error(`Unsupported character: ${pack}:${entry.id}`);
      characters.push({
        key: `${pack}:${entry.id}`, id: entry.id, pack,
        version: classifyCharacter(policy, pack, entry.id),
        sex: data.sex, faction: data.group, hp: data.hp, maxHp: data.maxHp ?? data.hp, armor: data.hujia ?? 0,
        factions: data.doubleGroup ?? [], isLord: data.isZhugong ?? false,
        isUnseen: data.isUnseen ?? false, isAiForbidden: data.isAiForbidden ?? false,
        groups: Object.entries(groups).filter(([, ids]) => ids.includes(entry.id)).map(([id]) => ({ id, name: groupNames[id] ?? id })),
        skills: data.skills, source: entry.source,
      });
    }
    let skillFiles;
    if (pack === "offline") {
      // Upstream index.ts eagerly merges these files with import.meta.glob; inspect that contract.
      const mergeAst = await source(`${base}/skill/index.ts`);
      if (!mergeAst.text.includes('import.meta.glob(["./*.js", "!./index.js"], { eager: true })') ||
          !mergeAst.text.includes("Object.assign({}, ...Object.values(modules).map((module: any) => module.default))")) {
        throw new Error("Offline skill merge changed; review upstream before adapting the scanner");
      }
      skillFiles = (await readdir(path.join(root, base, "skill"))).filter(name => name.endsWith(".js") && name !== "index.js")
        .sort(compare).map(name => `${base}/skill/${name}`);
    } else skillFiles = [`${base}/skill.js`];
    function addDefinition(entry, parent = null) {
      const id = parent ? `${parent}_${entry.id}` : entry.id;
      const key = `${pack}:${id}`;
      const members = fields(entry.node);
      const dependencies = [];
      const dynamicDependencies = [];
      for (const relation of ["inherit", "group", "global"]) {
        const node = members.get(relation);
        if (!node) continue;
        try {
          const value = literal(node);
          const ids = typeof value === "string" ? [value] : value;
          if (!Array.isArray(ids) || ids.some(v => typeof v !== "string")) throw new Error("Dynamic dependency");
          dependencies.push(...ids.map(target => ({ relation, id: target })));
        } catch { dynamicDependencies.push({ relation, source: location(node) }); }
      }
      const definition = {
        key, id, pack, parent,
        definitionStatus: ts.isObjectLiteralExpression(entry.node) ? "parsed" : "unresolved",
        source: entry.source, dependencies, dynamicDependencies,
        behaviorStatus: "unverified",
      };
      if (definitions.has(key)) {
        diagnostics.push({ kind: "duplicate-definition", id: key, previous: definitions.get(key).source, effective: entry.source });
        // We can locate both sources, but do not assert runtime merge precedence.
        definition.definitionStatus = "unresolved";
      }
      definitions.set(key, definition);
      if (!parent && members.has("subSkill")) {
        const sub = members.get("subSkill");
        if (ts.isObjectLiteralExpression(sub)) {
          for (const child of objectEntries(sub, diagnostics, `${key}:subSkill`)) addDefinition(child, id);
        } else diagnostics.push({ kind: "dynamic-subskills", id: key, source: location(sub) });
      }
    }
    for (const file of skillFiles) {
      const ast = await source(file);
      for (const entry of objectEntries(defaultObject(ast), diagnostics, `${pack}:skills`)) addDefinition(entry);
    }
    packs.push({ id: pack, name: policy.packs[pack].name, version, characterCount: charEntries.length,
      source: `${base}/index.js`, skillSources: skillFiles });
    await source(`${base}/index.js`);
  }
  for (const key of Object.keys(policy.characterOverrides)) {
    if (!characters.some(c => c.key === key)) throw new Error(`Stale version override: ${key}`);
  }
  const definitionsById = new Map();
  for (const definition of definitions.values()) {
    const items = definitionsById.get(definition.id) ?? [];
    items.push(definition);
    definitionsById.set(definition.id, items);
  }
  function translated(pack, id) {
    const local = translations.get(pack)?.get(id);
    if (local) return readText(local);
    const candidates = [...translations.values()].map(table => table.get(id)).filter(Boolean).map(readText);
    const values = [...new Set(candidates.map(item => item.value))];
    if (values.length === 1 && candidates.every(item => item.status === "parsed")) return candidates[0];
    return { value: null, status: candidates.length ? "ambiguous" : "missing", source: null };
  }
  function textFields(pack, id) {
    const name = translated(pack, id);
    const description = translated(pack, `${id}_info`);
    return { name: name.value ?? id, description: description.value,
      textStatus: { name: name.status, description: description.status },
      textSources: { name: name.source, description: description.source } };
  }
  const skillDefinitions = [...definitions.values()].sort(byKey).map(definition => ({
    ...definition, ...textFields(definition.pack, definition.id),
    dependencies: definition.dependencies.map(dep => ({ relation: dep.relation, ...resolveSkill(dep.id, definitionsById) })),
  }));
  const sortedCharacters = characters.sort(byKey).map(character => {
    const name = translated(character.pack, character.id);
    const skills = character.skills.map(id => ({ ...resolveSkill(id, definitionsById), ...textFields(character.pack, id) }));
    return { ...character, name: name.value ?? character.id, nameStatus: name.status, nameSource: name.source, skills,
      implementation: { sourceStatus: "collected", definitionStatus: skills.every(s => s.status === "resolved") ? "resolved" : "unresolved",
        behaviorStatus: "unverified" } };
  });
  function duplicates(items) {
    const ids = new Map();
    for (const item of items) ids.set(item.id, [...(ids.get(item.id) ?? []), item.key]);
    return [...ids].filter(([, keys]) => keys.length > 1).map(([id, keys]) => ({ id, keys })).sort((a, b) => compare(a.id, b.id));
  }
  const unresolvedCharacterSkills = sortedCharacters.flatMap(c => c.skills.filter(s => s.status !== "resolved")
    .map(s => ({ character: c.key, id: s.id, reason: s.reason, definitionKeys: s.definitionKeys })));
  const unresolvedDependencies = skillDefinitions.flatMap(s => s.dependencies.filter(d => d.status !== "resolved")
    .map(d => ({ skill: s.key, ...d })));
  const totals = {
    packs: packs.length,
    sourcedCharacters: sortedCharacters.length,
    sourcedSkillDefinitions: skillDefinitions.length,
    parsedSkillDefinitions: skillDefinitions.filter(s => s.definitionStatus === "parsed").length,
    characterSkillReferences: sortedCharacters.reduce((sum, c) => sum + c.skills.length, 0),
    unresolvedCharacterSkillReferences: unresolvedCharacterSkills.length,
    unresolvedDeclaredDependencies: unresolvedDependencies.length,
    behaviorVerifiedSkills: 0,
  };
  const metadata = {
    schemaVersion: 1,
    upstream: { repository: "https://github.com/libnoname/noname", commit: policy.upstreamCommit, license: "GPL-3.0-only", attribution: "无名杀 / libnoname/noname contributors" },
    officialBaseline: policy.officialBaseline,
    scope: {
      characters: "Exported character tables in apps/core/character; variants retain their original IDs and pack-qualified keys.",
      definitions: "Character-pack skill exports and first-level subSkill objects; offline eager glob included.",
      dependencies: "Static inherit/group/global references only. Runtime grants, generated skills, card/mode skills and dynamic expressions are not exhaustively resolved.",
      verification: "AST definition presence is not runtime behavior verification or official rules equivalence.",
    },
  };
  const catalog = { ...metadata, categories: policy.categories, versionRules: policy.rules, packs, characters: sortedCharacters, skillDefinitions };
  const report = {
    ...metadata, totals,
    categories: Object.keys(policy.categories).map(category => {
      const items = sortedCharacters.filter(c => c.version.category === category);
      return { category, name: policy.categories[category], sourcedCharacters: items.length,
        charactersWithResolvedSkills: items.filter(c => c.implementation.definitionStatus === "resolved").length,
        behaviorVerifiedSkills: 0 };
    }),
    packs: packs.map(pack => ({ ...pack, parsedSkillDefinitions: skillDefinitions.filter(s => s.pack === pack.id && s.definitionStatus === "parsed").length })),
    duplicateCharacterIds: duplicates(sortedCharacters), duplicateSkillIds: duplicates(skillDefinitions),
    unresolvedCharacterSkills, unresolvedDependencies,
    unresolvedDefinitions: skillDefinitions.filter(s => s.definitionStatus !== "parsed").map(s => ({ key: s.key, source: s.source })),
    dynamicDependencies: skillDefinitions.filter(s => s.dynamicDependencies.length).map(s => ({ key: s.key, dependencies: s.dynamicDependencies })),
    unresolvedCharacterNames: sortedCharacters.filter(c => c.nameStatus !== "parsed").map(c => c.key),
    diagnostics,
    sources: [...sourceManifest.values()].sort((a, b) => compare(a.file, b.file)),
  };
  return { catalog, report };
}

export async function writeCatalog(root = repositoryRoot) {
  const { catalog, report } = await createCatalog(root);
  await mkdir(path.join(root, "apps/core/sgs"), { recursive: true });
  await mkdir(path.join(root, "docs"), { recursive: true });
  await writeFile(path.join(root, "apps/core/sgs/catalog.json"), serialize(catalog));
  await writeFile(path.join(root, "docs/sgs-coverage.json"), serialize(report));
  return report;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = await writeCatalog();
  console.log(JSON.stringify(report.totals, null, 2));
}
