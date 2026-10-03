// Publishable source snapshot from this sparse upstream checkout; never pushes.
// The original branch, working tree, index and upstream history stay untouched.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../../', import.meta.url));
const git = (args, options = {}) => execFileSync('git', args, { cwd: root, windowsHide: true, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, ...options });
if (git(['status', '--porcelain']).trim()) throw new Error('Commit local changes before creating a publication snapshot');
const sourceCommit = git(['rev-parse', 'HEAD']).trim();
const flags = new Map(git(['ls-files', '-v', '-z']).split('\0').filter(Boolean).map(row => [row.slice(2), row[0].toUpperCase()]));
const excludedRoots = ['apps/core/audio/', 'apps/core/image/character/', 'apps/mobile/'];
const excludedFiles = new Set(['packages/fs/localhost.decrypted.key']);
const entries = [];
let bytes = 0, omittedFiles = 0;
for (const row of git(['ls-files', '--stage', '-z']).split('\0').filter(Boolean)) {
  const [, mode, oid, path] = row.match(/^(\d+) ([a-f\d]{40}) 0\t([\s\S]+)$/) || [];
  if (!path) throw new Error('Unmerged or unsupported index entry');
  if (flags.get(path) === 'S' || excludedFiles.has(path) || excludedRoots.some(prefix => path.startsWith(prefix))) { omittedFiles++; continue; }
  const info = await stat(join(root, path));
  if (!info.isFile() || !['100644', '100755'].includes(mode)) throw new Error(`Review non-file entry: ${path}`);
  if (info.size >= 100 * 1024 * 1024) throw new Error(`File exceeds GitHub limit: ${path}`);
  // Preserve upstream automation as source, without enabling its deployment,
  // release and scheduled jobs in the user's standalone SGS repository.
  const destination = path.startsWith('.github/workflows/') ? path.replace('.github/workflows/', 'archive/sgs-upstream-workflows/') : path;
  entries.push({ mode, oid, path: destination });
  bytes += info.size;
}
if (new Set(entries.map(entry => entry.path)).size !== entries.length) throw new Error('Snapshot path collision');
for (const required of ['LICENSE', 'README.md', 'README-SGS.md', 'apps/core/sgs/character-audio.json', '启动游戏.cmd']) {
  if (!entries.some(entry => entry.path === required)) throw new Error(`Missing required publication file: ${required}`);
}
const temporary = await mkdtemp(join(tmpdir(), 'sgs-publish-index-'));
try {
  const env = { ...process.env, GIT_INDEX_FILE: join(temporary, 'index'), GIT_NO_LAZY_FETCH: '1' };
  const objects = [...new Set(entries.map(entry => entry.oid))];
  const checked = git(['cat-file', '--batch-check'], { env, input: objects.join('\n') + '\n' }).trim().split('\n');
  if (checked.length !== objects.length || checked.some(line => !/^[a-f\d]{40} blob \d+$/.test(line.trim()))) throw new Error('Missing local blobs; refusing to fetch the omitted upstream asset tree');
  git(['read-tree', '--empty'], { env });
  git(['update-index', '-z', '--index-info'], { env, input: entries.map(entry => `${entry.mode} ${entry.oid}\t${entry.path}\0`).join('') });
  const tree = git(['write-tree'], { env }).trim();
  const previous = (() => { try { return git(['rev-parse', '--verify', 'refs/heads/publish/sgs'], { stdio: ['pipe', 'pipe', 'ignore'] }).trim(); } catch { return null; } })();
  const message = `Publish SGS single-player source snapshot\n\nLocal development commit: ${sourceCommit}\nUpstream: libnoname/noname@7fcf23ed54d8a7ce2b49ae2c15a054123891a52a\nIncludes the materialized source, local assets, GPL-3.0 license and attribution.\nUpstream GitHub workflows are preserved under archive/sgs-upstream-workflows.\n`;
  const commit = git(['commit-tree', tree, ...(previous ? ['-p', previous] : [])], { env, input: message }).trim();
  git(['update-ref', 'refs/heads/publish/sgs', commit, previous || '0000000000000000000000000000000000000000']);
  console.log(JSON.stringify({ sourceCommit, snapshotCommit: commit, branch: 'publish/sgs', files: entries.length, bytes, omittedFiles }, null, 2));
} finally {
  // mkdtemp creates this exact disposable directory; no repository tree is removed.
  if (dirname(resolve(temporary)) !== resolve(tmpdir()) || !basename(temporary).startsWith('sgs-publish-index-')) throw new Error('Unexpected temporary index directory');
  await rm(temporary, { recursive: true, force: true });
}
