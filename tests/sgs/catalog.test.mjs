import test, { before } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { createCatalog, classifyCharacter, resolveSkill } from "../../scripts/sgs/build-catalog.mjs";
import { parseSource, defaultObject, objectEntries, literal, readText } from "../../scripts/sgs/catalog-source.mjs";

let catalog, report, policy;
before(async () => {
  ({ catalog, report } = await createCatalog());
  policy = JSON.parse(await readFile(new URL("../../scripts/sgs/catalog-versions.json", import.meta.url), "utf8"));
});
const character = key => catalog.characters.find(c => c.key === key);
const skill = key => catalog.skillDefinitions.find(s => s.key === key);

test("generated artifacts exactly reproduce from the locked source and policy", async () => {
  for (const [file, value] of [["apps/core/sgs/catalog.json", catalog], ["docs/sgs-coverage.json", report]]) {
    const committed = await readFile(new URL(`../../${file}`, import.meta.url), "utf8");
    assert.equal(committed, `${JSON.stringify(value, null, 2)}\n`);
  }
  assert.equal(catalog.upstream.commit, "7fcf23ed54d8a7ce2b49ae2c15a054123891a52a");
  assert.equal(report.totals.sourcedCharacters, 2563);
  assert.equal(report.totals.sourcedSkillDefinitions, 9724);
});

test("pack classification is explicit, does not infer versions from ID prefixes", () => {
  for (const [pack, count] of [["xianding", 219], ["huicui", 119], ["sp2", 113]]) {
    assert.equal(catalog.packs.find(p => p.id === pack).characterCount, count);
    assert.equal(classifyCharacter(policy, pack, "no_dc_prefix").category, "decade");
  }
  for (const pack of ["standard", "shenhua", "extra", "yijiang"]) {
    assert.equal(classifyCharacter(policy, pack, "any").category, "common");
  }
  for (const pack of ["mobile", "sb", "onlyOL", "tw", "offline"]) {
    assert.equal(classifyCharacter(policy, pack, "dc_fake").category, "other");
  }
  assert.equal(character("refresh:dc_caozhi").version.category, "pending");
  assert.equal(character("sp2:ol_dingyuan").version.category, "decade");
  assert.throws(() => classifyCharacter(policy, "unknown", "dc_test"), /Unclassified pack/);
  const overridden = structuredClone(policy);
  overridden.characterOverrides["sp2:ol_dingyuan"] = { rule: "mixed-pack" };
  assert.equal(classifyCharacter(overridden, "sp2", "ol_dingyuan").category, "pending");
  assert.equal(classifyCharacter(policy, "sp2", "ol_dingyuan").category, "decade");
});

test("same-name variants retain separate IDs and physical character data", () => {
  const cao = character("standard:caocao");
  assert.equal(cao.name, "曹操");
  assert.equal(cao.faction, "wei");
  assert.equal(cao.hp, 4);
  assert.equal(cao.isLord, true);
  assert.deepEqual(cao.skills.map(s => s.id), ["jianxiong", "hujia"]);
  assert.ok(character("refresh:re_caocao"));
  assert.ok(character("sb:sb_caocao"));
  assert.equal(character("clan:clan_hanfu").hp, 3);
  assert.equal(character("clan:clan_hanfu").maxHp, 4);
  assert.deepEqual(character("key:key_umi2").skills, []);
  assert.equal(character("key:key_umi2").isUnseen, true);
});

test("cross-pack direct skills and inherited skills resolve to executable source definitions", () => {
  const lidian = character("standard:old_re_lidian");
  assert.deepEqual(lidian.skills.map(s => s.definitionKeys), [["refresh:xunxun"], ["refresh:wangxi"]]);
  assert.ok(lidian.skills.every(s => s.status === "resolved"));
  const duanliang = skill("offline:jdsbduanliang");
  assert.equal(duanliang.source.file, "apps/core/character/offline/skill/offline_jiudin.js");
  assert.deepEqual(duanliang.dependencies.find(d => d.relation === "inherit").definitionKeys, ["sb:sbduanliang"]);
  const sub = skill("xianding:dcshiyu_nodamage");
  assert.equal(sub.parent, "dcshiyu");
  assert.equal(sub.source.line, 73);
  assert.equal(sub.definitionStatus, "parsed");
});

