// Derive curated recordings from static pinned metadata and the native resolver.
// Game modules, translation modules/getters and logAudio methods are never run here.
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { parseSource, defaultObject, fields as readFields, literal, propertyName, location, ts } from './catalog-source.mjs';
const fields = node => node ? readFields(node) : new Map();

export async function readCharacterAudioSource(options = {}) {
  const core = new URL('../../apps/core/', import.meta.url);
  const selection = options.selection || JSON.parse(await readFile(new URL('character-audio-selection.json', import.meta.url), 'utf8'));
  const packs = new Map(), translates = {}, voices = {}, dynamicMethods = {};
  const readAST = async file => parseSource(file, await readFile(new URL(file, core), 'utf8'));
  async function loadPack(pack) {
    if (packs.has(pack)) return packs.get(pack);
    if (!/^[a-z0-9_]+$/.test(pack)) throw new Error(`Invalid source pack: ${pack}`);
    const prefix = `character/${pack}/`;
    const [characterAST, skillAST, indexAST, translateAST, voiceAST] = await Promise.all([
      readAST(prefix + 'character.js'), readAST(prefix + 'skill.js'), readAST(prefix + 'index.js'),
      readAST(prefix + 'translate.js'), readAST(prefix + 'voices.js'),
    ]);
    const data = { characters: fields(defaultObject(characterAST)), skills: new Map(), substitutes: {} };
    const indexSkill = (id, node) => {
      data.skills.set(id, node);
      for (const [suffix, child] of fields(fields(node).get('subSkill'))) indexSkill(`${id}_${suffix}`, child);
    };
    for (const [id, node] of fields(defaultObject(skillAST))) indexSkill(id, node);
    function visit(node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(indexAST) === 'characterSubstitute') data.substitutes = literal(node.initializer);
      ts.forEachChild(node, visit);
    }
    visit(indexAST);
    for (const [key, node] of fields(defaultObject(translateAST))) {
      try { const value = literal(node); if (typeof value === 'string') translates[key] = value; } catch { /* Rich descriptions are not audio labels. */ }
    }
    for (const [key, node] of fields(defaultObject(voiceAST))) {
      const value = literal(node);
      if (typeof value !== 'string') throw new Error(`Non-text voice: ${pack}/${key}`);
      if (Object.hasOwn(voices, key) && voices[key] !== value) throw new Error(`Conflicting voice text: ${key}`);
      voices[key] = value;
    }
    packs.set(pack, data);
    return data;
  }
  for (const selected of Object.values(selection)) {
    await loadPack(selected.pack || 'xianding');
    for (const pack of Object.values(selected.skillSources || {})) await loadPack(pack);
  }
  const librarySkills = fields(defaultObject(await readAST('noname/library/skill.js')));
  const selectedNames = new Set(Object.entries(selection).flatMap(([id, selected]) =>
    [id, ...(packs.get(selected.pack || 'xianding').substitutes[id] || []).map(([form]) => form)]));
  const characters = {}, skills = {}, skillPacks = {}, characterSubstitute = {}, metadata = {};
  const resolving = new Set();
  function resolveNode(id, pack) { return packs.get(pack)?.skills.get(id) || librarySkills.get(id); }
  function addSkill(id, preferredPack, overrides = {}) {
    const pack = overrides[id] || preferredPack;
    if (Object.hasOwn(skills, id)) {
      if (skillPacks[id] !== pack && resolveNode(id, pack) !== librarySkills.get(id)) throw new Error(`Conflicting skill source: ${id}`);
      return;
    }
    const node = resolveNode(id, pack);
    if (!node) throw new Error(`Missing skill metadata: ${pack}:${id}`);
    if (resolving.has(id)) throw new Error(`Cyclic skill metadata: ${id}`);
    resolving.add(id);
    const props = fields(node), own = {};
    for (const key of ['audio', 'audioname', 'audioname2', 'inherit']) {
      if (props.has(key)) own[key] = literal(props.get(key));
      else if (node.properties?.some(member => member.name && propertyName(member.name) === key)) throw new Error(`Dynamic ${key} needs an explicit audit: ${id}`);
    }
    let inherited = {};
    if (own.inherit) { addSkill(own.inherit, pack, overrides); inherited = skills[own.inherit]; }
    const info = { ...inherited, ...own };
    delete info.inherit;
    skills[id] = info; skillPacks[id] = pack;
    for (const member of node.properties || []) {
      if (!member.name) continue;
      const key = propertyName(member.name);
      if (!['logAudio', 'logAudio2'].includes(key)) continue;
      const code = member.getText();
      dynamicMethods[id] ||= {};
      dynamicMethods[id][key] = { ...location(member), source: code, sha256: createHash('sha256').update(code).digest('hex') };
      // All possible clips are enumerated from static audio/audioname metadata.
      // Native runtime keeps its real branch resolver; focused tests exercise it.
      if (info.audio === undefined) throw new Error(`Dynamic-only audio needs a bounded variant audit: ${id}`);
    }
    const references = value => {
      if (typeof value === 'string' && /^[a-z_][a-z0-9_]*$/i.test(value) && !['true', 'false'].includes(value)) {
        if (!resolveNode(value, overrides[value] || pack)) throw new Error(`Unknown audio reference: ${id} -> ${value}`);
        addSkill(value, pack, overrides);
      } else if (Array.isArray(value)) {
        if (value.length === 2 && typeof value[0] === 'string' && typeof value[1] === 'number' && !resolveNode(value[0], overrides[value[0]] || pack)) return;
        value.forEach(references);
      }
    };
    references(info.audio);
    for (const [name, value] of Object.entries(info.audioname2 || {})) if (selectedNames.has(name)) references(value);
    for (const [suffix] of fields(props.get('subSkill'))) addSkill(`${id}_${suffix}`, pack, overrides);
    resolving.delete(id);
  }
  function audibleTree(id, pack) {
    const result = skills[id]?.audio !== undefined && skills[id].audio !== false ? [id] : [];
    for (const [suffix] of fields(fields(resolveNode(id, pack)).get('subSkill'))) result.push(...audibleTree(`${id}_${suffix}`, pack));
    return result;
  }
  for (const [id, selected] of Object.entries(selection)) {
    const pack = selected.pack || 'xianding', data = packs.get(pack);
    const character = literal(data.characters.get(id));
    if (!Array.isArray(character.skills)) throw new Error(`Missing initial skills: ${pack}:${id}`);
    characters[id] = { tempname: [], dieAudios: [], isNull: false, ...character };
    characterSubstitute[id] = data.substitutes[id] || [];
    const forms = [id, ...characterSubstitute[id].map(([form, extra]) => {
      if (extra.length) throw new Error(`Audit custom skin metadata first: ${form}`);
      return form;
    })];
    const roots = [...character.skills, ...(selected.extraSkills || [])];
    for (const skill of roots) addSkill(skill, pack, selected.skillSources);
    const audible = roots.flatMap(skill => audibleTree(skill, selected.skillSources?.[skill] || pack));
    for (const [alias, target] of Object.entries(selected.skillAliases || {})) {
      addSkill(target, pack, selected.skillSources);
      if (skills[alias]?.audio !== undefined && skills[alias].audio !== target) throw new Error(`Conflicting backup audio: ${alias}`);
      if (skills[alias]?.audio === undefined) {
        const chooseButton = fields(resolveNode(alias.replace(/_backup$/, ''), pack)).get('chooseButton');
        const backup = chooseButton?.properties?.find(member => member.name && propertyName(member.name) === 'backup');
        let verified = false;
        const visit = node => {
          if (ts.isReturnStatement(node) && ts.isObjectLiteralExpression(node.expression)) {
            const audio = fields(node.expression).get('audio');
            if (audio && literal(audio) === target) verified = true;
          }
          ts.forEachChild(node, visit);
        };
        if (backup) visit(backup);
        if (!verified) throw new Error(`Unverified dynamic backup audio: ${alias}`);
      }
      skills[alias] = { audio: target }; skillPacks[alias] = pack;
      audible.push(alias);
    }
    if (!audible.length) throw new Error(`No native skill voices: ${id}`);
    metadata[id] = { ...selected, pack, skills: [...new Set(audible)], forms, clipKeys: [] };
  }
  const audioSource = await readFile(new URL('noname/get/audio.ts', core), 'utf8');
  const audioJS = ts.transpileModule(audioSource.replace(/^import[^\n]+\n/, '').replace('export class Audio', 'class Audio'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const lib = { skill: skills, characterSubstitute, translate: { ...translates, ...voices } };
  const get = { info: id => skills[id], character: id => characters[id] || { tempname: [], dieAudios: [], isNull: true },
    convertedCharacter: () => ({ tempname: [], dieAudios: [] }) };
  const Audio = new Function('lib', 'get', `${audioJS}\nreturn Audio;`)(lib, get);
  const clips = {}, original = Object.getOwnPropertyDescriptor(Array.prototype, 'addArray');
  Object.defineProperty(Array.prototype, 'addArray', { configurable: true, value(values) { for (const value of values) if (!this.includes(value)) this.push(value); return this; } });
  try {
    for (const [id, meta] of Object.entries(metadata)) for (const form of meta.forms) {
      const player = { name: id, sex: characters[id].sex, skin: { name: form }, tempname: form === id ? [] : [form] };
      const sources = meta.skills.map(skill => [skill, Audio.skill({ skill, player })]);
      sources.push(['die', Audio.die({ player })]);
      for (const [skill, audio] of sources) for (const entry of audio.audioList) {
        if (!/^(skill|die)\/[a-z0-9_]+\.mp3$/.test(entry.file) || !entry.text) throw new Error(`Unresolved recording: ${id}/${skill}/${entry.file}`);
        const key = entry.file.replace(/\.mp3$/, '');
        const alias = selectedAlias(meta, skill);
        const title = skill === 'die' ? '阵亡' : translates[skill] || translates[alias] || translates[skill.replace(/_[^_]+$/, '')];
        if (!title) throw new Error(`Missing skill label: ${skill}`);
        clips[key] ||= { key, file: `audio/${entry.file}`, character: id, label: `${meta.displayName}${form === id ? '' : '（转换形态）'} · ${title}`, text: entry.text };
        if (!meta.clipKeys.includes(key)) meta.clipKeys.push(key);
      }
    }
  } finally {
    if (original) Object.defineProperty(Array.prototype, 'addArray', original); else delete Array.prototype.addArray;
  }
  return { metadata, clips, skills, characters, characterSubstitute, translates, voices, dynamicMethods };
}
function selectedAlias(meta, skill) { return meta.skillAliases?.[skill] || ''; }
