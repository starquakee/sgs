// SGS-only volatile storage. Native rules still use their own configuration/DB
// code; these stores only replace unavailable browser persistence for this page.
export const storageNotice = '浏览器存储不可用；当前选择仍可开局，偏好与战绩可能无法保存，关闭页面后不会保留。';
export function persistentStorage(host = globalThis) {
  const storage = host.localStorage;
  if (storage?.sgsVolatile) throw new Error('Temporary storage');
  return storage;
}
export function canPersist(host = globalThis) {
  try {
    const storage = persistentStorage(host), key = 'sgs.storage-probe';
    const previous = storage.getItem(key);
    storage.setItem(key, '1');
    if (previous === null) storage.removeItem(key); else storage.setItem(key, previous);
    return true;
  } catch { return false; }
}
export function installVolatileLocalStorage(host = globalThis) {
  if (canPersist(host)) return false;
  const data = Object.create(null);
  // Retain readable settings when only writes have been denied/quota exceeded.
  try { const original = host.localStorage; for (let i = 0; i < original.length; i++) {
    const key = original.key(i); data[key] = original.getItem(key);
  } } catch {}
  const storage = Object.create(null);
  Object.defineProperties(storage, {
    sgsVolatile: { value: true }, length: { get: () => Object.keys(data).length },
    key: { value: index => Object.keys(data)[index] ?? null },
    getItem: { value: key => data[String(key)] ?? null },
    setItem: { value: (key, value) => { data[String(key)] = String(value); } },
    removeItem: { value: key => { delete data[String(key)]; } },
    clear: { value: () => { for (const key of Object.keys(data)) delete data[key]; } },
  });
  // Native sandbox storage also uses named-property access and enumeration.
  const namedStorage = new Proxy(storage, {
    get: (target, key) => Reflect.has(target, key) ? Reflect.get(target, key) : data[key],
    set(target, key, value) { if (Reflect.has(target, key)) return false; storage.setItem(key, value); return true; },
    deleteProperty(target, key) { if (Reflect.has(target, key)) return false; storage.removeItem(key); return true; },
    ownKeys: target => [...new Set([...Reflect.ownKeys(target), ...Object.keys(data)])],
    getOwnPropertyDescriptor: (target, key) => Reflect.getOwnPropertyDescriptor(target, key)
      || (Object.hasOwn(data, key) ? { value: data[key], writable: true, enumerable: true, configurable: true } : undefined),
  });
  Object.defineProperty(host, 'localStorage', { configurable: true, value: namedStorage });
  return true;
}

// The locked native engine uses get/put/delete/clear/openCursor, including its
// video menu. Implement that storage interface, never game events or rules.
export function createMemoryDatabase() {
  const stores = new Map();
  const copy = value => value === undefined ? undefined : structuredClone(value);
  const request = action => {
    const result = {};
    queueMicrotask(() => { try { result.result = action(); result.onsuccess?.({ target: result }); }
      catch (error) { result.error = error; result.onerror?.({ target: result }); } });
    return result;
  };
  const db = {
    objectStoreNames: { contains: name => stores.has(name) }, close() {},
    createObjectStore(name, options = {}) { stores.set(name, { data: new Map(), keyPath: options.keyPath }); },
    transaction() {
      const tx = { objectStore(name) {
        const store = stores.get(name);
        if (!store) throw new Error(`Unknown temporary store: ${name}`);
        const { data, keyPath } = store;
        return {
          get: key => request(() => copy(data.get(key))),
          put(value, key) { const cloned = copy(value); key ??= cloned?.[keyPath];
            return request(() => { data.set(key, cloned); return key; }); },
          delete: key => request(() => data.delete(key)),
          clear: () => request(() => data.clear()),
          openCursor() {
            const entries = [...data.entries()]; let index = 0;
            const cursorRequest = {};
            const advance = () => queueMicrotask(() => {
              const entry = entries[index++];
              cursorRequest.result = entry ? { key: entry[0], value: copy(entry[1]), continue: advance,
                delete: () => request(() => data.delete(entry[0])) } : null;
              cursorRequest.onsuccess?.({ target: cursorRequest });
            });
            advance(); return cursorRequest;
          },
        };
      } };
      // Writes complete before the transaction's completion notification.
      queueMicrotask(() => queueMicrotask(() => tx.oncomplete?.({ target: tx })));
      return tx;
    },
  };
  return db;
}

export async function saveNativeSettings(prefix, settings, { host = globalThis, timeout = 4000 } = {}) {
  const name = `${prefix}data`;
  let db;
  const initialize = database => {
    for (const store of ['video', 'image', 'audio', 'config', 'data']) {
      if (!database.objectStoreNames.contains(store)) database.createObjectStore(store, store === 'video' ? { keyPath: 'time' } : undefined);
    }
  };
  const write = database => new Promise((resolve, reject) => {
    const tx = database.transaction('config', 'readwrite');
    tx.oncomplete = resolve; tx.onerror = tx.onabort = reject;
    for (const [key, value] of Object.entries(settings)) tx.objectStore('config').put(value, key);
  });
  let timer, abandoned = false;
  try {
    await Promise.race([(async () => {
      db = await new Promise((resolve, reject) => {
        const req = host.indexedDB.open(name, 4);
        req.onupgradeneeded = () => { if (!abandoned) initialize(req.result); else req.transaction?.abort(); };
        req.onsuccess = () => { if (abandoned) req.result.close(); else resolve(req.result); };
        req.onerror = req.onblocked = reject;
      });
      await write(db);
    })(), new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Storage timeout')), timeout); })]);
    db.close(); return true;
  } catch {
    abandoned = true; db?.close();
    const memory = createMemoryDatabase(); initialize(memory); await write(memory);
    let original; try { original = host.indexedDB; } catch {}
    const facade = { open(database, version) {
      if (database !== name) return original.open(database, version);
      const req = {};
      queueMicrotask(() => { req.result = memory; req.onsuccess?.({ target: req }); });
      return req;
    } };
    Object.defineProperty(host, 'indexedDB', { configurable: true, value: facade });
    return false;
  } finally { clearTimeout(timer); }
}
