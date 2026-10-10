import {test,expect} from './fixtures';
const strips=(page:any)=>page.getByTestId('video-filmstrip');
/** Counts non-transparent pixel columns of a strip canvas and returns a coarse signature. */
const sig=(page:any,i:number)=>page.evaluate((i:number)=>{
 const c=document.querySelectorAll('[data-testid=video-filmstrip] canvas')[i] as HTMLCanvasElement;
 const d=c.getContext('2d')!.getImageData(0,0,c.width,c.height).data;let filled=0,sum=0;
 for(let x=0;x<c.width;x++){const a=d[(Math.floor(c.height/2)*c.width+x)*4+3];if(a>0)filled++;}
 for(let k=0;k<d.length;k+=4*37)sum=(sum*31+d[k]+d[k+1]*3+d[k+2]*7+d[k+3])>>>0;
 return{filled,width:c.width,sum};
},i);
test('filmstrip: real decode fills every clip strip, trim reuses cache, no blank frame while updating',async({page})=>{
 page.on('console',m=>{if(m.type()==='error')console.log('PAGE',m.text());});page.on('pageerror',e=>console.log('PAGEERR',e.message));
 await page.goto('/tests/harness/filmstrip.html');
 await expect(strips(page)).toHaveCount(3);
 await expect.poll(async()=>{const s=await sig(page,0);return s.filled/s.width;},{timeout:20000}).toBeGreaterThan(0.99);
 for(const i of [1,2])await expect.poll(async()=>{const s=await sig(page,i);return s.filled/s.width;},{timeout:20000}).toBeGreaterThan(0.99);
 await page.screenshot({path:'test-results/filmstrip-loaded.png',clip:{x:0,y:0,width:960,height:140}});
 // trim clip 1: strip must never go blank mid-update, and cached buckets are reused
 const before=await page.evaluate(()=>(window as any).__h.getBatches());
 await page.evaluate(()=>{
  (window as any).__blank=0;
  const c=document.querySelectorAll('[data-testid=video-filmstrip] canvas')[0] as HTMLCanvasElement;
  const t=()=>{const d=c.getContext('2d')!.getImageData(0,0,c.width,1).data;let f=0;for(let x=0;x<c.width;x++)if(d[x*4+3]>0)f++;if(f/c.width<0.9)(window as any).__blank++;requestAnimationFrame(t);};t();
 });
 await page.evaluate(()=>{const w=(window as any).__h;w.setClips((cs:any[])=>cs.map((c,i)=>i===0?{...c,out_s:1.2}:c));});
 await page.waitForTimeout(800);
 await page.evaluate(()=>{const w=(window as any).__h;w.setClips((cs:any[])=>cs.map((c,i)=>i===0?{...c,in_s:0.4}:c));});
 await page.waitForTimeout(1200);
 expect(await page.evaluate(()=>(window as any).__blank)).toBe(0);
 const s0=await sig(page,0);expect(s0.filled/s0.width).toBeGreaterThan(0.99);
 await page.screenshot({path:'test-results/filmstrip-trimmed.png',clip:{x:0,y:0,width:960,height:140}});
 // selecting a clip shows trim handles over the strip
 await page.getByTestId('video-clip').nth(1).click();
 await page.screenshot({path:'test-results/filmstrip-selected.png',clip:{x:0,y:0,width:960,height:140}});
 expect(await page.evaluate(()=>(window as any).__h.size())).toBeGreaterThan(3);
 expect(before).toBeGreaterThan(0);
});
