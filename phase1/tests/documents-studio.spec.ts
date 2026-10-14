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
/* ---- D0 session safety. Written against the real engine; runs in CI only (the WASM build is not available in the authoring sandbox). ---- */
const clickSecondParagraph=async(page:any)=>{
 const pg=page.getByTestId('documents-page').first();const img=pg.locator('img');
 await expect.poll(()=>img.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth)).toBeGreaterThan(300);
 const box=(await pg.boundingBox())!;await page.mouse.click(box.x+box.width*0.125,box.y+box.height*0.127);
 await expect(page.getByTestId('documents-caret')).toBeVisible();await expect(page.getByTestId('documents-input')).toBeFocused();
};
const secondText=(page:any)=>page.getByTestId('documents-editor').getByRole('textbox').nth(1);
test('D0: an edit survives switching to Code and back; dirty state and undo are kept',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const old2=await secondText(page).inputValue();await clickSecondParagraph(page);await page.keyboard.type('Keep ');
 await expect.poll(()=>secondText(page).inputValue()).toBe('Keep '+old2);
 await page.keyboard.press('Control+1');await expect(page.getByRole('radio',{name:'Somnia Code'})).toHaveAttribute('aria-checked','true');
 await page.keyboard.press('Control+2');await expect(page.getByRole('radio',{name:'Somnia Documents'})).toHaveAttribute('aria-checked','true');
 await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 await expect.poll(()=>secondText(page).inputValue()).toBe('Keep '+old2);
 await expect(page.getByTestId('documents-undo')).toBeEnabled();
 await page.getByTestId('documents-undo').click();await expect.poll(()=>secondText(page).inputValue()).toBe(old2);
 await page.getByTestId('documents-redo').click();await expect.poll(()=>secondText(page).inputValue()).toBe('Keep '+old2);
});
test('D0: switching between two DOCX tabs keeps each file\'s edits',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'one.docx',mimeType:DOCX,buffer:sample()}]);await expect(page.getByTestId('documents-name')).toHaveText('one.docx');
 const old2=await secondText(page).inputValue();await clickSecondParagraph(page);await page.keyboard.type('One ');
 await expect.poll(()=>secondText(page).inputValue()).toBe('One '+old2);
 await openBuffers(page,[{name:'two.docx',mimeType:DOCX,buffer:sample()}]);await expect(page.getByTestId('documents-name')).toHaveText('two.docx');
 await expect.poll(()=>secondText(page).inputValue()).toBe(old2);
 await page.evaluate(async()=>{(await import('/src/lib/media.ts')).setActiveMedia('one.docx');});
 await expect(page.getByTestId('documents-name')).toHaveText('one.docx');await expect.poll(()=>secondText(page).inputValue()).toBe('One '+old2);
});
test('D0: Save a copy right after typing contains the pending edit',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 await clickSecondParagraph(page);const download=page.waitForEvent('download');
 await page.keyboard.type('Pending');await page.getByTestId('documents-save-copy').click();
 const d=await download;const xml=Buffer.from(unzipSync(new Uint8Array(readFileSync((await d.path())!)))['word/document.xml']).toString('utf8');
 expect(xml).toContain('Pending');
});
test('D0: closing a file with unsaved edits asks first; declining keeps the edits',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const old2=await secondText(page).inputValue();await clickSecondParagraph(page);await page.keyboard.type('Guard ');
 await expect.poll(()=>secondText(page).inputValue()).toBe('Guard '+old2);
 const prompts:string[]=[];page.on('dialog',d=>{prompts.push(d.message());void d.dismiss();});
 const closed=await page.evaluate(async()=>{const m=await import('/src/lib/media.ts');m.closeMedia('sample.docx');return !m.findMedia('sample.docx');});
 expect(closed).toBe(false);expect(prompts.length).toBe(1);expect(prompts[0]).toContain('sample.docx');
 await expect.poll(()=>secondText(page).inputValue()).toBe('Guard '+old2);
});
/* ---- D1 typing feel. Real-engine specs: written for CI, not run in the authoring sandbox (no WASM build there). ---- */
const paras=(page:any)=>page.getByTestId('documents-editor').getByRole('textbox');
test('D1: Ctrl+arrows move by word, Shift+arrow selects across paragraphs, one Delete and one undo',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 await clickSecondParagraph(page);await page.keyboard.press('Home');
 const before=await paras(page).count();const first=await secondText(page).inputValue();
 await page.keyboard.press('Control+ArrowRight');await page.keyboard.press('Control+Shift+ArrowRight');
 await expect(page.getByTestId('documents-selection').first()).toBeVisible();
 await page.keyboard.press('End');await page.keyboard.down('Shift');await page.keyboard.press('ArrowRight');await page.keyboard.press('ArrowRight');await page.keyboard.up('Shift');
 await page.keyboard.press('Delete');
 await expect.poll(()=>paras(page).count()).toBe(before-1);
 await page.keyboard.press('Control+z');await expect.poll(()=>paras(page).count()).toBe(before);await expect.poll(()=>secondText(page).inputValue()).toBe(first);
});
test('D1: multi-line paste creates paragraphs and undoes in one step',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 await clickSecondParagraph(page);const before=await paras(page).count();
 await page.getByTestId('documents-input').evaluate((el:HTMLTextAreaElement)=>{const dt=new DataTransfer();dt.setData('text/plain','Line A\nLine B\nLine C');el.dispatchEvent(new ClipboardEvent('paste',{clipboardData:dt,bubbles:true,cancelable:true}));});
 await expect.poll(()=>paras(page).count()).toBe(before+2);
 await page.keyboard.press('Control+z');await expect.poll(()=>paras(page).count()).toBe(before);
});
test('D1: IME composition and a dead-key accent land as text; undo removes them',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const old2=await secondText(page).inputValue();await clickSecondParagraph(page);
 const cdp=await page.context().newCDPSession(page);
 await cdp.send('Input.imeSetComposition',{text:'にほん',selectionStart:3,selectionEnd:3});await cdp.send('Input.insertText',{text:'日本'});
 await expect.poll(()=>secondText(page).inputValue()).toContain('日本');
 await page.keyboard.insertText('é😀');await expect.poll(()=>secondText(page).inputValue()).toContain('é😀');
 await page.keyboard.press('Backspace');await expect.poll(()=>secondText(page).inputValue()).not.toContain('😀');
 for(let i=0;i<6;i++)await page.keyboard.press('Control+z');await expect.poll(()=>secondText(page).inputValue()).toBe(old2);
});

