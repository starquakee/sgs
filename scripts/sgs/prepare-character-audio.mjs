// Reproduce the selected recent generals' recordings from the pinned source.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readCharacterAudioSource } from './character-audio-source.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = new URL('../../apps/core/sgs/', import.meta.url);
const upstreamCommit = '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a';
const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const plan = await readCharacterAudioSource();
const clips = {};
for (const [key, planned] of Object.entries(plan.clips)) {
  const path = `apps/core/audio/${key}.mp3`;
  const tree = execFileSync('git', ['ls-tree', upstreamCommit, path], { cwd: root, encoding: 'utf8', windowsHide: true });
  const sourceGitBlob = tree.match(/^\d+ blob ([a-f\d]{40})\t/)?.[1];
  if (!sourceGitBlob) throw new Error(`Missing pinned audio: ${path}`);
  const file = `audio/${key}.mp3`;
  const sourceUrl = `https://raw.githubusercontent.com/libnoname/noname/${upstreamCommit}/${path}`;
  const target = new URL(file, destination);
  let bytes;
  try { bytes = await readFile(target); } catch {}
  if (!bytes || blobHash(bytes) !== sourceGitBlob) {
    for (let attempt = 0; attempt < 4; attempt++) {
      try {
        bytes = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl',
          ['--fail', '--silent', '--show-error', '--location', '--max-time', '45', sourceUrl],
          { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
        if (blobHash(bytes) !== sourceGitBlob) throw new Error('Source blob mismatch');
        break;
      } catch (error) {
        if (attempt === 3) throw new Error(`${key}: ${error.message}`);
      }
    }
    await mkdir(new URL('./', target), { recursive: true });
    await writeFile(target, bytes);
  }
  clips[key] = { ...planned, file,
    sourceUrl, sourceGitBlob, bytes: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex') };
}
const manifest = {
  schemaVersion: 2, upstreamCommit,
  attribution: { name: 'Noname / 无名杀', repository: 'https://github.com/libnoname/noname',
    commit: upstreamCommit, license: 'GPL-3.0',
    licenseUrl: `https://github.com/libnoname/noname/blob/${upstreamCommit}/LICENSE`,
    note: '录音与台词原样取自锁定的上游资源；保留来源，不主张录音原创或另行授权。' },
  scope: 'Nine selected 2025–2026 decade generals, including native skill aliases, conversion forms and death. No standard/refresh voices.',
  characters: plan.metadata,
  uniqueFiles: Object.keys(clips).length,
  totalBytes: Object.values(clips).reduce((sum, clip) => sum + clip.bytes, 0), clips,
};
await writeFile(new URL('character-audio.json', destination), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ files: manifest.uniqueFiles, bytes: manifest.totalBytes }));
