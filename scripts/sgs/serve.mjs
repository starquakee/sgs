import { createServer } from 'node:http';
import { createReadStream, existsSync } from 'node:fs';
import { realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, extname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { localFiles } from './local-files.mjs';
const output=fileURLToPath(new URL('../../dist-sgs/',import.meta.url));
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.json':'application/json; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.mp3':'audio/mpeg','.ogg':'audio/ogg','.woff2':'font/woff2','.woff':'font/woff','.txt':'text/plain; charset=utf-8'};
export function createSgsServer({root=output,staticOnly=false}={}) {
const files=staticOnly?(_req,_res,next)=>next():localFiles(root);
const inside=p=>{const rel=relative(root,p);return !isAbsolute(rel)&&rel!=='..'&&!rel.startsWith('../')&&!rel.startsWith('..\\')};
return createServer((req,res)=>files(req,res,async()=>{
  try {
    if(req.method!=='GET'&&req.method!=='HEAD'){res.writeHead(405);res.end();return;}
    const url=new URL(req.url,'http://127.0.0.1');
    let pathname=decodeURIComponent(url.pathname);
    if(staticOnly&&pathname==='/'){res.writeHead(307,{Location:'/sgs.html'+url.search});res.end();return;}
    if(pathname==='/') pathname='/sgs.html';
    const file=resolve(root,'.'+pathname);
    if(!inside(file)){res.writeHead(403);res.end();return;}
    const actual=await realpath(file);
    if(!inside(actual)||!(await stat(actual)).isFile()){res.writeHead(404);res.end();return;}
    res.writeHead(200,{'Content-Type':mime[extname(actual)]||'application/octet-stream','Cache-Control':'no-cache','X-Content-Type-Options':'nosniff'});
    if(req.method==='HEAD')res.end();else createReadStream(actual).pipe(res);
  }catch{res.writeHead(404);res.end('Not found');}
}));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
const port=Number(process.env.PORT || 8081);
const staticOnly=process.argv.includes('--static-only');
if(!existsSync(resolve(output,'sgs.html'))) {console.error('请先运行 node scripts/sgs/build.mjs');process.exit(1)}
const server=createSgsServer({staticOnly});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?`端口 ${port} 已占用，请关闭已有游戏服务，或设置 PORT。`:e.message);process.exitCode=1});
server.listen(port,'127.0.0.1',()=>console.log(`三国杀单机研习：http://127.0.0.1:${port}/sgs.html${staticOnly?' (static-only)':''}`));
}
