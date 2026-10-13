import {test,expect} from './fixtures';
import path from 'node:path';
const asset=(n:string)=>path.join(import.meta.dirname,'assets',n);
/**
 * Photos side panels, driven in the web build. The WASM develop engine is not bundled in the dev server, so a fake
 * worker answers the engine protocol with a deterministic gradient whose brightness follows Exposure and Contrast.
 * That exercises the real panels, session, commands and shell; it does not test LightCraft pixels.
 */
const FAKE_WORKER=`(()=>{
 const W=64,H=48;
 class FakeWorker{
  constructor(){this.onmessage=null;this.onerror=null;this.onmessageerror=null;}
  postMessage(d){
   setTimeout(()=>{
    if(d.op==='load'){this.onmessage?.({data:{id:d.id,ok:true,width:W,height:H}});return;}
    const s=d.settings||{};const ex=Math.pow(2,s.exposure||0),ct=1+(s.contrast||0)/100;
    const px=new Uint8Array(W*H*4);
    for(let y=0;y<H;y++)for(let x=0;x<W;x++){const o=(y*W+x)*4;let v=(x/(W-1))*255*ex;v=(v-128)*ct+128;v=Math.max(0,Math.min(255,v));px[o]=v;px[o+1]=v*0.9;px[o+2]=v*0.8;px[o+3]=255;}
    this.onmessage?.({data:{id:d.id,ok:true,bytes:px.buffer,width:W,height:H}});
   },5);
  }
  terminate(){}
 }
 window.Worker=FakeWorker;
})();`;
async function openPhoto(page:any){
 await page.addInitScript(FAKE_WORKER);
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.getByRole('radio',{name:'Somnia Photos'}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByTestId('photos-open').click();(await chooser).setFiles(asset('photo.jpg'));
 await expect(page.getByTestId('photos-workspace')).toBeVisible();
}
test('Photos panels: histogram reacts to exposure, resets, presets and history jump work',async({page})=>{
 await openPhoto(page);
 await expect(page.getByTestId('photos-histogram-panel')).toBeVisible();
 await expect(page.getByTestId('photos-light-panel')).toBeVisible();
 await expect(page.getByTestId('photos-hist-mean')).toBeVisible();
 const mean=async()=>Number((await page.getByTestId('photos-hist-mean').innerText()).split('/')[0]);
 const before=await mean();
 await page.getByTestId('photos-slider-exposure').fill('1');
 await expect.poll(mean).toBeGreaterThan(before+10);
 await page.screenshot({path:'test-results/photos-panels-light.png'});
 // section reset
 await page.getByTestId('photos-light-reset').click();
 await expect(page.getByTestId('photos-value-exposure')).toContainText('0');
 await expect.poll(mean).toBeLessThan(before+3);
 // presets
 await page.locator('[data-rail-item="presets"]').click();
 await page.getByTestId('photos-preset-bw').click();
 await expect(page.getByTestId('photos-value-contrast')).toContainText('+20');
 await page.getByTestId('photos-preset-name').fill('My bw');await page.getByTestId('photos-preset-save').click();
 await expect(page.getByTestId('photos-presets-user')).toContainText('My bw');
 await page.screenshot({path:'test-results/photos-panels-presets.png'});
 // history
 await page.locator('[data-rail-item="history"]').click();
 await expect(page.getByTestId('photos-history-list')).toContainText('Opened');
 await page.getByTestId('photos-history-0').click();
 await expect(page.getByTestId('photos-value-contrast')).toContainText('0');
 await page.getByTestId('photos-p-redo').click();
 await page.screenshot({path:'test-results/photos-panels-history.png'});
 // transform
 await page.locator('[data-rail-item="transform"]').click();
 await page.getByTestId('photos-aspect-1x1').click();
 await expect(page.getByTestId('photos-crop-size')).toContainText('Selection');
 await page.getByTestId('photos-p-crop-apply').click();
 await expect(page.getByTestId('photos-crop-size')).toContainText('Output');
 await page.screenshot({path:'test-results/photos-panels-transform.png'});
});
