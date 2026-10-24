// Manual check: scaffold each server template into a temp dir, npm ci, build, then start the standalone output and request /.
// Needs network access. Never run against a real host. Usage: node scripts/verify-node-templates.mjs [next-ts astro-js ...]
import {mkdtempSync,readdirSync,readFileSync,writeFileSync,mkdirSync,statSync,existsSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join,dirname} from 'node:path';import {spawnSync,spawn} from 'node:child_process';
const root=join(import.meta.dirname,'..','src','lib','frameworks','templates');
const ids=process.argv.slice(2).length?process.argv.slice(2):['next','astro','sveltekit','nuxt'].flatMap(f=>[`${f}-ts`,`${f}-js`]);
const bin={next:'next/dist/bin/next',astro:'astro/bin/astro.mjs',sveltekit:'vite/bin/vite.js',nuxt:'nuxt/bin/nuxt.mjs'};
const start={next:['server.js'],astro:['dist/server/entry.mjs'],sveltekit:['build/index.js'],nuxt:['.output/server/index.mjs']};
const env={PATH:process.env.PATH,HOME:tmpdir(),NEXT_TELEMETRY_DISABLED:'1',ASTRO_TELEMETRY_DISABLED:'1',NUXT_TELEMETRY_DISABLED:'1',DO_NOT_TRACK:'1'};
function copy(src,dst){mkdirSync(dst,{recursive:true});for(const e of readdirSync(src,{withFileTypes:true})){const s=join(src,e.name),d=join(dst,e.name);if(e.isDirectory())copy(s,d);else{mkdirSync(dirname(d),{recursive:true});writeFileSync(d,readFileSync(s,'utf8').replaceAll('{{name}}','my-app'));}}}
let failed=0;
for(const [i,id] of ids.entries()){
 const fw=id.split('-')[0],dir=mkdtempSync(join(tmpdir(),`somnia-${id}-`));copy(join(root,id),dir);
 const run=(args)=>spawnSync(process.execPath,args,{cwd:dir,env,encoding:'utf8'});
 const ci=spawnSync('npm',['ci','--ignore-scripts','--no-audit','--no-fund'],{cwd:dir,env,encoding:'utf8'});
 let ok=ci.status===0&&run([join(dir,'node_modules',bin[fw]),'build']).status===0;
 let out=fw==='next'?join(dir,'.next/standalone'):fw==='nuxt'?join(dir,'.output'):dir;
 if(ok&&fw==='next'){/* standalone needs static assets next to it */}
 let status='';
 if(ok){const port=18500+i,entry=start[fw][0].replace(/^\.output\//,'');const cwd=fw==='nuxt'?join(dir,'.output'):out;
  const child=spawn(process.execPath,[entry],{cwd,env:{...env,PORT:String(port),HOST:'127.0.0.1',HOSTNAME:'127.0.0.1',NITRO_PORT:String(port),NITRO_HOST:'127.0.0.1',NODE_ENV:'production'}});
  for(let t=0;t<20&&status!=='200';t++){await new Promise(r=>setTimeout(r,500));try{status=String((await fetch(`http://127.0.0.1:${port}/`)).status);}catch{}}
  child.kill();ok=status==='200';}
 console.log(`${ok?'ok  ':'FAIL'} ${id} ${status}`);if(!ok)failed++;rmSync(dir,{recursive:true,force:true});
}
process.exit(failed?1:0);
