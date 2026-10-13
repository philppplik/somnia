// Real engine correctness gate. Never expected-fail, skip, or route engine calls to doubles.
import {test,expect} from '@playwright/test';
import type {Page} from '@playwright/test';
import {readFileSync} from 'node:fs';
import {unzipSync,strFromU8} from 'fflate';
const docx=readFileSync(new URL('../documents/sample.docx',import.meta.url));
const xlsx=readFileSync(new URL('../../sheets-craft/fixtures/fixture.xlsx',import.meta.url));
test.beforeEach(async({page})=>{
 const pkg=JSON.parse(readFileSync(new URL('../../package.json',import.meta.url),'utf8'));
 await page.addInitScript(r=>{localStorage.setItem('somnia.locale.v1','en');localStorage.setItem('somnia.welcome.seen.v1',r);localStorage.removeItem('somnia.fixture');},pkg.somniaRelease);
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
});
async function add(page:Page,name:string,bytes:Buffer){
 await page.evaluate(async({name,bytes})=>{
  // Vite dev-only import. Same public file-intake path used by a file picker, real bytes.
  const m=await import('/src/lib/media.ts');
  const result=await m.addMediaFile(new Blob([new Uint8Array(bytes)]),name);
  if('error' in result)throw Error(result.error);
 },{name,bytes:[...bytes]});
}
async function select(page:Page,name:string){await page.evaluate(async name=>(await import('/src/lib/media.ts')).setActiveMedia(name),name);}
async function studio(page:Page,label:string){await page.getByRole('radio',{name:label,exact:true}).click();}
async function docReady(page:Page,name?:string){if(name)await expect(page.getByTestId('documents-name')).toHaveText(name);await expect.poll(()=>page.evaluate(async()=>(await import('/src/lib/documents/store.ts')).getDocumentsState().status)).toBe('ready');await expect(page.getByTestId('documents-page').first().locator('img')).toBeVisible();}
async function docState(page:Page){return page.evaluate(async()=>(await import('/src/lib/documents/store.ts')).getDocumentsState());}

test('Documents accepted edits, dirty, history and export survive studio and document-tab remount',async({page})=>{
 await add(page,'retention-a.docx',docx);await studio(page,'Somnia Documents');await docReady(page);
 const original=(await docState(page)).blocks.find(b=>b.editable&&b.text!==undefined)!;
 const accepted='Retention accepted Ä 😀';
 await page.evaluate(async({index,text})=>{await (await import('/src/lib/documents/session.ts')).editParagraph(index,text);},{index:original.index,text:accepted});
 expect((await docState(page)).edited).toBe(true);expect((await docState(page)).canUndo).toBe(true);
 await studio(page,'Somnia Code');
 // A hidden dirty file must not silently become clean.
 expect((await docState(page)).edited).toBe(true);
 await studio(page,'Somnia Documents');await docReady(page);
 expect((await docState(page)).blocks.find(b=>b.index===original.index)?.text).toBe(accepted);
 await add(page,'retention-b.docx',docx);await docReady(page,'retention-b.docx');
 await select(page,'retention-a.docx');await docReady(page,'retention-a.docx');
 expect((await docState(page)).blocks.find(b=>b.index===original.index)?.text).toBe(accepted);
 expect((await docState(page)).edited).toBe(true);expect((await docState(page)).canUndo).toBe(true);
 await page.getByTestId('documents-undo').click();
 await expect.poll(async()=>(await docState(page)).blocks.find(b=>b.index===original.index)?.text).toBe(original.text);
 await page.getByTestId('documents-redo').click();
 await expect.poll(async()=>(await docState(page)).blocks.find(b=>b.index===original.index)?.text).toBe(accepted);
 const saved=await page.evaluate(async()=>{const e=(await import('/src/lib/documents/session.ts')).getEngine();if(!e)throw Error('No live engine');return [...await e.save()];});
 const zip=unzipSync(new Uint8Array(saved));expect(strFromU8(zip['word/document.xml'])).toContain(accepted);
 await add(page,'retention-export.docx',Buffer.from(saved));await docReady(page);
 expect((await docState(page)).blocks.some(b=>b.text===accepted)).toBe(true);
});

test('Sheets accepted cell, global dirty guard, undo/redo and export survive studio and workbook-tab remount',async({page})=>{
 await add(page,'retention-a.xlsx',xlsx);await studio(page,'Somnia Sheets');
 const cell=page.locator('[data-address=B2]');await expect(cell).toHaveText('2');
 await cell.click();await page.getByTestId('sheets-formula').fill('7');await page.getByTestId('sheets-formula').press('Enter');
 await expect(cell).toHaveText('7');await expect(page.getByTestId('sheets-dirty')).toBeVisible();
 await studio(page,'Somnia Code');
 expect(await page.evaluate(async()=>(await import('/src/lib/sheets/session.ts')).sheetsIsDirty('retention-a.xlsx'))).toBe(true);
 await studio(page,'Somnia Sheets');await expect(cell).toHaveText('7');
 await add(page,'retention-b.xlsx',xlsx);await expect(cell).toHaveText('2');
 await select(page,'retention-a.xlsx');await expect(cell).toHaveText('7');await expect(page.getByTestId('sheets-dirty')).toBeVisible();
 const region=page.getByRole('region',{name:/^Workbook/});
 await region.getByRole('button',{name:'Undo',exact:true}).click();await expect(cell).toHaveText('2');
 await region.getByRole('button',{name:'Redo',exact:true}).click();await expect(cell).toHaveText('7');
 const downloaded=page.waitForEvent('download');await page.getByTestId('sheets-export').click();const download=await downloaded;
 const path=await download.path();if(!path)throw Error('No download bytes');const bytes=readFileSync(path);
 const zip=unzipSync(new Uint8Array(bytes));expect(Object.keys(zip)).toContain('xl/workbook.xml');
 await add(page,'retention-export.xlsx',bytes);await expect(cell).toHaveText('7');
});
