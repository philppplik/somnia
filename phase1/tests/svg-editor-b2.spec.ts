import {test,expect} from './fixtures';
const SVG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect id="box" x="60" y="60" width="140" height="140" fill="#2a6bff"/>
  <circle id="disc" cx="200" cy="200" r="80" fill="#ff3b6b"/>
</svg>
`;
const open=async(page:any,text=SVG,name='b2.svg')=>{await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.evaluate(async([n,t]:string[])=>{const m=await import('/src/lib/projectActions.ts');m.addTextFiles([{name:n,text:t}]);},[name,text]);
 await expect(page.getByTestId('svg-host')).toBeVisible();};
const src=(page:any,n='b2.svg')=>page.evaluate(async(n:string)=>{const s=await import('/src/store/appStore.ts');return s.getState().files[n] as string;},n);
const pick=async(page:any,names:string[])=>{for(const [i,n] of names.entries())await page.getByTestId('svg-layer').filter({hasText:n}).click({modifiers:i?['Shift']:[]});};
for(const [op,label] of [['unite','Unite'],['subtract','Subtract'],['intersect','Intersect'],['exclude','Exclude']] as const){
 test(`boolean ${op} merges two shapes into one path`,async({page})=>{await open(page);
  await pick(page,["box","disc"]);await page.getByRole('button',{name:new RegExp('^'+label)}).click();
  await expect.poll(async()=>(await src(page)).match(/<path /g)?.length??0).toBe(1);
  const out=await src(page);expect(out).not.toContain('<circle');expect(out).not.toContain('<rect');expect(out).toMatch(/<path d="M[^"]+" id="box" fill="#2a6bff"\/>/);
  if(op==='unite'||op==='exclude')expect(out).toMatch(/[CcAa]/);
  await page.screenshot({path:`test-results/b2-bool-${op}.png`});
  await page.keyboard.press('Control+z');});
}
test('boolean undo restores the original',async({page})=>{await open(page);await pick(page,["box","disc"]);await page.getByRole('button',{name:/^Intersect/}).click();
 await expect.poll(async()=>(await src(page)).includes('<circle')).toBe(false);
 await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('edit.undo');});
 await expect.poll(()=>src(page)).toBe(SVG);});
test('gradient editor: linear, stops, radial, solid, in one defs entry',async({page})=>{await open(page);
 await page.getByTestId('svg-layer').filter({hasText:"box"}).click();
 await page.locator('[data-grad-mode="linear"]').click();
 await expect.poll(src.bind(null,page)).toMatch(/<defs><linearGradient id="grad1"[^>]*>.*<\/linearGradient><\/defs>/s);
 let out=await src(page);expect(out).toContain('id="box"');expect(out).toMatch(/id="box"[^>]*fill="url\(#grad1\)"|fill="url\(#grad1\)"[^>]*id="box"/);
 await expect(page.getByTestId('svg-stop')).toHaveCount(2);
 await page.getByTestId('svg-add-stop').click();await expect(page.getByTestId('svg-stop')).toHaveCount(3);
 await page.getByTestId('svg-grad-angle').fill('90');
 await expect.poll(async()=>(await src(page)).match(/<stop /g)?.length).toBe(3);
 out=await src(page);expect(out).toMatch(/x1="0.5" y1="0" x2="0.5" y2="1"/);
 await page.screenshot({path:'test-results/b2-gradient-linear.png'});
 await page.locator('[data-grad-mode="radial"]').click();
 await expect.poll(async()=>(await src(page)).includes('<radialGradient id="grad1"')).toBe(true);
 expect((await src(page)).match(/<defs>/g)?.length).toBe(1);
 await page.screenshot({path:'test-results/b2-gradient-radial.png'});
 await page.locator('[data-grad-mode="solid"]').click();
 await expect.poll(async()=>(await src(page)).includes('id="box" x="60" y="60" width="140" height="140" fill="#2a6bff"')).toBe(true);});
test('bitmap trace turns an embedded image into vector paths',async({page})=>{
 await open(page,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300"></svg>\n`,'t.svg');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=160;c.height=120;const x=c.getContext('2d')!;x.fillStyle='#fff';x.fillRect(0,0,160,120);x.fillStyle='#e02020';x.beginPath();x.arc(60,60,40,0,7);x.fill();x.fillStyle='#1040e0';x.fillRect(100,30,50,60);return c.toDataURL('image/png');});
 await page.evaluate(async(u:string)=>{const m=await import('/src/lib/svgedit/controller.ts');m.addElement(`<image id="pic" x="50" y="40" width="160" height="120" href="${u}"/>`);},png);
 await expect(page.getByTestId('svg-trace')).toBeVisible();await page.getByTestId('svg-trace-colors').fill('4');
 await page.getByTestId('svg-trace').click();
 await expect.poll(async()=>(await src(page,'t.svg')).includes('<g id="trace" transform="translate(50 40)')).toBe(true);
 const out=await src(page,'t.svg');const n=(out.match(/<path /g)??[]).length;expect(n).toBeGreaterThanOrEqual(2);expect(out).toMatch(/fill="rgb\(/);
 await page.getByTestId('svg-layer').filter({hasText:'pic'}).getByRole('button',{name:'Hide'}).click();
 await page.screenshot({path:'test-results/b2-trace.png'});});
test('place image embeds a data URI and offers tracing',async({page})=>{await open(page,SVG,'p.svg');
 const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=40;c.height=40;c.getContext('2d')!.fillRect(0,0,40,40);return c.toDataURL('image/png').split(',')[1];});
 await page.getByTestId('svg-place-input').setInputFiles({name:'x.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});
 await expect.poll(async()=>(await src(page,'p.svg')).includes('<image ')).toBe(true);await expect(page.getByTestId('svg-trace')).toBeVisible();});
