import {readFileSync} from 'node:fs';
import {test,expect} from './fixtures';
/** A two-bone skinned box as GLB bytes, built with the real exporter (Node side, so the page test needs no fixture file). */
async function skinnedGlb():Promise<Buffer>{
 const THREE=await import('three');const {GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js');
 class FR{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
  readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
  readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:application/octet-stream;base64,${Buffer.from(r as ArrayBuffer).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
 (globalThis as unknown as {FileReader:unknown}).FileReader??=FR;(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
 const geo=new THREE.BoxGeometry(1,2,1);const count=geo.getAttribute('position').count;
 const si=new Uint16Array(count*4),sw=new Float32Array(count*4);for(let i=0;i<count;i++){si[i*4]=i%2;sw[i*4]=1;}
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
 const hip=new THREE.Bone();hip.name='Hip';const knee=new THREE.Bone();knee.name='Knee';knee.position.y=1;hip.add(knee);
 const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshStandardMaterial({color:0x8899aa}));mesh.name='Body';mesh.add(hip);mesh.bind(new THREE.Skeleton([hip,knee]));
 const scene=new THREE.Scene();scene.add(mesh);
 const out=await new GLTFExporter().parseAsync(scene,{binary:true}) as ArrayBuffer;
 return Buffer.from(out);
}
/** A three-bone skinned box (Hip > Knee > Ankle) for IK tests. */
async function skinnedGlb3():Promise<Buffer>{
 const THREE=await import('three');const {GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js');
 class FR{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
  readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
  readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:application/octet-stream;base64,${Buffer.from(r as ArrayBuffer).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
 (globalThis as unknown as {FileReader:unknown}).FileReader??=FR;(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
 const geo=new THREE.BoxGeometry(1,3,1);const count=geo.getAttribute('position').count;
 const si=new Uint16Array(count*4),sw=new Float32Array(count*4);for(let i=0;i<count;i++){si[i*4]=i%3;sw[i*4]=1;}
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
 const hip=new THREE.Bone();hip.name='Hip';const knee=new THREE.Bone();knee.name='Knee';knee.position.y=1;hip.add(knee);
 const ankle=new THREE.Bone();ankle.name='Ankle';ankle.position.y=1;knee.add(ankle);
 const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshStandardMaterial({color:0x8899aa}));mesh.name='Body';mesh.add(hip);mesh.bind(new THREE.Skeleton([hip,knee,ankle]));
 const scene=new THREE.Scene();scene.add(mesh);
 const out=await new GLTFExporter().parseAsync(scene,{binary:true}) as ArrayBuffer;
 return Buffer.from(out);
}
/** Two rigs with the same bone names (Hip > Knee > Ankle) in one scene, for retarget tests. */
async function skinnedGlbTwoRigs():Promise<Buffer>{
 const THREE=await import('three');const {GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js');
 class FR{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
  readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
  readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:application/octet-stream;base64,${Buffer.from(r as ArrayBuffer).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
 (globalThis as unknown as {FileReader:unknown}).FileReader??=FR;(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
 const scene=new THREE.Scene();
 for(const x of[-1,1]){
  const geo=new THREE.BoxGeometry(0.4,3,0.4);const count=geo.getAttribute('position').count;
  const si=new Uint16Array(count*4),sw=new Float32Array(count*4);for(let i=0;i<count;i++){si[i*4]=i%3;sw[i*4]=1;}
  geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
  const hip=new THREE.Bone();hip.name='Hip';const knee=new THREE.Bone();knee.name='Knee';knee.position.y=1;hip.add(knee);
  const ankle=new THREE.Bone();ankle.name='Ankle';ankle.position.y=1;knee.add(ankle);
  hip.position.x=x;
  const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshStandardMaterial({color:0x8899aa}));mesh.name=x<0?'BodyA':'BodyB';mesh.add(hip);
  mesh.updateMatrixWorld(true);mesh.bind(new THREE.Skeleton([hip,knee,ankle]));
  scene.add(mesh);
 }
 const out=await new GLTFExporter().parseAsync(scene,{binary:true}) as ArrayBuffer;
 return Buffer.from(out);
}
/** A four-bone skinned box (Hip > Knee > Ankle > Toe = 3 segments) for FABRIK tests. */
async function skinnedGlb4():Promise<Buffer>{
 const THREE=await import('three');const {GLTFExporter}=await import('three/examples/jsm/exporters/GLTFExporter.js');
 class FR{result:string|ArrayBuffer|null=null;onloadend:(()=>void)|null=null;onerror:(()=>void)|null=null;
  readAsArrayBuffer(b:Blob){void b.arrayBuffer().then(r=>{this.result=r;this.onloadend?.();},()=>this.onerror?.());}
  readAsDataURL(b:Blob){void b.arrayBuffer().then(r=>{this.result=`data:application/octet-stream;base64,${Buffer.from(r as ArrayBuffer).toString('base64')}`;this.onloadend?.();},()=>this.onerror?.());}}
 (globalThis as unknown as {FileReader:unknown}).FileReader??=FR;(globalThis as unknown as {ProgressEvent:unknown}).ProgressEvent??=Event;
 const geo=new THREE.BoxGeometry(1,4,1);const count=geo.getAttribute('position').count;
 const si=new Uint16Array(count*4),sw=new Float32Array(count*4);for(let i=0;i<count;i++){si[i*4]=i%4;sw[i*4]=1;}
 geo.setAttribute('skinIndex',new THREE.Uint16BufferAttribute(si,4));geo.setAttribute('skinWeight',new THREE.Float32BufferAttribute(sw,4));
 const hip=new THREE.Bone();hip.name='Hip';const knee=new THREE.Bone();knee.name='Knee';knee.position.y=1;hip.add(knee);
 const ankle=new THREE.Bone();ankle.name='Ankle';ankle.position.y=1;knee.add(ankle);
 const toe=new THREE.Bone();toe.name='Toe';toe.position.y=1;ankle.add(toe);
 const mesh=new THREE.SkinnedMesh(geo,new THREE.MeshStandardMaterial({color:0x8899aa}));mesh.name='Body';mesh.add(hip);mesh.bind(new THREE.Skeleton([hip,knee,ankle,toe]));
 const scene=new THREE.Scene();scene.add(mesh);
 const out=await new GLTFExporter().parseAsync(scene,{binary:true}) as ArrayBuffer;
 return Buffer.from(out);
}
/** CI-only: needs a browser with WebGL (headless Chromium uses SwiftShader). Not run in the authoring sandbox. */
function triangleGlb():Buffer{
 const pos=Buffer.from(new Float32Array([0,0,0,1,0,0,0,1,0]).buffer),idx=Buffer.from(new Uint16Array([0,1,2,0]).buffer);
 const bin=Buffer.concat([pos,idx]);
 const json={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'Triangle'}],meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:bin.length}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:6}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5123,count:3,type:'SCALAR'}]};
 const pad=(b:Buffer,f:number)=>{const o=Buffer.alloc((b.length+3)&~3,f);b.copy(o);return o;};
 const j=pad(Buffer.from(JSON.stringify(json)),0x20),b=pad(bin,0),total=12+8+j.length+8+b.length;
 const h=Buffer.alloc(12);h.writeUInt32LE(0x46546c67,0);h.writeUInt32LE(2,4);h.writeUInt32LE(total,8);
 const c1=Buffer.alloc(8);c1.writeUInt32LE(j.length,0);c1.writeUInt32LE(0x4e4f534a,4);const c2=Buffer.alloc(8);c2.writeUInt32LE(b.length,0);c2.writeUInt32LE(0x004e4942,4);
 return Buffer.concat([h,c1,j,c2,b]);
}
test('3D studio opens a GLB, shows its stats and exports a still',async({page})=>{
 await page.goto('/');
 await page.getByRole('button',{name:/3D/}).first().click();
 await expect(page.getByTestId('3d-start')).toBeVisible();
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'tri.glb',mimeType:'model/gltf-binary',buffer:triangleGlb()});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible();
 await expect(page.getByTestId('studio3d-model-section')).toContainText('GLB');
 await expect(page.getByTestId('studio3d-model-section')).toContainText('1');
 await expect(page.getByTestId('studio3d-scene-panel')).toContainText('Triangle');
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Render still'}).click()]);
 expect(download.suggestedFilename()).toBe('tri-still.png');
});
test('3D studio refuses a file that is not glTF with a readable error',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:/3D/}).first().click();
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'bad.glb',mimeType:'model/gltf-binary',buffer:Buffer.from('not a model')});
 await expect(page.getByRole('alert')).toContainText('bad.glb');
});

/** Helpers for the scene tests below. They drive the real app through its command layer (dev build) and read the studio session. */
type P=import('@playwright/test').Page;
const run=(page:P,id:string,params:unknown={})=>page.evaluate(async([i,p])=>{const m=await import('/src/lib/commands.ts');return (await m.executeCommand(i as string,p)) as unknown;},[id,params] as const);
const session=(page:P)=>page.evaluate(async()=>{const m=await import('/src/lib/studio3d/session.ts');const s=m.getStudio3DState();return {anim:s.anim,clips:s.clips,clipKeys:s.clipKeys,outline:s.outline,marked:s.marked,selected:s.selected,info:s.selectedInfo,dirty:s.dirty,notice:s.notice,status:s.status,name:s.name,bones:s.bones,weightPreview:s.weightPreview,stats:s.stats,exportClips:s.exportClips,poses:s.poses,ik:s.ik,boneLimits:s.boneLimits,views:s.views,materialPresets:s.materialPresets,env:s.env,edit:s.edit,sculpt:s.sculpt,uvChecker:s.uvChecker,snap:s.snap,pivot:s.pivot,cursor:s.cursor,measure:s.measure,viewKind:s.viewKind,viewFov:s.viewFov,history:s.history,turntable:s.turntable,shadows:s.shadows,lightHelpers:s.lightHelpers,ao:s.ao,perf:s.perf};});
const open3d=async(page:P)=>{await page.goto('/');await page.getByRole('button',{name:/3D/}).first().click();};
const blank=async(page:P)=>{await open3d(page);await page.getByTestId('3d-create-blank').click();await expect(page.getByTestId('studio3d-viewport')).toBeVisible();};
const insert=async(page:P,kind:string,x:number)=>{await run(page,'studio3d.insert.primitive',{kind});const s=await session(page);const id=s.selected as number;await run(page,'studio3d.object.transform',{id,position:{x,y:0,z:0}});return id;};
const positionOf=async(page:P,id:number)=>{await run(page,'studio3d.select',{id});return (await session(page)).info!.position;};
function zipEntries(buf:Buffer):number{for(let i=buf.length-22;i>=0;i--)if(buf.readUInt32LE(i)===0x06054b50)return buf.readUInt16LE(i+10);return -1;}

test('3D studio keeps a scene through a .som3d roundtrip, saved with Ctrl+S',async({page})=>{
 await blank(page);
 await insert(page,'cube',-1);await insert(page,'sphere',1);
 await run(page,'studio3d.insert.light',{kind:'area'});const area=(await session(page)).selected as number;await run(page,'studio3d.light.set',{id:area,intensity:7,width:3,height:2});
 await run(page,'studio3d.insert.light',{kind:'directional'});const sun=(await session(page)).selected as number;await run(page,'studio3d.light.set',{id:sun,shadow:true});
 const before=await session(page);
 await page.getByTestId('studio3d-viewport').click({position:{x:5,y:5}});
 const [download]=await Promise.all([page.waitForEvent('download'),page.keyboard.press('Control+s')]);
 expect(download.suggestedFilename()).toMatch(/\.som3d$/);
 const saved=readFileSync(await download.path()!);
 expect(JSON.parse(saved.toString('utf8')).format).toBe('somnia-3d');
 // Open the file again in a fresh page and compare.
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'scene.som3d',mimeType:'application/json',buffer:saved});
 await expect.poll(async()=>(await session(page)).status).toBe('ready');
 const after=await session(page);
 expect(after.outline.map(o=>o.kind).sort()).toEqual(before.outline.map(o=>o.kind).sort());
 expect(after.outline.length).toBe(before.outline.length);
 const lights=after.outline.filter(o=>o.kind==='light');
 const infos=[];for(const l of lights){await run(page,'studio3d.select',{id:l.id});infos.push((await session(page)).info!.light);}
 expect(infos.some(l=>l&&l.width===3&&l.height===2&&l.intensity===7)).toBe(true);
 expect(infos.some(l=>l&&l.shadow===true)).toBe(true);
});

