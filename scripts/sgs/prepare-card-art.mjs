// Original official classic Slash scans. Render fixed CSS crops; never redraw
// their artwork or hard-code the printed example's suit/rank into live cards.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
const destination = new URL('../../apps/core/sgs/', import.meta.url);
const records = [
  { nature: 'fire', file: 'cards/official-source/fire-slash.jpg',
    page: 'https://guozhan.sanguosha.com/a/kapaiyilan/youxipai/jibenpai/2013/0129/138.html',
    sourceUrl: 'https://guozhan.sanguosha.com/uploads/allimg/130130/1-1301301K4522D.jpg',
    sha256: '972fc327145158d0dae865b9b15ec03d144d559b9d4bf6398df54c33fe5497b5' },
  { nature: 'thunder', file: 'cards/official-source/thunder-slash.jpg',
    page: 'https://guozhan.sanguosha.com/a/kapaiyilan/youxipai/jibenpai/2013/0129/139.html',
    sourceUrl: 'https://guozhan.sanguosha.com/uploads/allimg/130130/1-1301301K64YJ.jpg',
    sha256: 'e417336fa690d099ae3882d51d535ff4ab64041c9b6e2c97ace1f90272384a2e' },
];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
for (const record of records) {
  const target = new URL(record.file, destination);
  let bytes;
  try { bytes = await readFile(target); } catch {}
  if (!bytes || hash(bytes) !== record.sha256) {
    bytes = execFileSync(process.platform === 'win32' ? 'curl.exe' : 'curl',
      ['--fail', '--silent', '--show-error', '--location', '--max-time', '30', record.sourceUrl],
      { windowsHide: true, maxBuffer: 256 * 1024 });
    if (hash(bytes) !== record.sha256) throw new Error(`Official source changed: ${record.nature}; review instead of silently substituting art`);
    await mkdir(new URL('./', target), { recursive: true });
    await writeFile(target, bytes);
  }
  record.bytes = bytes.length;
  record.dimensions = [240, 337];
}
await writeFile(new URL('card-art.json', destination), JSON.stringify({
  schemaVersion: 1, verifiedOn: '2026-10-03',
  attribution: '三国杀官网国战专题 / 杭州游卡网络技术有限公司；素材权利归原权利人，未声称图片获得GPL授权。',
  note: '官网经典牌面原图原样保存。仅用CSS显示武者插画和火纹/雷纹字样；点数花色来自真实卡牌DOM。',
  records,
}, null, 2) + '\n');
console.log(`Verified ${records.length} official scans (${records.reduce((sum, record) => sum + record.bytes, 0)} bytes).`);
