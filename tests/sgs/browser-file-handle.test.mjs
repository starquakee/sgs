import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import ts from 'typescript';

const read = file => readFileSync(new URL(`../../apps/core/noname/${file}`, import.meta.url), 'utf8');
const errorExports = {};
new Function('exports', ts.transpileModule(read('library/fs/errors.ts'), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
}).outputText)(errorExports);
const { FileSystemError, FileSystemErrorCode } = errorExports;

// Execute the actual adapter/handle classes and helpers, removing only module
// bindings. The browser startup function is left intact but is not invoked here;
// the parent browser acceptance exercises real static and local-service startup.
const browserSource = read('init/browser.js')
  .replace(/^import .* from "@\/library\/fs";\r?\n/m, '')
  .replace('export default async function browserReady', 'async function browserReady');
function nativeClasses(fetcher = () => { throw new Error('Unexpected network request'); }) {
  return new Function('FileSystemError', 'FileSystemErrorCode', 'fetch',
    `${browserSource}\nreturn { BrowserAdapter, BrowserFileHandle, OfflineAdapter };`)(
    FileSystemError, FileSystemErrorCode, fetcher,
  );
}

const filePath = 'save/example.bin';
function memoryBackend(initial = [1, 2, 3]) {
  let bytes = [...initial];
  const calls = [];
  return {
    calls,
    bytes: () => bytes,
    async fetch(route, options) {
      const url = new URL(route, 'http://in-memory.invalid');
      calls.push([url.pathname, options?.method ?? 'GET']);
      let data;
      if (url.pathname === '/checkFile' || url.pathname === '/readFile') {
        assert.equal(url.searchParams.get('fileName'), filePath);
        data = url.pathname === '/checkFile' ? 'file' : bytes;
      } else if (url.pathname === '/writeFile') {
        assert.equal(options.method, 'POST');
        const body = JSON.parse(options.body);
        assert.equal(body.path, filePath);
        bytes = body.data;
      } else {
        assert.fail(`Unexpected route: ${route}`);
      }
      return { ok: true, json: async () => ({ success: true, data }) };
    },
  };
}

function isFileError(code, path = filePath, detail) {
  return error => {
    assert.ok(error instanceof FileSystemError);
    assert.equal(error.code, code);
    assert.equal(error.path, path);
    if (detail) assert.match(error.message, detail);
    return true;
  };
}

test('actual browser adapter opens a writable handle and sends its path and bytes', async () => {
  const backend = memoryBackend();
  const { BrowserAdapter } = nativeClasses(backend.fetch);
  const handle = await new BrowserAdapter().open(filePath, { write: true });
  await handle.write(Uint8Array.of(9, 8));
  assert.deepEqual(backend.bytes(), [9, 8]);
  assert.deepEqual(backend.calls, [['/checkFile', 'GET'], ['/writeFile', 'POST']]);
});

test('actual append handle retains existing bytes and appends once', async () => {
  const backend = memoryBackend();
  const { BrowserAdapter } = nativeClasses(backend.fetch);
  const handle = await new BrowserAdapter().open(filePath, { append: true });
  await handle.write(Uint8Array.of(4, 5));
  assert.deepEqual(backend.bytes(), [1, 2, 3, 4, 5]);
  assert.deepEqual(backend.calls, [['/checkFile', 'GET'], ['/readFile', 'GET'], ['/writeFile', 'POST']]);
});

test('invalid write data reports the handle path without calling the backend', async () => {
  const backend = memoryBackend();
  const { BrowserAdapter } = nativeClasses(backend.fetch);
  const handle = await new BrowserAdapter().open(filePath, { write: true });
  backend.calls.length = 0;
  await assert.rejects(handle.write([4]), isFileError(FileSystemErrorCode.IoError, filePath, /Uint8Array/));
  assert.deepEqual(backend.calls, []);
  assert.deepEqual(backend.bytes(), [1, 2, 3]);
});

