import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { localFiles } from './local-files.mjs';
const root=fileURLToPath(new URL('../../dist-sgs/',import.meta.url));
const port=Number(process.env.PORT || 8081);
if(!existsSync(resolve(root,'sgs.html'))) {console.error('请先运行 node scripts/sgs/build.mjs');process.exit(1)}
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.woff2':'font/woff2','.woff':'font/woff','.txt':'text/plain; charset=utf-8'};
const files=localFiles(root);
const inside=p=>{const rel=relative(root,p);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\')};
const server=createServer((req,res)=>files(req,res,async()=>{
  try {
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1');
    let pathname=decodeURIComponent(url.pathname);
    if(pathname==='/') pathname='/sgs.html';
    const file=resolve(root,'.'+pathname);
    if(!inside(file)){res.writeHead(403);res.end();return;}
    const actual=await realpath(file);
    if(!inside(actual)||!(await stat(actual)).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[extname(actual)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else createReadStream(actual).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
}));
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已占用，请关闭已有游戏服务，或设置 PORT。`:e.message);process.exitCode=1});
server.listen(port,'127.0.0.1',()=>console.log(`三国杀单机研习：http://127.0.0.1:${port}/sgs.html`));
