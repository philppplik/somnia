import {test,expect} from '@playwright/test';
test('titlebar renders without native controls in browser',async({page})=>{await page.goto('/');await expect(page.getByRole('group',{name:'Window controls'})).toHaveCount(0);await expect(page.locator('.app-titlebar')).toBeVisible();});
