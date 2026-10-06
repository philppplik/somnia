import {test,expect} from './fixtures';
const long='<!doctype html><html><head><title>t</title></head><body><h1 id="x">Hi</h1>'+Array.from({length:300},(_,i)=>`<p>line ${i}</p>\n`).join('')+'</body></html>';
for(const swap of [false,true])
test(`horizontal split keeps code and design visible with a long file (swap=${swap})`,async({page})=>{
 await page.addInitScript(s=>localStorage.setItem('somnia.split.v1',JSON.stringify({splitLayout:'horizontal',splitSwap:s,splitRatio:0.48})),swap);
 await page.goto('/');
 await page.evaluate(s=>(window as any).__somnia.setSource('index.html',s),long);
 await page.keyboard.press('Control+3');
 const ws=page.locator('.workspace'),code=page.locator('.code-pane'),design=page.locator('iframe[title="Sandboxed design preview"]');
 await expect(ws).toHaveClass(/split-horizontal/);await expect(design).toBeVisible();
 await expect.poll(async()=>{const w=(await ws.boundingBox())!,c=(await code.boundingBox())!,s=(await page.locator('.canvas-stage').boundingBox())!;return c.height<=w.height*0.6&&s.height>=w.height*0.3&&c.height+s.height<=w.height+1;}).toBe(true);
 await page.screenshot({path:`test-results/split-horizontal${swap?'-swap':''}.png`});
});
