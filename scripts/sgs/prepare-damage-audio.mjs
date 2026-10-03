// Reproduce only the pinned native damage/armor impact recordings.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = new URL('../../apps/core/sgs/', import.meta.url);
const upstreamCommit = '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a';
const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const clips = {};
for (const armor of [false, true]) {
  for (const [nature, title] of [['', '普通'], ['fire', '火焰'], ['thunder', '雷电'], ...(!armor ? [['ice', '冰冻']] : [])]) {
    for (const heavy of [false, true]) {
      const key = `effect/${armor ? 'hujia_' : ''}damage${nature ? `_${nature}` : ''}${heavy ? '2' : ''}`;
      const path = `apps/core/audio/${key}.mp3`;
      const tree = execFileSync('git', ['ls-tree', upstreamCommit, path], { cwd: root, encoding: 'utf8', windowsHide: true });
      const sourceGitBlob = tree.match(/^\d+ blob ([a-f\d]{40})\t/)?.[1];
      if (!sourceGitBlob) throw new Error(`Missing pinned impact: ${path}`);
      const file = `audio/${key}.mp3`;
      const sourceUrl = `https://raw.githubusercontent.com/libnoname/noname/${upstreamCommit}/${path}`;
      const target = new URL(file, destination);
      let bytes;
      try { bytes = await readFile(target); } catch {}
      if (!bytes || blobHash(bytes) !== sourceGitBlob) {
        for (let attempt = 0; attempt < 4; attempt++) {
          try {
            // The system curl honors the workstation's configured HTTPS
            // proxy; Node 22 fetch does not use it automatically.
            bytes = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl',
              ['--fail', '--silent', '--show-error', '--location', '--max-time', '45', sourceUrl],
              { windowsHide: true, maxBuffer: 512 * 1024 });
            if (bytes.length > 512 * 1024 || blobHash(bytes) !== sourceGitBlob) throw new Error('Source blob mismatch');
            break;
          } catch (error) {
            if (attempt === 3) throw new Error(`${key}: ${error.message}`);
          }
        }
        await mkdir(new URL('./', target), { recursive: true });
        await writeFile(target, bytes);
      }
      clips[key] = { key, file, nature: nature || 'normal', armor, heavy,
        label: `${armor ? '护甲 · ' : ''}${title}${heavy ? '重击' : '受击'}`,
        sourceUrl, sourceGitBlob, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
    }
  }
}
const manifest = {
  schemaVersion: 1, upstreamCommit,
  attribution: { name: 'Noname / 无名杀', repository: 'https://github.com/libnoname/noname', commit: upstreamCommit,
    license: 'GPL-3.0', licenseUrl: `https://github.com/libnoname/noname/blob/${upstreamCommit}/LICENSE`,
    note: '音效原样取自锁定上游资源，保留来源，不主张录音原创或另行授权。' },
  scope: 'Native damage and armor impacts; one damage versus two or more, with fire/thunder/ice where provided.',
  uniqueFiles: Object.keys(clips).length,
  totalBytes: Object.values(clips).reduce((sum, clip) => sum + clip.bytes, 0), clips,
};
await writeFile(new URL('damage-audio.json', destination), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ files: manifest.uniqueFiles, bytes: manifest.totalBytes }));
