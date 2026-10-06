import {test,expect} from './fixtures';
test.use({sample:false});
test('1000-file folder opens fully, renders bounded rows, scrolls to last file and saves',async({page})=>{
 test.setTimeout(90000);
 await page.addInitScript(()=>{(window as unknown as {showDirectoryPicker:()=>Promise<unknown>}).showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('large-'+crypto.randomUUID(),{create:true});for(let i=0;i<1000;i++){const f=await dir.getFileHandle('page-'+String(i).padStart(4,'0')+'.html',{create:true});const w=await f.createWritable();await w.write('<!doctype html><html><head><title>Large</title></head><body><h1>Page '+i+'</h1></body></html>');await w.close();}(window as unknown as {__dir:unknown}).__dir=dir;return dir;};});
 await page.goto('/');await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('open folder');await page.getByRole('option',{name:/Open folder/}).click();
 await expect(page.getByRole('status')).toContainText('Folder connected in the browser',{timeout:60000});
 await page.getByRole('button',{name:'Files panel',exact:true}).click();const nav=page.getByRole('navigation',{name:'Project files'});const list=page.getByTestId('virtual-project-rows');
 expect(await nav.getByRole('button',{name:/^Open page/}).count()).toBeLessThan(70);
 await list.evaluate(el=>{el.scrollTop=el.scrollHeight;});await nav.getByRole('button',{name:'Open page-0999.html',exact:true}).click();
 const source=page.getByRole('textbox',{name:'Source code'});await expect(source).toContainText('Page 999');await nav.getByRole('button',{name:'Open page-0999.html',exact:true}).focus();await page.keyboard.press('Home');await expect(nav.getByRole('button',{name:'Open page-0000.html',exact:true})).toBeFocused();await page.keyboard.press('End');await expect(nav.getByRole('button',{name:'Open page-0999.html',exact:true})).toBeFocused();await source.fill('<html><body><h1>Saved last file</h1></body></html>');await page.keyboard.press('Control+s');
 await expect.poll(()=>page.evaluate(async()=>{const d=(window as unknown as {__dir:FileSystemDirectoryHandle}).__dir;return (await (await d.getFileHandle('page-0999.html')).getFile()).text();})).toContain('Saved last file');
// screenshot removed: CI has no /downloads directory
});
