import {test,expect} from './fixtures';
import {zipSync,strToU8} from 'fflate';
test('ZIP working copy opens when folder access is unavailable',async({page})=>{
 await page.goto('/?fallback=zip');page.on('dialog',d=>d.accept());await page.waitForTimeout(800);await page.locator('body').click({position:{x:5,y:5}});
 const zip=Buffer.from(zipSync({'index.html':strToU8('<!doctype html><html><body><h1>From zip</h1></body></html>')}));
 await expect(page.locator('[data-storage]')).toBeVisible();
 let chooser:any;await expect(async()=>{const c=page.waitForEvent('filechooser',{timeout:3000});await page.keyboard.press('Control+o');chooser=await c;}).toPass({timeout:25000});
 await chooser.setFiles({name:'site.zip',mimeType:'application/zip',buffer:zip});
 await expect(page.getByText(/Working copy in this browser tab/)).toBeVisible();await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','tab');
 await expect(page.frameLocator('iframe[title="Sandboxed design preview"]').locator('h1')).toHaveText('From zip');
});
test('status bar shows where the project is stored',async({page})=>{await page.goto('/');await expect(page.locator('[data-storage]')).toHaveAttribute('data-storage','memory');await expect(page.getByText('Memory only')).toBeVisible();});
