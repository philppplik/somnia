import {test,expect,type Page} from './fixtures';
import {showCode} from './helpers';
const LONG='Bäckerei Sonnenschein – Relaunch der Unternehmenswebsite mit Online-Bestellung';
type Open='save'|'disk'|'memory'|'closeProject';
async function setup(page:Page,o:{locale?:string;theme?:'light'|'dark';contrast?:'high';name?:string}={}){
 if(o.locale)await page.addInitScript(l=>localStorage.setItem('somnia.locale.v1',l),o.locale);
 await page.goto('/');await showCode(page);
 await page.evaluate(({t,c,n})=>{const r=document.documentElement;if(t)r.dataset.theme=t;if(c)r.dataset.contrast=c;if(n)(window as any).__somnia.patch({projectName:n});},{t:o.theme,c:o.contrast,n:o.name});}
async function open(page:Page,k:Open){await page.evaluate(k=>{const s=(window as any).__somnia;if(k==='save')s.patch({saveDialog:{error:null,busy:false}});else if(k==='closeProject')s.patch({closeProjectPrompt:true});else s.requestClose(k);},k);}
const shot=(page:Page,n:string)=>page.locator('.dlg-popup').screenshot({path:`test-results/dialogs/${n}.png`});
test('save dialog: structure, focus, tab order, zip link, name clamp',async({page})=>{
 await setup(page,{name:LONG});await open(page,'save');
 const d=page.getByRole('dialog',{name:'Save project'});await expect(d).toBeVisible();
 await expect(d.locator('.dlg-card strong')).toHaveText(LONG);await expect(d.locator('.dlg-card strong')).toHaveAttribute('title',LONG);
 await expect(d.locator('.dlg-card')).toContainText(/files? · not saved anywhere yet/);
 await expect(d.getByText(/Saves to …\//)).toBeVisible();
 await expect(d.locator('[class*=confirm-dialog]')).toHaveCount(0);
 const box=await d.boundingBox();expect(box!.width).toBeCloseTo(520,0);
 const radius=await d.evaluate(e=>getComputedStyle(e).borderRadius);expect(radius).toBe('25px');
 await expect(d.getByRole('button',{name:'Choose folder and save'})).toBeFocused();
 await shot(page,'save-en-'+'default');
 // Tab order (DOM = visual): switch, ZIP link, Cancel, primary, then X last.
 const act=()=>page.evaluate(()=>{const a=document.activeElement as HTMLElement;return a.getAttribute('aria-label')||a.textContent||'';});
 const back:string[]=[];for(let i=0;i<3;i++){await page.keyboard.press('Shift+Tab');back.push(await act());}
 expect(back).toEqual(['Cancel','Download ZIP instead','Create new folder']);
 await d.getByRole('button',{name:'Choose folder and save'}).focus();await page.keyboard.press('Tab');expect(await act()).toBe('Close settings');
 await d.getByRole('button',{name:'Choose folder and save'}).focus();
 await page.keyboard.press('Escape');await expect(d).toBeHidden();});
test('save dialog: X cancels, busy blocks Esc and X',async({page})=>{
 await setup(page);await open(page,'save');const d=page.getByRole('dialog',{name:'Save project'});
 await d.getByRole('button',{name:'Close'}).click();await expect(d).toBeHidden();
 await open(page,'save');await page.evaluate(()=>(window as any).__somnia.patch({saveDialog:{error:null,busy:true}}));
 await expect(d.getByRole('button',{name:'Saving...'})).toBeDisabled();await expect(d.getByRole('button',{name:'Close'})).toBeDisabled();
 await page.keyboard.press('Escape');await expect(d).toBeVisible();
 await page.evaluate(()=>(window as any).__somnia.patch({saveDialog:{error:'No access to that folder.',busy:false}}));
 await expect(page.getByTestId('save-error')).toHaveText('No access to that folder.');});
for(const kind of ['disk','memory'] as const)test(`close dialog (${kind}): discard is never focused or rightmost, keyboard flow`,async({page})=>{
 await setup(page,{name:LONG});await open(page,kind);const d=page.getByRole('alertdialog');await expect(d).toBeVisible();
 await expect(d.locator('.dlg-card')).toContainText(kind==='disk'?'On disk · unsaved changes':'Memory only · unsaved changes');
 const primary=d.getByRole('button',{name:kind==='disk'?'Save and close':'Keep draft and close'});const discard=d.getByRole('button',{name:kind==='disk'?'Discard and close':'Discard draft and close'});
 await expect(primary).toBeFocused();await expect(discard).not.toBeFocused();
 const [pb,db]=[await primary.boundingBox(),await discard.boundingBox()];expect(pb!.x).toBeGreaterThan(db!.x);
 const order:string[]=[];await page.keyboard.press('Shift+Tab');order.push(await page.evaluate(()=>(document.activeElement as HTMLElement).textContent||''));await page.keyboard.press('Shift+Tab');order.push(await page.evaluate(()=>(document.activeElement as HTMLElement).textContent||''));
 expect(order).toEqual([kind==='disk'?'Discard and close':'Discard draft and close','Cancel']);
 await page.keyboard.press('Escape');await expect(d).toBeHidden();});
test('close project dialog: Cancel and Discard',async({page})=>{
 await setup(page);await open(page,'closeProject');const d=page.getByRole('alertdialog',{name:'Close this project?'});await expect(d).toBeVisible();
 await expect(d.getByRole('button',{name:'Save...'})).toBeFocused();await d.getByRole('button',{name:'Cancel'}).click();await expect(d).toBeHidden();});
test('footer stacks with primary on top when German text does not fit',async({page})=>{
 await setup(page,{locale:'de',theme:'light',name:LONG});await open(page,'memory');const d=page.getByRole('alertdialog');await expect(d).toBeVisible();
 const foot=d.locator('.dlg-foot');await expect(foot).toHaveAttribute('data-stack','true');
 const p=await d.getByRole('button',{name:'Entwurf behalten und schließen'}).boundingBox();const x=await d.getByRole('button',{name:'Entwurf verwerfen und schließen'}).boundingBox();const c=await d.getByRole('button',{name:'Abbrechen'}).boundingBox();
 expect(p!.y).toBeLessThan(x!.y);expect(x!.y).toBeLessThan(c!.y);expect(Math.abs(p!.width-x!.width)).toBeLessThan(2);
 await shot(page,'close-memory-de-light');});
test('footer stays inline for short English text',async({page})=>{
 await setup(page);await open(page,'disk');const d=page.getByRole('alertdialog');await expect(d.locator('.dlg-foot')).toHaveAttribute('data-stack','false');});
for(const [theme,contrast] of [['light',undefined],['dark',undefined],['dark','high']] as const)for(const locale of ['en','de'])for(const k of ['save','disk','memory'] as const)
test(`no overflow: ${k} ${locale} ${theme}${contrast?'-hc':''} at 520 and 360px`,async({page})=>{
 await setup(page,{locale,theme,contrast,name:LONG});
 for(const w of [1000,360]){await page.setViewportSize({width:w,height:800});await open(page,k);const d=page.locator('.dlg-popup');await expect(d).toBeVisible();
  const bad=await d.evaluate(e=>{const r=e.getBoundingClientRect();const out:string[]=[];if(r.left<-0.5||r.right>innerWidth+0.5)out.push('dialog outside viewport');e.querySelectorAll('button,strong,small,p,h2,span').forEach(n=>{const b=n.getBoundingClientRect();if(b.width&&(b.right>r.right+0.5||b.left<r.left-0.5))out.push(n.tagName+':'+(n.textContent||'').slice(0,30));});return out;});
  expect(bad).toEqual([]);
  if(w===1000)await shot(page,`${k}-${locale}-${theme}${contrast?'-hc':''}`);
  await page.keyboard.press('Escape');await expect(d).toBeHidden();}});
