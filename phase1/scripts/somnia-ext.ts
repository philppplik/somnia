/* Somnia extension authoring CLI. Run: npm run ext -- <init|validate|pack|entry> ... (see docs/extensions/12-authoring-kit.md) */
import {readFileSync,writeFileSync,readdirSync,statSync,mkdirSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {join,relative,resolve,basename,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {lintPackage,buildZip,makeIndexEntry,rawZipURL,fillTemplate} from '../src/lib/extensions/authoring';
const here=fileURLToPath(new URL('.',import.meta.url));
function readDir(dir:string,base=dir,out:Record<string,Uint8Array>={}){
 for(const n of readdirSync(dir)){if(n.startsWith('.')||n==='node_modules')continue;const p=join(dir,n);
  if(statSync(p).isDirectory())readDir(p,base,out);else if(!n.endsWith('.zip'))out[relative(base,p).split(sep).join('/')]=new Uint8Array(readFileSync(p));}
 return out;}
function flag(args:string[],name:string):string|undefined{const i=args.indexOf('--'+name);return i>=0?args[i+1]:undefined;}
function show(dir:string){
 if(!existsSync(dir)||!statSync(dir).isDirectory()){console.error(`Not a folder: ${dir}`);process.exit(2);}
 const r=lintPackage(readDir(dir));
 if(!r.ok){console.error('INVALID');for(const e of r.errors)console.error('  error: '+e);process.exit(1);}
 console.log(`OK  ${r.manifest!.id} ${r.manifest!.version}  permissions: ${r.manifest!.permissions.join(', ')||'none'}`);
 for(const w of r.warnings)console.log('  warning: '+w);
 console.log(r.catalogReady?'  GitHub index: eligible':'  GitHub index: not eligible (worker code)');
 return r;}
const [cmd,...args]=process.argv.slice(2);
if(cmd==='init'){
 const [id,...rest]=args;const name=rest.join(' ')||(id||'').split('.').pop()||'';
 if(!id||!/^[a-z0-9][a-z0-9-]*(\.[a-z0-9][a-z0-9-]*)+$/.test(id)){console.error('Usage: init <vendor.name> ["Display name"]  (id like acme.my-tool)');process.exit(2);}
 const dest=resolve(id.split('.').pop()!);if(existsSync(dest)){console.error(`Folder exists: ${dest}`);process.exit(2);}
 mkdirSync(dest,{recursive:true});const src=join(here,'..','templates','extension');
 for(const n of readdirSync(src)){const t=readFileSync(join(src,n),'utf8');writeFileSync(join(dest,n),n==='LICENSE'?t:fillTemplate(t,{id,name}));}
 console.log(`Created ${dest}`);show(dest);
}else if(cmd==='validate'){show(resolve(args[0]||'.'));
}else if(cmd==='pack'){
 const dir=resolve(args[0]||'.');const r=show(dir);const files=readDir(dir);const zip=buildZip(files);
 const out=resolve(flag(args,'out')||`${basename(dir)}-${r!.manifest!.version}.zip`);writeFileSync(out,zip);
 const sha=createHash('sha256').update(zip).digest('hex');console.log(`Wrote ${out} (${zip.length} bytes)\nsha256 ${sha}`);
}else if(cmd==='entry'){
 const [zipPath,dir]=[args[0],args[1]||'.'];const repo=flag(args,'repo'),ref=flag(args,'ref'),path=flag(args,'path'),author=flag(args,'author'),description=flag(args,'description');
 if(!zipPath||!repo||!ref||!path||!author||!description){console.error('Usage: entry <zip> <folder> --repo <github url> --ref <tag|commit> --path <zip path in repo> --author <name> --description <text>');process.exit(2);}
 const r=lintPackage(readDir(resolve(dir)));if(!r.ok){console.error(r.errors.join('\n'));process.exit(1);}
 if(!r.catalogReady){console.error('Worker code is not accepted by the index yet.');process.exit(1);}
 const sha=createHash('sha256').update(readFileSync(resolve(zipPath))).digest('hex');
 console.log(JSON.stringify(makeIndexEntry(r.manifest!,{author,description,repo,download:rawZipURL(repo,ref,path),sha256:sha}),null,2));
}else{console.error('Commands: init <id> [name] | validate [folder] | pack [folder] [--out file.zip] | entry <zip> <folder> --repo ... --ref ... --path ... --author ... --description ...');process.exit(2);}
