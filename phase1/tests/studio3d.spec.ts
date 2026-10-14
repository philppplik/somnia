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
const session=(page:P)=>page.evaluate(async()=>{const m=await import('/src/lib/studio3d/session.ts');const s=m.getStudio3DState();return {anim:s.anim,clips:s.clips,clipKeys:s.clipKeys,outline:s.outline,marked:s.marked,selected:s.selected,info:s.selectedInfo,dirty:s.dirty,notice:s.notice,status:s.status,name:s.name,bones:s.bones,weightPreview:s.weightPreview,stats:s.stats,exportClips:s.exportClips,poses:s.poses,ik:s.ik,boneLimits:s.boneLimits};});
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
