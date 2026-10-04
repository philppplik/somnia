import {test,expect} from '@playwright/test';
test('copy and cut in the code editor put plain text only on the clipboard',async({page})=>{await page.goto('/');await page.keyboard.press('Control+1');
 const ed=page.getByLabel('Source code');await ed.click();await page.keyboard.press('Control+a');await page.keyboard.type('abc');await page.keyboard.press('Control+a');
 const types=await page.evaluate(()=>{const dt=new DataTransfer();const ev=new ClipboardEvent('copy',{clipboardData:dt,cancelable:true,bubbles:true});document.querySelector('.cm-content')!.dispatchEvent(ev);return{types:[...dt.types],text:dt.getData('text/plain'),prevented:ev.defaultPrevented};});
 expect(types).toEqual({types:['text/plain'],text:'abc',prevented:true});
 const cut=await page.evaluate(()=>{const dt=new DataTransfer();document.querySelector('.cm-content')!.dispatchEvent(new ClipboardEvent('cut',{clipboardData:dt,cancelable:true,bubbles:true}));return dt.getData('text/plain');});
 expect(cut).toBe('abc');await expect(page.locator('.cm-line').first()).toHaveText('');});
