import {test,expect} from './fixtures';
test('wrap an element in a div and unwrap it again, each one undo step',async({page})=>{await page.goto('/');
 await page.evaluate(()=>(window as any).__somnia.setSource('index.html','<!doctype html><html><head><title>t</title></head><body><section><h2>A</h2><p>B</p></section></body></html>'));const frame=page.frameLocator('iframe[title="Sandboxed design preview"]');await expect(frame.locator('h2')).toHaveCount(1);
 await page.getByRole('button',{name:'h2',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:'Wrap in div'}).click();await expect(frame.locator('section > div > h2')).toHaveCount(1);
 await page.getByRole('button',{name:'div',exact:true}).click({button:'right'});await page.getByRole('menuitem',{name:/Unwrap/}).click();await expect(frame.locator('section > h2')).toHaveCount(1);await expect(frame.locator('section div')).toHaveCount(0);
 await page.keyboard.press('Control+z');await expect(frame.locator('section > div > h2')).toHaveCount(1);});
