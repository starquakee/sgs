// Import a verified public client snapshot as data; never execute the game client.
// The downloaded bundles/decoder remain in the ignored research cache, not the game.
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../../', import.meta.url);
const inputs = {
  'official-GameGeneralConfig.txt': '9e47f6da6501e6097c762c4578e7a59aa3af326d41e6d05629e920280f1da765',
  'official-GeneralCards.json': 'f4beb9657f50e556e5cbc0941e51e87fcc23012d237e41904ead46dead30889e',
  'official-Skills.json': '626f61eb978e895cd0df8ef77ecb3b97525743627fd9cb12ad2173270bde77bd',
};
const data = {};
for (const [file, expected] of Object.entries(inputs)) {
  const raw = await readFile(new URL(`.sgs-assets-cache/${file}`, root));
  if (createHash('sha256').update(raw).digest('hex') !== expected) throw new Error(`Snapshot changed: review ${file} before importing`);
  data[file] = JSON.parse(raw);
}
const cards = new Map(data['official-GeneralCards.json'].Character.map(c => [c.CharacterId, c]));
const skills = new Map(data['official-Skills.json'].SpellDesc.map(s => [s.SpellId, s.Name]));
const source = {
  product: '三国杀十周年／一将成名', versionTime: '2026-10-01 14:47:58.691', retrievedOn: '2026-10-05',
  publisher: '游卡', homepage: 'https://x.sanguosha.com/',
  manifestUrl: 'https://web.sanguosha.com/10/pc/versionConf.js',
  url: 'https://web.sanguosha.com/10/pc/res/config/Config.sgs?v=8b1229df',
  sha256: '2a88fdb920eacf1bbf3924f70bd5a030ed69507da2b44296cc3e016e1e30e954',
  clientUrl: 'https://web.sanguosha.com/10/pc/sgsGame.sgs?v=ee8133a31',
  clientSha256: '318736ae2dd9257288882aff76ba511727180814134651047674e8cc3f36c8be',
  decoderUrl: 'https://web.sanguosha.com/10/pc/libs/min/resc?v=2020032001',
  decoderSha256: 'af1c27938880ab5edb4c48bb2279ee7da9c263ab04b8ea62db9d751b5dbf9279',
  fields: 'GameGeneralConfig.sgs / GeneralConf[].ModeScore',
  format: 'MSModeType: identity=1,2v2=2,landlord=4,overall=5; MSFIgureType: lord=1,loyalist=2,rebel=3,spy=4,farmer=5,landlord=6,first=7,second=8',
  displayRule: 'The official GeneralInfoVO clamps every ModeScore.score to 0..10. RuleType5 is the supplied overall score, not a locally calculated average.',
  decodedSha256: inputs,
};
const records = data['official-GameGeneralConfig.txt'].GeneralConf
  .filter(c => c.ModeScore?.length && c.InGameModeType?.some(mode => mode === 1 || mode === 2))
  .map(c => {
    const card = cards.get(c.GeneralID);
    return { id: c.GeneralID, name: `${(c.NamePrefix || []).join('')}${c.GeneralName}`,
      country: c.GeneralCountry, sex: card?.gender || c.GeneralGender, hp: card?.hp ?? null,
      skillNames: (card?.Spell || []).map(id => skills.get(id) || `unresolved:${id}`),
      inGameModes: c.InGameModeType, obtainable: c.IsCanGet === 1,
      rawScores: c.ModeScore.map(s => ({ mode: s.ruleType, role: s.figueType || 0, score: s.score })) };
  }).sort((a, b) => a.id - b.id);
if (new Set(records.map(r => r.id)).size !== records.length) throw new Error('Duplicate official general ID');
const header = JSON.stringify({ schemaVersion: 1, source }, null, 2).slice(0, -2);
await writeFile(new URL('scripts/sgs/official-ratings-source.json', root), `${header},\n  "records": [\n${records.map(row => `    ${JSON.stringify(row)}`).join(',\n')}\n  ]\n}\n`);
console.log(`Imported ${records.length} official rating records, retaining exact source IDs and raw scores.`);
