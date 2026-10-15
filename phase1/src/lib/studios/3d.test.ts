import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync,statSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {getStudio,listStudios,acceptsFormat} from '../studios';
import {CATALOGUES} from '../i18n';
import {studioShortName} from '../../components/studios/studioShortName';
import {studioStarterCopy} from './starterCopy';
import {STUDIO3D_COMMANDS,studio3DCommandSpecs} from '../studio3d/commands';
import {COMMAND_ID_PATTERN} from '../commandSpec';
const src=fileURLToPath(new URL('../../',import.meta.url));
test('3D is registered before Vibe Space, with a real hero action and claims only formats it can open',()=>{
 const s=getStudio('3d');const ids=listStudios().map(x=>x.id);
 assert.ok(ids.indexOf('3d')>ids.indexOf('vector'));assert.equal(ids.at(-1),'vibespace');
 assert.equal(s.canvas,'studio3d.canvas');assert.equal(s.shellV2?.panels?.length,2);
 assert.equal(s.shell.header.heroAction?.id,'studio3d.render.still');
 assert.equal(acceptsFormat(s,'a.glb'),true);assert.equal(acceptsFormat(s,'a.gltf'),true);assert.equal(acceptsFormat(s,'a.obj'),true);assert.equal(acceptsFormat(s,'a.stl'),true);assert.equal(acceptsFormat(s,'a.ply'),true);assert.equal(acceptsFormat(s,'a.fbx'),false);
 assert.equal(studioShortName('3d','Somnia 3D'),'3D');assert.match(studioStarterCopy['3d'].headline,/3D Studio/);
});
test('every studio3d command id is valid and every hero, menu and panel command exists',()=>{
 const ids=new Set(STUDIO3D_COMMANDS);const s=getStudio('3d');
 for(const id of ids)assert.match(id,COMMAND_ID_PATTERN);
 assert.ok(ids.has(s.shell.header.heroAction!.id));
 for(const m of s.shellV2!.menus??[])assert.ok(ids.has(m.command),m.command);
 for(const p of s.shellV2!.panels??[])for(const c of p.commands??[])assert.ok(ids.has(c),c);
 for(const sec of s.shellV2!.inspector?.sections??[])for(const c of sec.commands??[])assert.ok(ids.has(c),c);
});
test('commands are interactive only and disabled without a viewport',()=>{
 for(const c of studio3DCommandSpecs()){assert.equal(c.level,'ui');if(c.id!=='studio3d.model.open'&&c.id!=='studio3d.scene.new'&&c.id!=='studio3d.view.grid')assert.equal(c.enabled!({origin:'test'}),false,c.id);}
});
test('all five locales carry the studio strings, with the same placeholders',()=>{
 const keys=['studio.3d','cmd.studio.3d','studio3d.title','studio3d.hero.render','studio3d.status.loading',...STUDIO3D_COMMANDS.map(id=>'cmd.'+id)];
 for(const [tag,c] of Object.entries(CATALOGUES))for(const k of keys){assert.ok(c[k],`${tag}:${k}`);assert.equal(/\{name\}/.test(c[k]),/\{name\}/.test(CATALOGUES.en[k]),`${tag}:${k}`);}
 assert.equal(CATALOGUES.en[getStudio('3d').shell.header.heroAction!.labelKey],'Render still');
});
test('the shell registration names exactly the hosts the manifest uses',()=>{
 const reg=readFileSync(join(src,'components/studio3d/registerShell.ts'),'utf8');const def=getStudio('3d').shellV2!;
 for(const p of (def.panels??[]).filter(x=>x.component!=='shell.inspector'))assert.ok(reg.includes(`'${p.component}'`),p.component);
 for(const sec of def.inspector!.sections)assert.ok(reg.includes(`'${sec.component}'`),sec.component);
 const hosts=readFileSync(join(src,'components/studios/hosts.tsx'),'utf8');
 assert.match(hosts,new RegExp(`'${getStudio('3d').canvas.replace('.','\\.')}':Studio3DCanvas`));
 assert.match(readFileSync(join(src,'App.tsx'),'utf8'),/components\/studio3d\/registerShell/);
});
test('three.js stays in the lazy viewport chunk',()=>{
 const hits:string[]=[];
 const walk=(d:string)=>{for(const f of readdirSync(d)){const p=join(d,f);if(statSync(p).isDirectory()){if(f!=='node_modules'&&f!=='generated')walk(p);}else if(/\.tsx?$/.test(f)&&!/\.test\./.test(f)){const t=readFileSync(p,'utf8');if(/from\s+['"]three(\/|['"])/.test(t)||/import\(['"]three/.test(t))hits.push(p.slice(src.length));}}};
 walk(src);
 assert.deepEqual(hits.sort(),['components/studio3d/Viewport3D.tsx','lib/studio3d/convexHull.ts','lib/studio3d/shrinkwrap.ts','lib/studio3d/stage.ts']);
 const stageUsers:string[]=[];
 const scan=(d:string)=>{for(const f of readdirSync(d)){const p=join(d,f);if(statSync(p).isDirectory()){if(f!=='node_modules'&&f!=='generated')scan(p);}else if(/\.tsx?$/.test(f)&&!/\.test\./.test(f)&&/^import\s+(?!\s*type)[^\n]*(studio3d\/stage'|'\.\/stage')/m.test(readFileSync(p,'utf8')))stageUsers.push(p.slice(src.length));}};
 scan(src);
 assert.deepEqual(stageUsers,['components/studio3d/Viewport3D.tsx'],'only the lazy viewport imports stage at runtime');
 const canvas=readFileSync(join(src,'components/studio3d/Studio3DCanvas.tsx'),'utf8');
 assert.match(canvas,/lazy\(\(\)=>import\('\.\/Viewport3D'\)\)/);assert.doesNotMatch(canvas,/^import .*Viewport3D/m);
});
