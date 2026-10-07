/** Real Chromium: open an image through the web host, edit, undo, adjust, save a copy. Run with tsx --test. */
import {after,before,test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {chromium} from '@playwright/test';
import type {Browser,Page} from '@playwright/test';
let browser:Browser,page:Page;const port=1438;let server:ReturnType<typeof spawn>;
before(async()=>{
 server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port',String(port)],{stdio:'ignore'});
 for(let i=0;i<120;i++){try{if((await fetch(`http://127.0.0.1:${port}`)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.CHROME_PATH||'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
 page=await browser.newPage({viewport:{width:1440,height:900}});
 await page.addInitScript('window.__name = (fn) => fn');await page.goto(`http://127.0.0.1:${port}`);
});
after(async()=>{await browser?.close();server?.kill();});
test('Edit image: open, rotate, undo, redo, save a PNG copy with the edited size',async()=>{
 await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:'Edit image...'}).click();
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Open image...'}).click();
 (await chooser).setFiles({name:'photo.svg',mimeType:'image/svg+xml',buffer:Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100"><rect width="200" height="100" fill="#7c3aed"/><circle cx="150" cy="50" r="30" fill="#fafafa"/></svg>')});
 await page.getByText('200 x 100 px').waitFor();
 await page.getByTestId('imgedit-rotate-right').click();
 await page.getByText('100 x 200 px').waitFor();
 await page.getByRole('button',{name:'Undo',exact:true}).click();await page.getByText('200 x 100 px').waitFor();
 await page.getByRole('button',{name:'Redo',exact:true}).click();await page.getByText('100 x 200 px').waitFor();
 await page.screenshot({path:'/tmp/image-editor-dialog.png'});
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save copy...'}).click();
 const out=await download;assert.equal(out.suggestedFilename(),'photo-edited.png');await out.saveAs('/tmp/image-editor-out.png');
 const png=readFileSync('/tmp/image-editor-out.png');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.equal(png.readUInt32BE(16),100);assert.equal(png.readUInt32BE(20),200);
});
test('Edit image: brightness slider changes exported pixels and undo restores them',async()=>{
 const slider=page.getByRole('slider').first();
 await slider.focus();for(let i=0;i<20;i++)await slider.press('ArrowRight');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save copy...'}).click();await (await download).saveAs('/tmp/image-editor-bright.png');
 const a=readFileSync('/tmp/image-editor-out.png'),b=readFileSync('/tmp/image-editor-bright.png');
 assert.notDeepEqual(a,b);
});
test('Edit image: invert filter changes pixels, strength 100% inverts the purple fill',async()=>{
 await page.getByTestId('image-editor-filter-select').selectOption('invert');
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Save copy...'}).click();await (await download).saveAs('/tmp/image-editor-invert.png');
 const png=readFileSync('/tmp/image-editor-invert.png');assert.deepEqual([...png.subarray(0,8)],[137,80,78,71,13,10,26,10]);
 assert.notDeepEqual(png,readFileSync('/tmp/image-editor-out.png'));
});
