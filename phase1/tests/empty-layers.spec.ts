import {test,expect} from './fixtures';
test.use({sample:false});
const sidebar=(page:import('@playwright/test').Page)=>page.getByRole('complementary',{name:'Project sidebar'});
async function expectEmpty(page:import('@playwright/test').Page){
 await expect(page.getByTestId('layers-empty-state')).toBeVisible();
 await expect(sidebar(page).locator('[data-layer-id]')).toHaveCount(0);
 await expect(sidebar(page).getByText('Demo',{exact:true})).toHaveCount(0);
 await expect(sidebar(page).getByLabel('Filter layers')).toHaveCount(0);
 await expect(sidebar(page).getByText('No matching layers.')).toHaveCount(0);
 await expect(sidebar(page)).not.toContainText('index.html');
}
async function closeProject(page:import('@playwright/test').Page){
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('Close project');await page.getByRole('option',{name:/Close project/}).click();
 const discard=page.getByRole('button',{name:'Discard and close'});if(await discard.isVisible())await discard.click();
 await expectEmpty(page);
}
test('clean launch has no sample layers or phantom file, in light and dark',async({page})=>{
 await page.goto('/');await expectEmpty(page);await expect(page.getByTestId('empty-state')).toBeVisible();
 expect(await page.evaluate(async()=>{const {getState}=await import('/src/store/appStore.ts' as string);const s=getState();return {nodes:s.nodes,activeFile:s.activeFile,designFile:s.designFile,openFiles:s.openFiles};})).toEqual({nodes:[],activeFile:'',designFile:'',openFiles:[]});
 await page.screenshot({path:'tests/artifacts/empty-layers-light.png'});
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('Use dark theme');await page.keyboard.press('Enter');await expect(page.locator('html')).toHaveAttribute('data-theme','dark');await expectEmpty(page);
 await page.screenshot({path:'tests/artifacts/empty-layers-dark.png'});
});
test('blank page exposes document-empty state, filtering and close return to empty',async({page})=>{
 await page.goto('/');await page.getByTestId('empty-state').getByRole('button',{name:'New blank page'}).click();
 await expect(page.getByTestId('layers-empty-state')).toHaveCount(0);await expect(sidebar(page).getByText('No layers in this document.')).toBeVisible();
 await sidebar(page).getByLabel('Filter layers').fill('not-a-layer');await expect(sidebar(page).getByText('No matching layers.')).toBeVisible();
 await closeProject(page);await page.reload();await expectEmpty(page);
});
test('opened HTML file shows its source layers, including selection and no-match filtering',async({page})=>{
 await page.goto('/');const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByTestId('empty-state').getByRole('button',{name:'Open file'}).click()]);
 await chooser.setFiles({name:'hello.html',mimeType:'text/html',buffer:Buffer.from('<html><body><article id="real"><h2>Real document</h2></article></body></html>')});
 await expect(sidebar(page).getByText('hello.html',{exact:true})).toBeVisible();await expect(sidebar(page).getByRole('button',{name:'article',exact:true})).toBeVisible();
 const h2=sidebar(page).getByRole('button',{name:'h2',exact:true});await h2.click();await expect(h2).toHaveAttribute('aria-pressed','true');
 await sidebar(page).getByLabel('Filter layers').fill('missing');await expect(sidebar(page).getByText('No matching layers.')).toBeVisible();await sidebar(page).getByLabel('Filter layers').fill('');
 await page.screenshot({path:'tests/artifacts/empty-layers-open-file.png'});await closeProject(page);
});
test('non-HTML file has an honest no-document state rather than demo rows',async({page})=>{
 await page.goto('/');const [chooser]=await Promise.all([page.waitForEvent('filechooser'),page.getByTestId('empty-state').getByRole('button',{name:'Open file'}).click()]);await chooser.setFiles({name:'styles.css',mimeType:'text/css',buffer:Buffer.from('body { color: red; }')});
 await expect(sidebar(page).getByText('No HTML document open.')).toBeVisible();await expect(sidebar(page).locator('[data-layer-id]')).toHaveCount(0);await expect(page.getByTestId('layers-empty-state')).toHaveCount(0);await closeProject(page);
});
test('folder opened from empty shows source hierarchy',async({page})=>{
 await page.addInitScript(()=>{(window as unknown as {showDirectoryPicker:()=>Promise<unknown>}).showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('layers-folder',{create:true});const file=await dir.getFileHandle('index.html',{create:true});const writer=await file.createWritable();await writer.write('<html><body><article>Folder content</article></body></html>');await writer.close();return dir;};});
 await page.goto('/');await expectEmpty(page);await page.getByTestId('empty-state').getByRole('button',{name:'Open folder'}).click();await expect(sidebar(page).getByRole('button',{name:'article',exact:true})).toBeVisible();await expect(page.getByTestId('layers-empty-state')).toHaveCount(0);await closeProject(page);
});
test('restored draft shows its real layers without an empty-state regression',async({page})=>{
 await page.addInitScript(()=>localStorage.setItem('somnia.draft.v1',JSON.stringify({files:{'restored.html':'<html><body><aside id="saved">Restored</aside></body></html>'},activeFile:'restored.html',openFiles:['restored.html'],savedAt:new Date().toISOString()})));
 await page.goto('/');await expect(sidebar(page).getByRole('button',{name:'aside',exact:true})).toBeVisible();await expect(sidebar(page).getByText('#saved',{exact:true})).toBeVisible();await expect(page.getByTestId('layers-empty-state')).toHaveCount(0);await expect(sidebar(page).getByText('Demo',{exact:true})).toHaveCount(0);
});
