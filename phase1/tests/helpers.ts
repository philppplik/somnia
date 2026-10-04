import {expect,type Page} from '@playwright/test';
/** Opens the code view once the app has booted; avoids pressing Ctrl+1 before shortcuts are bound. */
export async function showCode(page:Page){await expect(page.locator('[data-storage]')).toBeVisible();await expect(async()=>{await page.keyboard.press('Control+1');await expect(page.getByLabel('Source code')).toBeVisible({timeout:1000});}).toPass({timeout:20000});}
