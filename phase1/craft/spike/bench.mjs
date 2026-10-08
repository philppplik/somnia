import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import { chromium } from 'playwright';
import { gzipSync, brotliCompressSync } from 'node:zlib';
const root=resolve('..');
const server=createServer(async(req,res)=>{try {const path=resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!path.startsWith(root+'/')){res.writeHead(403).end();return}const bytes=await readFile(path);res.setHeader('Content-Type',({'.js':'text/javascript','.wasm':'application/wasm','.html':'text/html'})[extname(path)]||'application/octet-stream');res.end(bytes)}catch{res.writeHead(404).end()}});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1180,height:1500}});
 await page.goto(`http://127.0.0.1:${server.address().port}/spike/bench.html`);
 const results=await page.evaluate(()=>window.run());
 results.sizes={};for(const path of ['../pkg/somnia_craft_bg.wasm','../pkg/somnia_craft.js','worker.js']){const b=await readFile(path);results.sizes[path]={raw:b.length,gzip:gzipSync(b).length,brotli:brotliCompressSync(b).length}}
 await writeFile('results.json',JSON.stringify(results,null,2));await page.screenshot({path:'preview.png',fullPage:true});console.log(JSON.stringify(results,null,2));
}finally{await browser?.close();await new Promise(r=>server.close(r))}
