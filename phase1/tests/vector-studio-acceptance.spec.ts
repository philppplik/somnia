import {test,expect} from './fixtures';
import {readFileSync} from 'node:fs';
import path from 'node:path';
test.use({sample:false});
const asset=(name:string)=>path.join(import.meta.dirname,'assets/vector-studio',name);
async function studio(page:any){
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Vector'}).click();
 await expect(page.getByTestId('vector-start')).toBeVisible();
}
async function open(page:any,name:string){
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('vector-open').click();
 await (await chooser).setFiles(asset(name));
}
const session=(page:any)=>page.evaluate(async()=>{const s=await import('/src/lib/vectorstudio/session.ts');return s.getVectorSession();});

test('Vector real empty start creates a blank document without a file chooser',async({page})=>{
 await studio(page);let choosers=0;page.on('filechooser',()=>choosers++);
 await page.getByTestId('vector-create-blank').click();await expect(page.getByTestId('vector-canvas')).toBeVisible();
 const state=await session(page);expect(state.doc.paths).toEqual([]);expect(state.open).toBe(true);expect(state.canUndo).toBe(false);
 expect(choosers).toBe(0);await page.screenshot({path:'test-results/vector-acceptance-blank.png'});
});

test('Vector failed strict panel import preserves artwork and its undo history',async({page})=>{
 await studio(page);await open(page,'primitives.svg');await expect(page.getByTestId('vector-layer')).toHaveCount(6);
 const before=await session(page);
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('vector-import-svg').click();await (await chooser).setFiles(asset('reject-event.svg'));
 await expect(page.getByTestId('vector-io-status')).toContainText('event attribute');
 const after=await session(page);expect(after.doc).toEqual(before.doc);expect(after.canUndo).toBe(before.canUndo);
 await page.screenshot({path:'test-results/vector-acceptance-rejected.png'});
});

test('Vector pointer cancellation and Escape discard drawing previews without undo steps',async({page})=>{
 await studio(page);await page.getByTestId('vector-create-blank').click();await page.getByTestId('vector-toolbar-rect').click();
 const box=(await page.getByTestId('vector-canvas').boundingBox())!;
 await page.mouse.move(box.x+180,box.y+170);await page.mouse.down();await page.mouse.move(box.x+320,box.y+270,{steps:4});
 await page.getByTestId('vector-canvas').locator('svg').first().dispatchEvent('pointercancel');await page.mouse.up();
 expect((await session(page)).doc.paths).toHaveLength(0);expect((await session(page)).canUndo).toBe(false);
 await page.mouse.move(box.x+180,box.y+170);await page.mouse.down();await page.mouse.move(box.x+320,box.y+270,{steps:4});
 await page.keyboard.press('Escape');await page.mouse.up();
 expect((await session(page)).doc.paths).toHaveLength(0);expect((await session(page)).canUndo).toBe(false);
});

test('Vector PNG export keeps compound holes transparent and encodes real PNG pixels',async({page})=>{
 await studio(page);await open(page,'compound-hole.svg');await expect(page.getByTestId('vector-layer')).toHaveCount(2);
 const download=page.waitForEvent('download');await page.getByTestId('vector-export-png').click();const file=await download;
 expect(file.suggestedFilename()).toBe('compound-hole.png');const bytes=readFileSync((await file.path())!);
 expect([...bytes.subarray(0,8)]).toEqual([137,80,78,71,13,10,26,10]);
 const pixels=await page.evaluate(async raw=>{
  const blob=new Blob([new Uint8Array(raw)],{type:'image/png'});const img=await createImageBitmap(blob);
  const c=document.createElement('canvas');c.width=img.width;c.height=img.height;const ctx=c.getContext('2d')!;ctx.drawImage(img,0,0);
  const result={width:img.width,height:img.height,filled:[...ctx.getImageData(40,40,1,1).data],hole:[...ctx.getImageData(120,120,1,1).data]};img.close();return result;
 },[...bytes]);
 expect(pixels.width).toBe(400);expect(pixels.height).toBe(240);expect(pixels.filled).toEqual([124,58,237,255]);expect(pixels.hole[3]).toBe(0);
 await page.screenshot({path:'test-results/vector-acceptance-hole.png'});
});

test('Vector dirty replacement can be cancelled, status follows only the Vector session',async({page})=>{
 await studio(page);await page.getByTestId('vector-create-blank').click();
 await page.evaluate(async()=>{const s=await import('/src/lib/vectorstudio/session.ts');const shapes=await import('/src/lib/vectorstudio/shapes.ts');s.addPath(shapes.rectPath({x:10,y:10,w:50,h:50}));});
 await expect(page.getByTestId('vector-session-status')).toHaveAttribute('data-dirty','true');await expect(page.getByTestId('vector-session-status')).toContainText('Untitled.svg');
 const before=await session(page);page.once('dialog',dialog=>dialog.dismiss());
 expect(await page.evaluate(async()=>{const s=await import('/src/lib/vectorstudio/session.ts');return s.createBlankVector();})).toBe(false);
 expect(await session(page)).toEqual(before);page.once('dialog',dialog=>dialog.accept());
 expect(await page.evaluate(async()=>{const s=await import('/src/lib/vectorstudio/session.ts');return s.openSvgSource('<svg width="50" height="50"/>','new.svg');})).toBe(true);
 await expect(page.getByTestId('vector-session-status')).toHaveAttribute('data-dirty','false');await expect(page.getByTestId('vector-session-status')).toContainText('new.svg');
});

test('Vector canvas drag preserves the hole and Shift-click deselects the whole object',async({page})=>{
 await studio(page);await open(page,'compound-hole.svg');
 const viewport=await page.getByTestId('vector-canvas').locator('svg').first().boundingBox();expect(viewport).toBeTruthy();
 const transform=await session(page);
 const point=(x:number,y:number)=>({x:viewport!.x+transform.pan.x+x*transform.zoom,y:viewport!.y+transform.pan.y+y*transform.zoom});
 const before=await session(page),start=point(20,20),end=point(30,25);
 await page.mouse.move(start.x,start.y);await page.mouse.down();await page.mouse.move(end.x,end.y,{steps:6});await page.mouse.up();
 const moved=await session(page);expect(moved.selection).toHaveLength(2);
 for(let i=0;i<2;i++)for(let j=0;j<before.doc.paths[i].nodes.length;j++){
  expect(moved.doc.paths[i].nodes[j].x-before.doc.paths[i].nodes[j].x).toBeCloseTo(10,0);
  expect(moved.doc.paths[i].nodes[j].y-before.doc.paths[i].nodes[j].y).toBeCloseTo(5,0);
 }
 await page.keyboard.down('Shift');await page.mouse.click(end.x,end.y);await page.keyboard.up('Shift');expect((await session(page)).selection).toEqual([]);
 const hole=point(70,65);await page.mouse.click(hole.x,hole.y);expect((await session(page)).selection).toEqual([]);
 await page.screenshot({path:'test-results/vector-integrity-drag-hole.png'});
});
