import {test,expect} from '@playwright/test';
test('scripts-off navigation stays sandboxed and preserves Back/Forward and anchors',async({page})=>{
 await page.goto('/tests/assets/preview-navigation-harness.html');
 const fr=page.frameLocator('iframe');await expect(fr.getByRole('heading',{name:'Home'})).toBeVisible();
 expect(await page.frames()[1].evaluate(()=>(window as any).UNTRUSTED)).toBeUndefined();
 await fr.getByRole('link',{name:'About',exact:true}).click();await expect(fr.getByRole('heading',{name:'The end'})).toBeVisible();
 expect(await page.frames()[1].evaluate(()=>scrollY)).toBeGreaterThan(900);
 await page.getByRole('button',{name:'Back'}).click();await expect(fr.getByRole('heading',{name:'Home'})).toBeVisible();
 await page.getByRole('button',{name:'Forward'}).click();await expect(fr.getByRole('heading',{name:'The end'})).toBeVisible();
 await fr.getByRole('link',{name:'Home',exact:true}).click();await expect(fr.getByRole('heading',{name:'Home'})).toBeVisible();
 await fr.getByRole('link',{name:'Escape'}).click();await expect(fr.getByRole('heading',{name:'Home'})).toBeVisible();
 const popup=page.waitForEvent('popup');await fr.getByRole('link',{name:'External'}).click();const external=await popup;
 await expect(external).toHaveURL('https://example.com/');await external.close();
 expect(await page.locator('iframe').getAttribute('sandbox')).toBe('allow-scripts');
 await page.screenshot({path:'test-results/preview-navigation.png'});
});
