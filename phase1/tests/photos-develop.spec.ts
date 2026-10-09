import {test,expect} from './fixtures';
test.use({viewport:{width:1440,height:1000}});
test('real Photos Develop worker, preview, undo and explicit source-sized copy',async({page})=>{
 await page.goto('/',{waitUntil:'domcontentloaded'});
 await page.evaluate(async()=>{const c=document.createElement('canvas');c.width=240;c.height=160;const x=c.getContext('2d')!;const g=x.createLinearGradient(0,0,240,160);g.addColorStop(0,'#102055');g.addColorStop(.5,'#aa8040');g.addColorStop(1,'#e0d0aa');x.fillStyle=g;x.fillRect(0,0,240,160);const b=await new Promise<Blob>(r=>c.toBlob(b=>r(b!)));const {addMediaFile}=await import('/src/lib/media.ts');await addMediaFile(b,'develop.png');});
 await expect(page.getByRole('region',{name:'Image editing viewport'})).toBeVisible();
 await page.getByRole('tab',{name:'Develop (experimental)',exact:true}).click();
 const panel=page.getByRole('region',{name:'LightCraft Develop'});await panel.getByRole('button',{name:'Enable experimental Develop'}).click();
 const after=panel.locator('canvas[aria-label="After development"]');
 await expect.poll(()=>after.evaluate((c:HTMLCanvasElement)=>c.width)).toBe(240);
 const pixels=()=>after.evaluate((c:HTMLCanvasElement)=>Array.from(c.getContext('2d')!.getImageData(100,80,1,1).data));const baseline=await pixels();
 await panel.getByLabel('Develop exposure').fill('1');await expect.poll(pixels).not.toEqual(baseline);
 await page.screenshot({path:'tests/artifacts/photos-develop.png'});
 await panel.getByRole('button',{name:'Undo Develop',exact:true}).click();await expect.poll(pixels).toEqual(baseline);
 await panel.getByRole('button',{name:'Redo Develop',exact:true}).click();await expect.poll(pixels).not.toEqual(baseline);
 const download=page.waitForEvent('download');await panel.getByRole('button',{name:'Export Develop PNG copy'}).click();expect((await download).suggestedFilename()).toBe('develop-edited.png');
 await panel.getByLabel('Develop exposure').fill('2');await expect.poll(pixels).not.toEqual(baseline);
 // Guards survive inspector unmount, and refusing discard leaves source/intent intact.
 await page.getByRole('tab',{name:'Adjust',exact:true}).click();page.once('dialog',d=>d.dismiss());await page.getByRole('button',{name:'Close develop.png',exact:true}).click();await expect(page.getByRole('button',{name:'Close develop.png',exact:true})).toBeVisible();
 await page.getByRole('tab',{name:'Develop (experimental)',exact:true}).click();await panel.getByRole('button',{name:'Enable experimental Develop'}).click();await expect(panel.getByLabel('Develop exposure')).toHaveValue('2');
});
test('worker load rejects malformed replacement without destroying valid source',async({page})=>{
 await page.goto('/');const result=await page.evaluate(async()=>{const {PhotosEngine}=await import('/src/lib/photos/engine.ts');const {neutralDevelop}=await import('/src/lib/photos/registry.ts');const e=new PhotosEngine();try{const c=document.createElement('canvas');c.width=64;c.height=48;c.getContext('2d')!.fillRect(0,0,64,48);const b=await new Promise<Blob>(r=>c.toBlob(b=>r(b!)));const load=await e.load(await b.arrayBuffer());let rejected=false;try{await e.load(new Uint8Array([1,2,3]).buffer);}catch{rejected=true;}const render=await e.render(neutralDevelop);const exp=await e.export({...neutralDevelop,exposure:1},'jpeg');return {rejected,width:load.width,renderWidth:render.width,signature:Array.from(new Uint8Array(exp.bytes!).slice(0,2))};}finally{e.dispose();}});expect(result).toEqual({rejected:true,width:64,renderWidth:64,signature:[255,216]});
});
