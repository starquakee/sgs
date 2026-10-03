// Derive selected recordings from the pinned engine's real resolver and metadata.
import { readFile } from 'node:fs/promises';
import { parseSource, defaultObject, fields, literal, ts } from './catalog-source.mjs';
import voices from '../../apps/core/character/xianding/voices.js';

export async function readCharacterAudioSource() {
  const core = new URL('../../apps/core/', import.meta.url);
  const selection = JSON.parse(await readFile(new URL('character-audio-selection.json', import.meta.url), 'utf8'));
  const readAST = async file => parseSource(file, await readFile(new URL(file, core), 'utf8'));
  const [characterAST, skillAST, indexAST, translateAST, audioSource] = await Promise.all([
    readAST('character/xianding/character.js'), readAST('character/xianding/skill.js'), readAST('character/xianding/index.js'),
    readAST('character/xianding/translate.js'),
    readFile(new URL('noname/get/audio.ts', core), 'utf8'),
  ]);
  const translates = {};
  for (const [key, value] of fields(defaultObject(translateAST))) {
    try { translates[key] = literal(value); } catch { /* only plain skill titles are needed */ }
  }
  const sourceCharacters = fields(defaultObject(characterAST));
  const sourceSkills = fields(defaultObject(skillAST));
  let substitutes;
  function visit(node) {
    if (ts.isPropertyAssignment(node) && node.name.getText(indexAST) === 'characterSubstitute') substitutes = literal(node.initializer);
    ts.forEachChild(node, visit);
  }
  visit(indexAST);
  if (!substitutes) throw new Error('Missing native character substitutes');
  const characters = {}, skills = {}, characterSubstitute = {}, metadata = {};
  function addSkill(id, node) {
    const props = fields(node);
    const info = {};
    for (const key of ['audio', 'audioname', 'audioname2', 'logAudio', 'logAudio2', 'inherit']) {
      if (props.has(key)) info[key] = literal(props.get(key)); // fail on dynamic metadata
    }
    if (info.inherit) throw new Error(`Audit inherited audio first: ${id}`);
    skills[id] = info;
    const audible = Object.hasOwn(info, 'audio') && info.audio !== false ? [id] : [];
    if (props.has('subSkill')) for (const [suffix, child] of fields(props.get('subSkill'))) audible.push(...addSkill(`${id}_${suffix}`, child));
    return audible;
  }
  for (const [id, selected] of Object.entries(selection)) {
    const character = literal(sourceCharacters.get(id));
    characters[id] = { tempname: [], dieAudios: [], isNull: false, ...character };
    characterSubstitute[id] = substitutes[id] || [];
    const forms = [id, ...characterSubstitute[id].map(([form, extra]) => {
      if (extra.length) throw new Error(`Audit custom skin metadata first: ${form}`);
      return form;
    })];
    const audible = character.skills.flatMap(skill => addSkill(skill, sourceSkills.get(skill)));
    if (!audible.length) throw new Error(`No native skill voices: ${id}`);
    metadata[id] = { ...selected, pack: 'xianding', skills: audible, forms, clipKeys: [] };
  }
  const audioJS = ts.transpileModule(audioSource.replace(/^import[^\n]+\n/, '').replace('export class Audio', 'class Audio'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
  }).outputText;
  const lib = { skill: skills, characterSubstitute, translate: { ...translates, ...voices } };
  const get = { info: id => skills[id], character: id => characters[id] || { tempname: [], dieAudios: [], isNull: true },
    convertedCharacter: () => ({ tempname: [], dieAudios: [] }) };
  const Audio = new Function('lib', 'get', `${audioJS}\nreturn Audio;`)(lib, get);
  const clips = {};
  const original = Object.getOwnPropertyDescriptor(Array.prototype, 'addArray');
  // Native Audio uses this engine array helper. Limit it to this synchronous audit.
  Object.defineProperty(Array.prototype, 'addArray', { configurable: true, value(values) { for (const value of values) if (!this.includes(value)) this.push(value); return this; } });
  try {
    for (const [id, meta] of Object.entries(metadata)) {
      for (const form of meta.forms) {
        const player = { name: id, sex: characters[id].sex, skin: { name: form }, tempname: form === id ? [] : [form] };
        const sources = meta.skills.map(skill => [skill, Audio.skill({ skill, player })]);
        sources.push(['die', Audio.die({ player })]);
        for (const [skill, audio] of sources) for (const entry of audio.audioList) {
          if (!/^(skill|die)\/[a-z0-9_]+\.mp3$/.test(entry.file) || !entry.text) throw new Error(`Unresolved recording: ${id}/${skill}/${entry.file}`);
          const key = entry.file.replace(/\.mp3$/, '');
          const title = skill === 'die' ? '阵亡' : translates[skill] || translates[skill.replace(/_[^_]+$/, '')];
          if (!title) throw new Error(`Missing skill label: ${skill}`);
          clips[key] ||= { key, file: `audio/${entry.file}`, character: id, label: `${meta.displayName}${form === id ? '' : '（转换形态）'} · ${title}`, text: entry.text };
          if (!meta.clipKeys.includes(key)) meta.clipKeys.push(key);
        }
      }
    }
  } finally {
    if (original) Object.defineProperty(Array.prototype, 'addArray', original); else delete Array.prototype.addArray;
  }
  return { metadata, clips, skills, characters, characterSubstitute };
}
