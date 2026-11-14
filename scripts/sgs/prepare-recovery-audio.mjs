// Reproduce the pinned native recovery effect without altering its recording.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const destination = new URL('../../apps/core/sgs/', import.meta.url);
const upstreamCommit = '7fcf23ed54d8a7ce2b49ae2c15a054123891a52a';
const key = 'effect/recover';
const path = `apps/core/audio/${key}.mp3`;
const sourceGitBlob = '1472462d35dc98d4206e5fb33e13970283e2a92d';
const tree = execFileSync('git', ['ls-tree', upstreamCommit, path], {
  cwd: root, encoding: 'utf8', windowsHide: true, env: { ...process.env, GIT_NO_LAZY_FETCH: '1' },
});
if (!tree.startsWith(`100644 blob ${sourceGitBlob}\t`)) throw new Error('Pinned recovery audio tree changed');
const sourceUrl = `https://raw.githubusercontent.com/libnoname/noname/${upstreamCommit}/${path}`;
const file = `audio/${key}.mp3`;
const target = new URL(file, destination);
const blobHash = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
let bytes;
try { bytes = await readFile(target); } catch {}
if (!bytes || blobHash(bytes) !== sourceGitBlob) {
  bytes = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl',
    ['--fail', '--silent', '--show-error', '--location', '--max-time', '45', sourceUrl],
    { windowsHide: true, maxBuffer: 512 * 1024 });
  if (blobHash(bytes) !== sourceGitBlob) throw new Error('Recovery audio source blob mismatch');
  await mkdir(new URL('./', target), { recursive: true });
  await writeFile(target, bytes);
}
const manifest = {
  schemaVersion: 1, upstreamCommit,
  attribution: { name: 'Noname / 无名杀', repository: 'https://github.com/libnoname/noname', commit: upstreamCommit,
    license: 'GPL-3.0', licenseUrl: `https://github.com/libnoname/noname/blob/${upstreamCommit}/LICENSE`,
    note: '音效原样取自锁定上游资源，保留来源，不主张录音原创或另行授权。' },
  scope: 'Native recovery effect, only after an actual positive HP change directly owned by a recover event.',
  uniqueFiles: 1, totalBytes: bytes.length,
  clips: { [key]: { key, file, label: '回复体力', sourceUrl, sourceGitBlob,
    bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') } },
};
await writeFile(new URL('recovery-audio.json', destination), `${JSON.stringify(manifest, null, 2)}\n`);
console.log(JSON.stringify({ files: 1, bytes: bytes.length, sourceGitBlob }));
