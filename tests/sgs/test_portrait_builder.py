"""Focused maintenance tests; Pillow is needed only to rebuild portraits."""
import hashlib
import importlib.util
import io
from pathlib import Path
import tempfile
import unittest
from PIL import Image

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location('portrait_builder', ROOT / 'scripts/sgs/build-portraits.py')
BUILDER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BUILDER)


def picture_bytes(size, format='WEBP'):
    picture = Image.new('RGB', size)
    picture.putdata([((x * 3) % 256, (y * 2) % 256, (x + y) % 256)
                     for y in range(size[1]) for x in range(size[0])])
    data = io.BytesIO()
    picture.save(data, format)
    return data.getvalue()


class PortraitBuilderTests(unittest.TestCase):
    def test_original_encoding_records_provenance_and_meets_budget(self):
        raw = picture_bytes((320, 440), 'PNG')
        content, info = BUILDER.encode_original(raw, 'b' * 20 + '.webp', (0.5, 0.35))
        self.assertEqual((info['width'], info['height']), (192, 256))
        self.assertEqual((info['sourceWidth'], info['sourceHeight']), (320, 440))
        self.assertEqual(info['sourceSha256'], hashlib.sha256(raw).hexdigest())
        self.assertEqual(info['sha256'], hashlib.sha256(content).hexdigest())
        self.assertLessEqual(len(content), 8192)

    def test_only_verified_same_source_fallback_can_be_retained(self):
        with tempfile.TemporaryDirectory(prefix='sgs-portrait-test-') as name:
            directory = Path(name)
            raw = picture_bytes((96, 128))
            info = {'file': 'a' * 20 + '.webp', 'source': 'image/character/example.jpg', **BUILDER.inspect_bytes(raw)}
            (directory / info['file']).write_bytes(raw)
            retained = BUILDER.old_image(info['source'], {info['source']: info}, directory)
            self.assertEqual(retained['width'], 96)
            with self.assertRaises(ValueError):
                BUILDER.old_image('different-source.jpg', {}, directory)
            with self.assertRaises(ValueError):
                BUILDER.portrait_path(directory, '../outside.webp')
            info['sha256'] = '0' * 64
            with self.assertRaises(ValueError):
                BUILDER.old_image(info['source'], {info['source']: info}, directory)

    def test_failed_validation_preserves_manifest_and_success_removes_only_old(self):
        with tempfile.TemporaryDirectory(prefix='sgs-portrait-test-') as name:
            root = Path(name)
            output, staged, manifest = root / 'portraits', root / 'staging', root / 'portraits.json'
            output.mkdir(); staged.mkdir()
            raw = picture_bytes((96, 128))
            old_info = {'file': 'a' * 20 + '.webp', **BUILDER.inspect_bytes(raw)}
            (output / old_info['file']).write_bytes(raw)
            manifest.write_text('previous manifest', encoding='utf-8')
            content, info = BUILDER.encode_original(picture_bytes((320, 440), 'PNG'), 'b' * 20 + '.webp', (0.5, 0.35))
            (staged / info['file']).write_bytes(content)
            old = {'portraits': {'example': old_info}}
            with self.assertRaises(ValueError):
                BUILDER.install_snapshot({'example': {**info, 'sha256': '0' * 64}}, {}, old, output, manifest, staged)
            self.assertEqual(manifest.read_text(), 'previous manifest')
            self.assertTrue((output / old_info['file']).exists())
            (output / 'unrelated.txt').write_text('leave me')
            with self.assertRaises(ValueError):
                BUILDER.install_snapshot({'example': info}, {}, old, output, manifest, staged)
            self.assertEqual((output / 'unrelated.txt').read_text(), 'leave me')
            (output / 'unrelated.txt').unlink()
            BUILDER.install_snapshot({'example': info}, {'portraits': {'example': info}}, old, output, manifest, staged)
            self.assertEqual({p.name for p in output.iterdir()}, {info['file']})
            self.assertEqual(BUILDER.validate_file(output, info).read_bytes(), content)


if __name__ == '__main__':
    unittest.main()
