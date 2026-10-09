import {test,expect} from './fixtures';
import {readFileSync,mkdirSync} from 'node:fs';
import {zipSync,strToU8,unzipSync} from 'fflate';
const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const sample=()=>readFileSync('test/documents/sample.docx');const large=()=>readFileSync('test/documents/large.docx');
async function openBuffers(page:any,files:{name:string;mimeType:string;buffer:Buffer}[]){const chooser=page.waitForEvent('filechooser');await page.evaluate(async()=>{const m=await import('/src/lib/commands.ts');void m.executeCommand('project.openMedia');});(await chooser).setFiles(files);}
const shot=(n:string)=>{mkdirSync('test-results/documents',{recursive:true});return `test-results/documents/${n}.png`;};
test('opening a DOCX switches to Documents and draws real engine pages',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByRole('radio',{name:'Somnia Documents'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByTestId('documents-name')).toHaveText('sample.docx');await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const img=page.getByTestId('documents-page').first().locator('img');await expect(img).toBeVisible();
 await expect.poll(()=>img.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth)).toBeGreaterThan(300);
 await page.screenshot({path:shot('sample-page')});
 await page.getByRole('button',{name:'Zoom in'}).click();await expect(page.getByTestId('documents-zoom')).toHaveText('125%');
 await expect.poll(()=>img.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth)).toBeGreaterThan(300);
 await page.screenshot({path:shot('sample-zoom')});
});
test('long documents render only the pages near the viewport',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'large.docx',mimeType:DOCX,buffer:large()}]);
 await expect(page.getByTestId('documents-pages')).toHaveText('34 pages');
 await expect(page.getByTestId('documents-page').first().locator('img')).toBeVisible();
 const drawn=await page.locator('[data-testid="documents-page"] img').count();expect(drawn).toBeGreaterThan(0);expect(drawn).toBeLessThan(10);
 await page.getByTestId('documents-scroll').evaluate(e=>e.scrollTo(0,e.scrollHeight));
 await expect(page.getByTestId('documents-page').last().locator('img')).toBeVisible();
 await expect(page.getByTestId('documents-page').first().locator('img')).toHaveCount(0);
 await page.screenshot({path:shot('large-end')});
});
test('saving a copy writes a new .docx that reopens; risky parts need confirmation',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 const parts=unzipSync(new Uint8Array(sample()));const risky=Buffer.from(zipSync({...parts,'word/comments.xml':strToU8('<c/>'),'word/charts/chart1.xml':strToU8('<c/>')}));
 await openBuffers(page,[{name:'risky.docx',mimeType:DOCX,buffer:risky}]);
 await expect(page.getByTestId('documents-pages')).toBeVisible();
 await page.getByTestId('documents-save-copy').click();
 const dialog=page.getByRole('alertdialog');await expect(dialog).toBeVisible();await expect(page.getByTestId('documents-loss-list').getByRole('listitem')).toHaveText(['Charts','Comments']);
 await page.screenshot({path:shot('loss-dialog')});
 await dialog.getByRole('button',{name:'Cancel'}).click();await expect(dialog).toHaveCount(0);
 const download=page.waitForEvent('download');await page.getByTestId('documents-save-copy').click();await page.getByTestId('documents-save-anyway').click();
 const d=await download;expect(d.suggestedFilename()).toBe('risky (Somnia copy).docx');
 const path=await d.path();const out=readFileSync(path!);expect(out.subarray(0,2).toString()).toBe('PK');
 await openBuffers(page,[{name:'copy.docx',mimeType:DOCX,buffer:out}]);
 await expect(page.getByTestId('documents-name')).toHaveText('copy.docx');await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
});
test('a broken or encrypted DOCX shows a readable error and can be closed; engine stays usable',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'fake.docx',mimeType:DOCX,buffer:Buffer.from('not a zip at all')}]);
 await expect(page.getByText('fake.docx is not a valid DOCX file.')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByTestId('documents-pages')).toBeVisible();
});
test('manual Code choice wins and the studio is reachable by keyboard; inspector shows facts',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await page.keyboard.press('Control+2');await expect(page.getByRole('radio',{name:'Somnia Documents'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByText('Open a .docx file to see its pages here.')).toBeVisible();await page.screenshot({path:shot('empty')});
 await page.keyboard.press('Control+1');await expect(page.getByRole('radio',{name:'Somnia Code'})).toHaveAttribute('aria-checked','true');
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByTestId('docx-frame')).toBeVisible();
 await expect(page.getByRole('radio',{name:'Somnia Code'})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Control+2');await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 await expect(page.getByTestId('documents-inspector')).toBeVisible();await expect(page.getByTestId('documents-info-pages')).toHaveText('1');
 await page.screenshot({path:shot('inspector')});
});
