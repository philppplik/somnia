// Updater end-to-end harness (no network, no secrets, no real installers).
// What it does:
//  1. Creates fake signed artifacts (.sig files) for Windows, Linux and macOS in a temp dir.
//  2. Runs scripts/make-latest-json.py exactly like the release step does.
//  3. Serves the result from a local HTTP server that mimics GitHub's releases/latest/download/latest.json.
//  4. Acts as the app's updater: fetches latest.json, checks the shape Tauri requires, compares versions
//     (only strictly newer counts), picks the entry for a given platform and checks the download URL name.
// Usage: node scripts/updater-e2e/harness.mjs [--current 9.18.0] [--next 9.19.0] [--platform windows-x86_64]
// Exit code 0 = all checks passed.
import {createServer} from 'node:http';
import {mkdtempSync,writeFileSync,mkdirSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,dirname} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {compareSemver,validateManifest,pickPlatform} from './lib.mjs';

const here=dirname(fileURLToPath(import.meta.url));
const arg=(n,d)=>{const i=process.argv.indexOf('--'+n);return i>0?process.argv[i+1]:d;};
const current=arg('current','9.18.0'),next=arg('next','9.19.0'),platform=arg('platform','windows-x86_64');
const tag='v'+next;
const failures=[];const check=(ok,msg)=>{console.log((ok?'PASS ':'FAIL ')+msg);if(!ok)failures.push(msg);};

// 1. fake artifacts
const tmp=mkdtempSync(join(tmpdir(),'somnia-updater-'));
const dirs={win:join(tmp,'nsis'),lin:join(tmp,'appimage'),mac:join(tmp,'macos')};
for(const d of Object.values(dirs))mkdirSync(d);
const fakeSig=s=>Buffer.from(`untrusted comment: fake signature ${s}\nRWQfake${s}==`).toString('base64');
writeFileSync(join(dirs.win,'Somnia_x64-setup.exe.sig'),fakeSig('win'));
writeFileSync(join(dirs.lin,'somnia_amd64.AppImage.sig'),fakeSig('lin'));
writeFileSync(join(dirs.mac,'Somnia.app.tar.gz.sig'),fakeSig('mac'));
writeFileSync(join(tmp,'notes.md'),'Test release notes\n');

// 2. build latest.json
const out=join(tmp,'latest.json');
const r=spawnSync('python3',[join(here,'..','make-latest-json.py'),tag,join(tmp,'notes.md'),dirs.win,dirs.lin,out,dirs.mac],{encoding:'utf8'});
check(r.status===0,'make-latest-json.py exits 0 ('+(r.stdout||r.stderr).trim()+')');

// 3. serve
const server=createServer((req,res)=>{
  if(req.url==='/releases/latest/download/latest.json'){res.writeHead(200,{'content-type':'application/json'});res.end(readFileSync(out));}
  else{res.writeHead(404);res.end();}
});
await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
const port=server.address().port;

// 4. act as the updater
try{
  const resp=await fetch(`http://127.0.0.1:${port}/releases/latest/download/latest.json`);
  check(resp.status===200,'latest.json is served');
  const manifest=await resp.json();
  const problems=validateManifest(manifest,tag);
  check(problems.length===0,'manifest shape is valid'+(problems.length?': '+problems.join('; '):''));
  check(Object.keys(manifest.platforms).sort().join()==='darwin-aarch64,linux-x86_64,windows-x86_64','lists windows, linux and macOS (Apple Silicon)');
  check(compareSemver(manifest.version,current)>0,`${manifest.version} is newer than installed ${current} -> pill shows`);
  check(compareSemver(manifest.version,manifest.version)===0,'same version -> no update offered');
  check(compareSemver(current,manifest.version)<0,'older manifest than installed -> no downgrade');
  const entry=pickPlatform(manifest,platform);
  check(!!entry,`platform ${platform} has an entry`);
  if(entry)check(entry.url.endsWith(tag+'/'+entry.url.split('/').pop())&&entry.url.includes(`Somnia-${tag}-`),'download URL points at this tag and the Somnia-<tag>-... asset name');
  const mac=pickPlatform(manifest,'darwin-aarch64');
  check(!!mac&&mac.url.endsWith(`Somnia-${tag}-macos-aarch64.app.tar.gz`),'macOS entry points at the .app.tar.gz archive (not the .dmg)');
}finally{server.close();}
console.log(failures.length?`\n${failures.length} check(s) failed`:'\nAll updater checks passed');
process.exit(failures.length?1:0);
