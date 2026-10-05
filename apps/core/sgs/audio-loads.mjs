// One deadline covers fetch, body read and decode. Abort alone cannot settle a
// stuck decoder (or a fetch implementation that ignores its signal).
export function createAudioLoader({ fetcher, baseURL, timeout = 8000, timers = globalThis }) {
  const cache = new Map(), pending = new Set();
  const canceled = () => Object.assign(new Error('声音载入已取消'), { name: 'AbortError' });
  return {
    load(file, context) {
      if (cache.has(file)) return cache.get(file).promise;
      const controller = new AbortController(), entry = {};
      cache.set(file, entry); pending.add(entry);
      entry.promise = new Promise((resolve, reject) => {
        let settled = false, timer;
        const finish = (error, buffer) => {
          if (settled) return;
          settled = true; timers.clearTimeout(timer); pending.delete(entry);
          if (error && cache.get(file) === entry) cache.delete(file);
          if (error) reject(error); else resolve(buffer);
        };
        entry.cancel = () => { if (!settled) { controller.abort(); finish(canceled()); } };
        timer = timers.setTimeout(() => {
          controller.abort(); finish(Object.assign(new Error('声音载入超时，已跳过'), { name: 'TimeoutError' }));
        }, timeout);
        try {
          Promise.resolve(fetcher(new URL(file, baseURL), { signal: controller.signal })).then(async response => {
            if (!response.ok) throw new Error(`声音载入失败：${response.status}`);
            const bytes = await response.arrayBuffer();
            if (controller.signal.aborted) throw canceled();
            return context.decodeAudioData(bytes);
          }).then(buffer => finish(null, buffer), error => finish(error));
        } catch (error) { finish(error); }
      });
      return entry.promise;
    },
    cancel() { for (const entry of [...pending]) entry.cancel(); },
    dispose() { this.cancel(); cache.clear(); },
    get size() { return cache.size; },
    get pending() { return pending.size; },
  };
}
