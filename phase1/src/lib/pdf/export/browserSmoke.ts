/** Optional local Chrome integration: npx tsx src/lib/pdf/export/browserSmoke.ts */
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
const output=process.env.PDF_EXPORT_ARTIFACTS;
if(output)mkdirSync(output,{recursive:true});
const html=resolve('.pdf-export-smoke.html'),entry=resolve('.pdf-export-smoke.tsx');
writeFileSync(html,'<!doctype html><html lang="en"><meta charset="utf-8"><title>PDF export preview</title><style>body{background:#0c111a;margin:24px;display:flex;justify-content:center}#root{width:640px}</style><div id="root"></div><script type="module" src="/.pdf-export-smoke.tsx"></script></html>');
writeFileSync(entry,`import React from 'react';
import {createRoot} from 'react-dom/client';
import {PDFDocument,StandardFonts} from 'pdf-lib';
import {PdfExportPanel} from './src/lib/pdf/export/PdfExportPanel';
import {browserPdfRenderer} from './src/lib/pdf/export/browserRenderer';
const doc=await PDFDocument.create();const font=await doc.embedFont(StandardFonts.Helvetica);doc.addPage([300,200]).drawText('Browser export fixture',{x:20,y:100,size:18,font});const bytes=await doc.save();
const locale=new URLSearchParams(location.search).get('locale')??'en';
createRoot(document.getElementById('root')!).render(<PdfExportPanel bytes={bytes} locale={locale as any} environment={{canvas:true}} renderer={browserPdfRenderer} onExport={result=>{(window as any).lastExport={size:result.bytes.length,rasterized:result.rasterized};}}/>);`);
const server=await createServer({configFile:false,server:{host:'127.0.0.1',port:5199},esbuild:{jsx:'automatic'}});
let browser;
try {
  await server.listen();
  browser=await chromium.launch({executablePath:process.env.CHROME_PATH??'/usr/bin/google-chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1000,height:1100}}),errors:string[]=[];
  page.on('pageerror',e=>errors.push(e.message));
  for(const locale of ['en','de','es','fr','pt-BR']) {
    await page.goto(`http://127.0.0.1:5199/.pdf-export-smoke.html?locale=${locale}`);await page.locator('h2').waitFor();
    if(output)await page.screenshot({path:`${output}/ui-${locale}.png`,fullPage:true});
    if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error(`${locale}: overflow`);
  }
  await page.goto('http://127.0.0.1:5199/.pdf-export-smoke.html');await page.locator('h2').waitFor();
  await page.getByRole('button',{name:'Export copy'}).click();await page.getByRole('status').waitFor({timeout:25000});
  const print=await page.evaluate(()=>(window as unknown as {lastExport:{size:number;rasterized:boolean}}).lastExport);
  if(!print.size || print.rasterized)throw Error('Print worker failed');
  await page.getByRole('radio',{name:'Screen - JPEG pages'}).check();
  await page.getByRole('button',{name:'Export copy'}).click();await page.getByRole('status').waitFor({timeout:25000});
  const screen=await page.evaluate(()=>(window as unknown as {lastExport:{size:number;rasterized:boolean}}).lastExport);
  if(!screen.size || !screen.rasterized)throw Error('Browser screen render failed');
  await page.setViewportSize({width:375,height:1200});
  if(output)await page.screenshot({path:`${output}/ui-mobile.png`,fullPage:true});
  if(await page.evaluate(()=>document.documentElement.scrollWidth>window.innerWidth))throw Error('Mobile overflow');
  if(errors.length)throw Error(errors.join('\n'));
  console.log('PASS: five locales, print Worker, browser screen renderer, mobile layout', {print,screen});
} finally {
  await browser?.close();await server.close();unlinkSync(html);unlinkSync(entry);
}