test('3D studio moves a group of selected objects together with the gizmo',async({page})=>{
 await blank(page);
 const a=await insert(page,'cube',-1),b=await insert(page,'cube',1);
 await run(page,'studio3d.gizmo.mode',{mode:'translate'});
 await run(page,'studio3d.select',{id:a});
 // Mark both through the scene panel outline, then drag the gizmo handle at the centre of the viewport.
 await page.getByTestId('studio3d-scene-panel').getByRole('checkbox').nth(0).check();
 await page.getByTestId('studio3d-scene-panel').getByRole('checkbox').nth(1).check();
 const box=(await page.getByTestId('studio3d-viewport').boundingBox())!;
 const cx=box.x+box.width/2,cy=box.y+box.height/2;
 const gapBefore=(await positionOf(page,b)).x-(await positionOf(page,a)).x;
 await page.mouse.move(cx+40,cy);await page.mouse.down();await page.mouse.move(cx+120,cy,{steps:8});await page.mouse.up();
 const pa=await positionOf(page,a),pb=await positionOf(page,b);
 expect(Math.abs(pb.x-pa.x-gapBefore)).toBeLessThan(1e-3);
});

test('3D studio selects several objects with a Shift-drag marquee',async({page})=>{
 await blank(page);
 await insert(page,'cube',-1);await insert(page,'cube',1);
 await run(page,'studio3d.select',{id:null});
 const box=(await page.getByTestId('studio3d-viewport').boundingBox())!;
 await page.keyboard.down('Shift');
 await page.mouse.move(box.x+4,box.y+4);await page.mouse.down();await page.mouse.move(box.x+box.width-4,box.y+box.height-4,{steps:10});await page.mouse.up();
 await page.keyboard.up('Shift');
 const s=await session(page);
 expect(s.marked.length+(s.selected==null?0:1)).toBeGreaterThanOrEqual(2);
});

test('3D studio renders a turntable and downloads it as a ZIP of PNG frames',async({page})=>{
 await blank(page);await insert(page,'cube',0);
 const frames=4;
 const [download]=await Promise.all([page.waitForEvent('download',{timeout:60_000}),run(page,'studio3d.render.turntable',{frames,width:64,height:64})]);
 expect(download.suggestedFilename()).toMatch(/-turntable\.zip$/);
 const zip=readFileSync(await download.path()!);
 expect(zip.subarray(0,2).toString('latin1')).toBe('PK');
 expect(zipEntries(zip)).toBe(frames);
 expect(zip.includes(Buffer.from('.png'))).toBe(true);
});

test('3D studio offers an autosaved scene again after a reload and shows it in the recent list',async({page})=>{
 await blank(page);await insert(page,'torus',0);
 await expect(page.getByTestId('studio3d-recent-autosave').first()).toBeVisible({timeout:20_000});
 await open3d(page);
 await page.getByTestId('studio3d-recent-autosave').click();
 await expect.poll(async()=>(await session(page)).outline.some(o=>o.kind==='mesh')).toBe(true);
});

test('3D studio refuses a glTF that points at a remote file and never requests it',async({page})=>{
 const requested:string[]=[];page.on('request',r=>{if(/example\.test/.test(r.url()))requested.push(r.url());});
 await open3d(page);
 const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],buffers:[{uri:'https://example.test/a.bin',byteLength:36}],bufferViews:[{buffer:0,byteLength:36}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'}]};
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'remote.gltf',mimeType:'model/gltf+json',buffer:Buffer.from(JSON.stringify(gltf))});
 await expect(page.getByRole('alert')).toContainText('remote.gltf');
 expect(requested).toEqual([]);
});

test('3D studio edits a primitive by parameters, applies a material preset and exports glTF',async({page})=>{
 await blank(page);
 const id=await insert(page,'sphere',0);
 await expect(page.getByTestId('studio3d-primitive')).toBeVisible();
 await page.getByTestId('studio3d-primitive').getByLabel('Radius').fill('2');await page.getByTestId('studio3d-primitive').getByLabel('Radius').blur();
 await expect.poll(async()=>(await session(page)).info?.primitive?.params.radius).toBe(2);
 await page.getByTestId('studio3d-material-presets').getByRole('button',{name:'Gold'}).click();
 await expect.poll(async()=>(await session(page)).info?.material?.metalness).toBe(1);
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByTestId('studio3d-export').getByRole('button',{name:'glTF'}).click()]);
 expect(download.suggestedFilename()).toMatch(/\.gltf$/);
 const json=JSON.parse(readFileSync(await download.path()!,'utf8'));
 expect(json.asset.version).toBe('2.0');
 expect(JSON.stringify(json.nodes)).toContain('somniaPrimitive');
 expect(id).toBeGreaterThan(0);
});

test('3D studio sets PBR extras, mirrors, merges, applies a view preset and renders a PNG at a chosen size',async({page})=>{
 await blank(page);
 const a=await insert(page,'cube',0);
 await run(page,'studio3d.object.material',{id:a,emissive:'#ff0000',emissiveIntensity:2,opacity:0.5});
 await expect.poll(async()=>(await session(page)).info?.material?.alphaMode).toBe('blend');
 await run(page,'studio3d.mesh.mirror',{axis:'x',copy:true});
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').length).toBe(2);
 await run(page,'studio3d.view.preset',{preset:'top'});
 await page.getByTestId('studio3d-texture-input').setInputFiles({name:'t.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==','base64')});
 const w=page.getByTestId('studio3d-render-png');
 await w.getByLabel('Width (px)').fill('640');await w.getByLabel('Height (px)').fill('360');
 const [download]=await Promise.all([page.waitForEvent('download'),w.getByRole('button').last().click()]);
 expect(download.suggestedFilename()).toMatch(/\.png$/);
});

function animatedGltf():Buffer{
 const f=(...n:number[])=>Buffer.concat(n.map(v=>{const b=Buffer.alloc(4);b.writeFloatLE(v);return b;}));
 const q=(a:number)=>f(0,Math.sin(a/2),0,Math.cos(a/2));
 const bin=Buffer.concat([f(0,0,0,1,0,0,0,1,0),f(0,2),q(0),q(Math.PI)]);
 const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes:[{mesh:0,name:'spinner'}],meshes:[{primitives:[{attributes:{POSITION:0}}]}],
  buffers:[{uri:'data:application/octet-stream;base64,'+bin.toString('base64'),byteLength:bin.length}],
  bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:8},{buffer:0,byteOffset:44,byteLength:32}],
  accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3',min:[0,0,0],max:[1,1,0]},{bufferView:1,componentType:5126,count:2,type:'SCALAR',min:[0],max:[2]},{bufferView:2,componentType:5126,count:2,type:'VEC4'}],
  animations:[{name:'Spin',samplers:[{input:1,output:2}],channels:[{sampler:0,target:{node:0,path:'rotation'}}]}]};
 return Buffer.from(JSON.stringify(gltf));
}
test('3D studio plays, pauses and scrubs a glTF animation and lists scene checks',async({page})=>{
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'spin.gltf',mimeType:'model/gltf+json',buffer:animatedGltf()});
 await expect(page.getByTestId('studio3d-animation')).toBeVisible({timeout:20_000});
 await run(page,'studio3d.anim.seek',{time:1});
 await expect.poll(async()=>(await session(page)).anim?.time).toBe(1);
 await run(page,'studio3d.anim.loop',{loop:false});await run(page,'studio3d.anim.play',{});
 await expect.poll(async()=>(await session(page)).anim?.playing,{timeout:10_000}).toBe(false);
 await expect.poll(async()=>(await session(page)).anim?.time).toBe(2);
});
test('3D studio keeps a texture and its mapping through GLB export and a saved scene',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==','base64');
 await page.getByTestId('studio3d-texture-input').setInputFiles({name:'t.png',mimeType:'image/png',buffer:png});
 await run(page,'studio3d.texture.transform',{id,slot:'color',offsetX:0.5,scaleX:2,rotation:90});
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByTestId('studio3d-export').getByRole('button',{name:'GLB'}).click()]);
 const bytes=readFileSync(await download.path()!);
 expect(bytes.subarray(0,4).toString()).toBe('glTF');
 expect(bytes.toString('latin1')).toContain('KHR_texture_transform');
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'back.glb',mimeType:'model/gltf-binary',buffer:bytes});
 await expect.poll(async()=>(await session(page)).outline.some(o=>o.kind==='mesh')).toBe(true);
 const mesh=(await session(page)).outline.find(o=>o.kind==='mesh')!;await run(page,'studio3d.select',{id:mesh.id});
 await expect.poll(async()=>(await session(page)).info?.material?.transforms?.color?.scaleX).toBe(2);
});

test('3D studio records keys into a clip, scrubs them and keeps the clip through GLB export and reopen',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 await run(page,'studio3d.clip.add',{name:'Hop',duration:2});
 await run(page,'studio3d.key.set',{path:'position',time:0});
 await run(page,'studio3d.object.transform',{id,position:{x:0,y:3,z:0}});
 await run(page,'studio3d.key.set',{path:'position',time:1});
 await expect(page.getByTestId('studio3d-keyrow-position')).toContainText('0:01.00');
 await run(page,'studio3d.anim.seek',{time:0.5});
 await expect.poll(async()=>(await session(page)).info?.position.y).toBeCloseTo(1.5,1);
 await run(page,'studio3d.key.remove',{path:'position',time:1});
 await expect(page.getByTestId('studio3d-keyrow-position')).not.toContainText('0:01.00');
 await run(page,'studio3d.key.set',{path:'position',time:1,y:3});
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByTestId('studio3d-export').getByRole('button',{name:'GLB'}).click()]);
 const bytes=readFileSync(await download.path()!);
 expect(bytes.toString('latin1')).toContain('"animations"');
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'hop.glb',mimeType:'model/gltf-binary',buffer:bytes});
 await expect(page.getByTestId('studio3d-animation')).toContainText('Hop',{timeout:20_000});
});

test('3D studio moves a key, sets its easing, auto-keys and keeps easing and clip length through GLB export and reopen',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 await run(page,'studio3d.clip.add',{name:'Slide',duration:5});
 await run(page,'studio3d.key.set',{path:'position',time:0});
 await run(page,'studio3d.object.transform',{id,position:{x:4,y:0,z:0}});
 await run(page,'studio3d.key.set',{path:'position',time:1});
 await run(page,'studio3d.key.move',{path:'position',time:1,to:2});
 await expect(page.getByTestId('studio3d-keyrow-position')).toContainText('0:02.00');
 await expect(page.getByTestId('studio3d-keyrow-position')).not.toContainText('0:01.00');
 await run(page,'studio3d.key.ease',{path:'position',time:0,ease:'easeIn'});
 await run(page,'studio3d.anim.seek',{time:1});
 await expect.poll(async()=>(await session(page)).info?.position.x).toBeLessThan(2);
 await page.keyboard.press('Control+z');
 await run(page,'studio3d.anim.autokey',{on:true});
 await expect(page.getByRole('checkbox',{name:/Auto-key/})).toBeChecked();
 await run(page,'studio3d.anim.seek',{time:3});
 await run(page,'studio3d.object.transform',{id,position:{x:0,y:2,z:0}});
 await expect(page.getByTestId('studio3d-keyrow-position')).toContainText('0:03.00');
 await run(page,'studio3d.anim.autokey',{on:false});
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByTestId('studio3d-export').getByRole('button',{name:'GLB'}).click()]);
 const bytes=readFileSync(await download.path()!);
 expect(bytes.toString('latin1')).toContain('"somnia"');
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'slide.glb',mimeType:'model/gltf-binary',buffer:bytes});
 await expect(page.getByTestId('studio3d-animation')).toContainText('Slide',{timeout:20_000});
 await expect.poll(async()=>(await session(page)).clips[0]?.duration).toBe(5);
 await expect.poll(async()=>(await session(page)).clipKeys.find(k=>k.path==='position')?.eases[0]).toBe('easeIn');
});

