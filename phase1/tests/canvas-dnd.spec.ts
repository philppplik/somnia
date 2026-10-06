import {test,expect} from './fixtures';
// Playwright's real mouse hangs on drags inside the sandboxed preview iframe in headless Chromium, so the pointer sequence is dispatched inside the frame instead.
const page0='<!doctype html><html><head><title>t</title><style>section{padding:10px} h2,p{display:block;margin:0;height:40px;background:#eee}</style></head><body><section><h2>A</h2><p>B</p></section><footer>F</footer></body></html>';
type Step=['down'|'move'|'up'|'esc','h2'|'p'|'footer'|null,number?];
async function run(frame:any,steps:Step[]){await frame.locator('body').evaluate((body:HTMLElement,steps:Step[])=>{const doc=body.ownerDocument;const fire=(type:string,x:number,y:number)=>{const target=doc.elementFromPoint(x,y)||doc.body;target.dispatchEvent(new PointerEvent(type,{bubbles:true,cancelable:true,clientX:x,clientY:y,button:0,buttons:type==='pointerup'?0:1,pointerId:1,isPrimary:true}));};
 for(const [kind,sel,frac] of steps){if(kind==='esc'){doc.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));continue;}const r=(sel?doc.querySelector(sel)!:doc.body).getBoundingClientRect();const x=r.x+20,y=r.y+r.height*(frac??0.5);fire(kind==='down'?'pointerdown':kind==='up'?'pointerup':'pointermove',x,y);}},steps);}
test('dragging an element on the canvas moves it after its sibling as one undo step',async({page})=>{await page.goto('/');
 await page.evaluate(s=>(window as any).__somnia.setSource('index.html',s),page0);
 const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h2')).toHaveCount(1);
 await run(frame,[['down','h2',0.5],['move','h2',0.9],['move','p',0.9]]);await expect(page.getByTestId('canvas-drop-hint')).toHaveAttribute('data-zone','after');
 await run(frame,[['up','p',0.9]]);await expect(frame.locator('section > p + h2')).toHaveCount(1);await expect(page.getByTestId('canvas-drop-hint')).toHaveCount(0);
 await page.keyboard.press('Control+z');await expect(frame.locator('section > h2 + p')).toHaveCount(1);});
test('dropping on the middle of an element moves it inside; Escape cancels',async({page})=>{await page.goto('/');
 await page.evaluate(s=>(window as any).__somnia.setSource('index.html',s),page0);
 const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h2')).toHaveCount(1);
 await run(frame,[['down','h2',0.5],['move','h2',0.9],['move','footer',0.5]]);await expect(page.getByTestId('canvas-drop-hint')).toHaveAttribute('data-zone','inside');
 await run(frame,[['esc',null],['up','footer',0.5]]);await expect(frame.locator('section > h2 + p')).toHaveCount(1);await expect(page.getByTestId('canvas-drop-hint')).toHaveCount(0);
 await run(frame,[['down','h2',0.5],['move','h2',0.9],['move','footer',0.5],['up','footer',0.5]]);await expect(frame.locator('footer > h2')).toHaveCount(1);});
test('a small pointer movement is a click, not a drag',async({page})=>{await page.goto('/');
 await page.evaluate(s=>(window as any).__somnia.setSource('index.html',s),page0);
 const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h2')).toHaveCount(1);
 await run(frame,[['down','h2',0.5],['move','h2',0.55],['up','h2',0.55]]);await expect(page.getByTestId('canvas-drop-hint')).toHaveCount(0);await expect(frame.locator('section > h2 + p')).toHaveCount(1);});

test('element drag suppresses selection only while active and restores author styles',async({page})=>{
 await page.goto('/');
 await page.evaluate(s=>(window as any).__somnia.setSource('index.html',s),page0.replace('section{','h2{user-select:text!important} html{cursor:crosshair} section{'));
 const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h2')).toHaveCount(1);
 await expect(frame.locator('h2')).toHaveCSS('user-select','text');
 const selection=()=>frame.locator('body').evaluate(body=>{const doc=body.ownerDocument;const r=doc.createRange();r.selectNodeContents(doc.querySelector('h2')!);doc.getSelection()!.addRange(r);});
 await selection();
 await run(frame,[['down','h2',0.5],['move','h2',0.55]]);
 await expect(frame.locator('h2')).toHaveCSS('user-select','text');
 await run(frame,[['move','h2',0.9],['move','p',0.9]]);
 await expect(frame.locator('h2')).toHaveCSS('user-select','none');await expect(frame.locator('p')).toHaveCSS('user-select','none');
 expect(await frame.locator('body').evaluate(body=>body.ownerDocument.getSelection()?.toString())).toBe('');
 expect(await frame.locator('h2').evaluate(el=>el.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})))).toBe(false);
 await page.screenshot({path:'test-results/canvas-drag-selection.png'});
 await run(frame,[['esc',null]]);
 await expect(frame.locator('h2')).toHaveCSS('user-select','text');await expect(frame.locator('html')).toHaveCSS('cursor','crosshair');
 expect(await frame.locator('h2').evaluate(el=>el.dispatchEvent(new Event('selectstart',{bubbles:true,cancelable:true})))).toBe(true);
 // A completed drag, pointer cancellation and losing window focus also restore selection.
 for(const finish of ['up','pointercancel','blur']){
  await run(frame,[['down','h2',0.5],['move','h2',0.9]]);
  await expect(frame.locator('h2')).toHaveCSS('user-select','none');
  if(finish==='up')await run(frame,[['up','h2',0.9]]);
  else await frame.locator('body').evaluate((body,kind)=>{if(kind==='blur')body.ownerDocument.defaultView!.dispatchEvent(new Event('blur'));else body.dispatchEvent(new PointerEvent(kind,{bubbles:true}));},finish);
  await expect(frame.locator('h2')).toHaveCSS('user-select','text');
 }
 await selection();expect(await frame.locator('body').evaluate(body=>body.ownerDocument.getSelection()?.toString())).toBe('A');

});
