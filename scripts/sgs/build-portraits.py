"""Build attributed local WebP portraits; originals stay in memory, never shipped.
Usage: python scripts/sgs/build-portraits.py [--download] [--allow-incomplete]
"""
import argparse
import concurrent.futures
import hashlib
import io
import json
import re
from pathlib import Path
import time
import urllib.parse
import urllib.request
from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / 'apps/core/sgs/portraits'
PLAN = ROOT / '.sgs-assets-cache/portrait-plan.json'
MANIFEST = OUTPUT.parent / 'portraits.json'
STAGING = ROOT / '.sgs-assets-cache/portrait-upgrade'
SIZE = (192, 256)
LIMIT = 8192
TOTAL_LIMIT = 20 * 1024 * 1024
PROFILE = '192x256-q56-v2'


def small_webp(raw, centering=(0.5, 0.35)):
    with Image.open(io.BytesIO(raw)) as original:
        picture = ImageOps.fit(ImageOps.exif_transpose(original).convert('RGB'), SIZE,
                               Image.Resampling.LANCZOS, centering=centering)
    for quality in (56, 48, 40, 32, 24, 16, 12, 8, 6, 4, 0):
        encoded = io.BytesIO()
        picture.save(encoded, 'WEBP', quality=quality, method=6)
        content = encoded.getvalue()
        if len(content) <= LIMIT:
            return content
    raise ValueError('Portrait exceeds size budget')


def portrait_path(directory, filename):
    if not re.fullmatch(r'[a-f0-9]{20}\.webp', filename):
        raise ValueError('Invalid portrait filename')
    base = directory.resolve()
    target = (base / filename).resolve()
    if target.parent != base:
        raise ValueError('Portrait path escapes its directory')
    return target


def inspect_bytes(raw):
    with Image.open(io.BytesIO(raw)) as picture:
        picture.load()
        if picture.format != 'WEBP' or picture.size not in (SIZE, (96, 128)) or len(raw) > LIMIT:
            raise ValueError('Invalid portrait dimensions/format/budget')
        return {'width': picture.width, 'height': picture.height, 'bytes': len(raw),
                'sha256': hashlib.sha256(raw).hexdigest()}


def validate_file(directory, info):
    path = portrait_path(directory, info['file'])
    actual = inspect_bytes(path.read_bytes())
    if any(info.get(key) != value for key, value in actual.items()):
        raise ValueError('Portrait differs from manifest: ' + info['file'])
    return path


def encode_original(raw, filename, centering):
    with Image.open(io.BytesIO(raw)) as original:
        source_size = ImageOps.exif_transpose(original).size
    content = small_webp(raw, centering)
    return content, {'file': filename, **inspect_bytes(content), 'profile': PROFILE,
                     'sourceWidth': source_size[0], 'sourceHeight': source_size[1],
                     'sourceSha256': hashlib.sha256(raw).hexdigest()}


def old_image(source, old_by_source, directory):
    info = old_by_source.get(source)
    if not info or info.get('source') != source:
        raise ValueError('No existing attributed fallback for ' + source)
    validate_file(directory, info)
    return {key: info[key] for key in ('file', 'width', 'height', 'bytes', 'sha256',
            'profile', 'sourceWidth', 'sourceHeight', 'sourceSha256') if key in info}


