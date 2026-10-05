// Writes src/lib/thirdParty.json from the installed production dependencies. Run: npm run licenses
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
const pkg=JSON.parse(readFileSync('package.json','utf8'));
const seen=new Map();
const visit=name=>{if(seen.has(name))return;const file=`node_modules/${name}/package.json`;if(!existsSync(file))return;const p=JSON.parse(readFileSync(file,'utf8'));
 seen.set(name,{name,version:p.version,license:typeof p.license==='string'?p.license:p.license?.type??(Array.isArray(p.licenses)?p.licenses.map(l=>l.type).join(' OR '):'UNKNOWN'),homepage:p.homepage??p.repository?.url?.replace(/^git\+/,'').replace(/\.git$/,'')??''});
 for(const dep of Object.keys(p.dependencies??{}))visit(dep);};
for(const dep of Object.keys(pkg.dependencies??{}))visit(dep);
// Bundled assets that are not npm packages.
seen.set('Momo Signature (font)',{name:'Momo Signature (font)',version:'1.0',license:'OFL-1.1',homepage:'https://github.com/typeassociates/MomoSignature'});
const list=[...seen.values()].sort((a,b)=>a.name.localeCompare(b.name));
writeFileSync('src/lib/thirdParty.json',JSON.stringify(list,null,1)+'\n');
console.log(`${list.length} packages, licenses: ${[...new Set(list.map(x=>x.license))].join(', ')}`);
