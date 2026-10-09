import {test,expect} from './fixtures';
const SVG=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect id="a" x="40" y="40" width="100" height="60" fill="#2a6bff"/>
  <rect id="b" x="220" y="160" width="60" height="60" fill="#ff3b6b"/>
</svg>
`;
const CLIP=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <rect id="photo" x="60" y="60" width="240" height="180" fill="#2a6bff"/>
  <rect id="stripe" x="60" y="140" width="240" height="30" fill="#ffd23b"/>
  <circle id="hole" cx="180" cy="150" r="80" fill="#ffffff"/>
</svg>
`;
const open=async(page:any,text=SVG,name='b3.svg')=>{await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.evaluate(async([n,t]:string[])=>{const m=await import('/src/lib/projectActions.ts');m.addTextFiles([{name:n,text:t}]);},[name,text]);
 await expect(page.getByTestId('svg-host')).toBeVisible();};
const src=(page:any,n='b3.svg')=>page.evaluate(async(n:string)=>{const s=await import('/src/store/appStore.ts');return s.getState().files[n] as string;},n);
const pick=async(page:any,names:string[])=>{for(const [i,n] of names.entries())await page.getByTestId('svg-layer').filter({hasText:n}).click({modifiers:i?['Shift']:[]});};
/** Drag element `id` by (dx,dy) document units; `hold` is a modifier held during the drag. */
const drag=async(page:any,id:string,dx:number,dy:number,hold?:string,shot?:string)=>{
 const host=await page.getByTestId('svg-host').locator('svg').boundingBox();const k=host.width/400;
 const b=await page.getByTestId('svg-host').locator(`#${id}`).boundingBox();const x=b.x+b.width/2,y=b.y+b.height/2;
 if(hold)await page.keyboard.down(hold);
 await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+dx*k/2,y+dy*k/2,{steps:4});await page.mouse.move(x+dx*k,y+dy*k,{steps:4});
 if(shot)await page.screenshot({path:`test-results/${shot}.png`});
 const lines=await page.getByTestId('svg-snapline').count();
 await page.mouse.up();if(hold)await page.keyboard.up(hold);return lines;};
const num=(s:string,id:string,a:string)=>parseFloat(new RegExp(`id="${id}"[^>]*? ${a}="([-\\d.]+)"`).exec(s)![1]);

test('dragging snaps an edge to another object and shows a guide line',async({page})=>{await open(page);
 // b.x is 220; a's right edge is 140. Drag so b lands 3 units short of it.
 const lines=await drag(page,'b',-77,0,undefined,'b3-snap-drag');
 expect(lines).toBeGreaterThan(0);
 const out=await src(page);expect(num(out,'b','x')).toBe(140);});
test('holding Ctrl skips snapping',async({page})=>{await open(page);
 await drag(page,'b',-77,0,'Control');const x=num(await src(page),'b','x');expect(x).not.toBe(140);expect(Math.abs(x-143)).toBeLessThan(3);});
test('snap toggle in the toolbar turns snapping off',async({page})=>{await open(page);
 await page.getByRole('button',{name:/^Snap to objects/}).click();
 await drag(page,'b',-77,0);expect(num(await src(page),'b','x')).not.toBe(140);});
test('guides: add by position, snap to them, remove',async({page})=>{await open(page);
 await page.getByTestId('svg-guide-pos').fill('100');await page.getByTestId('svg-guide-add-v').click();
 await expect(page.getByTestId('svg-guide-row')).toHaveCount(1);await expect(page.getByTestId('svg-guide')).toHaveCount(1);
 await drag(page,'b',-117,40,undefined,'b3-guide');// b.x would be ~103 -> snaps to the guide at 100
 expect(num(await src(page),'b','x')).toBe(100);
 await page.getByRole('button',{name:'Remove guide'}).click();await expect(page.getByTestId('svg-guide')).toHaveCount(0);});
test('grid snaps moves to the grid size',async({page})=>{await open(page);
 await page.getByTestId('svg-grid-size').fill('25');await expect(page.getByTestId('svg-grid')).toBeVisible();
 await drag(page,'b',-72,0,undefined,'b3-grid');const x=num(await src(page),'b','x');expect(x%25).toBe(0);});
test('make clipping path: topmost shape clips the rest, release restores',async({page})=>{await open(page,CLIP);
 await pick(page,['photo','stripe','hole']);await page.getByRole('button',{name:/^Make clipping path/}).click();
 const out=await src(page);
 expect(out).toMatch(/<defs>\s*<clipPath id="clip1"><circle id="hole"[^>]*\/><\/clipPath>\s*<\/defs>/);
 expect(out).toMatch(/<g clip-path="url\(#clip1\)">[\s\S]*id="photo"[\s\S]*id="stripe"[\s\S]*<\/g>/);
 expect(out).not.toMatch(/<circle[^>]*>\s*<\/svg>/);
 await page.screenshot({path:'test-results/b3-clip.png'});
 await expect(page.getByTestId('svg-clip-status')).toContainText('Clipped');
 await page.getByTestId('svg-clip-release').click();
 const back=await src(page);expect(back).not.toContain('clipPath');expect(back).not.toContain('clip-path');expect(back).not.toContain('<defs');
 expect(back).toContain('id="hole"');expect(back).toContain('id="photo"');});
test('clip is one undo step',async({page})=>{await open(page,CLIP);
 await pick(page,['photo','hole']);await page.getByRole('button',{name:/^Make clipping path/}).click();
 await expect.poll(async()=>(await src(page)).includes('clipPath')).toBe(true);
 await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('edit.undo');});
 await expect.poll(()=>src(page)).toBe(CLIP);});
test('make mask uses the topmost shape luminance',async({page})=>{await open(page,CLIP);
 await pick(page,['photo','stripe','hole']);await page.getByRole('button',{name:/^Make mask/}).click();
 const out=await src(page);expect(out).toMatch(/<mask id="mask1"><circle id="hole"/);expect(out).toMatch(/<g mask="url\(#mask1\)">/);
 await page.screenshot({path:'test-results/b3-mask.png'});
 await expect(page.getByTestId('svg-clip-status')).toContainText('Masked');});
test('clip buttons are disabled for a single selection',async({page})=>{await open(page,CLIP);
 await pick(page,['photo']);await expect(page.getByRole('button',{name:/^Make clipping path/})).toBeDisabled();});
test('clip inside a nested group keeps working and a second clip gets a new id',async({page})=>{
 await open(page,`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 300" width="400" height="300">
  <g id="grp">
    <rect id="r1" x="20" y="20" width="200" height="100" fill="#2a6bff"/>
    <ellipse id="e1" cx="120" cy="70" rx="60" ry="40" fill="#fff"/>
  </g>
  <rect id="r2" x="220" y="150" width="120" height="100" fill="#ff3b6b"/>
  <circle id="c2" cx="280" cy="200" r="40" fill="#fff"/>
</svg>
`);
 await pick(page,['r1','e1']);await page.getByRole('button',{name:/^Make clipping path/}).click();
 await expect.poll(async()=>(await src(page)).includes('clip1')).toBe(true);
 await pick(page,['r2','c2']);await page.getByRole('button',{name:/^Make clipping path/}).click();
 const out=await src(page);expect(out).toContain('id="clip2"');expect((out.match(/<defs>/g)??[]).length).toBe(1);
 expect(out).toMatch(/<g id="grp">\s*<g clip-path="url\(#clip1\)">/);});