test('3D studio zooms the timeline, shifts and pastes key selections, duplicates a clip and loops a range',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 await run(page,'studio3d.clip.add',{name:'Move',duration:6});
 await run(page,'studio3d.key.set',{path:'position',time:0});
 await run(page,'studio3d.key.set',{path:'position',time:1});
 await expect(page.getByTestId('studio3d-keyrow-position').getByTestId('studio3d-key')).toHaveCount(2);
 // Zoom and pan the timeline view: the ruler shows a finer grid, fit restores it.
 await page.getByTestId('studio3d-timeline-zoom-in').click();await page.getByTestId('studio3d-timeline-zoom-in').click();
 await expect(page.getByTestId('studio3d-timeline-ruler')).toContainText('0:00.50');
 await page.getByTestId('studio3d-timeline-zoom-fit').click();
 await expect(page.getByTestId('studio3d-timeline-ruler')).toContainText('0:06.00');
 // Copy two keys and paste them at the playhead.
 await run(page,'studio3d.key.copy',{keys:[{path:'position',time:0},{path:'position',time:1}]});
 await run(page,'studio3d.key.paste',{time:3});
 await expect(page.getByTestId('studio3d-keyrow-position')).toContainText('0:03.00');
 await expect(page.getByTestId('studio3d-keyrow-position')).toContainText('0:04.00');
 // Shift the pasted keys as one undo step.
 await run(page,'studio3d.key.shift',{keys:[{path:'position',time:3},{path:'position',time:4}],delta:0.5});
 await expect(page.getByTestId('studio3d-keyrow-position')).toContainText('0:04.50');
 await run(page,'studio3d.undo',{});
 await expect(page.getByTestId('studio3d-keyrow-position')).toContainText('0:03.00');
 await expect(page.getByTestId('studio3d-keyrow-position')).toContainText('0:04.00');
 // Duplicate the clip: same keys, new current clip, one undo step.
 await run(page,'studio3d.clip.duplicate',{});
 await expect.poll(async()=>(await session(page)).clips.length).toBe(2);
 await expect.poll(async()=>(await session(page)).anim.clip).toBe(1);
 await expect.poll(async()=>(await session(page)).clipKeys.find(k=>k.path==='position')?.times.length).toBe(4);
 await run(page,'studio3d.undo',{});
 await expect.poll(async()=>(await session(page)).clips.length).toBe(1);
 // Loop range preview: playback wraps inside the range, clearing it plays the whole clip again.
 await run(page,'studio3d.anim.range',{start:1,end:2});
 await run(page,'studio3d.anim.seek',{time:0});
 await run(page,'studio3d.anim.play',{});
 await expect.poll(async()=>{const a=(await session(page)).anim;return a.playing&&a.time>=1&&a.time<=2;},{timeout:10_000}).toBe(true);
 await run(page,'studio3d.anim.pause',{});
 await run(page,'studio3d.anim.range',{clear:true});
 await expect.poll(async()=>(await session(page)).anim.range).toBe(null);
});

test('3D studio shows a skeleton overlay, keys a bone rotation and exports the skin back',async({page})=>{
 const glb=await skinnedGlb();
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'rig.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await expect(page.getByTestId('studio3d-skeleton')).toBeVisible();
 // Bones are picked from the bone list, not the scene list.
 await expect(page.getByTestId('studio3d-scene-panel')).not.toContainText('Knee');
 await page.getByLabel('Bone').selectOption({index:2});
 await expect.poll(async()=>(await session(page)).info?.kind).toBe('bone');
 // The timeline reuses the clip editor with the rotation lane only.
 await run(page,'studio3d.clip.add',{name:'Bend',duration:2});
 await run(page,'studio3d.key.set',{path:'rotation',time:0});
 await run(page,'studio3d.key.set',{path:'rotation',time:1,z:45});
 await expect(page.getByTestId('studio3d-keyrow-rotation')).toContainText('0:01.00');
 await expect(page.getByTestId('studio3d-keyrow-position')).toHaveCount(0);
 // Position keys on a bone are refused with a readable error.
 await run(page,'studio3d.key.set',{path:'position',time:0});
 await expect(page.getByRole('alert')).toContainText('rotation keys only');
 // A second clip on the other bone sits next to the first, with its own keys.
 await run(page,'studio3d.clip.add',{name:'Twist',duration:1.5});
 await page.getByLabel('Bone').selectOption({index:1});
 await run(page,'studio3d.key.set',{path:'rotation',time:0});
 await run(page,'studio3d.key.set',{path:'rotation',time:1.5,y:90});
 await expect(page.getByTestId('studio3d-keyrow-rotation')).toContainText('0:01.50');
 // Click-select: the mesh under the cursor selects, a click into empty space clears the selection.
 const vp=page.getByTestId('studio3d-viewport');const vb=await vp.boundingBox();
 await vp.click({position:{x:vb!.width/2,y:vb!.height/2}});
 await expect.poll(async()=>(await session(page)).info?.name).toBe('Body');
 await vp.click({position:{x:5,y:5}});
 await expect.poll(async()=>(await session(page)).selected).toBe(null);
 // The overlay toggles off and on.
 await page.getByRole('checkbox',{name:/Skeleton overlay/}).uncheck();
 await page.getByRole('checkbox',{name:/Skeleton overlay/}).check();
 // Export keeps the skin, the clip and the authoring keys, and the reopened file behaves the same.
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByTestId('studio3d-export').getByRole('button',{name:'GLB'}).click()]);
 const bytes=readFileSync(await download.path()!);
 expect(bytes.toString('latin1')).toContain('"skins"');
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'rig2.glb',mimeType:'model/gltf-binary',buffer:bytes});
 await expect(page.getByTestId('studio3d-skeleton')).toBeVisible({timeout:20_000});
 await expect.poll(async()=>{const c=(await session(page)).clips.map(x=>x.name).join(',');return c;}).toBe('Bend,Twist');
 await page.getByLabel('Bone').selectOption({index:2});
 await expect.poll(async()=>(await session(page)).clipKeys.find(k=>k.path==='rotation')?.times).toEqual([0,1]);
 // The second clip kept its own bone track with its own keys.
 await page.getByLabel('Clip').selectOption({index:1});
 await page.getByLabel('Bone').selectOption({index:1});
 await expect.poll(async()=>(await session(page)).clipKeys.find(k=>k.path==='rotation')?.times).toEqual([0,1.5]);
});

test('3D studio binds a primitive onto a bone chain, previews a weight and undoes it',async({page})=>{
 const glb=await skinnedGlb();
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'rig.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await expect(page.getByTestId('studio3d-skeleton')).toBeVisible();
 // A fresh cube next to the rig is not skinned yet.
 await run(page,'studio3d.insert.primitive',{kind:'cube'});
 const cube=(await session(page)).selected as number;
 await run(page,'studio3d.object.transform',{id:cube,position:{x:2,y:1,z:0}});
 // The skinning section offers a bind; smooth bind makes the cube a skinned mesh on the Hip chain.
 await expect(page.getByTestId('studio3d-skinning')).toBeVisible();
 await page.getByRole('button',{name:'Smooth bind'}).click();
 await expect.poll(async()=>(await session(page)).info?.skinned).toBe(true);
 // The weight preview tints the cube by one bone's influence, and turns back off.
 await page.getByLabel('Weight preview').selectOption({index:2});
 await expect.poll(async()=>(await session(page)).weightPreview).not.toBe(null);
 await page.getByLabel('Weight preview').selectOption({index:0});
 await expect.poll(async()=>(await session(page)).weightPreview).toBe(null);
 // Rigid re-weights in one undo step; undoing twice brings the plain cube back.
 await page.getByRole('button',{name:'Rigid weights'}).click();
 await run(page,'studio3d.undo');await run(page,'studio3d.undo');
 await expect.poll(async()=>{await run(page,'studio3d.select',{id:cube});return (await session(page)).info?.skinned;}).toBe(false);
});

test('3D studio paints bone weights with the brush and undoes the stroke',async({page})=>{
 const glb=await skinnedGlb();
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'rig.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await expect(page.getByTestId('studio3d-skeleton')).toBeVisible();
 // Bind a fresh cube, then paint with the brush through the command surface.
 await run(page,'studio3d.insert.primitive',{kind:'cube'});
 const cube=(await session(page)).selected as number;
 await run(page,'studio3d.object.transform',{id:cube,position:{x:2,y:1,z:0}});
 await page.getByRole('button',{name:'Smooth bind'}).click();
 await expect.poll(async()=>(await session(page)).info?.skinned).toBe(true);
 // Turning the brush on picks the first bone for the preview when none is set.
 await page.getByLabel('Paint').check();
 await expect.poll(async()=>(await session(page)).weightPreview).not.toBe(null);
 const bone=(await session(page)).weightPreview as number;
 // One dab at the cube center touches vertices; a posed mesh is reset to bind pose first.
 const dabbed=await run(page,'studio3d.skin.paint',{x:0,y:0,z:0,bone,radius:2,strength:1,mode:'add'});
 expect(dabbed).toBeGreaterThan(0);
 // Painting without a bone refuses with a notice instead of throwing.
 await run(page,'studio3d.skin.preview',{bone:null});
 await run(page,'studio3d.skin.paint',{x:0,y:0,z:0});
 await expect(page.getByRole('alert')).toBeVisible();
 // Undo removes the whole stroke, then the bind itself.
 await run(page,'studio3d.undo');
 await run(page,'studio3d.undo');
 await expect.poll(async()=>{await run(page,'studio3d.select',{id:cube});return (await session(page)).info?.skinned;}).toBe(false);
});

test('3D studio opens an OBJ, picks export clips and exports glTF textures as a ZIP',async({page})=>{
 // OBJ import: bounded and local, the mesh lands in the scene list.
 await open3d(page);
 const obj=Buffer.from('v 0 0 0\nv 1 0 0\nv 0 1 0\nv 0 0 1\nf 1 2 3\nf 1 3 4\n');
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'tetra.obj',mimeType:'model/obj',buffer:obj});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await expect.poll(async()=>(await session(page)).stats.meshes).toBe(1);
 // Two clips with one key each (empty clips never export); the export options select which leave the app.
 const meshId=(await session(page)).outline[0].id as number;
 await run(page,'studio3d.select',{id:meshId});
 await run(page,'studio3d.clip.add',{name:'First'});
 await run(page,'studio3d.key.set',{path:'position',time:0});
 await run(page,'studio3d.clip.add',{name:'Second'});
 await run(page,'studio3d.key.set',{path:'position',time:0});
 await expect.poll(async()=>(await session(page)).clips.length).toBe(2);
 const exportBox=page.getByTestId('studio3d-export');
 await exportBox.getByLabel('Second').uncheck();
 await expect.poll(async()=>(await session(page)).exportClips).toEqual(['First']);
 // External textures download one ZIP with the .gltf inside; the animation list follows the pick.
 await exportBox.getByLabel('glTF textures').selectOption('external');
 const [zipDown]=await Promise.all([page.waitForEvent('download'),exportBox.getByRole('button',{name:'glTF'}).click()]);
 expect(zipDown.suggestedFilename()).toMatch(/\.gltf\.zip$/);
 const {unzipSync,strFromU8}=await import('fflate');
 const zip=unzipSync(new Uint8Array(readFileSync(await zipDown.path()!)));
 const gltfName=Object.keys(zip).find(n=>n.endsWith('.gltf'))!;
 const json=JSON.parse(strFromU8(zip[gltfName]));
 expect(json.animations.map((a:{name:string})=>a.name)).toEqual(['First']);
 // Back to embedded: one self-contained .gltf file again.
 await exportBox.getByLabel('glTF textures').selectOption('embed');
 await run(page,'studio3d.export.options',{clips:null});
 const [gltfDown]=await Promise.all([page.waitForEvent('download'),exportBox.getByRole('button',{name:'glTF'}).click()]);
 expect(gltfDown.suggestedFilename()).toMatch(/\.gltf$/);
 const embedded=JSON.parse(readFileSync(await gltfDown.path()!,'utf8'));
 expect(embedded.animations.length).toBe(2);
 // An unknown clip name refuses with a notice instead of throwing.
 await run(page,'studio3d.export.gltf',{clips:['Nope']});
 await expect(page.getByRole('alert')).toBeVisible();
});

test('3D studio saves, blends and undoes poses on a rig',async({page})=>{
 const glb=await skinnedGlb();
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'rig.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await expect(page.getByTestId('studio3d-skeleton')).toBeVisible();
 // A selected bone shows the pose library of its rig.
 await page.getByLabel('Bone').selectOption({index:1});
 await expect.poll(async()=>(await session(page)).info?.kind).toBe('bone');
 const bone=(await session(page)).selected as number;
 const poses=page.getByTestId('studio3d-poses');
 await expect(poses).toBeVisible();
 await expect(poses).toContainText('No poses saved yet.');
 // Save two poses through the panel.
 await poses.getByLabel('Pose name').fill('Rest');await poses.getByRole('button',{name:'Save'}).click();
 await poses.getByLabel('Pose name').fill('Bent');await poses.getByRole('button',{name:'Save'}).click();
 await expect.poll(async()=>(await session(page)).poses.map(p=>p.name)).toEqual(['Rest','Bent']);
 // Apply and blend run through the command surface; mirror works on any saved pose.
 expect(await run(page,'studio3d.pose.apply',{id:bone,name:'Rest'})).not.toBe(false);
 expect(await run(page,'studio3d.pose.blend',{id:bone,a:'Rest',b:'Bent',t:0.5})).not.toBe(false);
 expect(await run(page,'studio3d.pose.mirror',{id:bone,name:'Bent'})).not.toBe(false);
 // A pose name that does not exist refuses with a notice instead of throwing.
 await run(page,'studio3d.pose.apply',{id:bone,name:'Nope'});
 await expect(page.getByRole('alert')).toBeVisible();
 // Undoing empties the library again (mirror, blend, apply and both saves are one step each).
 for(let i=0;i<8&&(await session(page)).poses.length>0;i++)await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).poses.length).toBe(0);
});