test('truncate shrinks, zero-extends, skips unchanged size and defaults to empty', async () => {
  const backend = memoryBackend();
  const { BrowserAdapter } = nativeClasses(backend.fetch);
  const handle = await new BrowserAdapter().open(filePath, { write: true });
  await handle.truncate(2);
  assert.deepEqual(backend.bytes(), [1, 2]);
  await handle.truncate(4);
  assert.deepEqual(backend.bytes(), [1, 2, 0, 0]);
  backend.calls.length = 0;
  await handle.truncate(4);
  assert.deepEqual(backend.calls, [['/readFile', 'GET']]);
  await handle.truncate();
  assert.deepEqual(backend.bytes(), []);
});

test('truncate preserves typed backend errors and wraps raw errors with the handle path and cause', async () => {
  const { BrowserFileHandle } = nativeClasses();
  const raw = new Error('EACCES: backend denied the write');
  const typed = new FileSystemError(FileSystemErrorCode.PermissionDenied, filePath, { cause: raw });
  for (const backendError of [raw, typed]) {
    const handle = new BrowserFileHandle({
      read: async () => Uint8Array.of(1, 2, 3),
      write: async () => { throw backendError; },
    }, filePath, true, true, false);
    await assert.rejects(handle.truncate(1), error => {
      isFileError(FileSystemErrorCode.PermissionDenied)(error);
      if (backendError === typed) assert.equal(error, typed);
      else assert.equal(error.cause, raw);
      return true;
    });
  }
});

test('closed handles reject every operation before any backend access, including same-size truncate', async () => {
  const { BrowserFileHandle } = nativeClasses();
  const calls = [];
  const adapter = {
    read: async () => { calls.push('read'); return Uint8Array.of(1, 2, 3); },
    write: async () => { calls.push('write'); },
    stat: async () => { calls.push('stat'); return { type: 'file' }; },
  };
  for (const writable of [true, false]) {
    const handle = new BrowserFileHandle(adapter, filePath, true, writable, false);
    await handle.close();
    await handle.close();
    for (const operation of [() => handle.readAll(), () => handle.stat(), () => handle.truncate(1),
      () => handle.truncate(3), () => handle.write(Uint8Array.of(9)), () => handle.truncate(-1)]) {
      await assert.rejects(operation(), isFileError(FileSystemErrorCode.IoError, filePath, /File handle is closed/));
      assert.deepEqual(calls, []);
    }
  }
});

test('open read-only handles and invalid truncate sizes reject without backend mutation', async () => {
  const backend = memoryBackend();
  const { BrowserAdapter } = nativeClasses(backend.fetch);
  const adapter = new BrowserAdapter();
  const readOnly = await adapter.open(filePath);
  const writable = await adapter.open(filePath, { write: true });
  backend.calls.length = 0;
  await assert.rejects(readOnly.write(Uint8Array.of(9)), isFileError(FileSystemErrorCode.IoError));
  await assert.rejects(readOnly.truncate(1), isFileError(FileSystemErrorCode.IoError));
  for (const size of [-1, 0.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1]) {
    await assert.rejects(writable.truncate(size), isFileError(FileSystemErrorCode.InvalidPath));
  }
  assert.deepEqual(backend.calls, []);
  assert.deepEqual(backend.bytes(), [1, 2, 3]);
});

test('offline adapter reports missing files and empty lists while rejecting all file operations', async () => {
  const { OfflineAdapter } = nativeClasses();
  const offline = new OfflineAdapter();
  assert.equal(await offline.stat(filePath), null);
  assert.deepEqual(await offline.list('save'), []);
  for (const operation of [() => offline.open(filePath, { write: true, create: true }),
    () => offline.read(filePath), () => offline.write(filePath, Uint8Array.of(9)),
    () => offline.createDir(filePath), () => offline.remove(filePath)]) {
    await assert.rejects(operation(), isFileError(FileSystemErrorCode.NotFound, filePath, /本地文件服务不可用/));
  }
});
