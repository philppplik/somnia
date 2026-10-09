import {test,expect} from './fixtures';
import fs from 'node:fs';
const SVG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect id="box" x="100" y="100" width="200" height="100" fill="#ffffff" stroke="#2a6bff" stroke-width="20"/>
  <path id="curve" d="M40 260 C 120 200, 280 280, 360 240" fill="none" stroke="#ff3b6b" stroke-width="12" stroke-linecap="round"/>
</svg>
`;
const open=async(page:any,text=SVG,name='b4.svg')=>{await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.evaluate(async([n,t]:string[])=>{const m=await import('/src/lib/projectActions.ts');m.addTextFiles([{name:n,text:t}]);},[name,text]);
 await expect(page.getByTestId('svg-host')).toBeVisible();};
const src=(page:any,n='b4.svg')=>page.evaluate(async(n:string)=>{const s=await import('/src/store/appStore.ts');return s.getState().files[n] as string;},n);
const layer=(page:any,n:string)=>page.getByTestId('svg-layer').filter({hasText:n});
const png=(buf:Buffer)=>({sig:buf.subarray(0,8).toString('hex'),w:buf.readUInt32BE(16),h:buf.readUInt32BE(20)});

test('stroke gradient: linear on stroke only, fill untouched, one defs',async({page})=>{await open(page);
 await layer(page,'box').click();
 await page.locator('[data-grad-prop="stroke"][data-grad-mode="linear"]').click();
 const out=await src(page);
 expect(out).toMatch(/id="box"[^>]*stroke="url\(#grad1\)"|stroke="url\(#grad1\)"[^>]*id="box"/);
 expect(out).toMatch(/id="box"[^>]*fill="#ffffff"|fill="#ffffff"[^>]*id="box"/);
 expect((out.match(/<defs>/g)??[]).length).toBe(1);expect(out).toMatch(/<linearGradient id="grad1"/);
 await expect(page.getByTestId('svg-gradient-stroke')).toBeVisible();
 await expect(page.getByTestId('svg-stroke')).toHaveCount(0);
 // a second gradient on the fill gets its own id and the stroke one stays
 await page.locator('[data-grad-prop="fill"][data-grad-mode="radial"]').click();
 const o2=await src(page);expect(o2).toContain('fill="url(#grad2)"');expect(o2).toContain('stroke="url(#grad1)"');expect((o2.match(/<defs>/g)??[]).length).toBe(1);
 await page.screenshot({path:'test-results/b4-stroke-gradient.png'});
 // back to solid
 await page.locator('[data-grad-prop="stroke"][data-grad-mode="solid"]').click();
 expect(await src(page)).toMatch(/stroke="#[0-9a-f]{6}"/i);});
test('stroke gradient renders: exported pixels along the stroke differ',async({page})=>{await open(page);
 await layer(page,'box').click();await page.locator('[data-grad-prop="stroke"][data-grad-mode="linear"]').click();
 const px=await page.evaluate(async()=>{const s=await import('/src/store/appStore.ts');const r=await import('/src/lib/svgedit/raster.ts');
  const text=s.getState().files['b4.svg'] as string;const blob=await r.svgToPng(text,{w:400,h:300},{scale:1,background:null});
  const bm=await createImageBitmap(blob);const c=new OffscreenCanvas(400,300);const g=c.getContext('2d')!;g.drawImage(bm,0,0);
  const at=(x:number,y:number)=>Array.from(g.getImageData(x,y,1,1).data);return{l:at(100,150),r:at(300,150),mid:at(200,150)};});
 // stroke is 20 wide centred on the edge: x=100 is on the left stroke, x=300 on the right one
 expect(px.l[3]).toBe(255);expect(px.r[3]).toBe(255);expect(px.l.slice(0,3)).not.toEqual(px.r.slice(0,3));expect(px.mid.slice(0,3)).toEqual([255,255,255]);});
test('stroke to path: filled rect keeps its fill and gets a filled outline',async({page})=>{await open(page);
 await layer(page,'box').click();await page.getByRole('button',{name:/^Stroke to path/}).click();
 await expect.poll(async()=>(await src(page)).match(/<path /g)?.length??0).toBe(2);
 const out=await src(page);
 expect(out).toMatch(/<rect id="box"[^>]*fill="#ffffff"[^>]*\/>/);expect(out.match(/<rect[^>]*>/)![0]).not.toContain('stroke');
 expect(out).toMatch(/<path d="M[^"]+" fill="#2a6bff" fill-rule="evenodd"\/>/);
 // the outline of a 200x100 rect with a 20 stroke spans 220x120
 const bb=await page.evaluate(()=>{const ps=[...document.querySelectorAll('[data-testid="svg-host"] path')] as SVGGraphicsElement[];const p=ps.find(x=>x.getAttribute('fill')==='#2a6bff')!;const b=p.getBBox();return[b.x,b.y,b.width,b.height].map(n=>Math.round(n));});
 expect(bb).toEqual([90,90,220,120]);
 await page.screenshot({path:'test-results/b4-stroke-to-path.png'});
 await page.keyboard.press('Control+z');await expect.poll(()=>src(page)).toBe(SVG);});
test('stroke to path: open stroke-only path is replaced in place, round caps, id kept',async({page})=>{await open(page);
 await layer(page,'curve').click();await page.getByRole('button',{name:/^Stroke to path/}).click();
 await expect.poll(async()=>(await src(page)).includes('stroke="#ff3b6b"')).toBe(false);
 const out=await src(page);expect(out).toMatch(/<path id="curve" d="M[^"]+" fill="#ff3b6b" fill-rule="evenodd"\/>/);
 expect((out.match(/<path /g)??[]).length).toBe(1);
 const ok=await page.evaluate(()=>{const p=document.querySelector('[data-testid="svg-host"] path') as SVGGeometryElement;const b=p.getBBox();return{w:b.width,x:b.x,inside:p.isPointInFill(new DOMPoint(40,260)),capEnd:p.isPointInFill(new DOMPoint(34,260)),far:p.isPointInFill(new DOMPoint(200,20))};});
 expect(ok.inside).toBe(true);expect(ok.far).toBe(false);expect(ok.capEnd).toBe(true);});
test('stroke to path refuses dashed strokes and shapes without a stroke',async({page})=>{
 await open(page,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100" height="100"><circle id="d" cx="50" cy="50" r="30" fill="none" stroke="#000" stroke-width="4" stroke-dasharray="4 2"/><rect id="n" x="5" y="5" width="20" height="20" fill="#f00"/></svg>
`);
 await layer(page,'n').click();await expect(page.getByRole('button',{name:/^Stroke to path/})).toBeDisabled();
 const before=await src(page);await layer(page,'d').click();await page.getByRole('button',{name:/^Stroke to path/}).click();
 await expect(page.getByText(/Dashed strokes cannot be converted/)).toBeVisible();expect(await src(page)).toBe(before);});
