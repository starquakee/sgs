import { readFile, readdir, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute } from 'node:path';

const routes = new Set(['/checkFile', '/checkDir', '/readFile', '/readFileAsText', '/getFileList', '/writeFile', '/removeFile', '/createDir', '/removeDir']);
export function localFiles(root) {
  return async (req, res, next) => {
    const url = new URL(req.url, 'http://127.0.0.1');
    if (!routes.has(url.pathname)) return next();
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    const send = (status, value) => { res.statusCode = status; res.end(JSON.stringify(value)); };
    if (req.method !== 'GET' || ['/writeFile', '/removeFile', '/createDir', '/removeDir'].includes(url.pathname)) {
      return send(405, { success: false, errorMsg: '单机网页仅开放游戏资源读取' });
    }
    const name = url.searchParams.get('fileName') ?? url.searchParams.get('dir') ?? '';
    const candidate = resolve(root, name);
    const isInside = p => { const r = relative(root, p); return !isAbsolute(r) && r !== '..' && !r.startsWith('..\\') && !r.startsWith('../'); };
    if (!isInside(candidate) || name.includes('\0')) return send(403, { success: false, errorMsg: '无效资源路径' });
    try {
      const actual = await realpath(candidate);
      if (!isInside(actual)) return send(403, { success: false, errorMsg: '无效资源路径' });
      const info = await stat(actual);
      let data;
      if (url.pathname === '/checkFile' || url.pathname === '/checkDir') data = info.isDirectory() ? 'directory' : 'file';
      else if (url.pathname === '/getFileList') {
        const entries = await readdir(actual, { withFileTypes: true });
        data = { folders: entries.filter(x => x.isDirectory() && !x.name.startsWith('.')).map(x => x.name), files: entries.filter(x => x.isFile() && !x.name.startsWith('.')).map(x => x.name) };
      } else if (url.pathname === '/readFileAsText') data = await readFile(actual, 'utf8');
      else data = Array.from(await readFile(actual));
      send(200, { success: true, data });
    } catch (error) {
      if (error.code === 'ENOENT' && (url.pathname === '/checkFile' || url.pathname === '/checkDir')) return send(200, { success: true, data: null });
      send(404, { success: false, errorMsg: '游戏资源不存在' });
    }
  };
}

export function localFilesPlugin(root) {
  return { name: 'sgs-local-files', configureServer(server) { server.middlewares.use(localFiles(root)); } };
}
