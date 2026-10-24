import {test,expect} from './fixtures';
import {readFileSync,mkdirSync} from 'node:fs';
const shot=(n:string)=>{mkdirSync('/tmp/wave1-shots',{recursive:true});return `/tmp/wave1-shots/${n}.png`;};
const XLSX='application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const XFIX=readFileSync('sheets-craft/fixtures/fixture.xlsx');
const DFIX=readFileSync('test/documents/sample.docx');
async function openMedia(page:any,files:{name:string;mimeType:string;buffer:Buffer}[]){const chooser=page.waitForEvent('filechooser');await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('project.openMedia');});(await chooser).setFiles(files);}

test('sheets: CSV/TSV import dialog',async({page})=>{
  await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
  await openMedia(page,[{name:'fixture.xlsx',mimeType:XLSX,buffer:XFIX}]);
  await page.getByRole('radio',{name:'Somnia Sheets'}).click();
  await expect(page.getByTestId('sheets-grid')).toBeVisible();
  await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');await m.executeCommand('sheets.importCsv');});
  await page.waitForTimeout(800);
  await page.screenshot({path:shot('sheets-csv-import-dialog')});
});

test('slides: PDF export button in deck panel + header export popover',async({page})=>{
  await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
  await page.getByRole('radio',{name:'Slides',exact:true}).click();
  await page.getByLabel('Open PPTX',{exact:true}).setInputFiles('slides-engine/fixtures/independent.pptx');
  await expect(page.getByAltText('Slide 1',{exact:true})).toBeVisible({timeout:30000});
  await expect(page.getByRole('region',{name:'Slide preview'})).toHaveAttribute('aria-busy','false');
  const pdfBtn=page.getByRole('button',{name:'Export slides as PDF'});
  if(await pdfBtn.count()){await pdfBtn.scrollIntoViewIfNeeded();}
  await page.screenshot({path:shot('slides-pdf-button'),fullPage:false});
  const iconBtn=page.locator('button').filter({hasText:/icon|Symbol/i});
  if(await iconBtn.count()){await iconBtn.first().click();await page.waitForTimeout(400);await page.screenshot({path:shot('slides-icon-picker')});}
});

test('documents: footnote and caption buttons in the format bar',async({page})=>{
  await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
  await openMedia(page,[{name:'sample.docx',mimeType:DOCX,buffer:DFIX}]);
  await page.getByRole('radio',{name:'Somnia Documents'}).click();
  await expect(page.getByTestId('documents-name')).toHaveText('sample.docx');
  await page.waitForTimeout(800);
  await page.screenshot({path:shot('documents-footnote-caption-buttons')});
});