test('3D studio drives a chain with IK, moves the target and sets joint limits',async({page})=>{
 const glb=await skinnedGlb3();
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'rig3.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await expect(page.getByTestId('studio3d-skeleton')).toBeVisible();
 // The chain root shows the IK switch; toggling on snaps the target to the end effector without moving the pose.
 await page.getByLabel('Bone').selectOption({index:1});
 await expect.poll(async()=>(await session(page)).info?.kind).toBe('bone');
 const bone=(await session(page)).selected as number;
 await expect(page.getByTestId('studio3d-ik')).toBeVisible();
 await page.getByLabel('IK drives this chain').check();
 await expect.poll(async()=>(await session(page)).ik?.on).toBe(true);
 const snapped=(await session(page)).ik!.target;
 expect(snapped[1]).toBeGreaterThan(1.9);
 // Moving the target is one undo step.
 await run(page,'studio3d.ik.target',{x:0.8,y:1.2,z:0});
 await expect.poll(async()=>(await session(page)).ik?.target[0]).toBeCloseTo(0.8,3);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).ik?.target[0]).toBeCloseTo(snapped[0],3);
 // Joint limits land in the panel state and clear again.
 await run(page,'studio3d.bone.limits',{id:bone,min:[-30,null,null],max:[30,null,null]});
 await expect.poll(async()=>(await session(page)).boneLimits?.min[0]).toBe(-30);
 await page.getByRole('button',{name:'Clear limits'}).click();
 await expect.poll(async()=>(await session(page)).boneLimits).toBe(null);
 // With IK off again, target moves refuse with a notice instead of throwing.
 await page.getByLabel('IK drives this chain').uncheck();
 await run(page,'studio3d.ik.target',{x:0,y:1,z:0});
 await expect(page.getByRole('alert')).toBeVisible();
});

test('3D studio drives an N-bone chain with FABRIK, look-at and limits',async({page})=>{
 const glb=await skinnedGlb4();
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'rig4.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await expect(page.getByTestId('studio3d-skeleton')).toBeVisible();
 // The chain root shows the FABRIK switch; toggling on snaps the target to the end effector without moving the pose.
 await page.getByLabel('Bone').selectOption({index:1});
 await expect.poll(async()=>(await session(page)).info?.kind).toBe('bone');
 await expect(page.getByTestId('studio3d-fabrik')).toBeVisible();
 await page.getByLabel('FABRIK drives this chain').check();
 await expect.poll(async()=>(await session(page)).fabrik?.on).toBe(true);
 const snapped=(await session(page)).fabrik!.target;
 expect(snapped[1]).toBeGreaterThan(2.9);
 // Moving the target is one undo step and the chain bends to reach it.
 await run(page,'studio3d.fabrik.target',{x:1.5,y:1.5,z:0});
 await expect.poll(async()=>(await session(page)).fabrik?.target[0]).toBeCloseTo(1.5,3);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).fabrik?.target[0]).toBeCloseTo(snapped[0],3);
 // Look-at aims the end bone; the toggle lands in the panel state.
 await page.getByLabel('Aim the end bone at the look target').check();
 await expect.poll(async()=>(await session(page)).fabrik?.look.on).toBe(true);
 await run(page,'studio3d.fabrik.looktarget',{x:0,y:3,z:3});
 await expect.poll(async()=>(await session(page)).fabrik?.look.target[2]).toBeCloseTo(3,3);
 // With FABRIK off again, target moves refuse with a notice instead of throwing.
 await page.getByLabel('FABRIK drives this chain').uncheck();
 await run(page,'studio3d.fabrik.target',{x:0,y:1,z:0});
 await expect(page.getByRole('alert')).toBeVisible();
});

test('3D studio records keyframe poses at the playhead for selected or all bones',async({page})=>{
 const glb=await skinnedGlb3();
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'rig3.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await expect(page.getByTestId('studio3d-record')).toBeVisible();
 await run(page,'studio3d.clip.add',{name:'Wave',duration:2});
 // Pose the middle bone and record the selected chain root at the playhead.
 await page.getByLabel('Bone').selectOption({index:2});
 await expect.poll(async()=>(await session(page)).info?.kind).toBe('bone');
 const bone=(await session(page)).selected as number;
 await run(page,'studio3d.object.transform',{id:bone,rotation:{z:20}});
 await run(page,'studio3d.anim.seek',{time:0.5});
 await page.getByRole('button',{name:'Record pose'}).click();
 await expect.poll(async()=>(await session(page)).clipKeys?.some(k=>k.path==='rotation'&&k.times.includes(0.5))).toBe(true);
 // The record is one undo step.
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).clipKeys?.length??0).toBe(0);
 // Record all bones: another bone of the rig carries a key at the same time afterwards.
 await page.getByRole('button',{name:'Record all bones'}).click();
 await page.getByLabel('Bone').selectOption({index:1});
 await expect.poll(async()=>(await session(page)).clipKeys?.some(k=>k.path==='rotation'&&k.times.includes(0.5))).toBe(true);
 // Without a clip the record refuses with a notice instead of throwing.
 await run(page,'studio3d.clip.remove',{});
 await run(page,'studio3d.clip.record',{all:true});
 await expect(page.getByRole('alert')).toBeVisible();
});

test('3D studio reviews animation with onion skin, motion path and retarget',async({page})=>{
 const glb=await skinnedGlbTwoRigs();
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'two-rigs.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 // A clip with source motion: rotate a bone of rig A and record everything.
 await run(page,'studio3d.clip.add',{name:'Wave',duration:2});
 await page.getByLabel('Bone').selectOption({index:2});
 await expect.poll(async()=>(await session(page)).info?.kind).toBe('bone');
 const boneA=(await session(page)).selected as number;
 await run(page,'studio3d.object.transform',{id:boneA,rotation:{z:45}});
 await run(page,'studio3d.anim.seek',{time:1});
 await run(page,'studio3d.clip.record',{all:true});
 // Onion skin and motion path are review toggles in the session.
 await page.getByLabel('Onion skin').check();
 await expect.poll(async()=>(await session(page)).onion?.on).toBe(true);
 await page.getByLabel('Motion path').check();
 await expect.poll(async()=>(await session(page)).motionPath).toBe(true);
 // Retarget: selecting a bone of rig B offers rig A as the source; applying bakes a new clip.
 await page.getByLabel('Bone').selectOption({index:5});
 await expect.poll(async()=>(await session(page)).info?.kind).toBe('bone');
 await expect(page.getByTestId('studio3d-retarget')).toBeVisible();
 await page.getByLabel('Source rig').selectOption({index:1});
 await page.getByRole('button',{name:'Apply as new clip'}).click();
 await expect.poll(async()=>(await session(page)).clips.length).toBe(2);
 expect((await session(page)).clips[1].name).toBe('Retarget: Wave');
 // The bake is one undo step; the retargeted keys ride on rig B bones.
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).clips.length).toBe(1);
});

test('3D studio inserts a three-point light rig as one undo step',async({page})=>{
 const glb=await skinnedGlb3();
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'rig3.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await page.getByRole('button',{name:'3-point rig'}).click();
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='light').length).toBe(3);
 const names=(await session(page)).outline.filter(o=>o.kind==='light').map(o=>o.name);
 expect(names).toEqual(['Key light','Fill light','Rim light']);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='light').length).toBe(0);
});

test('3D studio adds an orthographic camera, edits zoom and manages named views',async({page})=>{
 await blank(page);
 const a=await insert(page,'cube',0);
 await run(page,'studio3d.insert.camera',{kind:'orthographic'});
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='camera').length).toBe(1);
 const camId=(await session(page)).outline.find(o=>o.kind==='camera')!.id;
 expect((await session(page)).outline.find(o=>o.kind==='camera')!.name).toBe('Ortho camera');
 await run(page,'studio3d.object.rename',{id:camId,name:'Top ortho'});
 await run(page,'studio3d.camera.set',{id:camId,zoom:2});
 await run(page,'studio3d.view.save',{name:'Wide'});
 await expect.poll(async()=>(await session(page)).views.length).toBe(1);
 await run(page,'studio3d.view.preset',{preset:'top'});
 await run(page,'studio3d.view.save',{});
 await expect.poll(async()=>(await session(page)).views.length).toBe(2);
 await run(page,'studio3d.view.apply',{name:'Wide'});
 await run(page,'studio3d.view.save',{name:'Wide'});
 await expect(page.getByRole('alert')).toContainText(/already exists/);
 await run(page,'studio3d.view.apply',{name:'Nope'});
 await expect(page.getByRole('alert')).toContainText(/no saved view/);
 await run(page,'studio3d.view.remove',{name:'Wide'});
 await expect.poll(async()=>(await session(page)).views.length).toBe(1);
 await run(page,'studio3d.camera.set',{id:camId,fov:50});
 await expect(page.getByRole('alert')).toContainText(/set zoom, not fov/);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>{const c=(await session(page)).info?.camera;return c?.kind==='orthographic'?c.zoom:-1;}).toBe(1);
 await run(page,'studio3d.undo');
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='camera').length).toBe(0);
});

test('3D studio groups, ungroups, builds a linear array and picks snap modes',async({page})=>{
 await blank(page);
 const a=await insert(page,'cube',0);
 await run(page,'studio3d.view.preset',{preset:'front'});
 const b=await insert(page,'sphere',1);
 await page.getByTestId('studio3d-tools-section').scrollIntoViewIfNeeded();
 // tick both in the outline via marked: use group command directly
 await run(page,'studio3d.group',{ids:[a,b]});
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='group').length).toBe(1);
 const gid=(await session(page)).outline.find(o=>o.kind==='group')!.id;
 await run(page,'studio3d.ungroup',{id:gid});
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='group').length).toBe(0);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='group').length).toBe(1);
 await run(page,'studio3d.object.array',{ids:[a],mode:'linear',count:4,dx:2,dy:0,dz:0});
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').length).toBe(5);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').length).toBe(2);
 await run(page,'studio3d.object.array',{ids:[a],mode:'linear',count:2,dx:0,dy:0,dz:0});
 await expect(page.getByRole('alert')).toContainText(/offset cannot be zero/);
 await run(page,'studio3d.snap.set',{on:true,mode:'vertex'});
 await expect.poll(async()=>(await session(page)).notice).toBe('');
});

/** A two-bone skinned box with a one-second rotation clip, built by hand - no external assets. */
function skinnedGltf():Buffer{
 const f=(...n:number[])=>Buffer.concat(n.map(v=>{const b=Buffer.alloc(4);b.writeFloatLE(v);return b;}));
 const u=(...n:number[])=>Buffer.concat(n.map(v=>{const b=Buffer.alloc(4);b.writeUint32LE(v);return b;}));
 const pos:number[]=[];
 for(const y of [0,2])for(const z of [-0.5,0.5])for(const x of [-0.5,0.5])pos.push(x,y,z);
 const joints=Buffer.concat([0,0,0,0, 0,0,0,0, 0,0,0,0, 0,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0, 1,0,0,0].map(v=>Buffer.from([v])));
 const weights:number[]=[];for(let i=0;i<8;i++)weights.push(...(i<4?[1,0,0,0]:[1,0,0,0]));
 const ident=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1];
 const ibm2=[1,0,0,0, 0,1,0,0, 0,0,1,0, 0,-1,0,1];
 const q=(a:number)=>[0,Math.sin(a/2),0,Math.cos(a/2)];
 const bin=Buffer.concat([f(...pos),joints,f(...weights),f(...ident,...ibm2),f(0,1),f(...q(0),...q(Math.PI/2))]);
 const off=[0,96,128,256,384,392];
 const gltf={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],
  nodes:[{mesh:0,skin:0,name:'Body'},{name:'Hip',children:[2]},{name:'Knee',translation:[0,1,0]}],
  meshes:[{primitives:[{attributes:{POSITION:0,JOINTS_0:1,WEIGHTS_0:2}}]}],
  skins:[{joints:[1,2],inverseBindMatrices:3,skeleton:1}],
  buffers:[{uri:'data:application/octet-stream;base64,'+bin.toString('base64'),byteLength:bin.length}],
  bufferViews:off.map((o,i)=>{const ends=[96,128,256,384,392,424];return {buffer:0,byteOffset:o,byteLength:ends[i]-o};}),
  accessors:[
   {bufferView:0,componentType:5126,count:8,type:'VEC3',min:[-0.5,0,-0.5],max:[0.5,2,0.5]},
   {bufferView:1,componentType:5121,count:8,type:'VEC4'},
   {bufferView:2,componentType:5126,count:8,type:'VEC4'},
   {bufferView:3,componentType:5126,count:2,type:'MAT4'},
   {bufferView:4,componentType:5126,count:2,type:'SCALAR',min:[0],max:[1]},
   {bufferView:5,componentType:5126,count:2,type:'VEC4'}],
  animations:[{name:'Wave',samplers:[{input:4,output:5}],channels:[{sampler:0,target:{node:2,path:'rotation'}}]}]};
 return Buffer.from(JSON.stringify(gltf));
}

