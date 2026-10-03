// Optional full decoder check; requires an existing ffmpeg on PATH (or FFMPEG).
// No installation, visible subprocess windows, or network access is needed.
import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
const base = new URL('../../apps/core/sgs/', import.meta.url);
const manifests = await Promise.all(['card-audio.json', 'character-audio.json', 'damage-audio.json'].map(async file => JSON.parse(await readFile(new URL(file, base), 'utf8'))));
const clips = manifests.flatMap(manifest => Object.values(manifest.clips));
let next = 0;
async function worker() {
  while (next < clips.length) {
    const clip = clips[next++];
    await new Promise((resolve, reject) => {
      const process = spawn(globalThis.process.env.FFMPEG || 'ffmpeg', ['-v', 'error', '-nostdin', '-i', fileURLToPath(new URL(clip.file, base)), '-f', 'null', '-'], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] });
      let stderr = '';
      process.stderr.on('data', data => { stderr += data; });
      process.on('error', reject);
      process.on('exit', code => code === 0 ? resolve() : reject(new Error(`${clip.key}: ${stderr}`)));
    });
  }
}
await Promise.all(Array.from({ length: 4 }, worker));
console.log(`Decoded all ${clips.length} local audio files successfully (${manifests.reduce((sum, manifest) => sum + manifest.totalBytes, 0)} bytes).`);
