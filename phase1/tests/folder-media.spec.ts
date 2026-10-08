import {test,expect} from './fixtures';
import fs from 'node:fs';
import path from 'node:path';
const asset=(n:string)=>fs.readFileSync(path.join(import.meta.dirname,'assets',n)).toString('base64');
// Real OPFS directory in Chromium; only the picker is replaced.
test('folder media: png and pdf from an opened folder appear under Previews, fake and duplicate names are reported',async({page})=>{
 const files={png:asset('red.png'),pdf:asset('doc.pdf'),fake:asset('fake.png')};
 await page.addInitScript((f)=>{(window as any).showDirectoryPicker=async()=>{const root=await navigator.storage.getDirectory();const dir=await root.getDirectoryHandle('somnia-media-'+Math.random().toString(36).slice(2),{create:true});
  const put=async(d:any,name:string,data:string|Uint8Array)=>{const h=await d.getFileHandle(name,{create:true});const w=await h.createWritable();await w.write(data);await w.close();};
  const bin=(b:string)=>Uint8Array.from(atob(b),c=>c.charCodeAt(0));
  await put(dir,'index.html','<!doctype html><html><head><title>T</title></head><body><h1>With media</h1></body></html>');
  const img=await dir.getDirectoryHandle('img',{create:true});const other=await dir.getDirectoryHandle('other',{create:true});
  await put(dir,'notes.md','# Notes\n\n![a](img/red.png)\n\n![b](other/red.png)\n');
  await put(img,'red.png',bin(f.png));await put(other,'red.png',bin(f.png));await put(dir,'doc.pdf',bin(f.pdf));await put(dir,'fake.png',bin(f.fake));
  (window as any).__dir=dir;return dir;};},files);
 page.on('dialog',d=>void d.accept());
 await page.goto('/');
 await page.keyboard.press('Control+k');await page.getByRole('combobox',{name:'Search commands'}).fill('open folder');await page.getByRole('option',{name:/Open folder/}).click();
 const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h1')).toHaveText('With media');
 await expect(page.locator('span[role=status]')).toContainText('3 of 4 media files loaded');
 await page.getByRole('button',{name:'Files'}).click();
 await expect(page.getByRole('button',{name:'Preview img/red.png',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Preview other/red.png',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Preview doc.pdf',exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'Preview fake.png',exact:true})).toHaveCount(0);
 // The editor stays on the text document until a preview is chosen.
 await expect(page.getByTestId('image-editor-stage')).toHaveCount(0);
 await page.getByRole('button',{name:'Preview img/red.png',exact:true}).click();
 await expect(page.getByTestId('image-editor-stage')).toBeVisible();
 await page.screenshot({path:'test-results/folder-media-png.png'});
 await page.getByRole('tab',{name:'index.html'}).click();await page.getByText('notes.md',{exact:true}).first().click();
 await expect(page.getByTestId('md-preview').locator('img[src^="blob:"]')).toHaveCount(2);
 await page.screenshot({path:'test-results/folder-media-md.png'});
 await page.getByRole('tab',{name:'index.html'}).click();await page.getByRole('button',{name:'Preview doc.pdf',exact:true}).click();
 await expect(page.getByTestId('pdf-frame')).toHaveAttribute('src',/^blob:/);
 await page.screenshot({path:'test-results/folder-media-files.png'});
});
