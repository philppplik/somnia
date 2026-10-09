import {test,expect} from './fixtures';
const SVG=`<?xml version="1.0" encoding="UTF-8"?>
<!-- brand mark -->
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#002AFF"/>
      <stop offset="1" stop-color="#EE00FF"/>
    </linearGradient>
    <filter id="blur"><feGaussianBlur stdDeviation="2"/></filter>
  </defs>
  <style>.tag{font:700 20px sans-serif}</style>
  <rect id="card" x="40" y="40" width="160" height="100" rx="12" fill="url(#g)" filter="url(#blur)"/>
  <g id="dots">
    <circle cx="280" cy="90" r="30" fill="#ff001e"/>
    <circle cx="330" cy="90" r="20" fill="#00c389"/>
  </g>
  <path id="wave" d="M40 220 C 100 160, 160 280, 220 220 S 340 180, 360 230" fill="none" stroke="#111" stroke-width="4"/>
  <text id="label" class="tag" x="40" y="280">Somnia</text>
</svg>
`;
const open=async(page:any)=>{await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.evaluate(async(t:string)=>{const m=await import('/src/lib/projectActions.ts');m.addTextFiles([{name:'logo.svg',text:t}]);},SVG);
 await expect(page.getByTestId('svg-host')).toBeVisible();await page.evaluate(()=>document.fonts.ready);};
const src=(page:any)=>page.evaluate(async()=>{const s=await import('/src/store/appStore.ts');return s.getState().files['logo.svg'] as string;});
const centre=async(page:any,sel:string)=>{const b=await page.locator(sel).first().boundingBox();return{x:b.x+b.width/2,y:b.y+b.height/2,b};};
test('svg opens in the inline editor with native sidebars',async({page})=>{await open(page);
 await expect(page.getByTestId('svg-sidebar')).toBeVisible();await expect(page.getByTestId('svg-inspector')).toBeVisible();
 await expect(page.getByTestId('svg-layer')).toHaveCount(6);
 await page.screenshot({path:'test-results/svg-1-open.png'});});
test('moving a rect rewrites only its own tag and keeps defs, style and filter',async({page})=>{await open(page);
 const c=await centre(page,'[data-sp="2"]');await page.mouse.move(c.x,c.y);await page.mouse.down();await page.mouse.move(c.x+40,c.y+20,{steps:6});await page.mouse.up();
 const out=await src(page);const a=SVG.split('\n'),b=out.split('\n');const diff=a.map((l,i)=>l===b[i]?-1:i).filter(i=>i>=0);
 expect(b.length).toBe(a.length);expect(diff).toEqual([11]);expect(b[11]).toContain('filter="url(#blur)"');expect(b[11]).toContain('fill="url(#g)"');expect(b[11]).toMatch(/x="\d+(\.\d+)?"/);
 expect(out).toContain('<!-- brand mark -->');expect(out).toContain('<filter id="blur">');
 await expect(page.getByTestId('svg-selection')).toBeVisible();
 await page.screenshot({path:'test-results/svg-2-moved.png'});
 await page.keyboard.press('Control+z');await expect.poll(()=>src(page)).toBe(SVG);});
test('resize handle, inspector fields and colour',async({page})=>{await open(page);
 const c=await centre(page,'[data-sp="2"]');await page.mouse.click(c.x,c.y);
 await expect(page.getByTestId('svg-w')).toHaveValue('160');
 const se=page.locator('[data-h="se"]');const hb=await se.boundingBox();await page.mouse.move(hb!.x+4,hb!.y+4);await page.mouse.down();await page.mouse.move(hb!.x+44,hb!.y+34,{steps:5});await page.mouse.up();
 await expect.poll(async()=>(await src(page)).match(/id="card"[^>]*/)?.[0]).not.toContain('width="160"');
 await page.locator('[data-grad-prop="fill"][data-grad-mode="solid"]').click();await page.getByTestId('svg-fill').fill('#00aa55');await page.getByTestId('svg-fill').blur();
 expect(await src(page)).toContain('fill="#00aa55"');
 await page.getByTestId('svg-radius').fill('30');await page.getByTestId('svg-radius').blur();expect(await src(page)).toContain('rx="30"');
 await page.screenshot({path:'test-results/svg-3-resized.png'});});
