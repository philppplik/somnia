import {expect,type Page} from '@playwright/test';
/** Opens the code view once the app has booted; avoids pressing Ctrl+Alt+3 before shortcuts are bound. */
export async function showCode(page:Page){await expect(page.locator('[data-storage]')).toBeVisible();await expect(async()=>{await page.keyboard.press('Control+Alt+3');await expect(page.getByLabel('Source code')).toBeVisible({timeout:1000});}).toPass({timeout:20000});}

/** Opens the Components panel on "My library" with the advanced tools (variants, fields, sharing) expanded. */
export async function openMine(page:Page,advanced=true){
 if(!(await page.getByTestId('scope-mine').isVisible()))await page.getByRole('button',{name:'Components panel',exact:true}).click();
 await page.getByTestId('scope-mine').click();
 if(advanced){const d=page.getByTestId('components-advanced');if(await d.count()&&!(await d.evaluate((e:HTMLDetailsElement)=>e.open)))await d.locator(':scope > summary').click();}
}
