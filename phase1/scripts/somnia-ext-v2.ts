/**
 * somnia-ext-v2: SDK v2 authoring kit CLI.
 *
 *   npx tsx scripts/somnia-ext-v2.ts validate <folder> [--lane local|store|experimental]
 *                                              [--somnia-version X.Y.Z] [--api-version X.Y.Z]
 *   npx tsx scripts/somnia-ext-v2.ts pack <folder> [same options]
 *
 * validate checks a folder against the same manifest and package gates the
 * installer runs (manifestV2 + packageV2). pack additionally writes
 * <id>-<version>.somniax next to the folder and prints its SHA-256.
 * Exit codes: 0 ok, 1 validation errors, 2 usage or tool failure.
 */
import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,lstatSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {zipSync} from 'fflate';
import {parsePackageFilesV2} from '../src/lib/extensions/packageV2';
import type {ExtensionDiagnostic,ManifestValidationOptions} from '../src/lib/extensions/manifestV2';

type Lane=NonNullable<ManifestValidationOptions['lane']>;
function usage():never {
  console.error('usage: somnia-ext-v2 <validate|pack> <folder> [--lane local|store|experimental] [--somnia-version X.Y.Z] [--api-version X.Y.Z]');
  process.exit(2);
}
const [command,folderArg,...rest]=process.argv.slice(2);
if((command!=='validate'&&command!=='pack')||!folderArg) usage();
const options:ManifestValidationOptions={};
for(let i=0;i<rest.length;i++){
  const flag=rest[i],value=rest[++i];
  if(!value) usage();
  if(flag==='--lane'){if(!['local','store','experimental'].includes(value)) usage(); options.lane=value as Lane;}
  else if(flag==='--somnia-version') options.somniaVersion=value;
  else if(flag==='--api-version') options.apiVersion=value;
  else usage();
}
const root=resolve(folderArg);
function readFolder(dir:string,prefix:string,files:Record<string,Uint8Array>):void {
  for(const name of readdirSync(dir)){
    const full=join(dir,name);const stat=lstatSync(full);const rel=prefix?`${prefix}/${name}`:name;
    if(stat.isSymbolicLink()||(!stat.isDirectory()&&!stat.isFile())){
      console.error(`error SOM-EXT-005 /files/${rel} symlink or special file rejected before reading bytes.`);
      process.exit(1);
    }
    if(stat.isDirectory()) readFolder(full,rel,files);
    else files[rel]=new Uint8Array(readFileSync(full));
  }
}
const files:Record<string,Uint8Array>={};
try{readFolder(root,'',files);}catch(error){console.error(`error: cannot read folder: ${(error as Error).message}`);process.exit(2);}
const result=parsePackageFilesV2(files,options);
const print=(errors:ExtensionDiagnostic[])=>{
  for(const e of errors) console.error(`error ${e.code} ${e.path||'/'} ${e.message}`);
  console.error(`${errors.length} errors, 0 warnings`);
};
if(!result.ok){print(result.errors);process.exit(1);}
const names=Object.keys(result.package.files).sort();
const bytes=names.reduce((sum,n)=>sum+result.package.files[n].byteLength,0);
console.log(`✓ manifest valid (0 errors, 0 warnings)`);
console.log(`✓ package ok: ${names.length} files, ${(bytes/1024).toFixed(1)} KiB expanded`);
if(command==='pack'){
  const archive=zipSync(Object.fromEntries(names.map(n=>[n,result.package.files[n]])),{level:9});
  const {id,version}=result.package.manifest;
  const out=join(resolve(root,'..'),`${id}-${version}.somniax`);
  writeFileSync(out,archive);
  const sha=createHash('sha256').update(archive).digest('hex');
  console.log(`✓ wrote ${out}`);
  console.log(`  sha256: ${sha}`);
}
