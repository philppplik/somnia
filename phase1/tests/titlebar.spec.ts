import {test,expect} from './fixtures';
test('titlebar renders without native controls in browser',async({page})=>{await page.goto('/');await expect(page.getByRole('group',{name:'Window controls'})).toHaveCount(0);await expect(page.getByRole('banner')).toBeVisible();});
