import {test,expect} from './fixtures';
import {join} from 'node:path';
import {mkdirSync} from 'node:fs';
const artifacts=join('test-results','studio-inline');
test('PDF keeps its inline pages and properties after a Code studio request',async({page})=>{
 await page.goto('/');await expect(page.locator('[data-storage]')).toBeVisible();
 const chooser=page.waitForEvent('filechooser');
 await page.evaluate(async()=>{const {executeCommand}=await import('/src/lib/commands.ts');void executeCommand('project.openMedia');});
 await (await chooser).setFiles(join(import.meta.dirname,'assets','doc.pdf'));
 await expect(page.getByTestId('media-name')).toHaveText('doc.pdf',{timeout:20000});
 const before=await page.evaluate(async()=>{const {getState,requestStudio}=await import('/src/store/appStore.ts');const {getMedia}=await import('/src/lib/media.ts');const s=getState();requestStudio('code');return {revision:s.revision,dirty:s.isDirty,media:getMedia().active};});
 const after=await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts');const {getMedia}=await import('/src/lib/media.ts');return {revision:getState().revision,dirty:getState().isDirty,media:getMedia().active};});
 expect(after).toEqual(before);await expect(page.getByTestId('studio-view-context')).toHaveCount(0);
 await expect(page.getByLabel('PDF pages and search',{exact:true})).toBeVisible();
 await expect(page.getByLabel('PDF properties',{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Edit PDF',exact:true})).toBeVisible();
 await page.evaluate(()=>document.fonts.ready);mkdirSync(artifacts,{recursive:true});await page.screenshot({path:join(artifacts,'pdf-inline.png')});
});
