/** Reproduce the checked Chromium screenshots without the unrelated desktop/craft build. */
import { createServer } from 'vite';
import { chromium } from 'playwright-core';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const output=process.env.PDF_INSPECTION_OUTPUT??'/tmp/somnia-pdf-import-inspection';
await mkdir(output,{recursive:true});
const server=await createServer({root,configFile:false,server:{host:'127.0.0.1',port:5187,strictPort:true}});
let browser;
try {
  await server.listen();
  browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1320,height:760},deviceScaleFactor:1});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto('http://127.0.0.1:5187/src/lib/pdf/inspection.html');
  await page.waitForFunction(()=>window.__inspectionReady===1);
  await page.screenshot({path:path.join(output,'pdf-import-page-1.png'),fullPage:true});
  await page.getByRole('button',{name:'Page 2',exact:true}).click();
  await page.waitForFunction(()=>window.__inspectionReady===2);
  await page.screenshot({path:path.join(output,'pdf-import-page-2.png'),fullPage:true});
  const summary=await page.evaluate(()=>window.__importedPdf.pages.map(p=>({page:p.number,text:p.text.length,vectors:p.vectors.length,images:p.images.length,thumbnail:!!p.thumbnail})));
  console.log(JSON.stringify({errors,summary,output},null,2));
  if(errors.length)throw Error('Chromium reported a page error.');
} finally {await browser?.close();await server.close();}