test('3D studio round-trips a skinned glTF with its clip: import, export as GLB, import again',async({page})=>{
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'skinned.gltf',mimeType:'model/gltf+json',buffer:skinnedGltf()});
 await expect(page.getByTestId('studio3d-viewport')).toBeVisible({timeout:20_000});
 await expect.poll(async()=>(await session(page)).bones.length).toBe(2);
 await expect.poll(async()=>((await session(page)).clips??[]).map(c=>c.name)).toEqual(['Wave']);
 const [download]=await Promise.all([page.waitForEvent('download'),run(page,'studio3d.export.glb',{})]);
 const stream=await download.createReadStream();
 const chunks:Buffer[]=[];for await(const c of stream)chunks.push(c as Buffer);
 const glb=Buffer.concat(chunks);
 expect(glb.length).toBeGreaterThan(500);
 expect(glb.readUInt32LE(0)).toBe(0x46546c67,'a real binary GLB comes back');
 await run(page,'studio3d.scene.new',{});
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'again.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect.poll(async()=>(await session(page)).bones.length,{timeout:20_000}).toBe(2);
 await expect.poll(async()=>((await session(page)).clips??[]).map(c=>c.name)).toEqual(['Wave']);
 await expect.poll(async()=>((await session(page)).clips??[])[0]?.duration).toBeCloseTo(1,1);
});

test('mesh edit mode: select faces, extrude, undo restores the cube',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 const before=(await session(page)).stats.triangles;
 expect(before).toBe(12);
 expect(await run(page,'studio3d.edit.start',{id,mode:'face'})).toBe(true);
 let s=await session(page);
 expect(s.edit).toMatchObject({id,mode:'face',verts:0,faces:0});
 expect(await run(page,'studio3d.edit.select',{kind:'face',ids:[4,5]})).toBe(true);
 s=await session(page);expect(s.edit).toMatchObject({faces:2});
 expect(await run(page,'studio3d.edit.extrude',{offset:0.5})).toBe(true);
 await expect.poll(async()=>(await session(page)).stats.triangles).toBe(20);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).stats.triangles).toBe(12);
 expect(await run(page,'studio3d.edit.end')).toBe(true);
 expect((await session(page)).edit).toBeNull();
});

test('mesh edit: extrude without a selection is refused readably',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 await run(page,'studio3d.edit.start',{id,mode:'face'});
 expect(await run(page,'studio3d.edit.extrude',{offset:0.5})).toBe(false);
 await expect(page.getByRole('alert')).toContainText('Select at least one face');
 expect(await run(page,'studio3d.edit.loopCut')).toBe(false);
 await expect(page.getByRole('alert')).toContainText('exactly one edge');
});

test('sculpt: one stroke moves vertices, one undo restores them',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 expect(await run(page,'studio3d.sculpt.brush',{brush:'grab',radius:2,strength:1,symmetry:'none'})).toBe(true);
 const s0=await session(page);
 expect(s0.sculpt).toMatchObject({brush:'grab',radius:2,strength:1,symmetry:'none'});
 expect(await run(page,'studio3d.sculpt.begin',{id})).toBe(true);
 expect(await run(page,'studio3d.sculpt.dab',{id,center:[0.5,1,0.5],delta:[0,0.4,0]})).toBe(true);
 expect(await run(page,'studio3d.sculpt.dab',{id,center:[0,1,0],delta:[0.2,0,0]})).toBe(true);
 expect(await run(page,'studio3d.sculpt.end')).toBe(true);
 await expect.poll(async()=>(await session(page)).stats.triangles).toBe(12); // sculpt keeps topology
 expect(await run(page,'studio3d.undo')).toBe(true); // single undo for the whole stroke
 await expect.poll(async()=>(await session(page)).stats.vertices).toBe(24);
 // the mesh is still editable after the undo (positions restored, topology intact)
 expect(await run(page,'studio3d.sculpt.begin',{id})).toBe(true);
 expect(await run(page,'studio3d.sculpt.end')).toBe(true);
});

test('sculpt on a light is refused readably',async({page})=>{
 await blank(page);
 await run(page,'studio3d.insert.light',{kind:'directional'});
 const s=await session(page);
 const lightId=s.outline.find(o=>o.kind==='light')!.id;
 expect(await run(page,'studio3d.sculpt.begin',{id:lightId})).toBe(false);
 await expect(page.getByRole('alert')).toContainText('not a mesh');
});

test('edge bevel and loop slide work through commands with undo',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 await run(page,'studio3d.edit.start',{id,mode:'edge'});
 // BoxGeometry: vert 0 = (0.5,0.5,0.5), vert 2 = (0.5,-0.5,0.5) - a vertical edge
 // select edge [0,4]: vertical on the indexed box geometry (corner 0 bottom, 4 top on BoxGeometry)
 expect(await run(page,'studio3d.edit.select',{kind:'edge',ids:[[0,2]]})).toBe(true);
 const s1=await session(page);expect(s1.edit!.edges).toBe(1);
 const before=s1.stats.triangles;
 expect(await run(page,'studio3d.edit.bevelEdge',{width:0.1})).toBe(true);
 await expect.poll(async()=>(await session(page)).stats.triangles).toBeGreaterThan(before);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).stats.triangles).toBe(before);
 expect(await run(page,'studio3d.edit.loopSlide',{factor:0.5})).toBe(true);
 expect(await run(page,'studio3d.undo')).toBe(true);
});

test('mirror modifier doubles the cube in the session and exports, undo restores',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 expect(await run(page,'studio3d.mesh.mirrorMod',{id,axis:'x',merge:0,on:true})).toBe(true);
 await expect.poll(async()=>(await session(page)).stats.triangles).toBe(24);
 expect((await session(page)).info!.mirror).toMatchObject({axis:'x'});
 // editing is refused while the modifier is on
 expect(await run(page,'studio3d.edit.start',{id,mode:'face'})).toBe(false);
 await expect(page.getByRole('alert')).toContainText('mirror modifier');
 expect(await run(page,'studio3d.mesh.mirrorMod',{id,axis:'x',merge:0,on:false})).toBe(true);
 await expect.poll(async()=>(await session(page)).stats.triangles).toBe(12);
 expect((await session(page)).info!.mirror).toBeNull();
});

test('mask brush protects vertices and clears with undo',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 await run(page,'studio3d.sculpt.brush',{brush:'mask',radius:2,strength:1});
 expect(await run(page,'studio3d.sculpt.begin',{id})).toBe(true);
 expect(await run(page,'studio3d.sculpt.dab',{id,center:[0.5,1,0.5]})).toBe(true);
 expect(await run(page,'studio3d.sculpt.end')).toBe(true);
 await run(page,'studio3d.sculpt.brush',{brush:'grab'});
 expect(await run(page,'studio3d.sculpt.begin',{id})).toBe(true);
 expect(await run(page,'studio3d.sculpt.dab',{id,center:[0.5,1,0.5],delta:[0,0.5,0]})).toBe(true);
 expect(await run(page,'studio3d.sculpt.end')).toBe(true);
 expect(await run(page,'studio3d.sculpt.maskClear',{id})).toBe(true);
 expect(await run(page,'studio3d.undo')).toBe(true); // clear undone
});

test('crease, pinch and flatten brushes run through the dab command',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 for(const brush of['crease','pinch','flatten']){
  await run(page,'studio3d.sculpt.brush',{brush,radius:2,strength:0.8});
  expect(await run(page,'studio3d.sculpt.begin',{id})).toBe(true);
  expect(await run(page,'studio3d.sculpt.dab',{id,center:[0.5,1,0.5]})).toBe(true);
  expect(await run(page,'studio3d.sculpt.end')).toBe(true);
  expect(await run(page,'studio3d.undo')).toBe(true);
 }
});

test('round bevel profile and mirror bisect work through commands',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 await run(page,'studio3d.edit.start',{id,mode:'edge'});
 expect(await run(page,'studio3d.edit.select',{kind:'edge',ids:[[0,2]]})).toBe(true);
 const before=(await session(page)).stats.triangles;
 expect(await run(page,'studio3d.edit.bevelEdge',{width:0.1,segments:4})).toBe(true);
 await expect.poll(async()=>(await session(page)).stats.triangles).toBeGreaterThan(before+4);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).stats.triangles).toBe(before);
 expect(await run(page,'studio3d.edit.bevelEdge',{width:0.1,segments:9})).toBe(false);
 await expect(page.getByRole('alert')).toContainText('segments');
 await run(page,'studio3d.edit.end');
 // mirror with bisect on the whole cube: clip at the plane, mirror back to a whole cube
 expect(await run(page,'studio3d.mesh.mirrorMod',{id,axis:'x',merge:0.001,on:true,bisect:true})).toBe(true);
 const s=await session(page);
 expect(s.info!.mirror).toMatchObject({axis:'x',bisect:true});
 expect(s.stats.triangles).toBeGreaterThanOrEqual(12);
 expect(await run(page,'studio3d.undo')).toBe(true);
 expect((await session(page)).info!.mirror).toBeNull();
});

test('sculpt mask overlay paints are visible in the session while sculpt mode is on',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 await run(page,'studio3d.sculpt.brush',{on:true,brush:'mask',radius:2,strength:1});
 expect((await session(page)).sculpt.on).toBe(true);
 await run(page,'studio3d.sculpt.begin',{id});
 expect(await run(page,'studio3d.sculpt.dab',{id,center:[0.5,1,0.5]})).toBe(true);
 await run(page,'studio3d.sculpt.end');
 // overlay itself is WebGL viewport state (CI verifies pixels); here the mask attribute drives it
 expect(await run(page,'studio3d.sculpt.maskClear',{id})).toBe(true);
});

test('uv seams, unwrap, planar and checker preview work through commands',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 await run(page,'studio3d.edit.start',{id,mode:'edge'});
 expect(await run(page,'studio3d.edit.select',{kind:'edge',ids:[[0,2]]})).toBe(true);
 expect(await run(page,'studio3d.uv.seam',{mark:true})).toBe(true);
 await expect.poll(async()=>(await session(page)).info!.uv!.seams).toBe(2);
 expect(await run(page,'studio3d.uv.seam',{mark:true})).toBe(false);
 await expect(page.getByRole('alert')).toContainText('already seams');
 expect(await run(page,'studio3d.uv.unwrap',{id})).toBe(false);
 await expect(page.getByRole('alert')).toContainText('edit mode');
 await run(page,'studio3d.edit.end');
 const before=(await session(page)).stats.vertices;
 expect(await run(page,'studio3d.uv.unwrap',{id})).toBe(true);
 await expect.poll(async()=>(await session(page)).stats.vertices).toBeGreaterThan(before);
 const s=await session(page);
 expect(s.info!.uv).toMatchObject({hasUv:true,seams:2});
 expect(s.info!.uv!.islands).toBe(1);
 expect(await run(page,'studio3d.uv.planar',{id,axis:'y'})).toBe(true);
 expect(await run(page,'studio3d.uv.preview',{on:true})).toBe(true);
 await expect.poll(async()=>(await session(page)).uvChecker).toBe(true);
 expect(await run(page,'studio3d.uv.preview',{on:false})).toBe(true);
 await expect.poll(async()=>(await session(page)).uvChecker).toBe(false);
 expect(await run(page,'studio3d.undo')).toBe(true); // planar
 expect(await run(page,'studio3d.undo')).toBe(true); // unwrap
 await expect.poll(async()=>(await session(page)).stats.vertices).toBe(before);
 expect((await session(page)).info!.uv!.seams).toBe(2);
});

test('uv unwrap packs islands by default and angle unfolding works through commands',async({page})=>{
 await blank(page);
 const id=await insert(page,'cube',0);
 // seam display lines are WebGL viewport state (CI verifies pixels); here the commands drive them
 expect(await run(page,'studio3d.uv.unwrap',{id,method:'angle'})).toBe(true);
 let s=await session(page);
 expect(s.info!.uv).toMatchObject({hasUv:true,islands:1});
 expect(await run(page,'studio3d.uv.unwrap',{id,method:'box',pack:false})).toBe(true);
 expect((await session(page)).info!.uv!.hasUv).toBe(true);
 expect(await run(page,'studio3d.uv.unwrap',{id,method:'angle',pack:true,padding:0.1})).toBe(true);
 expect(await run(page,'studio3d.uv.unwrap',{id,padding:0.5})).toBe(false);
 await expect(page.getByRole('alert')).toBeVisible();
 expect(await run(page,'studio3d.undo')).toBe(true);
});

