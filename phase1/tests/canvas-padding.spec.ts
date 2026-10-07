import {test,expect} from './fixtures';
import type {Page,FrameLocator} from '@playwright/test';
const card='<!doctype html><html><head><title>t</title><style>body{margin:0;font:14px sans-serif} .outer{padding:40px} .card{min-height:120px;padding:10px 20px 30px 40px;border:1px solid #333;background:#eef;margin:20px 0} #tiny{width:48px;height:48px;padding:4px;background:#fdd;margin:12px 0} #mini{width:16px;height:16px;background:#dfd;margin:12px 0} #hard{min-height:120px;padding:5px 5px 5px 5px;padding-left:5px!important;background:#ffd;margin:12px 0} #rel{min-height:120px;padding:1rem;background:#dff;margin:12px 0}</style></head><body><section class="outer"><div class="card">Card</div><div id="tiny"></div><div id="mini"></div><div id="hard">Hard</div><div id="rel">Rel</div></section></body></html>';
const FRAME='iframe[title="Sandboxed design preview"]';
async function setup(p:Page){await p.goto('/');await p.evaluate(s=>(window as any).__somnia.setSource('index.html',s),card);const f=p.frameLocator(FRAME);await expect(f.locator('.card')).toHaveCount(1);return f;}
const pads=(f:FrameLocator,sel:string)=>f.locator(sel).evaluate(el=>{const c=getComputedStyle(el);return [c.paddingTop,c.paddingRight,c.paddingBottom,c.paddingLeft].map(parseFloat);});
async function scaleOf(p:Page){const b=await p.locator(FRAME).boundingBox();const w=await p.locator(FRAME).evaluate(e=>(e as HTMLElement).offsetWidth);return b!.width/w;}
async function select(f:FrameLocator,sel:string){await f.locator(sel).click({position:{x:2,y:2}});}
const slider=(p:Page,side:string)=>p.getByRole('slider',{name:`Padding ${side}`,exact:true});
async function centre(p:Page,side:string){const b=(await slider(p,side).boundingBox())!;return {x:b.x+b.width/2,y:b.y+b.height/2};}
async function drag(p:Page,side:string,dx:number,dy:number,{release=true}={}){const c=await centre(p,side);await p.mouse.move(c.x,c.y);await p.mouse.down();await p.mouse.move(c.x+dx/2,c.y+dy/2,{steps:3});await p.mouse.move(c.x+dx,c.y+dy,{steps:3});if(release)await p.mouse.up();}
test('four sliders, left drag writes only padding-left, asymmetric values survive, one undo step',async({page})=>{
 const f=await setup(page);await select(f,'.card');
 for(const s of ['top','right','bottom','left'])await expect(slider(page,s)).toBeVisible();
 await expect(page.getByTestId('canvas-selection')).toHaveAttribute('data-handle-mode','inner');
 const k=await scaleOf(page);expect(await pads(f,'.card')).toEqual([10,20,30,40]);
 await drag(page,'left',24*k,0);
 await expect.poll(async()=>(await pads(f,'.card'))[3]).toBeGreaterThanOrEqual(63);
 const after=await pads(f,'.card');expect(after.slice(0,3)).toEqual([10,20,30]);expect(Math.abs(after[3]-64)).toBeLessThanOrEqual(2);
 await page.getByRole('button',{name:'Undo',exact:true}).click();
 await expect.poll(()=>pads(f,'.card')).toEqual([10,20,30,40]);
});
test('live preview is transient: badge shows the value, Escape snaps back and writes nothing',async({page})=>{
 const f=await setup(page);await select(f,'.card');const k=await scaleOf(page);
 await drag(page,'top',0,30*k,{release:false});
 await expect(page.getByTestId('padding-badge')).toContainText('Padding top');
 await expect(page.getByTestId('padding-strip-top')).toBeVisible();
 expect((await pads(f,'.card'))[0]).toBeGreaterThan(30);
 await page.screenshot({path:'test-results/canvas-padding-drag-top.png'});
 await page.keyboard.press('Escape');await page.mouse.up();
 await expect.poll(()=>pads(f,'.card')).toEqual([10,20,30,40]);
 await expect(page.getByTestId('padding-badge')).toHaveCount(0);
});
test('Alt drags the opposite side by the same delta, Alt+Shift all four, Shift snaps to 10 px',async({page})=>{
 const f=await setup(page);await select(f,'.card');const k=await scaleOf(page);
 await page.keyboard.down('Alt');await drag(page,'left',20*k,0,{release:false});
 await expect(page.getByTestId('padding-badge')).toContainText('Left + right');
 await page.screenshot({path:'test-results/canvas-padding-alt.png'});
 await page.mouse.up();await page.keyboard.up('Alt');
 await expect.poll(async()=>(await pads(f,'.card'))[1]).toBeGreaterThan(36);
 const a=await pads(f,'.card');expect(a[0]).toBe(10);expect(a[2]).toBe(30);expect(a[3]-40).toBeCloseTo(a[1]-20,0);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>pads(f,'.card')).toEqual([10,20,30,40]);
 await page.keyboard.down('Alt');await page.keyboard.down('Shift');await drag(page,'top',0,10*k,{release:false});
 await expect(page.getByTestId('padding-badge')).toContainText('All sides');await page.mouse.up();await page.keyboard.up('Shift');await page.keyboard.up('Alt');
 await expect.poll(async()=>(await pads(f,'.card'))[0]).toBeGreaterThan(15);
 const b=await pads(f,'.card');expect(b[0]-10).toBeCloseTo(b[1]-20,0);expect(b[2]-30).toBeCloseTo(b[3]-40,0);expect(b[0]).not.toBe(b[2]);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>pads(f,'.card')).toEqual([10,20,30,40]);
 await page.keyboard.down('Shift');await drag(page,'bottom',0,-(23*k),{release:false});await page.mouse.up();await page.keyboard.up('Shift');
 await expect.poll(async()=>(await pads(f,'.card'))[2]).not.toBe(30);expect(((await pads(f,'.card'))[2]-30)%10).toBe(0);
});
test('click on a handle opens the numeric popover: arrows, Shift+arrows, Tab, Enter commits, Esc discards',async({page})=>{
 const f=await setup(page);await select(f,'.card');
 const c=await centre(page,'left');await page.mouse.click(c.x,c.y);
 const dlg=page.getByRole('dialog',{name:'Padding'});await expect(dlg).toBeVisible();
 const input=dlg.getByRole('textbox');await expect(input).toBeFocused();await expect(input).toHaveValue('40');
 await page.screenshot({path:'test-results/canvas-padding-numeric.png'});
 await page.keyboard.press('ArrowUp');await page.keyboard.press('Shift+ArrowUp');await expect(input).toHaveValue('51');
 await expect.poll(async()=>(await pads(f,'.card'))[3]).toBe(51);
 await page.keyboard.press('Escape');await expect(dlg).toHaveCount(0);await expect.poll(()=>pads(f,'.card')).toEqual([10,20,30,40]);
 await page.mouse.click(c.x,c.y);await expect(input).toHaveValue('40');await input.fill('55');await page.keyboard.press('Tab');await expect(dlg.getByRole('textbox')).toHaveAttribute('aria-label','Padding top px');
 await page.keyboard.press('Shift+Tab');await page.keyboard.press('Enter');
 await expect.poll(async()=>(await pads(f,'.card'))[3]).toBe(55);
 await page.getByRole('button',{name:'Undo',exact:true}).click();await expect.poll(()=>pads(f,'.card')).toEqual([10,20,30,40]);
});
test('keyboard: sliders respond to arrows and are tabbable',async({page})=>{
 const f=await setup(page);await select(f,'.card');await slider(page,'left').focus();
 await expect(slider(page,'left')).toHaveAttribute('aria-valuenow','40');await page.keyboard.press('ArrowRight');
 await expect.poll(async()=>(await pads(f,'.card'))[3]).toBe(41);
});
test('inherited lock: lock icon, no handles, not-allowed label',async({page})=>{
 const f=await setup(page);await page.getByRole('button',{name:'Lock section',exact:true}).click();await select(f,'.card');
 await expect(page.getByTestId('canvas-selection')).toHaveAttribute('data-locked','true');
 await expect(page.getByRole('slider')).toHaveCount(0);await expect(page.getByRole('img',{name:/Locked by parent/})).toBeVisible();
 await page.screenshot({path:'test-results/canvas-padding-locked.png'});
});
test('small elements: 48x48 uses outside handles with leaders; 16x16 uses the compact popover',async({page})=>{
 const f=await setup(page);await select(f,'#tiny');
 await expect(page.getByTestId('canvas-selection')).toHaveAttribute('data-handle-mode','outside');await expect(page.getByRole('slider')).toHaveCount(4);
 await page.screenshot({path:'test-results/canvas-padding-48.png'});
 await select(f,'#mini');await expect(page.getByTestId('canvas-selection')).toHaveAttribute('data-handle-mode','popover');await expect(page.getByRole('slider')).toHaveCount(0);
 await page.getByRole('button',{name:'Edit padding'}).click();const dlg=page.getByRole('dialog',{name:'Padding'});await expect(dlg.getByRole('textbox')).toHaveCount(4);
 await page.screenshot({path:'test-results/canvas-padding-16.png'});
 await dlg.getByRole('textbox',{name:'Padding left px'}).fill('6');await dlg.getByRole('textbox',{name:'Padding right px'}).fill('6');await page.keyboard.press('Enter');
 await expect.poll(async()=>(await pads(f,'#mini')).join()).toBe('0,6,0,6');
});
test('hit areas are at least 24x24 screen px',async({page})=>{
 const f=await setup(page);await select(f,'.card');
 for(const s of ['top','right','bottom','left']){const b=(await slider(page,s).boundingBox())!;expect(b.width).toBeGreaterThanOrEqual(24);expect(b.height).toBeGreaterThanOrEqual(24);}
});
test('a longhand that the cascade overrides is detected and reverted instead of reporting success',async({page})=>{
 const f=await setup(page);await select(f,'#hard');const k=await scaleOf(page);
 await drag(page,'left',12*k,0);
 await expect(page.getByText(/was not applied because another CSS rule overrides it/)).toBeVisible();
 await expect.poll(async()=>(await pads(f,'#hard'))[3]).toBe(5);
});
test('non-px padding (rem) cannot be dragged and shows a read-only hint',async({page})=>{
 const f=await setup(page);await select(f,'#rel');const k=await scaleOf(page);
 await expect(slider(page,'left')).toHaveAttribute('aria-disabled','true');
 await drag(page,'left',20*k,0);
 expect(await pads(f,'#rel')).toEqual([16,16,16,16]);
 await expect(page.getByRole('dialog',{name:'Padding'}).getByRole('textbox')).toBeDisabled();
});
test('inline shorthand conflict from the preflight surfaces as an error, nothing changes',async({page})=>{
 await page.goto('/');await page.evaluate(s=>(window as any).__somnia.setSource('index.html',s),'<!doctype html><html><head><title>t</title></head><body><div id="i" style="min-height:120px;padding:8px;background:#eee;margin:30px">x</div></body></html>');
 const f=page.frameLocator(FRAME);await f.locator('#i').click({position:{x:2,y:2}});const k=await scaleOf(page);
 await drag(page,'left',12*k,0);await expect(page.getByText(/inline style/i).first()).toBeVisible();expect(await pads(f,'#i')).toEqual([8,8,8,8]);
});
test('selection colour follows the theme accent; no stored legacy colour overrides it',async({page})=>{
 const f=await setup(page);await select(f,'.card');
 const v=await page.locator('.canvas-stage').evaluate(el=>getComputedStyle(el).getPropertyValue('--canvas-accent').trim());expect(v).toMatch(/^#[0-9a-f]{6}$/);expect(v).not.toBe('#818cf8');
 const shadow=await page.getByTestId('selection-outline').evaluate(el=>getComputedStyle(el).boxShadow);
 const hex=v.slice(1).match(/../g)!.map(h=>parseInt(h,16)).join(', ');expect(shadow).toContain(`rgb(${hex})`);
});
for(const mode of ['light','dark'] as const)test(`evidence screenshots ${mode}`,async({page})=>{
 await page.addInitScript(m=>{localStorage.setItem('somnia.canvasPrefs.v1',JSON.stringify({background:m==='light'?'#f8f9fb':'#1b1e26',prefsVersion:2}));if(m==='light')document.documentElement.dataset.theme='light';},mode);
 const f=await setup(page);await select(f,'.card');const k=await scaleOf(page);
 await page.screenshot({path:`test-results/evidence-${mode}-1-selected.png`});
 const c=await centre(page,'left');await page.mouse.move(c.x,c.y);await page.waitForTimeout(500);await page.screenshot({path:`test-results/evidence-${mode}-3-hover-tip.png`});
 await drag(page,'left',30*k,0,{release:false});await page.screenshot({path:`test-results/evidence-${mode}-4-drag-left.png`});await page.keyboard.press('Escape');await page.mouse.up();
 await select(f,'#tiny');await page.screenshot({path:`test-results/evidence-${mode}-7-48.png`});
});
