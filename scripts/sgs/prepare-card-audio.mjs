// SGS card audio pack. Pinned upstream recordings, with clearly labeled local
// Windows Chinese speech for Peach, absent from the upstream spoken pack.
// Run with Node 22. Sources stay locked to the versions below.
import { readFile, writeFile, mkdir, unlink } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = new URL('../../apps/core/sgs/', import.meta.url);
const upstreamCommit = '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const entries = execFileSync('git', ['ls-tree', '-r', upstreamCommit, 'apps/core/audio/card'], {
  cwd: root, encoding: 'utf8', windowsHide: true,
}).trim().split(/\r?\n/).map(line => {
  const [, sourceGitBlob, path] = line.match(/^\d+ blob ([a-f\d]+)\t(.+)$/) || [];
  if (!path) throw new Error(`Invalid source tree line: ${line}`);
  return { path, sourceGitBlob };
}).filter(entry => /\/card\/(male|female)\//.test(entry.path)).map(entry => ({
  key: entry.path.replace('apps/core/audio/', '').replace(/\.mp3$/, ''),
  file: entry.path.replace('apps/core/', ''),
  sourceUrl: `https://raw.githubusercontent.com/libnoname/noname/${upstreamCommit}/${entry.path}`,
  sourceGitBlob: entry.sourceGitBlob,
  kind: 'upstream-card-audio',
}));
const records = new Map();
let next = 0;
async function worker() {
  while (next < entries.length) {
    const entry = entries[next++];
    const target = new URL(entry.file, destination);
    let bytes;
    try { bytes = await readFile(target); } catch {}
    if (!bytes || blobHash(bytes) !== entry.sourceGitBlob) {
      for (let attempt = 0; attempt < 4; attempt++) {
        try {
          const response = await fetch(entry.sourceUrl, { signal: AbortSignal.timeout(45000) });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          bytes = Buffer.from(await response.arrayBuffer());
          if (bytes.length > 512 * 1024 || blobHash(bytes) !== entry.sourceGitBlob) throw new Error('Source blob mismatch');
          break;
        } catch (error) {
          if (attempt === 3) throw new Error(`${entry.key}: ${error.message}`);
        }
      }
      await mkdir(new URL('./', target), { recursive: true });
      await writeFile(target, bytes);
    }
    records.set(entry.key, { ...entry, bytes: bytes.length, sha256: sha256(bytes) });
  }
}
await Promise.all(Array.from({ length: 8 }, worker));
// The source engine has only a healing effect for Peach. Generate the spoken
// name locally; never label these two small supplements as official recordings.
let previous;
try { previous = JSON.parse(await readFile(new URL('card-audio.json', destination), 'utf8')); } catch {}
const generated = ['male', 'female'].map(sex => ({
  key: `card/${sex}/tao`, file: `audio/card/${sex}/tao.mp3`, kind: 'system-speech',
  speech: { engine: 'Windows System.Speech / SAPI', voice: sex === 'male' ? 'Microsoft Kangkang' : 'Microsoft Huihui Desktop', locale: 'zh-CN', text: '桃', rate: 0 },
  recipe: 'scripts/sgs/prepare-peach-voice.ps1',
  note: '桃：本机中文系统语音补充，非官方真人配音；其余卡牌使用锁定上游录音。',
}));
let regenerate = false;
for (const clip of generated) {
  try {
    const bytes = await readFile(new URL(clip.file, destination));
    if (sha256(bytes) !== previous?.clips?.[clip.key]?.sha256) regenerate = true;
  } catch { regenerate = true; }
}
if (regenerate) {
  const script = fileURLToPath(new URL('prepare-peach-voice.ps1', import.meta.url));
  const audioDirectory = fileURLToPath(new URL('audio/card/', destination));
  // PowerShell 7's System.Speech sees the installed Chinese OneCore male voice;
  // Windows PowerShell 5 only exposes the older desktop voices on this host.
  execFileSync(process.env.SGS_POWERSHELL || 'pwsh.exe', ['-NoProfile', '-NonInteractive', '-File', script, '-OutputDirectory', audioDirectory], { windowsHide: true, stdio: 'pipe' });
  for (const clip of generated) {
    const wave = new URL(clip.file.replace(/\.mp3$/, '.wav'), destination);
    execFileSync(process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-nostdin', '-y', '-i', fileURLToPath(wave), '-ac', '1', '-ar', '24000', '-b:a', '48k', '-map_metadata', '-1', '-write_xing', '0', fileURLToPath(new URL(clip.file, destination))], { windowsHide: true });
    await unlink(wave);
  }
}
for (const clip of generated) {
  const bytes = await readFile(new URL(clip.file, destination));
  records.set(clip.key, { ...clip, bytes: bytes.length, sha256: sha256(bytes) });
}
const clips = Object.fromEntries([...records].sort(([a], [b]) => a.localeCompare(b)));
const aliases = {};
for (const sex of ['male', 'female']) {
  for (const [name, clip] of Object.entries({ huosha: 'sha_fire', leisha: 'sha_thunder', icesha: 'sha_ice', cisha: 'sha_stab' })) {
    aliases[`card/${sex}/${name}`] = `card/${sex}/${clip}`;
  }
}
const manifest = {
  schemaVersion: 1, upstreamCommit,
  attribution: [
    { name: 'Noname / 无名杀', repository: 'https://github.com/libnoname/noname', commit: upstreamCommit,
      license: 'GPL-3.0', licenseUrl: `https://github.com/libnoname/noname/blob/${upstreamCommit}/LICENSE` },
    { name: 'Microsoft Windows 中文系统语音（桃）', engine: 'System.Speech / SAPI',
      note: '本机合成的桃字读音；非官方游戏配音，未分发系统语音引擎。' },
  ],
  scope: 'All pinned Noname card recordings plus two explicitly labeled local Chinese system voices saying Peach; no background music or hero skill/death packs.',
  uniqueFiles: Object.keys(clips).length,
  totalBytes: Object.values(clips).reduce((total, clip) => total + clip.bytes, 0),
  aliases, clips,
};
await writeFile(new URL('card-audio.json', destination), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ files: manifest.uniqueFiles, bytes: manifest.totalBytes, aliases: Object.keys(aliases).length }));