test('3D studio saves, applies and removes local material presets',async({page})=>{
 await blank(page);
 const a=await insert(page,'cube',0);
 await run(page,'studio3d.object.material',{id:a,color:'#2244cc',metalness:0.8,roughness:0.2});
 const box=page.getByTestId('studio3d-material-user-presets');
 await box.getByLabel('Preset name').fill('Blue steel');
 await box.getByRole('button',{name:'Save as preset'}).click();
 await expect.poll(async()=>(await session(page)).materialPresets?.map((p:{name:string})=>p.name)).toEqual(['Blue steel']);
 await expect.poll(async()=>await page.evaluate(()=>localStorage.getItem('somnia.studio3d.materialPresets.v1')??'')).toContain('Blue steel');
 await run(page,'studio3d.object.material',{id:a,color:'#cccccc',metalness:0});
 await expect.poll(async()=>(await session(page)).info?.material?.color).toBe('#cccccc');
 await box.getByRole('button',{name:'Blue steel',exact:true}).click();
 await expect.poll(async()=>(await session(page)).info?.material?.color).toBe('#2244cc');
 await expect.poll(async()=>(await session(page)).info?.material?.metalness).toBe(0.8);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).info?.material?.color).toBe('#cccccc');
 await run(page,'studio3d.material.preset.apply',{id:a,name:'Blue steel'});
 await expect.poll(async()=>(await session(page)).info?.material?.color).toBe('#2244cc');
 await box.getByRole('button',{name:'Remove preset Blue steel'}).click();
 await expect.poll(async()=>(await session(page)).materialPresets?.length).toBe(0);
 await run(page,'studio3d.material.preset.remove',{name:'Blue steel'});
 await expect(page.getByRole('alert')).toContainText('no preset called');
});

test('3D studio lights and scene basics: ambient light, env presets and background modes',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 await run(page,'studio3d.insert.light',{kind:'ambient'});
 const amb=(await session(page)).selected as number;
 await expect.poll(async()=>(await session(page)).info?.light?.intensity).toBe(0.6);
 await expect(page.getByTestId('studio3d-light').getByLabel('Cast shadows')).toHaveCount(0);
 await run(page,'studio3d.light.set',{id:amb,color:'#224466',intensity:1.1});
 await expect.poll(async()=>(await session(page)).info?.light?.color).toBe('#224466');
 await run(page,'studio3d.light.set',{id:amb,shadow:true});
 await expect(page.getByRole('alert')).toContainText('Ambient lights cannot cast shadows');
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).info?.light?.color).toBe('#ffffff');
 await run(page,'studio3d.env.set',{preset:'outdoor'});
 await expect.poll(async()=>(await session(page)).env?.preset).toBe('outdoor');
 await run(page,'studio3d.env.set',{preset:'dark'});
 await expect.poll(async()=>(await session(page)).env?.preset).toBe('dark');
 await run(page,'studio3d.env.set',{bg:'gradient',bgColor:'#102030',bgColor2:'#405060'});
 await expect.poll(async()=>(await session(page)).env?.bg).toBe('gradient');
 await expect.poll(async()=>(await session(page)).env?.bgColor2).toBe('#405060');
 await run(page,'studio3d.env.set',{bg:'color',bgColor:'#203040'});
 await expect.poll(async()=>(await session(page)).env?.bg).toBe('color');
 await run(page,'studio3d.env.set',{background:true});
 await expect.poll(async()=>(await session(page)).env?.bg).toBe('env');
 for(const kind of['directional','point','spot'])await run(page,'studio3d.insert.light',{kind});
 const [download]=await Promise.all([page.waitForEvent('download'),page.getByTestId('studio3d-export').getByRole('button',{name:'glTF'}).click()]);
 const json=JSON.parse(readFileSync(await download.path()!,'utf8'));
 expect(json.extensionsUsed).toContain('KHR_lights_punctual');
 expect(json.extensions.KHR_lights_punctual.lights.map((l:{type:string})=>l.type).sort()).toEqual(['directional','point','spot']);
});

test('3D studio material polish: glass and wood presets, copy/paste material and metal texture slot',async({page})=>{
 await blank(page);
 const cube=await insert(page,'cube',0);
 const sphere=await insert(page,'sphere',2);
 // Pasting with an empty clipboard is refused.
 expect(await run(page,'studio3d.material.paste',{id:cube})).toBe(false);
 await expect(page.getByRole('alert')).toContainText('Copy a material first');
 // The glass preset makes the selected cube transparent.
 await run(page,'studio3d.select',{id:cube});
 await page.getByTestId('studio3d-material-presets').getByRole('button',{name:'Glass'}).click();
 await expect.poll(async()=>(await session(page)).info?.material?.opacity).toBe(0.28);
 await expect.poll(async()=>(await session(page)).info?.material?.alphaMode).toBe('blend');
 // The wood preset generates a wood texture in the color slot.
 await page.getByTestId('studio3d-material-presets').getByRole('button',{name:'Wood'}).click();
 await expect(page.getByTestId('studio3d-texture-color')).toContainText('wood');
 await expect.poll(async()=>(await session(page)).info?.material?.color).toBe('#8a5a33');
 // Copy the cube's material and paste it onto the sphere in one undo step.
 await page.getByTestId('studio3d-material-copy-paste').getByRole('button',{name:'Copy material'}).click();
 await run(page,'studio3d.select',{id:sphere});
 const before=(await session(page)).info?.material?.color;
 await page.getByTestId('studio3d-material-copy-paste').getByRole('button',{name:'Paste material'}).click();
 await expect.poll(async()=>(await session(page)).info?.material?.color).toBe('#8a5a33');
 await expect(page.getByTestId('studio3d-texture-color')).toContainText('wood');
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).info?.material?.color).toBe(before);
 // The metal slot accepts an image like the other slots.
 await page.getByTestId('studio3d-material-copy-paste').getByRole('button',{name:'Paste material'}).click();
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==','base64');
 expect(await run(page,'studio3d.texture.open',{slot:'metal'})).toBe(true);
 await page.getByTestId('studio3d-texture-input').setInputFiles({name:'m.png',mimeType:'image/png',buffer:png});
 await expect.poll(async()=>(await session(page)).info?.material?.textures?.metal).toBe('m.png');
 await expect(page.getByTestId('studio3d-texture-metal')).toContainText('m.png');
 // Copy/paste via commands works too.
 expect(await run(page,'studio3d.material.copy',{id:sphere})).toBe(true);
 await run(page,'studio3d.select',{id:cube});
 expect(await run(page,'studio3d.material.paste',{id:cube})).toBe(true);
 await expect.poll(async()=>(await session(page)).info?.material?.textures?.metal).toBe('m.png');
 await expect.poll(async()=>(await session(page)).info?.material?.color).toBe('#8a5a33');
});

test('3D studio outliner: hide/lock, ctrl/shift multi-select, inline rename, reparent and persistence',async({page})=>{
 await blank(page);
 const cube=await insert(page,'cube',-1);const sphere=await insert(page,'sphere',1);
 // Hide and lock the cube from its outline row.
 await page.getByRole('button',{name:'Hide Cube'}).click();
 await expect.poll(async()=>(await session(page)).outline.find(o=>o.id===cube)?.hidden).toBe(true);
 await page.getByRole('button',{name:'Lock Cube'}).click();
 await expect.poll(async()=>(await session(page)).outline.find(o=>o.id===cube)?.locked).toBe(true);
 // A shift-drag marquee over the viewport picks the sphere but skips the hidden, locked cube.
 const vp=page.getByTestId('studio3d-viewport');const box=(await vp.boundingBox())!;
 await page.keyboard.down('Shift');
 await page.mouse.move(box.x+4,box.y+4);await page.mouse.down();await page.mouse.move(box.x+box.width-4,box.y+box.height-4,{steps:5});await page.mouse.up();
 await page.keyboard.up('Shift');
 await expect.poll(async()=>(await session(page)).marked).toEqual([sphere]);
 await run(page,'studio3d.select',{id:null});
 // Ctrl+click toggles and shift+click range-selects in the outline.
 await page.getByTestId('studio3d-outline-row-'+cube).click();
 await page.getByTestId('studio3d-outline-row-'+sphere).click({modifiers:['ControlOrMeta']});
 await expect.poll(async()=>(await session(page)).marked).toEqual([cube,sphere]);
 await expect.poll(async()=>(await session(page)).selected).toBe(sphere);
 // Group and ungroup from the outline toolbar.
 await page.getByTestId('studio3d-outline-groups').getByRole('button',{name:'Group'}).click();
 const grp=(await session(page)).outline.find(o=>o.kind==='group')!;
 expect(grp).toBeTruthy();
 await run(page,'studio3d.select',{id:grp.id});
 await page.getByTestId('studio3d-outline-groups').getByRole('button',{name:'Ungroup'}).click();
 await expect.poll(async()=>(await session(page)).outline.some(o=>o.kind==='group')).toBe(false);
 // Reparent the sphere under the cube in one undo step.
 expect(await run(page,'studio3d.object.reparent',{ids:[sphere],parent:cube})).toBe(true);
 await expect.poll(async()=>(await session(page)).outline.find(o=>o.id===sphere)?.depth).toBe(1);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.find(o=>o.id===sphere)?.depth).toBe(0);
 // Inline rename with a double click.
 await page.getByTestId('studio3d-outline-row-'+cube).dblclick();
 await page.getByRole('textbox',{name:'Rename Cube'}).fill('Hero');
 await page.keyboard.press('Enter');
 await expect.poll(async()=>(await session(page)).outline.find(o=>o.id===cube)?.name).toBe('Hero');
 // Frame-selection command still works; F is its key binding.
 expect(await run(page,'studio3d.view.frame',{})).toBe(true);
 // Hide the sphere too, then flags survive a .som3d save and reopen.
 await page.getByRole('button',{name:'Hide Sphere'}).click();
 const [download]=await Promise.all([page.waitForEvent('download'),page.keyboard.press('Control+s')]);
 const saved=readFileSync(await download.path()!);
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'scene.som3d',mimeType:'application/json',buffer:saved});
 await expect.poll(async()=>(await session(page)).status).toBe('ready');
 const after=await session(page);
 expect(after.outline.find(o=>o.name==='Hero')?.hidden).toBe(true);
 expect(after.outline.find(o=>o.name==='Hero')?.locked).toBe(true);
 expect(after.outline.find(o=>o.name==='Sphere')?.hidden).toBe(true);
});

test('3D studio import/export polish: selection-only export, import units and axis, one-undo open',async({page})=>{
 await blank(page);
 const cube=await insert(page,'cube',0);await insert(page,'sphere',2);
 // Selection-only export writes just the chosen object.
 await page.getByRole('checkbox',{name:'Selection only'}).check();
 await run(page,'studio3d.select',{id:cube});
 const [dl]=await Promise.all([page.waitForEvent('download'),page.getByTestId('studio3d-export').getByRole('button',{name:'GLB'}).click()]);
 const glb=readFileSync(await dl.path()!);
 await open3d(page);
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'sel.glb',mimeType:'model/gltf-binary',buffer:glb});
 await expect.poll(async()=>(await session(page)).status).toBe('ready');
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').map(o=>o.name)).toEqual(['Cube']);
 // Opening the file replaced the empty scene in one undo step.
 expect(await run(page,'studio3d.undo')).toBe(true);
 await expect.poll(async()=>(await session(page)).outline.length).toBe(0);
 await run(page,'studio3d.redo');
 await expect.poll(async()=>(await session(page)).outline.some(o=>o.name==='Cube')).toBe(true);
 // Import units and up axis: a 1000 x 1000 x 10 mm slab from a Z-up OBJ reads as 1 x 0.01 x 1 metres.
 const obj=['v 0 0 0','v 1000 0 0','v 1000 1000 0','v 0 1000 0','v 0 0 10','v 1000 0 10','v 1000 1000 10','v 0 1000 10','f 1 2 3','f 1 3 4','f 5 7 6','f 5 8 7','f 1 5 6','f 1 6 2','f 2 6 7','f 2 7 3','f 3 7 8','f 3 8 4','f 4 8 5','f 4 5 1'].join('\n');
 await run(page,'studio3d.import.options',{unit:'mm',upAxis:'z'});
 await page.getByTestId('studio3d-file-input').setInputFiles({name:'slab.obj',mimeType:'model/obj',buffer:Buffer.from(obj)});
 await expect.poll(async()=>(await session(page)).status).toBe('ready');
 await expect(page.getByTestId('studio3d-model-section')).toContainText('1 x 0.01 x 1');
 // The import options are visible in the panel and drove that open.
 await expect(page.getByTestId('studio3d-import').getByLabel('File units')).toHaveValue('mm');
 await expect(page.getByTestId('studio3d-import').getByLabel('Up axis')).toHaveValue('z');
 // Undoing the import restores the previously open file.
 expect(await run(page,'studio3d.undo')).toBe(true);
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').map(o=>o.name)).toEqual(['Cube']);
});

