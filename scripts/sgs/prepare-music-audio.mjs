// Reproduce one original battle track, with pinned bytes and no transcoding.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = new URL('../../apps/core/sgs/', import.meta.url);
const upstreamCommit = '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a';
const key = 'background/music_default';
const path = `apps/core/audio/${key}.mp3`;
const sourceGitBlob = 'eaccd4570b89a824cf5300e5d8601d605828c054';
const expectedSha256 = '5fcefad6d89c2471c2aae05735c7d0cf6faeba015c2679bc6060afb85f8fef9d';
const tree = execFileSync('git', ['ls-tree', upstreamCommit, path], {
  cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
});
if (!tree.startsWith(`100644 blob ${sourceGitBlob}\t`)) throw new Error('Pinned music tree changed');
const sourceUrl = `https://raw.githubusercontent.com/libnoname/noname/${upstreamCommit}/${path}`;
const file = `audio/${key}.mp3`, target = new URL(file, destination);
const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const valid = bytes => bytes?.length === 3543457 && blobHash(bytes) === sourceGitBlob && sha256(bytes) === expectedSha256;
let bytes;
try { bytes = await readFile(target); } catch {}
if (!valid(bytes)) {
  bytes = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl',
    ['--fail', '--silent', '--show-error', '--location', '--max-time', '45', sourceUrl],
    { windowsHide: true, maxBuffer: 4 * 1024 * 1024 });
  if (!valid(bytes)) throw new Error('Music source bytes or hash mismatch');
  await mkdir(new URL('./', target), { recursive: true });
  await writeFile(target, bytes);
}
const manifest = {
  schemaVersion: 1, upstreamCommit,
  attribution: { name: 'Noname / 无名杀', repository: 'https://github.com/libnoname/noname', commit: upstreamCommit,
    license: 'GPL-3.0', licenseUrl: `https://github.com/libnoname/noname/blob/${upstreamCommit}/LICENSE`,
    note: '音乐原样取自锁定上游资源，保留来源，不主张录音原创或另行授权。' },
  scope: 'One original battle track, looping only in the current SGS table on the shared unlocked audio context.',
  uniqueFiles: 1, totalBytes: bytes.length,
  clips: { [key]: { key, file, label: '原版对局音乐', sourceUrl, sourceGitBlob,
    bytes: bytes.length, sha256: sha256(bytes) } },
};
await writeFile(new URL('music-audio.json', destination), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ files: 1, bytes: bytes.length, sourceGitBlob }));
