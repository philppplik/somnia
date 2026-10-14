import {readFileSync} from 'node:fs';
import {test,expect} from './fixtures';
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
const session=(page:P)=>page.evaluate(async()=>{const m=await import('/src/lib/studio3d/session.ts');const s=m.getStudio3DState();return {outline:s.outline,marked:s.marked,selected:s.selected,info:s.selectedInfo,dirty:s.dirty,notice:s.notice,status:s.status,name:s.name};});
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