test('export PNG downloads a real PNG at the chosen scale',async({page})=>{await open(page);
 await page.getByTestId('svg-export-scale').selectOption('2');
 const [dl]=await Promise.all([page.waitForEvent('download'),page.getByRole('button',{name:'Export as PNG'}).click()]);
 expect(dl.suggestedFilename()).toBe('b4@2x.png');const buf=fs.readFileSync(await dl.path());const i=png(buf);
 expect(i.sig).toBe('89504e470d0a1a0a');expect([i.w,i.h]).toEqual([800,600]);});
test('export PNG: transparent by default, white on request, pixels match the drawing',async({page})=>{await open(page);
 const px=await page.evaluate(async()=>{const s=await import('/src/store/appStore.ts');const r=await import('/src/lib/svgedit/raster.ts');
  const text=s.getState().files['b4.svg'] as string;
  const read=async(bg:string|null)=>{const bm=await createImageBitmap(await r.svgToPng(text,{w:400,h:300},{scale:1,background:bg}));const c=new OffscreenCanvas(400,300);const g=c.getContext('2d')!;g.drawImage(bm,0,0);
   const at=(x:number,y:number)=>Array.from(g.getImageData(x,y,1,1).data);return{corner:at(2,2),stroke:at(200,100),fill:at(200,150)};};
  return{t:await read(null),w:await read('#ffffff')};});
 expect(px.t.corner[3]).toBe(0);expect(px.w.corner).toEqual([255,255,255,255]);expect(px.t.stroke).toEqual([42,107,255,255]);expect(px.t.fill).toEqual([255,255,255,255]);});
test('export PNG reports an error for an oversized export instead of hanging',async({page})=>{await open(page,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 9000 9000" width="9000" height="9000"><rect width="10" height="10"/></svg>
`);
 await page.getByTestId('svg-export-scale').selectOption('4');await page.getByRole('button',{name:'Export as PNG'}).click();
 await expect(page.getByText(/PNG export failed: Export would be/)).toBeVisible();});