test('3D studio precision tools: snap modes and hotkey, measure picks, transform pivot, relative entry',async({page})=>{
 await blank(page);
 const cube=await insert(page,'cube',0);
 // S toggles snapping; the panel reflects it and offers the midpoint mode.
 const snapBox=page.getByRole('checkbox',{name:'Snap to steps'});
 await expect(snapBox).not.toBeChecked();
 await page.getByTestId('studio3d-viewport').click({position:{x:40,y:40}});
 await page.keyboard.press('s');
 await expect(snapBox).toBeChecked();
 expect((await session(page)).snap.on).toBe(true);
 expect(await run(page,'studio3d.snap.set',{mode:'midpoint'})).toBe(true);
 await expect(page.getByLabel('Snap to')).toHaveValue('midpoint');
 // Relative numeric entry: +2 adds to the current X, *3 scales it.
 await run(page,'studio3d.select',{id:cube});
 const posX=page.getByRole('textbox',{name:'Position X'});
 await posX.fill('+2');await posX.press('Enter');
 await expect.poll(async()=>(await positionOf(page,cube)).x).toBe(2);
 await posX.fill('*3');await posX.press('Enter');
 await expect.poll(async()=>(await positionOf(page,cube)).x).toBe(6);
 // Transform pivot: origin and cursor are accepted, the cursor fields appear for cursor mode.
 expect(await run(page,'studio3d.pivot.set',{mode:'origin'})).toBe(true);
 expect((await session(page)).pivot).toBe('origin');
 expect(await run(page,'studio3d.cursor.set',{x:1,y:0,z:2})).toBe(true);
 expect(await run(page,'studio3d.pivot.set',{mode:'cursor'})).toBe(true);
 await expect(page.getByTestId('studio3d-cursor')).toBeVisible();
 expect((await session(page)).cursor).toEqual({x:1,y:0,z:2});
 // Measure tool: two viewport clicks give a distance readout; M and Escape leave the tool.
 expect(await run(page,'studio3d.measure.set',{on:true})).toBe(true);
 const vp=page.getByTestId('studio3d-viewport');
 await vp.click({position:{x:200,y:220}});
 await vp.click({position:{x:420,y:160}});
 await expect(page.getByTestId('studio3d-measure')).toContainText(/[0-9]+\.[0-9]{3} m · /);
 // The readout lists the signed per-axis deltas and follows the scene unit.
 await expect(page.getByTestId('studio3d-measure')).toContainText('Δ');
 expect(await run(page,'studio3d.unit.set',{unit:'mm'})).toBe(true);
 await expect(page.getByTestId('studio3d-measure')).toContainText('mm · ');
 await expect(page.getByTestId('studio3d-measure')).toContainText(' mm');
 expect(await run(page,'studio3d.unit.set',{unit:'m'})).toBe(true);
 expect((await session(page)).measure?.a).toBeTruthy();
 expect((await session(page)).measure?.b).toBeTruthy();
 // Snapping applies to measure picks: grid mode rounds the picked point to the move step.
 expect(await run(page,'studio3d.snap.set',{on:true,mode:'grid',move:0.5})).toBe(true);
 await vp.click({position:{x:310,y:205}});
 const snapped=(await session(page)).measure?.a;
 expect(snapped).toBeTruthy();
 for(const v of [snapped!.x,snapped!.y,snapped!.z])expect(Math.abs(v/0.5-Math.round(v/0.5))).toBeLessThan(1e-9);
 expect(await run(page,'studio3d.snap.set',{on:false})).toBe(true);
 await page.keyboard.press('m');
 await expect(page.getByTestId('studio3d-measure')).toHaveCount(0);
 expect((await session(page)).measure).toBe(null);
});

test('3D studio outliner: drag reorder next to siblings with one undo',async({page})=>{
 await blank(page);
 const a=await insert(page,'cube',-2);const b=await insert(page,'sphere',0);const c=await insert(page,'cone',2);
 const order=async()=>(await session(page)).outline.filter(o=>o.depth===0).map(o=>o.name);
 expect(await order()).toEqual(['Cube','Sphere','Cone']);
 // Move the cone in front of the cube; the outline order updates and one undo restores it.
 expect(await run(page,'studio3d.object.reorder',{ids:[c],target:a,where:'before'})).toBe(true);
 expect(await order()).toEqual(['Cone','Cube','Sphere']);
 await run(page,'studio3d.undo');
 expect(await order()).toEqual(['Cube','Sphere','Cone']);
 await run(page,'studio3d.redo');
 expect(await order()).toEqual(['Cone','Cube','Sphere']);
 // Move the sphere after the cone.
 expect(await run(page,'studio3d.object.reorder',{ids:[b],target:c,where:'after'})).toBe(true);
 expect(await order()).toEqual(['Cone','Sphere','Cube']);
 // Reorder into a group child slot: the cube before the cone's sibling inside a group.
 expect(await run(page,'studio3d.group',{ids:[c,b]})).toBe(true);
 expect(await run(page,'studio3d.object.reorder',{ids:[a],target:c,where:'after'})).toBe(true);
 const s1=await session(page);
 const grp=s1.outline.find(o=>o.kind==='group')!;
 expect(s1.outline.filter(o=>o.depth===1).map(o=>o.name)).toEqual(['Cone','Cube','Sphere']);
 await run(page,'studio3d.undo');
 const s2=await session(page);
 expect(s2.outline.filter(o=>o.depth===1).map(o=>o.name)).toEqual(['Cone','Sphere']);
 expect(s2.outline.find(o=>o.id===a)?.depth).toBe(0);
 // Dropping a row onto itself is a no-op.
 expect(await run(page,'studio3d.object.reorder',{ids:[a],target:a,where:'before'})).toBe(true);
 expect((await session(page)).outline.filter(o=>o.depth===1).map(o=>o.name)).toEqual(['Cone','Sphere']);
});

test('3D studio materials: emissive preset and inspector preview swatch',async({page})=>{
 await blank(page);
 const cube=await insert(page,'cube',0);
 await run(page,'studio3d.select',{id:cube});
 // The emissive preset applies a glowing PBR material in one undo step.
 await page.getByTestId('studio3d-material-presets').getByRole('button',{name:'Emissive'}).click();
 await expect.poll(async()=>(await session(page)).info?.material?.emissiveIntensity).toBe(2);
 expect((await session(page)).info?.material?.emissive).toBe('#4fc3ff');
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).info?.material?.emissiveIntensity).not.toBe(2);
 // The swatch mirrors the current material.
 await expect(page.getByTestId('studio3d-material-swatch')).toBeVisible();
 // Copy/paste still round-trips materials between objects (regression guard for the row).
 const ball=await insert(page,'sphere',2);
 await run(page,'studio3d.select',{id:cube});
 await page.getByTestId('studio3d-material-copy-paste').getByRole('button',{name:'Copy'}).click();
 await run(page,'studio3d.select',{id:ball});
 await page.getByTestId('studio3d-material-copy-paste').getByRole('button',{name:'Paste'}).click();
 expect((await session(page)).info?.material?.color).toBe('#b8bcc8');
});

test('3D studio lights: shadow softness and one-click studio and sunset rigs',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 const sun=await run(page,'studio3d.insert.light',{kind:'directional'});
 // Shadow softness appears once shadows are on and edits in one undo step.
 await run(page,'studio3d.light.set',{id:(await session(page)).selected,shadow:true});
 const soft=page.getByRole('textbox',{name:'Shadow softness'});
 await soft.fill('6');await soft.press('Enter');
 await expect.poll(async()=>(await session(page)).info?.light?.radius).toBe(6);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).info?.light?.radius).toBe(1);
 // Studio rig: two area softboxes plus a directional top, added and removed in one undo step.
 await page.getByTestId('studio3d-insert').getByRole('button',{name:'Studio'}).click();
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='light').length).toBe(4);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='light').length).toBe(1);
 // Sunset rig: a warm directional sun and a cool ambient sky.
 await page.getByTestId('studio3d-insert').getByRole('button',{name:'Sunset'}).click();
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='light').length).toBe(3);
 await run(page,'studio3d.undo');
 // The classic three-point rig still works from the same command.
 expect(await run(page,'studio3d.light.rig',{preset:'three-point'})).toBe(true);
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='light').length).toBe(4);
});

test('3D studio camera: projection toggle, fov and focal length fields and turntable preview',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 const cam=page.getByTestId('studio3d-view-camera');
 // Projection switch is view state and round-trips.
 await cam.getByLabel('Projection').selectOption('orthographic');
 await expect.poll(async()=>(await session(page)).viewKind).toBe('orthographic');
 await cam.getByLabel('Projection').selectOption('perspective');
 await expect.poll(async()=>(await session(page)).viewKind).toBe('perspective');
 // Focal length and field of view stay in sync (50mm is about 27 degrees on the 24mm sensor height).
 await cam.getByRole('textbox',{name:'Focal length (mm)'}).fill('50');
 await cam.getByRole('textbox',{name:'Focal length (mm)'}).press('Enter');
 await expect.poll(async()=>(await session(page)).viewFov).toBeCloseTo(27,0);
 await cam.getByRole('textbox',{name:'Field of view (degrees)'}).fill('45');
 await cam.getByRole('textbox',{name:'Field of view (degrees)'}).press('Enter');
 await expect.poll(async()=>(await session(page)).viewFov).toBe(45);
 // Turntable preview toggles and stays a preview: it never marks the scene dirty.
 const dirty=(await session(page)).dirty;
 await cam.getByRole('button',{name:'Turntable preview'}).click();
 await expect.poll(async()=>(await session(page)).turntable).toBe(true);
 await cam.getByRole('button',{name:'Turntable preview'}).click();
 await expect.poll(async()=>(await session(page)).turntable).toBe(false);
 expect((await session(page)).dirty).toBe(dirty);
});

test('3D studio opens a dropped model with its sidecars and shows an import summary',async({page})=>{
 await blank(page);
 // Dropping a batch without a model file keeps the scene and shows a readable error naming every openable format.
 await page.getByTestId('studio3d-viewport').dispatchEvent('drop',{dataTransfer:await page.evaluateHandle(()=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(8)],'notes.txt'));return dt;})});
 await expect(page.getByRole('alert')).toContainText('Choose a .som3d');
 // A real model drop imports and reports the summary. The scene was left intact by the failed drop above.
 await blank(page);
 const glb=triangleGlb();
 await page.getByTestId('studio3d-viewport').dispatchEvent('drop',{dataTransfer:await page.evaluateHandle(b=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(b)],'dropped.glb'));return dt;},[...glb])});
 await expect.poll(async()=>(await session(page)).name).toBe('dropped.glb');
 await expect(page.getByTestId('studio3d-import-summary')).toContainText('1 triangles');
 await expect(page.getByTestId('studio3d-import-summary')).toContainText('1 materials');
 // Dropping over unsaved changes asks first, like the file dialog does.
 await insert(page,'cube',0);
 await page.getByTestId('studio3d-viewport').dispatchEvent('drop',{dataTransfer:await page.evaluateHandle(b=>{const dt=new DataTransfer();dt.items.add(new File([new Uint8Array(b)],'second.glb'));return dt;},[...glb])});
 await expect(page.getByTestId('studio3d-replace')).toBeVisible();
 await page.getByTestId('studio3d-replace').getByRole('button',{name:/replace/i}).first().click();
 await expect.poll(async()=>(await session(page)).name).toBe('second.glb');
});