def install_snapshot(items, report, old, output, manifest_path, staged):
    """Validate everything before publishing a manifest or removing old files."""
    output, staged, manifest_path = output.resolve(), staged.resolve(), manifest_path.resolve()
    if manifest_path.parent != output.parent:
        raise ValueError('Manifest must stay beside the portrait directory')
    unique = {item['file']: item for item in items.values()}
    if sum(item['bytes'] for item in unique.values()) > TOTAL_LIMIT:
        raise ValueError('Portrait set exceeds total storage budget')
    old_unique = {item['file']: item for item in old.get('portraits', {}).values()}
    # Refuse unrelated files rather than deleting them as cleanup.
    if {path.name for path in output.iterdir()} - (set(old_unique) | set(unique)):
        raise ValueError('Unexpected files in portrait directory; left untouched')
    resolved = {}
    for name, info in unique.items():
        directory = staged if portrait_path(staged, name).exists() else output
        resolved[name] = validate_file(directory, info)
    obsolete = [validate_file(output, old_unique[name]) for name in old_unique.keys() - unique.keys()]
    for name, path in resolved.items():
        destination = portrait_path(output, name)
        if path != destination:
            destination.write_bytes(path.read_bytes())
        validate_file(output, unique[name])
    pending = staged / 'manifest-ready.json'
    pending.write_text(json.dumps(report, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    pending.replace(manifest_path)
    # Each exact obsolete path was resolved inside output and hash-checked above.
    for path in obsolete:
        path.unlink()
    if {path.name for path in output.iterdir()} != set(unique):
        raise ValueError('Portrait directory/manifest mismatch')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--download', action='store_true')
    parser.add_argument('--allow-incomplete', action='store_true',
                        help='Write diagnostic report only when coverage is incomplete; never install it')
    args = parser.parse_args()
    plan = json.loads(PLAN.read_text(encoding='utf-8'))
    catalog = json.loads((OUTPUT.parent / 'catalog.json').read_text(encoding='utf-8'))
    if plan['commit'] != catalog['upstream']['commit'] or {c['key'] for c in plan['characters']} != {c['key'] for c in catalog['characters']}:
        raise ValueError('Portrait plan does not match the pinned catalog')
    external = json.loads((ROOT / 'scripts/sgs/portrait-sources.json').read_text(encoding='utf-8'))
    crops = {item['url']: tuple(item['centering']) for item in external.values() if 'centering' in item}
    for directory in (OUTPUT, STAGING):
        if ROOT.resolve() not in directory.resolve().parents:
            raise ValueError('Asset directory must stay in the workspace')
        directory.mkdir(parents=True, exist_ok=True)
    old = json.loads(MANIFEST.read_text(encoding='utf-8')) if MANIFEST.exists() else {'portraits': {}}
    old_by_source = {item['source']: item for item in old['portraits'].values()}
    old_fallbacks = {item['source']: item for item in old.get('upgradeFallbacks', [])}
    sources = sorted({c['source'] for c in plan['characters'] if c['source']})
    prepared, fallbacks, failures = {}, [], []

    def prepare(source):
        centering = crops.get(source, (0.5, 0.35))
        filename = hashlib.sha256((PROFILE + ':' + source + ':' + json.dumps(centering)).encode()).hexdigest()[:20] + '.webp'
        target = portrait_path(STAGING, filename)
        metadata = target.with_suffix('.json')
        previous = old_by_source.get(source, {})
        if previous.get('profile') == PROFILE and previous.get('file') == filename:
            return source, old_image(source, old_by_source, OUTPUT), None
        if not args.download and source in old_fallbacks:
            return source, old_image(source, old_by_source, OUTPUT), old_fallbacks[source]
        if target.exists() and metadata.exists():
            try:
                info = json.loads(metadata.read_text(encoding='utf-8'))
                validate_file(STAGING, info)
                if info.get('file') == filename and info.get('profile') == PROFILE:
                    return source, info, None
            except (ValueError, KeyError, OSError):
                pass
        if not args.download:
            raise ValueError('Missing upgraded portrait; run with --download: ' + source)
        try:
            url = source if source.startswith('https://') else 'https://raw.githubusercontent.com/libnoname/noname/' + plan['commit'] + '/apps/core/' + urllib.parse.quote(source)
            for attempt in range(4):
                try:
                    request = urllib.request.Request(url, headers={'User-Agent': 'SGS-local-portrait-builder'})
                    with urllib.request.urlopen(request, timeout=35) as response:
                        raw = response.read(8 * 1024 * 1024 + 1)
                    if len(raw) > 8 * 1024 * 1024:
                        raise ValueError('Unexpectedly large portrait')
                    content, info = encode_original(raw, filename, centering)
                    target.write_bytes(content)
                    metadata.write_text(json.dumps(info), encoding='utf-8')
                    break
                except Exception:
                    if attempt == 3:
                        raise
                    time.sleep(1 + attempt)
            validate_file(STAGING, info)
            return source, info, None
        except Exception as error:
            info = old_image(source, old_by_source, OUTPUT)
            return source, info, {'source': source, 'file': info['file'], 'reason': str(error)[:300]}

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as pool:
        jobs = {pool.submit(prepare, source): source for source in sources}
        for i, job in enumerate(concurrent.futures.as_completed(jobs), 1):
            try:
                source, info, fallback = job.result()
                prepared[source] = info
                if fallback:
                    fallbacks.append(fallback)
            except Exception as error:
                failures.append({'source': jobs[job], 'error': str(error)})
            if i % 100 == 0 or i == len(sources):
                print(f'Portraits: {i}/{len(sources)}, retained {len(fallbacks)}, failed {len(failures)}', flush=True)
    items = {}
    for character in plan['characters']:
        source = character['source']
        info = prepared.get(source)
        if info:
            items[character['id']] = {**info, 'kind': character['kind'], 'source': source,
                'sourcePage': character.get('sourcePage'), 'note': character.get('note'), 'characterKey': character['key']}
    unique = {item['file']: item['bytes'] for item in items.values()}
    report = {'schemaVersion': 1, 'upstreamCommit': plan['commit'], 'profile': PROFILE, 'size': list(SIZE),
        'perFileLimit': LIMIT, 'totalByteLimit': TOTAL_LIMIT, 'mappedCharacters': len(items),
        'expectedCharacters': len(plan['characters']), 'uniqueImages': len(unique), 'totalBytes': sum(unique.values()),
        'portraits': items, 'missing': [c['id'] for c in plan['characters'] if c['id'] not in items],
        'failures': failures, 'upgradeFallbacks': sorted(fallbacks, key=lambda row: row['source'])}
    if report['missing'] or failures:
        if args.allow_incomplete:
            (STAGING / 'incomplete-report.json').write_text(json.dumps(report, ensure_ascii=False), encoding='utf-8')
            print('Incomplete report saved in staging; existing installed portraits unchanged', flush=True)
            return
        raise RuntimeError('Incomplete portrait coverage: ' + json.dumps(report['missing'], ensure_ascii=False))
    install_snapshot(items, report, old, OUTPUT, MANIFEST, STAGING)
    # A completed build no longer needs its duplicate small staging images.
    for name in unique:
        path = portrait_path(STAGING, name)
        for candidate in (path, path.with_suffix('.json')):
            if candidate.parent != STAGING.resolve():
                raise ValueError('Unexpected staging cleanup path')
            candidate.unlink(missing_ok=True)
    print(json.dumps({key: value for key, value in report.items() if key not in ('portraits', 'upgradeFallbacks')}
                     | {'retainedSources': len(fallbacks)}, ensure_ascii=False), flush=True)


if __name__ == '__main__':
    main()
