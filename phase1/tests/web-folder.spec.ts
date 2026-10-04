import {test,expect} from './fixtures';
// Uses a real FileSystemDirectoryHandle from the browser's origin private file system, so createWritable, getFile and entries() run in Chromium. Only the picker is replaced.
test('web folder: open, edit, save writes verified bytes to the folder',async({page})=>{
 await page.addInitScript(()=>{(window as unknown as {showDirectoryPicker:()=>Promise<unknown>}).showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('somnia-e2e-'+Math.random().toString(36).slice(2),{create:true});const f=await dir.getFileHandle('index.html',{create:true});const w=await f.createWritable();await w.write('<!doctype html><html><head><title>T</title></head><body><h1>Folder title</h1></body></html>');await w.close();(window as unknown as {__dir:unknown}).__dir=dir;return dir;};});
  page.on('dialog',d=>void d.accept());
 await page.goto('/');
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('open folder');await page.getByRole('option',{name:/Open folder/}).click();
 const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h1')).toHaveText('Folder title');
 await expect(page.getByRole('status')).toContainText('Folder connected in the browser');
 await page.getByRole('button',{name:'Split view',exact:true}).click();
 const source=page.getByRole('textbox',{name:'Source code'});const original=await source.innerText();
 await source.fill(original.replace('Folder title','Saved from browser'));
 await page.keyboard.press('Control+s');
 await expect.poll(()=>page.evaluate(async()=>{const dir=(window as unknown as {__dir:FileSystemDirectoryHandle}).__dir;return await (await (await dir.getFileHandle('index.html')).getFile()).text();}),{timeout:10000}).toContain('Saved from browser');
 await expect(page.getByText('Unsaved changes')).toHaveCount(0);
});
