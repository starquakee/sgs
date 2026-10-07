// Reproduce only the curated recordings from pinned upstream, then install a complete manifest.
import { readFile, writeFile, mkdir, mkdtemp, rm, rename } from 'node:fs/promises';
import { execFileSync, execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createHash } from 'node:crypto';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { resolve, dirname, basename, join } from 'node:path';
import { readCharacterAudioSource } from './character-audio-source.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = new URL('../../apps/core/sgs/', import.meta.url);
const upstreamCommit = '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a';
const budget = 40 * 1024 * 1024;
const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const run = promisify(execFile);
const plan = await readCharacterAudioSource();
const tree = execFileSync('git', ['ls-tree', '-r', upstreamCommit, 'apps/core/audio/skill', 'apps/core/audio/die'],
  { cwd: root, encoding: 'utf8', windowsHide: true, maxBuffer: 16 * 1024 * 1024 });
const sourceBlobs = new Map(tree.trim().split('\n').map(row => {
  const match = row.match(/^\d+ blob ([a-f\d]{40})\t(.+)$/);
  if (!match) throw new Error('Unexpected pinned audio entry');
  return [match[2], match[1]];
}));
const cache = resolve(root, '.sgs-assets-cache');
await mkdir(cache, { recursive: true });
const stage = await mkdtemp(join(cache, 'character-audio-stage-'));
const entries = Object.entries(plan.clips), collected = new Map();
let cursor = 0, downloaded = 0;
try {
  async function worker() {
    while (cursor < entries.length) {
      const [key, planned] = entries[cursor++];
      const path = `apps/core/audio/${key}.mp3`, sourceGitBlob = sourceBlobs.get(path);
      if (!sourceGitBlob) throw new Error(`Missing pinned audio: ${path}`);
      const file = `audio/${key}.mp3`, sourceUrl = `https://raw.githubusercontent.com/libnoname/noname/${upstreamCommit}/${path}`;
      let bytes, staged;
      try { bytes = await readFile(new URL(file, destination)); } catch {}
      if (!bytes || blobHash(bytes) !== sourceGitBlob) {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            const result = await run(process.platform === 'win32' ? 'curl.exe' : 'curl',
              ['--fail', '--silent', '--show-error', '--location', '--max-time', '45', sourceUrl],
              { windowsHide: true, encoding: 'buffer', maxBuffer: 4 * 1024 * 1024 });
            bytes = result.stdout;
            if (blobHash(bytes) !== sourceGitBlob) throw new Error('Source blob mismatch');
            break;
          } catch (error) {
            if (attempt === 3) throw new Error(`${key}: ${error.message}`);
          }
        }
        staged = resolve(stage, file);
        await mkdir(dirname(staged), { recursive: true });
        await writeFile(staged, bytes);
        downloaded++;
      }
      // Some locked files have a .mp3 name but contain the original WAV audio.
      // Retain those bytes and names rather than transcoding or relabeling them.
      const magic = bytes.subarray(0, 4).toString();
      const validHeader = bytes.subarray(0, 3).toString() === 'ID3' || (bytes[0] === 255 && (bytes[1] & 224) === 224)
        || (magic === 'RIFF' && bytes.subarray(8, 12).toString() === 'WAVE') || ['OggS', 'fLaC'].includes(magic);
      if (bytes.length < 500 || bytes.length > 4 * 1024 * 1024 || blobHash(bytes) !== sourceGitBlob || !validHeader) throw new Error(`Invalid pinned audio: ${key}`);
      collected.set(key, { staged, clip: { ...planned, file, sourceUrl, sourceGitBlob,
        bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } });
    }
  }
  // Settle all workers before cleaning their staging directory on any failure.
  const results = await Promise.allSettled(Array.from({ length: 4 }, worker));
  const failed = results.find(result => result.status === 'rejected');
  if (failed) throw failed.reason;
  const clips = Object.fromEntries(entries.map(([key]) => [key, collected.get(key).clip]));
  const totalBytes = Object.values(clips).reduce((sum, clip) => sum + clip.bytes, 0);
  if (totalBytes > budget) throw new Error(`Hero audio exceeds ${budget} byte budget: ${totalBytes}`);
  const manifest = {
    schemaVersion: 2, upstreamCommit, curatedOn: '2026-10-07',
    attribution: { name: 'Noname / 无名杀', repository: 'https://github.com/libnoname/noname', commit: upstreamCommit, license: 'GPL-3.0',
      licenseUrl: `https://github.com/libnoname/noname/blob/${upstreamCommit}/LICENSE`,
      note: '录音与台词原样取自锁定的上游资源；保留来源，不主张录音原创或另行授权。' },
    scope: `${Object.keys(plan.metadata).length} curated decade/general editions, including earlier strong God/Mou editions approved on 2026-10-07; no standard/refresh character voices.`,
    characters: plan.metadata,
    metadataAudits: Object.fromEntries(Object.entries(plan.dynamicMethods).map(([id, methods]) => [id,
      Object.fromEntries(Object.entries(methods).map(([name, { source, ...evidence }]) => [name, evidence]))])),
    uniqueFiles: Object.keys(clips).length, totalBytes, clips,
  };
  // Every planned byte is verified before changing any shipped file. Preserve
  // all existing recordings and do not replace the manifest on download failure.
  for (const { staged, clip } of collected.values()) if (staged) {
    const target = new URL(clip.file, destination);
    await mkdir(new URL('./', target), { recursive: true });
    await rename(pathToFileURL(staged), target);
  }
  const stagedManifest = join(stage, 'character-audio.json');
  await writeFile(stagedManifest, `${JSON.stringify(manifest, null, 2)}\n`);
  await rename(pathToFileURL(stagedManifest), new URL('character-audio.json', destination));
  console.log(JSON.stringify({ characters: Object.keys(plan.metadata).length, files: manifest.uniqueFiles, bytes: totalBytes, downloaded }));
} finally {
  if (dirname(resolve(stage)) !== cache || !basename(stage).startsWith('character-audio-stage-')) throw new Error('Unexpected audio staging directory');
  await rm(stage, { recursive: true, force: true });
}
