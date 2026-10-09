import {test,expect} from './fixtures';
import path from 'node:path';
/** Runs without source imports against the built app, exercising Vite's hashed worker and WASM URLs. */
test.use({sample:false});
test('production bundle opens TIFF through real worker and PNG through native A2',async({page})=>{
 const errors:string[]=[];const wasm:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.url().endsWith('.wasm'))wasm.push(r.url());});
 await page.goto('/',{waitUntil:'domcontentloaded'});
 const open=async(name:string)=>{const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Project',exact:true}).click();await page.getByRole('menuitem',{name:'Open file',exact:true}).click();await(await chooser).setFiles(path.join(import.meta.dirname,'assets','raster',name));};
 await open('raster.tiff');await expect(page.getByTestId('media-dims')).toHaveText('240 x 160 px');await expect(page.getByTestId('raster-warning')).toBeVisible();await expect(page.getByTestId('image-editor-stage')).toHaveCount(0);
 expect(wasm.some(url=>/somnia_raster_codec_bg-[\w-]+\.wasm$/.test(url))).toBe(true);
 await page.screenshot({path:'test-results/raster-production-tiff.png'});
 await open('raster.png');await expect(page.getByRole('region',{name:'Image editing viewport'}).locator('canvas')).toBeVisible();await expect(page.getByTestId('raster-warning')).toHaveCount(0);
 expect(errors).toEqual([]);
});
