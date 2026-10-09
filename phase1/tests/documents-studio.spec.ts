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
 await expect(page.getByTestId('documents-start')).toBeVisible();await page.screenshot({path:shot('empty')});
 await page.keyboard.press('Control+1');await expect(page.getByRole('radio',{name:'Somnia Code'})).toHaveAttribute('aria-checked','true');
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByTestId('docx-frame')).toBeVisible();
 await expect(page.getByRole('radio',{name:'Somnia Code'})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Control+2');await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 await expect(page.getByTestId('documents-inspector')).toBeVisible();await expect(page.getByTestId('documents-info-pages')).toHaveText('1');
 await page.screenshot({path:shot('inspector')});
});

test('edit a paragraph, undo/redo, tables stay locked, save a copy contains the edit',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const editor=page.getByTestId('documents-editor');await expect(editor).toBeVisible();
 await expect(page.getByTestId('documents-block-locked').first()).toContainText('table');
 const first=editor.getByRole('textbox').first();const old=await first.inputValue();
 await first.fill('Geändert: '+old);await first.blur();
 await expect(page.getByTestId('documents-undo')).toBeEnabled();
 await expect.poll(async()=>(await first.inputValue()).startsWith('Geändert: ')).toBe(true);
 await expect(page.getByTestId('documents-edit-error')).toHaveCount(0);
 await page.waitForTimeout(400);await page.screenshot({path:shot('edited')});
 await page.getByTestId('documents-undo').click();await expect.poll(()=>first.inputValue()).toBe(old);
 await expect(page.getByTestId('documents-redo')).toBeEnabled();
 await page.getByTestId('documents-redo').click();await expect.poll(()=>first.inputValue()).toBe('Geändert: '+old);
 const download=page.waitForEvent('download');await page.getByTestId('documents-save-copy').click();
 const d=await download;expect(d.suggestedFilename()).toBe('sample (Somnia copy).docx');
 const out=readFileSync((await d.path())!);
 await openBuffers(page,[{name:'copy.docx',mimeType:DOCX,buffer:out}]);
 await expect(page.getByTestId('documents-name')).toHaveText('copy.docx');
 await expect(page.getByTestId('documents-editor').getByRole('textbox').first()).toHaveValue('Geändert: '+old);
 await page.screenshot({path:shot('edited-copy')});
});
test('two far-apart changes in one paragraph apply as one undoable edit; heading keeps its bold',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const first=page.getByTestId('documents-editor').getByRole('textbox').first();const old=await first.inputValue();
 const next='Neu: '+old.replace('worker','Somnia')+' (final)';
 await first.fill(next);await first.blur();
 await expect.poll(()=>first.inputValue()).toBe(next);await expect(page.getByTestId('documents-edit-error')).toHaveCount(0);
 const img=page.getByTestId('documents-page').first().locator('img');
 await expect.poll(()=>img.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth)).toBeGreaterThan(300);await page.waitForTimeout(400);
 await page.getByTestId('documents-page').first().screenshot({path:shot('format-kept')});
 await page.getByTestId('documents-undo').click();await expect.poll(()=>first.inputValue()).toBe(old);
 await expect(page.getByTestId('documents-undo')).toBeDisabled();
});
test('on-page caret: click, type, select, delete, undo as one step; tables are locked',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const pg=page.getByTestId('documents-page').first();const img=pg.locator('img');
 await expect.poll(()=>img.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth)).toBeGreaterThan(300);
 const box=(await pg.boundingBox())!;const first=page.getByTestId('documents-editor').getByRole('textbox').first();const old=await first.inputValue();
 // second paragraph text line (y ~ 86 of 842 on the page), click near its start
 const second=page.getByTestId('documents-editor').getByRole('textbox').nth(1);const old2=await second.inputValue();
 await page.mouse.click(box.x+box.width*0.125,box.y+box.height*0.127);
 await expect(page.getByTestId('documents-caret')).toBeVisible();
 await expect(page.getByTestId('documents-input')).toBeFocused();
 await page.keyboard.type('Hey ');
 await expect.poll(()=>second.inputValue()).toBe('Hey '+old2);
 await expect(page.getByTestId('documents-caret')).toBeVisible();
 await page.keyboard.press('Backspace');
 await expect.poll(()=>second.inputValue()).toBe('Hey'+old2);
 await page.keyboard.press('Shift+ArrowRight');await page.keyboard.press('Shift+ArrowRight');
 await expect(page.getByTestId('documents-selection').first()).toBeVisible();
 await page.getByTestId('documents-page').first().screenshot({path:shot('caret-selection')});
 await page.keyboard.type('X');
 await expect.poll(()=>second.inputValue()).toBe('HeyX'+old2.slice(2));
 await page.keyboard.press('ArrowLeft');await page.keyboard.press('Home');
 await page.keyboard.type('>');
 await expect.poll(()=>second.inputValue()).toBe('>HeyX'+old2.slice(2));
 for(let i=0;i<6;i++){if(await page.getByTestId('documents-undo').isDisabled())break;await page.getByTestId('documents-undo').click();await page.waitForTimeout(150);}
 await expect.poll(()=>second.inputValue()).toBe(old2);expect(await first.inputValue()).toBe(old);
 // table row is locked
 const b2=(await pg.boundingBox())!;await page.mouse.click(b2.x+b2.width*0.15,b2.y+b2.height*0.19);
 await expect(page.getByTestId('documents-caret-locked')).toBeVisible();await expect(page.getByTestId('documents-caret')).toHaveCount(0);
});
test('Enter splits a paragraph, Backspace at its start joins it again, undo/redo walk both steps',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const pg=page.getByTestId('documents-page').first();const img=pg.locator('img');
 await expect.poll(()=>img.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth)).toBeGreaterThan(300);
 const boxes=page.getByTestId('documents-editor').getByRole('textbox');const n=await boxes.count();const old2=await boxes.nth(1).inputValue();
 const b=(await pg.boundingBox())!;await page.mouse.click(b.x+b.width*0.2,b.y+b.height*0.127);
 await expect(page.getByTestId('documents-caret')).toBeVisible();
 await page.keyboard.press('Enter');
 await expect(boxes).toHaveCount(n+1);
 const a1=await boxes.nth(1).inputValue(),a2=await boxes.nth(2).inputValue();expect(a1.length).toBeGreaterThan(0);expect(a1+a2).toBe(old2);
 await page.getByTestId('documents-page').first().screenshot({path:shot('split')});
 await page.keyboard.type('Z');await expect.poll(()=>boxes.nth(2).inputValue()).toBe('Z'+a2);
 await page.keyboard.press('Home');await page.keyboard.press('Backspace');
 await expect(boxes).toHaveCount(n);await expect.poll(()=>boxes.nth(1).inputValue()).toBe(a1+'Z'+a2);
 for(let i=0;i<5;i++){if(await page.getByTestId('documents-undo').isDisabled())break;await page.getByTestId('documents-undo').click();await page.waitForTimeout(200);}
 await expect(boxes).toHaveCount(n);await expect.poll(()=>boxes.nth(1).inputValue()).toBe(old2);
 await page.getByTestId('documents-redo').click();await expect(boxes).toHaveCount(n+1);
 await expect(page.getByTestId('documents-edit-error')).toHaveCount(0);
});
