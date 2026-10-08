import {test,expect} from './fixtures';
const dir=(page:any)=>page.locator('.workspace').evaluate((e:Element)=>getComputedStyle(e).flexDirection);
test('View menu offers vertical, horizontal and swapped split',async({page})=>{await page.goto('/');
 const pick=async(name:string)=>{await page.getByRole('button',{name:'View',exact:true}).click();await page.getByRole('menuitem',{name:new RegExp(name)}).click();};
 await pick('Split: code and design side by side');expect(await dir(page)).toBe('row');
 await pick('Split: code above');expect(await dir(page)).toBe('column');
 await pick('Split: swap');expect(await dir(page)).toBe('column-reverse');
 await page.reload();await page.locator('body').click({position:{x:2,y:2}});await page.keyboard.press('Control+Alt+2');await expect.poll(()=>dir(page)).toBe('column-reverse');
 await page.keyboard.press('Control+,');await page.getByRole('button',{name:'Shortcuts',exact:true}).click();await expect(page.getByLabel('Keyboard shortcuts')).toContainText('Split: swap code and design');});
