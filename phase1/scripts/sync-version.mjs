// CI helper: makes the Tauri app version equal the release number (somniaRelease in package.json), because the updater compares versions.
// With --updater it also turns on signed updater artifacts (needs TAURI_SIGNING_PRIVATE_KEY in the environment).
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8'));const v=String(pkg.somniaRelease??'');
if(!/^\d+\.\d+\.\d+$/.test(v)){console.log(`somniaRelease "${v}" is not x.y.z, leaving app version unchanged`);process.exit(0);}
const updater=process.argv.includes('--updater');
for(const f of ['tauri.conf.json','tauri.alpha.conf.json','tauri.windows-alpha.conf.json','tauri.macos-alpha.conf.json']){
 const p=`src-tauri/${f}`;if(!existsSync(p))continue;const c=JSON.parse(readFileSync(p,'utf8'));
 if(f==='tauri.conf.json')c.version=v;else c.version=v;
 if(updater&&f!=='tauri.conf.json'&&f!=='tauri.macos-alpha.conf.json'){c.bundle=c.bundle??{};c.bundle.createUpdaterArtifacts=true;}
 writeFileSync(p,JSON.stringify(c,null,2)+'\n');}
console.log(`app version ${v}, updater artifacts ${updater?'on':'off'}`);
