// Pure helpers shared by the harness and its unit tests.
export function compareSemver(a,b){
  const p=s=>String(s).replace(/^v/,'').split('-')[0].split('.').map(n=>parseInt(n,10));
  const x=p(a),y=p(b);
  for(let i=0;i<3;i++){const d=(x[i]||0)-(y[i]||0);if(d)return d>0?1:-1;}
  return 0;
}
const PLATFORM_KEY=/^(windows|linux|darwin)-(x86_64|aarch64|i686|armv7)$/;
export function validateManifest(m,tag){
  const out=[];
  if(!m||typeof m!=='object')return ['manifest is not an object'];
  if(typeof m.version!=='string'||!/^\d+\.\d+\.\d+$/.test(m.version))out.push('version must be x.y.z without a leading v');
  if(tag&&m.version!==String(tag).replace(/^v/,''))out.push('version does not match the release tag');
  if(typeof m.pub_date!=='string'||Number.isNaN(Date.parse(m.pub_date)))out.push('pub_date must be an RFC 3339 date');
  if(!m.platforms||typeof m.platforms!=='object'||!Object.keys(m.platforms).length)out.push('platforms is empty');
  for(const [k,v] of Object.entries(m.platforms||{})){
    if(!PLATFORM_KEY.test(k))out.push(`unknown platform key ${k}`);
    if(!v||typeof v.signature!=='string'||!v.signature)out.push(`${k}: signature missing`);
    if(!v||typeof v.url!=='string'||!/^https:\/\/github\.com\/philppplik\/somnia\/releases\/download\//.test(v.url))out.push(`${k}: url must be a GitHub release asset of philppplik/somnia`);
    if(k.startsWith('darwin')&&v&&/\.dmg$/.test(v.url||''))out.push(`${k}: updater needs the .app.tar.gz archive, not the .dmg`);
  }
  return out;
}
export const pickPlatform=(m,key)=>m.platforms?.[key]??null;