test("every character skill joins a parsed definition or has an explicit unresolved reason", () => {
  const definitions = new Map(catalog.skillDefinitions.map(s => [s.key, s]));
  for (const c of catalog.characters) {
    for (const ref of c.skills) {
      for (const key of ref.definitionKeys) assert.ok(definitions.has(key), `${c.key}: ${key}`);
      if (ref.status === "resolved") {
        assert.equal(ref.definitionKeys.length, 1);
        assert.equal(definitions.get(ref.definitionKeys[0]).definitionStatus, "parsed");
      } else assert.ok(ref.reason, `${c.key}: ${ref.id}`);
    }
  }
  assert.equal(report.unresolvedCharacterSkills.length, 4);
  assert.equal(character("key:key_misa").skills.find(s => s.id === "dualside").status, "unresolved");
  assert.ok(report.unresolvedDependencies.some(d => d.skill === "huicui:chijian_qinggang" && d.id === "qinggang_skill"));
});

test("duplicate IDs cannot silently resolve by arbitrary load order or by translation text", () => {
  assert.equal(new Set(catalog.characters.map(c => c.key)).size, catalog.characters.length);
  assert.equal(new Set(catalog.skillDefinitions.map(s => s.key)).size, catalog.skillDefinitions.length);
  assert.deepEqual(report.duplicateCharacterIds, []);
  assert.deepEqual(report.duplicateSkillIds, []);
  const candidates = new Map([["shared", [
    { key: "a:shared", definitionStatus: "parsed" },
    { key: "b:shared", definitionStatus: "parsed" },
  ]]]);
  assert.equal(resolveSkill("shared", candidates).reason, "ambiguous-definition");
  assert.equal(resolveSkill("translated_but_not_defined", candidates).reason, "missing-definition");
  assert.equal(skill("tw:twgongsun_shadow").definitionStatus, "unresolved");
  assert.ok(report.diagnostics.some(d => d.kind === "duplicate-definition" && d.id === "tw:twgongsun_shadow"));
});

test("static parsing reports duplicate properties and never executes imports, getters or expressions", () => {
  const ast = parseSource("fixture.js", `
    import "does-not-exist";
    const skills = { example: { content() { throw new Error("never run"); } },
      example: { inherit: "real" }, get dynamic() { throw new Error("never run"); },
      ...(() => { throw new Error("never run"); })() };
    export default skills;`);
  const diagnostics = [];
  const entries = objectEntries(defaultObject(ast), diagnostics, "fixture");
  assert.deepEqual(literal(entries.find(e => e.id === "example").node), { inherit: "real" });
  assert.equal(readText(entries.find(e => e.id === "dynamic")).status, "dynamic");
  assert.deepEqual(diagnostics.map(d => d.kind), ["duplicate-property", "dynamic-member"]);
  assert.equal(character("sixiang:std_nanhualaoxian").nameStatus, "dynamic");
});

test("source locations and fingerprints are reviewable and current", async () => {
  const files = new Map();
  for (const item of report.sources) {
    const raw = await readFile(new URL(`../../${item.file}`, import.meta.url));
    assert.equal(createHash("sha256").update(raw).digest("hex"), item.sha256, item.file);
    files.set(item.file, raw.toString("utf8").split(/\r?\n/));
  }
  for (const item of [...catalog.characters, ...catalog.skillDefinitions]) {
    const lines = files.get(item.source.file);
    assert.ok(lines && item.source.line >= 1 && item.source.line <= lines.length, item.key);
    // Location must point to the actual property (subskills use the local suffix).
    const localId = item.parent ? item.id.slice(item.parent.length + 1) : item.id;
    assert.ok(lines[item.source.line - 1].includes(localId), `${item.key}: source location`);
  }
});

test("source collection and definition parsing never imply official or behavioral coverage", () => {
  assert.equal(report.officialBaseline.totalCharacters, null);
  assert.equal(report.officialBaseline.totalSkills, null);
  assert.equal(report.officialBaseline.coveragePercent, null);
  assert.equal(report.totals.behaviorVerifiedSkills, 0);
  assert.ok(catalog.characters.every(c => c.implementation.behaviorStatus === "unverified" && c.version.officialStatus === "unverified"));
  assert.ok(catalog.skillDefinitions.every(s => s.behaviorStatus === "unverified"));
  assert.equal(report.categories.find(c => c.category === "decade").sourcedCharacters, 451);
});