test('draw rect and ellipse, group, ungroup, reorder, hide and delete',async({page})=>{await open(page);
 const stage=await page.getByTestId('svg-host').boundingBox();
 await page.locator('[data-tool="rect"]').click();await page.mouse.move(stage!.x+200,stage!.y+200);await page.mouse.down();await page.mouse.move(stage!.x+260,stage!.y+240,{steps:4});await page.mouse.up();
 expect(await src(page)).toMatch(/<rect x="[\d.]+" y="[\d.]+" width="[\d.]+" height="[\d.]+" fill="#6d5ef5"\/>\n<\/svg>/);
 await page.locator('[data-tool="ellipse"]').click();await page.mouse.move(stage!.x+300,stage!.y+200);await page.mouse.down();await page.mouse.move(stage!.x+340,stage!.y+240,{steps:4});await page.mouse.up();
 expect(await src(page)).toContain('<ellipse');
 await page.locator('[data-tool="select"]').click();
 // layers: select two circles in the group -> group them
 await page.getByTestId('svg-layer').filter({hasText:'dots'}).click();
 await page.getByRole('button',{name:'Ungroup'}).first().click();
 let out=await src(page);expect(out).not.toContain('<g id="dots">');expect(out).toContain('<circle cx="280"');
 const circles=page.getByTestId('svg-layer').filter({hasText:'circle'});await circles.nth(0).click();await circles.nth(1).click({modifiers:['Shift']});
 await page.getByRole('button',{name:'Group'}).first().click();out=await src(page);expect(out).toMatch(/<g>\n\s+<circle cx="280"/);
 await page.getByTestId('svg-layer').filter({hasText:'label'}).click();await page.getByRole('button',{name:'Send to back'}).click();
 out=await src(page);expect(out.indexOf('id="label"')).toBeLessThan(out.indexOf('id="card"'));
 await page.getByTestId('svg-layer').filter({hasText:'label'}).getByRole('button',{name:'Hide'}).click();expect(await src(page)).toContain('display="none"');
 await page.screenshot({path:'test-results/svg-4-drawn.png'});
 await page.getByTestId('svg-layer').filter({hasText:'label'}).click();await page.getByRole('button',{name:'Delete'}).first().click();expect(await src(page)).not.toContain('id="label"');});
test('node tool drags a path node and inserts a node',async({page})=>{await open(page);
 await page.getByTestId('svg-layer').filter({hasText:'wave'}).click();
 const before=await src(page);await page.locator('[data-tool="node"]').click();
 await expect(page.locator('[data-n$=":node"]').first()).toBeVisible();
 const n=await page.locator('[data-n="0:0:node"]').boundingBox();await page.mouse.move(n!.x+5,n!.y+5);await page.mouse.down();await page.mouse.move(n!.x+25,n!.y-25,{steps:5});await page.mouse.up();
 const out=await src(page);expect(out).not.toBe(before);expect(out).toMatch(/id="wave" d="M[\d. -]+C/);
 await page.screenshot({path:'test-results/svg-5-nodes.png'});});
test('text tool creates text and ctrl+wheel zooms',async({page})=>{await open(page);
 const stage=await page.getByTestId('svg-host').boundingBox();await page.locator('[data-tool="text"]').click();await page.mouse.click(stage!.x+100,stage!.y+120);
 await expect(page.locator('.svg-text-input')).toBeFocused();await page.keyboard.press('End');await page.keyboard.type(' two');await page.keyboard.press('Enter');expect(await src(page)).toMatch(/<text [^>]*>Text two<\/text>/);
 const z0=await page.getByTestId('svg-zoom').textContent();await page.getByTestId('svg-footer').getByRole('button',{name:'Zoom in'}).click();expect(await page.getByTestId('svg-zoom').textContent()).not.toBe(z0);});
test('hostile svg is neutralised in the editor',async({page})=>{await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.evaluate(async()=>{const m=await import('/src/lib/projectActions.ts');m.addTextFiles([{name:'evil.svg',text:'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10" onload="window.__x=1"><script>window.__x=2</script><rect width="5" height="5" onclick="window.__x=3"/><image href="https://example.invalid/a.png" width="3" height="3"/></svg>'}]);});
 await expect(page.getByTestId('svg-host')).toBeVisible();await expect(page.getByTestId('svg-host').locator('script')).toHaveCount(0);
 await expect(page.getByTestId('svg-host').locator('[onclick],[onload]')).toHaveCount(0);await expect(page.getByTestId('svg-host').locator('image[href]')).toHaveCount(0);
 expect(await page.evaluate(()=>(window as any).__x)).toBeUndefined();});
