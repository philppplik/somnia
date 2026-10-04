import {test,expect} from './fixtures';
const doc='<!doctype html><html><head><title>t</title></head><body><section><p>one</p></section><div>two</div><h2>three</h2></body></html>';
async function setup(page:any){await page.goto('/');await page.evaluate((d:string)=>(window as any).__somnia.setSource('index.html',d),doc);const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h2')).toHaveCount(1);return frame;}
const order=(frame:any)=>frame.locator('body').evaluate((b:HTMLElement)=>Array.from(b.children).map(c=>c.tagName.toLowerCase()).join(','));
test('dragging a layer above another reorders the source and undo restores it',async({page})=>{const frame=await setup(page);
 const h2=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'h2',exact:true})});const section=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'section',exact:true})});
 await h2.dragTo(section,{targetPosition:{x:60,y:2}});await expect.poll(()=>order(frame)).toBe('h2,section,div');
 await page.keyboard.press('Control+z');await expect.poll(()=>order(frame)).toBe('section,div,h2');});
test('dropping on the middle of a container moves the layer inside it',async({page})=>{const frame=await setup(page);
 const h2=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'h2',exact:true})});const section=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'section',exact:true})});
 await h2.dragTo(section);await expect.poll(()=>order(frame)).toBe('section,div');await expect(frame.locator('section h2')).toHaveCount(1);});
test('keyboard alternative: indent and outdent buttons move layers between parents',async({page})=>{const frame=await setup(page);
 const div=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'div',exact:true})});await div.hover();await div.getByRole('button',{name:'Indent div into previous sibling'}).click();
 await expect(frame.locator('section div')).toHaveCount(1);
 const d2=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'div',exact:true})});await d2.hover();await d2.getByRole('button',{name:'Outdent div out of parent'}).click();await expect.poll(()=>order(frame)).toBe('section,div,h2');});
test('a layer cannot be dropped into its own descendant',async({page})=>{await setup(page);
 const section=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'section',exact:true})});const p=page.locator('[data-layer-id]',{has:page.getByRole('button',{name:'p',exact:true})});
 await section.dragTo(p);await expect(page.getByRole('status')).toContainText(/itself or its descendants/);});