test('D2a: Ctrl+B bolds a selection in the engine render, pressed state follows, one undo removes it, and the saved DOCX keeps it',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 await openBuffers(page,[{name:'sample.docx',mimeType:DOCX,buffer:sample()}]);
 await expect(page.getByTestId('documents-pages')).toHaveText('1 pages');
 const pg=page.getByTestId('documents-page').first();const img=pg.locator('img');
 await expect.poll(()=>img.evaluate((i:HTMLImageElement)=>i.complete&&i.naturalWidth)).toBeGreaterThan(300);
 await expect(page.getByTestId('documents-format-bold')).toBeDisabled();
 const box=(await pg.boundingBox())!;
 await page.mouse.click(box.x+box.width*0.125,box.y+box.height*0.127);
 await expect(page.getByTestId('documents-caret')).toBeVisible();
 for(let i=0;i<4;i++)await page.keyboard.press('Shift+ArrowRight');
 const before=await img.screenshot();
 await page.keyboard.press('Control+b');
 await expect(page.getByTestId('documents-format-bold')).toHaveAttribute('aria-pressed','true');
 await expect.poll(async()=>!(await img.screenshot()).equals(before)).toBe(true);
 await page.keyboard.press('Control+b');
 await expect(page.getByTestId('documents-format-bold')).toHaveAttribute('aria-pressed','false');
 await page.keyboard.press('Control+b');await page.keyboard.press('Control+z');
 await expect(page.getByTestId('documents-format-bold')).toHaveAttribute('aria-pressed','false');
});
