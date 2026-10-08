import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
test.use({viewport:{width:1440,height:1000}});
async function setup(page:Page){
 await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'}}}));await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{const canvas=document.createElement('canvas');canvas.width=160;canvas.height=100;const ctx=canvas.getContext('2d')!;ctx.fillStyle='#ed3030';ctx.fillRect(0,0,80,100);ctx.fillStyle='#3060ee';ctx.fillRect(80,0,80,100);const blob=await new Promise<Blob>(r=>canvas.toBlob(b=>r(b!),'image/png'));const {addMediaFile}=await import('/src/lib/media.ts');await addMediaFile(blob,'fixture.png');});await expect(page.getByRole('region',{name:'Image editing viewport'})).toBeVisible();
 await page.getByRole('button',{name:'Open Somnia Agent',exact:true}).click();const panel=page.getByRole('complementary',{name:'Somnia Agent'});await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();const s=page.getByRole('dialog');await s.getByLabel('Model',{exact:true}).fill('fixture-local');await s.getByRole('button',{name:'Save AI settings',exact:true}).click();await s.getByText('Configuration saved.',{exact:true}).waitFor();await s.getByRole('button',{name:'Close settings',exact:true}).click();await panel.getByRole('checkbox',{name:/Allow inspecting/}).check();return panel;
}
async function propose(page:Page,panel:ReturnType<Page['getByRole']>,name='raster_filter',args:object={filter:'grayscale',strength:1}){
 let round=0;let payload:any;await page.route('http://127.0.0.1:11434/api/chat',async r=>{payload=r.request().postDataJSON();await r.fulfill({contentType:'application/x-ndjson',body:JSON.stringify({message:round++===0?{content:'Staging a non-destructive Photo operation.',tool_calls:[{function:{name,arguments:args}}]}:{content:'Please review the local preview. No pixels uploaded.'},done:true})+'\n'});});await panel.getByLabel('Message to Somnia Agent').fill('Edit this image');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.getByRole('region',{name:'Review native AI proposal'})).toBeVisible();return ()=>payload;
}
async function state(page:Page){return page.evaluate(async()=>{const {getPhoto}=await import('/src/lib/agent/photoWorkspace.ts');const e=getPhoto('fixture.png')!;return {text:e.text,dirty:e.dirty,original:e.sourceURL};});}
test('Photo metadata only, real grayscale preview -> accept -> origin undo, original preserved',async({page})=>{
 const panel=await setup(page);const request=await propose(page,panel);await expect(panel.getByAltText('After Photo edit')).toBeVisible();
 const payload=JSON.stringify(request().messages);expect(payload).not.toContain('data:image');expect(payload).not.toContain('blob:');expect(payload).toContain('pixelsDisclosed');expect(request().tools.map((t:any)=>t.function.name)).toEqual(['raster_inspect','raster_adjust','raster_filter','raster_crop']);
 const before=await state(page);expect(before.dirty).toBe(false);await page.screenshot({path:'tests/artifacts/ai-photo-preview.png'});
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(page.getByRole('region',{name:'Image editing viewport'})).toBeVisible();const after=await state(page);expect(after.dirty).toBe(true);expect(after.original).toBe(before.original);expect(JSON.parse(after.text).operations[0].type).toBe('grayscale');
 await expect.poll(()=>page.getByRole('region',{name:'Image editing viewport'}).locator('canvas').evaluate((c:HTMLCanvasElement)=>{const p=c.getContext('2d')!.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data;return p[0]===p[1]&&p[1]===p[2]&&p[3]===255;})).toBe(true);
 await page.screenshot({path:'tests/artifacts/ai-photo-accepted.png'});await panel.getByRole('button',{name:'Undo AI transaction',exact:true}).click();await expect.poll(async()=>JSON.parse((await state(page)).text).operations.length).toBe(0);const undone=await state(page);expect(undone.text).toBe(before.text);expect(undone.dirty).toBe(false);
});
test('crop preview has exact dimensions, reject leaves stack unchanged',async({page})=>{
 const panel=await setup(page);await propose(page,panel,'raster_crop',{x:0,y:0,width:80,height:100});await expect(panel.getByText('80 x 100 px',{exact:true})).toBeVisible();const before=await state(page);await panel.getByRole('button',{name:'Reject proposal',exact:true}).click();expect((await state(page)).text).toBe(before.text);
});
test('replaced source makes preview stale and cannot be overwritten',async({page})=>{
 const panel=await setup(page);await propose(page,panel);page.once('dialog',d=>d.accept());await page.evaluate(async()=>{const {findMedia,addMediaFile}=await import('/src/lib/media.ts');const item=findMedia('fixture.png')!;const b=await(await fetch(item.url)).blob();await addMediaFile(b,'fixture.png');});
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Document changed');
});

