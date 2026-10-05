import {test,expect} from './fixtures';
const doc='<!doctype html><html><head><title>t</title></head><body><section><p>one</p></section><div>two</div><h2>three</h2></body></html>';
async function setup(page:any){await page.goto('/');await page.evaluate((d:string)=>(window as any).__somnia.setSource('index.html',d),doc);const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h2')).toHaveCount(1);return frame;}
async function drag(page:any,source:any,target:any,y?:number){const a=await source.locator('[data-layer-drag-label]').boundingBox();const b=await target.boundingBox();await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();await page.mouse.move(b.x+60,b.y+(y??b.height/2),{steps:12});await page.mouse.up();}
const order=(frame:any)=>frame.locator('body').evaluate((b:HTMLElement)=>Array.from(b.children).map(c=>c.tagName.toLowerCase()).join(','));
test('dragging a layer above another reorders the source and undo restores it',async({page})=>{const frame=await setup(page);
 const h2=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'h2',exact:true})});const section=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'section',exact:true})});
 await drag(page,h2,section,2);await expect.poll(()=>order(frame)).toBe('h2,section,div');
 await page.keyboard.press('Control+z');await expect.poll(()=>order(frame)).toBe('section,div,h2');});
test('dropping on the middle of a container moves the layer inside it',async({page})=>{const frame=await setup(page);
 const h2=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'h2',exact:true})});const section=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'section',exact:true})});
 await drag(page,h2,section);await expect.poll(()=>order(frame)).toBe('section,div');await expect(frame.locator('section h2')).toHaveCount(1);});
test('keyboard alternative: indent and outdent buttons move layers between parents',async({page})=>{const frame=await setup(page);
 const div=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'div',exact:true})});await div.hover();await div.getByRole('button',{name:'Indent div into previous sibling'}).click();
 await expect(frame.locator('section div')).toHaveCount(1);
 const d2=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'div',exact:true})});await d2.hover();await d2.getByRole('button',{name:'Outdent div out of parent'}).click();await expect.poll(()=>order(frame)).toBe('section,div,h2');});
test('a layer cannot be dropped into its own descendant',async({page})=>{await setup(page);
 const section=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'section',exact:true})});const p=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'p',exact:true})});
 await drag(page,section,p);await expect(page.getByRole('status')).toContainText(/itself or its descendants/);});
test('pointer drag Escape cancels and small movement stays a selection',async({page})=>{
 const frame=await setup(page);const row=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'h2',exact:true})});const label=row.locator('[data-layer-drag-label]');const box=(await label.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+12);await page.mouse.down();await page.mouse.move(box.x+box.width/2+2,box.y+13);await page.mouse.up();await expect(label).toHaveAttribute('aria-pressed','true');await expect.poll(()=>order(frame)).toBe('section,div,h2');
 const section=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'section',exact:true})});const target=(await section.boundingBox())!;
 await page.mouse.move(box.x+box.width/2,box.y+12);await page.mouse.down();await page.mouse.move(target.x+80,target.y+18,{steps:10});await page.screenshot({path:'tests/artifacts/layers-pointer-drop.png'});await page.keyboard.press('Escape');await page.mouse.up();await expect.poll(()=>order(frame)).toBe('section,div,h2');
});
