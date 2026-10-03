"""Create small local WebP portraits from the pinned, attributed upstream art.

Original images are decoded in memory and never included in the game bundle.
Usage: python scripts/sgs/build-portraits.py [--download] [--allow-incomplete]
Additional existing network art is attributed in portrait-sources.json.
"""
import argparse
import concurrent.futures
import hashlib
import io
import json
from pathlib import Path
import time
import urllib.parse
import urllib.request
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'apps/core/sgs/portraits'
PLAN = ROOT / '.sgs-assets-cache/portrait-plan.json'
SIZE = (96, 128)
LIMIT = 4096

def small_webp(raw, centering=(0.5, 0.35)):
    with Image.open(io.BytesIO(raw)) as original:
        picture = ImageOps.fit(ImageOps.exif_transpose(original).convert('RGB'), SIZE, Image.Resampling.LANCZOS, centering=centering)
    for quality in (48, 40, 32, 24, 16):
        encoded = io.BytesIO()
        picture.save(encoded, 'WEBP', quality=quality, method=6)
        content = encoded.getvalue()
        if len(content) <= LIMIT:
            return content
    raise ValueError('Portrait exceeds size budget')

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--allow-incomplete', action='store_true')
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text(encoding='utf-8'))
    external = json.loads((ROOT / 'scripts/sgs/portrait-sources.json').read_text(encoding='utf-8'))
    crops = {item['url']:tuple(item['centering']) for item in external.values() if 'centering' in item}
    OUTPUT.mkdir(parents=True, exist_ok=True)
    sources = sorted({c['source'] for c in plan['characters'] if c['source']})
    downloaded = {}
    failures = []
    def prepare(source):
        filename = hashlib.sha256(('96x128-q48-v1:' + source).encode()).hexdigest()[:20] + '.webp'
        target = OUTPUT / filename
        if not target.exists():
            if not args.download:
                raise ValueError('Missing thumbnail; run with --download: ' + source)
            url = source if source.startswith('https://') else 'https://raw.githubusercontent.com/libnoname/noname/' + plan['commit'] + '/apps/core/' + urllib.parse.quote(source)
            for attempt in range(4):
                try:
                    request = urllib.request.Request(url, headers={'User-Agent':'SGS-local-thumbnail-builder'})
                    with urllib.request.urlopen(request, timeout=35) as response:
                        raw = response.read(8 * 1024 * 1024 + 1)
                    if len(raw) > 8 * 1024 * 1024:
                        raise ValueError('Unexpectedly large portrait')
                    target.write_bytes(small_webp(raw, crops.get(source, (0.5, 0.35))))
                    break
                except Exception:
                    if attempt == 3:
                        raise
                    time.sleep(1 + attempt)
        raw = target.read_bytes()
        with Image.open(io.BytesIO(raw)) as picture:
            if picture.size != SIZE or picture.format != 'WEBP' or len(raw) > LIMIT:
                raise ValueError('Invalid thumbnail: ' + source)
        return source, {'file':filename,'width':SIZE[0],'height':SIZE[1],'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        jobs = {pool.submit(prepare, s):s for s in sources}
        for i, job in enumerate(concurrent.futures.as_completed(jobs), 1):
            try:
                source, info = job.result()
                downloaded[source] = info
            except Exception as error:
                failures.append({'source':jobs[job],'error':str(error)})
            if i % 200 == 0 or i == len(sources):
                print(f'Portraits: {i}/{len(sources)}, failed {len(failures)}', flush=True)
    items = {}
    for character in plan['characters']:
        source = character['source']
        if source:
            info = downloaded.get(source)
        else:
            info = None
        if info:
            items[character['id']] = {**info,'kind':character['kind'],'source':source,'sourcePage':character.get('sourcePage'),'note':character.get('note'),'characterKey':character['key']}
    unique = {item['file']:item['bytes'] for item in items.values()}
    report = {'schemaVersion':1,'upstreamCommit':plan['commit'],'size':list(SIZE),'perFileLimit':LIMIT,
              'mappedCharacters':len(items),'expectedCharacters':len(plan['characters']),
              'uniqueImages':len(unique),'totalBytes':sum(unique.values()),'portraits':items,
              'missing':[c['id'] for c in plan['characters'] if c['id'] not in items],'failures':failures}
    if report['missing'] and not args.allow_incomplete:
        raise RuntimeError('Incomplete portrait coverage: '+json.dumps(report['missing'],ensure_ascii=False))
    (OUTPUT.parent/'portraits.json').write_text(json.dumps(report,ensure_ascii=False,separators=(',',':')),encoding='utf-8')
    print(json.dumps({k:v for k,v in report.items() if k!='portraits'},ensure_ascii=False),flush=True)

if __name__ == '__main__':
    main()
