import {parse} from '@babel/parser';
import {readFileSync,existsSync,statSync} from 'node:fs';
import {resolve,dirname,relative} from 'node:path';
import {performance} from 'node:perf_hooks';
const root=resolve(process.argv[2]??'.');
const entry=resolve(root,'src/main.tsx');
function resolveLocal(from,spec){const p=resolve(dirname(from),spec);return [p,p+'.ts',p+'.tsx',p+'.js',p+'/index.ts',p+'/index.tsx'].find(f=>existsSync(f)&&statSync(f).isFile());}
const trials=[];let files,bytes;
for(let i=0;i<10;i++){
 const start=performance.now(),seen=new Set();let total=0;
 function visit(file){if(seen.has(file)||! /\.[cm]?[jt]sx?$/.test(file))return;seen.add(file);const text=readFileSync(file,'utf8');total+=Buffer.byteLength(text);
 const ast=parse(text,{sourceType:'module',plugins:file.endsWith('tsx')?['typescript','jsx']:['typescript']});
 for(const n of ast.program.body){if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(n.type)&&n.source){
 if(n.importKind==='type'||n.exportKind==='type')continue;
 const spec=n.source.value;if(!spec.startsWith('.'))continue;const child=resolveLocal(file,spec);if(child)visit(child);
 }}
 }visit(entry);trials.push(performance.now()-start);files=[...seen].map(f=>relative(root,f));bytes=total;
}
trials.sort((a,b)=>a-b);
console.log(JSON.stringify({scenario:'local-static-module-source-parse',trials:10,modules:files.length,sourceBytes:bytes,p50Ms:trials[4],p95Ms:trials[9],inactiveCanvases:files.filter(f=>/components\/(documents|sheets|slides|photos|sound|video|design|vectorstudio|vibespace)\/.*(Canvas|Workspace|DesktopVibeSpacePanel)/.test(f)),files},null,2));