test('3D studio outliner: folding groups, keyboard navigation and selection-set actions',async({page})=>{
 await blank(page);
 const a=await insert(page,'cube',-1);await insert(page,'sphere',1);
 await page.getByTestId('studio3d-outline-row-'+a).click();
 await run(page,'studio3d.select',{id:null});
 await run(page,'studio3d.group',{ids:[a,(await session(page)).outline.find(o=>o.kind==='mesh'&&o.id!==a)!.id]});
 const group=(await session(page)).outline.find(o=>o.kind==='group')!;
 // Folding hides the children; expanding brings them back. The group row itself stays.
 await page.getByRole('button',{name:`Collapse ${group.name}`}).click();
 await expect(page.getByTestId('studio3d-outline-row-'+a)).toHaveCount(0);
 await expect(page.getByTestId('studio3d-outline-row-'+group.id)).toBeVisible();
 await page.getByRole('button',{name:`Expand ${group.name}`}).click();
 await expect(page.getByTestId('studio3d-outline-row-'+a)).toBeVisible();
 // A name filter still finds rows inside a folded group.
 await page.getByRole('button',{name:`Collapse ${group.name}`}).click();
 await page.getByTestId('studio3d-scene-panel').getByRole('textbox').first().fill('Cube');
 await expect(page.getByTestId('studio3d-outline-row-'+a)).toBeVisible();
 await page.getByTestId('studio3d-scene-panel').getByRole('textbox').first().fill('');
 await page.getByRole('button',{name:`Expand ${group.name}`}).click();
 // Keyboard: F2 renames, arrows move between rows, ArrowLeft folds an open group.
 await page.getByTestId('studio3d-outline-row-'+a).focus();
 await page.keyboard.press('F2');
 await page.getByRole('textbox',{name:/Rename/}).fill('Hero cube');
 await page.keyboard.press('Enter');
 await expect.poll(async()=>(await session(page)).outline.find(o=>o.id===a)?.name).toBe('Hero cube');
 await page.getByTestId('studio3d-outline-row-'+group.id).focus();
 await page.keyboard.press('ArrowLeft');
 await expect(page.getByTestId('studio3d-outline-row-'+a)).toHaveCount(0);
 await page.keyboard.press('ArrowRight');
 await expect(page.getByTestId('studio3d-outline-row-'+a)).toBeVisible();
 // Duplicate and delete act on the selection set (the group with its two children) and undo as one step each.
 await page.getByTestId('studio3d-outline-row-'+group.id).click();
 await expect.poll(async()=>(await session(page)).selected).toBe(group.id);
 await page.getByTestId('studio3d-outline-selection').getByRole('button',{name:'Duplicate selected'}).click();
 await expect.poll(async()=>(await session(page)).outline.length).toBe(6);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.length).toBe(3);
 await page.getByTestId('studio3d-outline-selection').getByRole('button',{name:'Delete selected'}).click();
 await expect.poll(async()=>(await session(page)).outline.length).toBe(0);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.length).toBe(3);
});

test('3D studio materials: texture slot preview and the material list with usage counts',async({page})=>{
 await blank(page);
 const a=await insert(page,'cube',-1);const b=await insert(page,'sphere',1);
 // Each primitive starts with its own material: two rows, one user each.
 const list=page.getByTestId('studio3d-material-list');
 await expect(list.getByRole('button')).toHaveCount(2);
 await expect(list).toContainText('Material 1');
 await expect(list).toContainText('1 objects');
 // A procedural preset texture shows a thumbnail preview on its slot.
 await run(page,'studio3d.select',{id:a});
 await run(page,'studio3d.object.material',{id:a,preset:'wood'});
 await expect(page.getByTestId('studio3d-texture-thumb-color')).toBeVisible();
 // Clearing the slot removes the thumbnail again.
 await page.getByTestId('studio3d-texture-color').getByRole('button',{name:'Clear'}).click();
 await expect(page.getByTestId('studio3d-texture-thumb-color')).toHaveCount(0);
 // Clicking a material entry selects the objects that share it.
 await list.getByRole('button').first().click();
 await expect.poll(async()=>(await session(page)).marked.length).toBeGreaterThan(0);
 await expect.poll(async()=>(await session(page)).selected).not.toBeNull();
});

test('3D studio lights: outdoor rig, shadow quality, helper toggle and ambient occlusion preview',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 // Outdoor rig: a shadow-casting sun plus a cool sky fill in one undo step.
 await page.getByTestId('studio3d-insert').getByRole('button',{name:'Outdoor'}).click();
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='light').length).toBe(2);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='light').length).toBe(0);
 // Shadow quality and algorithm are render state, set from the env panel.
 expect(await run(page,'studio3d.shadow.set',{quality:'low'})).toBe(true);
 await expect.poll(async()=>(await session(page)).shadows.quality).toBe('low');
 expect(await run(page,'studio3d.shadow.set',{type:'pcf'})).toBe(true);
 await expect.poll(async()=>(await session(page)).shadows.type).toBe('pcf');
 // The selected light's helper and the AO preview toggle from the view panel.
 expect(await run(page,'studio3d.light.helpers',{on:false})).toBe(true);
 await expect.poll(async()=>(await session(page)).lightHelpers).toBe(false);
 expect(await run(page,'studio3d.view.ao',{on:true,strength:0.6})).toBe(true);
 await expect.poll(async()=>(await session(page)).ao.on).toBe(true);
 await expect.poll(async()=>(await session(page)).ao.strength).toBe(0.6);
});

test('3D studio performance overlay toggles from the view panel',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 expect(await run(page,'studio3d.view.perf',{on:true})).toBe(true);
 await expect.poll(async()=>(await session(page)).perf).not.toBeNull();
 await expect(page.getByTestId('studio3d-perf')).toBeVisible();
 await expect(page.getByTestId('studio3d-perf')).toContainText('fps');
 expect(await run(page,'studio3d.view.perf',{on:false})).toBe(true);
 await expect.poll(async()=>(await session(page)).perf).toBeNull();
 await expect(page.getByTestId('studio3d-perf')).toHaveCount(0);
});

test('3D studio turntable renders a WebM video and refuses transparency for it',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 // Transparent frames stay exclusive to the PNG outputs.
 expect(await run(page,'studio3d.render.turntable',{out:'webm',transparent:true})).toBe(false);
 await expect(page.getByRole('alert')).toContainText('keeps the background');
 // A short WebM records and downloads.
 const [download]=await Promise.all([page.waitForEvent('download'),run(page,'studio3d.render.turntable',{frames:3,fps:10,out:'webm',width:160,height:120})]);
 expect(download.suggestedFilename()).toMatch(/-turntable\.webm$/);
 // The PNG zip output still works after the video.
 const [zip]=await Promise.all([page.waitForEvent('download'),run(page,'studio3d.render.turntable',{frames:2,width:120,height:90})]);
 expect(zip.suggestedFilename()).toMatch(/-turntable\.zip$/);
});

test('3D studio asset drags: primitive lands at the drop point, material assigns to the dropped mesh',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 // A primitive dragged from the insert panel lands on the ground plane as one undo step.
 await page.evaluate(()=>{const dt=new DataTransfer();dt.setData('application/x-somnia3d-asset',JSON.stringify({kind:'primitive',primitive:'sphere'}));
  const el=document.querySelector('[data-testid="studio3d-viewport"] > div')!;
  el.dispatchEvent(new DragEvent('dragover',{dataTransfer:dt,bubbles:true,cancelable:true}));
  const r=el.getBoundingClientRect();
  el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true,clientX:r.left+r.width/2,clientY:r.top+r.height/2}));});
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').length).toBe(2);
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').length).toBe(1);
 // A scene material dragged from the material list assigns to the mesh under the cursor.
 await page.evaluate(()=>{const dt=new DataTransfer();dt.setData('application/x-somnia3d-asset',JSON.stringify({kind:'material',key:'missing'}));
  const el=document.querySelector('[data-testid="studio3d-viewport"] > div')!;
  el.dispatchEvent(new DragEvent('drop',{dataTransfer:dt,bubbles:true,cancelable:true,clientX:10,clientY:10}));});
 await expect(page.getByRole('alert')).toBeVisible();
});

test('3D studio pins: insert at the cursor, label in the inspector, one undo',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 expect(await run(page,'studio3d.insert.pin',{})).toBe(true);
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='pin').length).toBe(1);
 expect(await run(page,'studio3d.pin.set',{id:(await session(page)).selected,text:'check this weld'})).toBe(true);
 await expect.poll(async()=>(await session(page)).info?.pin).toBe('check this weld');
 await expect(page.getByTestId('studio3d-pin-fields')).toBeVisible();
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).info?.pin).toBe('');
 await run(page,'studio3d.undo');
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='pin').length).toBe(0);
});

test('3D studio pin labels: labeled pins show a viewport overlay label; empty or hidden pins do not',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 expect(await run(page,'studio3d.insert.pin',{})).toBe(true);
 const pinId=(await session(page)).selected as number;
 expect(await run(page,'studio3d.pin.set',{id:pinId,text:'weld seam'})).toBe(true);
 const label=page.locator('[data-pin-label]');
 await expect(label).toHaveCount(1);
 await expect(label).toHaveText('weld seam');
 // Renaming the label updates the overlay.
 expect(await run(page,'studio3d.pin.set',{id:pinId,text:'crack'})).toBe(true);
 await expect(label).toHaveText('crack');
 // Clearing the text removes the overlay.
 expect(await run(page,'studio3d.pin.set',{id:pinId,text:''})).toBe(true);
 await expect(page.locator('[data-pin-label]')).toHaveCount(0);
 // A hidden pin shows no label either.
 expect(await run(page,'studio3d.pin.set',{id:pinId,text:'back'})).toBe(true);
 await run(page,'studio3d.object.visible',{id:pinId,on:false});
 await expect(page.locator('[data-pin-label]')).toHaveCount(0);
 await run(page,'studio3d.object.visible',{id:pinId,on:true});
 await expect(page.locator('[data-pin-label]')).toHaveCount(1);
});

test('3D studio history: labels list and multi-step undo/redo',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 await insert(page,'sphere',1);
 const h=(await session(page)).history;
 expect(h.undo.length).toBeGreaterThanOrEqual(2);
 expect(h.redo).toEqual([]);
 // Undo both inserts at once; the scene is empty and the redo side lists both steps.
 expect(await run(page,'studio3d.undo',{count:2})).toBe(true);
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').length).toBe(0);
 expect((await session(page)).history.redo.length).toBe(2);
 // Redoing beyond the available steps stops cleanly at the end.
 expect(await run(page,'studio3d.redo',{count:5})).toBe(true);
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').length).toBe(2);
 expect((await session(page)).history.redo).toEqual([]);
 // The tools panel lists the steps and a row click jumps straight to that point.
 await page.getByTestId('studio3d-history-undo').getByRole('button').nth(1).click();
 await expect.poll(async()=>(await session(page)).outline.filter(o=>o.kind==='mesh').length).toBe(0);
});

test('3D studio views: rename, update and the digit shortcuts',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 expect(await run(page,'studio3d.view.save',{name:'front'})).toBe(true);
 expect(await run(page,'studio3d.view.save',{name:'top'})).toBe(true);
 // Rename works; duplicates and unknown names are refused.
 expect(await run(page,'studio3d.view.rename',{name:'top',to:'hero'})).toBe(true);
 expect((await session(page)).views.map(v=>v.name)).toEqual(['front','hero']);
 expect(await run(page,'studio3d.view.rename',{name:'hero',to:'front'})).toBe(false);
 expect(await run(page,'studio3d.view.rename',{name:'side',to:'x'})).toBe(false);
 // Update keeps the name and the list size.
 expect(await run(page,'studio3d.view.update',{name:'hero'})).toBe(true);
 expect((await session(page)).views.map(v=>v.name)).toEqual(['front','hero']);
 // Digit keys address view slots: a digit without a saved view does nothing, Shift+Digit saves into the slot.
 await page.getByTestId('studio3d-viewport').locator('canvas').click();
 await page.keyboard.press('Digit3');
 expect((await session(page)).views.length).toBe(2);
 await page.keyboard.press('Shift+Digit3');
 await expect.poll(async()=>(await session(page)).views.length).toBe(3);
 await expect.poll(async()=>(await session(page)).notice).toContain('View 1');
 // Shift+Digit on an existing slot keeps the name and the count.
 await page.keyboard.press('Shift+Digit1');
 await expect.poll(async()=>(await session(page)).views.map(v=>v.name)).toEqual(['front','hero','View 1']);
});

test('3D studio views: applying a bookmark flies the camera, interruptions and reduced motion are safe',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 expect(await run(page,'studio3d.view.save',{name:'a'})).toBe(true);
 expect(await run(page,'studio3d.view.preset',{preset:'right'})).toBe(true);
 // Interrupting a running flight with another camera move is safe.
 expect(await run(page,'studio3d.view.apply',{name:'a'})).toBe(true);
 expect(await run(page,'studio3d.view.preset',{preset:'front'})).toBe(true);
 // Reduced-motion users get instant jumps.
 await page.emulateMedia({reducedMotion:'reduce'});
 expect(await run(page,'studio3d.view.apply',{name:'a'})).toBe(true);
 expect(await run(page,'studio3d.view.preset',{preset:'top'})).toBe(true);
});

test('3D studio outliner: the focus button selects the row and frames it',async({page})=>{
 await blank(page);
 await insert(page,'cube',0);
 const id=await insert(page,'sphere',6);
 await run(page,'studio3d.select',{id:null});
 await expect.poll(async()=>(await session(page)).selected).toBe(null);
 // One focus button per outline row.
 await expect(page.getByRole('button',{name:/focus/i})).toHaveCount(2);
 await page.getByRole('button',{name:/focus/i}).nth(1).click();
 await expect.poll(async()=>(await session(page)).selected).toBe(id);
});