test('explicit PNG copy export works; cancelling dirty close preserves edits',async({page})=>{
 const panel=await setup(page);await propose(page,panel);await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(page.getByRole('region',{name:'Image editing viewport'})).toBeVisible();
 page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Close fixture.png',exact:true}).click();expect((await state(page)).dirty).toBe(true);
 page.once('dialog',d=>d.dismiss());const closed=await page.evaluate(async()=>{const {closeCore}=await import('/src/store/appStore.ts');return closeCore();});expect(closed).toBe(false);expect((await state(page)).dirty).toBe(true);
 const downloaded=page.waitForEvent('download');await page.getByRole('button',{name:'Save Photo copy as PNG',exact:true}).click();const download=await downloaded;expect(download.suggestedFilename()).toBe('fixture-edited.png');await expect.poll(async()=>(await state(page)).dirty).toBe(false);
});

test('Photo guest acceptance denied, later Photo transaction cannot be rolled back by an older card',async({page})=>{
 const panel=await setup(page);await propose(page,panel);await page.evaluate(async()=>{const {getCollabEngine}=await import('/src/lib/collab/store.ts');const e=getCollabEngine();const original=e.snapshot.bind(e);(window as any).restorePhotoRole=()=>{e.snapshot=original;};e.snapshot=()=>({...original(),role:'guest'});});
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Only the collaboration host');expect((await state(page)).dirty).toBe(false);
 await page.evaluate(()=>(window as any).restorePhotoRole());await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(page.getByText('Applied to Photo memory',{exact:false})).toBeVisible();
 await propose(page,panel,'raster_adjust',{brightness:0.2});await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect.poll(async()=>JSON.parse((await state(page)).text).operations.length).toBe(2);
 const text=(await state(page)).text;await panel.getByRole('button',{name:'Undo AI transaction',exact:true}).first().click();await expect(panel.getByRole('alert').last()).toContainText('Later Photo edits');expect((await state(page)).text).toBe(text);
});

test('real manual sliders are preserved in AI stack and restored by editor undo',async({page})=>{
 const panel=await setup(page);const brightness=page.getByRole('slider',{name:'Brightness',exact:true});await brightness.fill('0.25');await brightness.dispatchEvent('pointerup');
 const request=await propose(page,panel,'raster_crop',{x:0,y:0,width:80,height:100});const before=await state(page);expect(JSON.parse(before.text).operations[0].type).toBe('adjust');
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect.poll(async()=>JSON.parse((await state(page)).text).operations.map((o:any)=>o.type)).toEqual(['adjust','crop']);
 await expect(page.getByTestId('image-editor-stage')).toBeVisible();await expect(page.getByText('80 x 100 px',{exact:true})).toBeVisible();
 expect(JSON.stringify(request().messages)).not.toContain('data:image');
 await page.getByRole('button',{name:'Undo',exact:true}).click();expect((await state(page)).text).toBe(before.text);
 await page.getByRole('button',{name:'Redo',exact:true}).click();expect(JSON.parse((await state(page)).text).operations.map((o:any)=>o.type)).toEqual(['adjust','crop']);
});

test('manual edit during review blocks accept and later manual edit blocks AI undo',async({page})=>{
 const panel=await setup(page);await propose(page,panel);await page.getByTestId('imgedit-flip-h').click();
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Document changed');
 await panel.getByRole('button',{name:'Reject proposal',exact:true}).click();await panel.getByRole('button',{name:'New chat',exact:true}).click();await propose(page,panel);
 await panel.getByRole('button',{name:'Accept preview',exact:true}).click();await page.getByTestId('imgedit-flip-h').click();const text=(await state(page)).text;
 await panel.getByRole('button',{name:'Undo AI transaction',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Later Photo edits');expect((await state(page)).text).toBe(text);
});

test('A2 retained layer mode refuses AI without flattening or disclosing pixels',async({page})=>{
 const panel=await setup(page);await page.getByRole('tab',{name:'Layers',exact:true}).click();await page.getByRole('button',{name:'Start layered document',exact:true}).click();
 await expect(page.getByText('PhotoCraft layers · composite export',{exact:true})).toBeVisible();let requests=0;await page.route('http://127.0.0.1:11434/api/chat',r=>{requests++;return r.abort();});
 await panel.getByLabel('Message to Somnia Agent').fill('Adjust the image');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('retained layers or masks');expect(requests).toBe(0);
});

test('active RasterEditor selection is an explicit scope limit',async({page})=>{
 const panel=await setup(page);await page.getByRole('button',{name:'Select',exact:true}).click();
 const canvas=page.getByRole('region',{name:'Image editing viewport'}).locator('canvas');const box=(await canvas.boundingBox())!;
 await page.mouse.move(box.x+box.width/2-20,box.y+box.height/2-20);await page.mouse.down();await page.mouse.move(box.x+box.width/2+20,box.y+box.height/2+20);await page.mouse.up();
 await expect(page.getByRole('button',{name:'Deselect',exact:true})).toBeEnabled();let requests=0;await page.route('http://127.0.0.1:11434/api/chat',r=>{requests++;return r.abort();});
 await panel.getByLabel('Message to Somnia Agent').fill('Adjust selection');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.getByRole('alert')).toContainText('Clear the active pixel selection');expect(requests).toBe(0);
});
