import {test,expect} from './fixtures';
test('status bar shows cursor line, column and language',async({page})=>{await page.goto('/');await page.getByRole('button',{name:'Split view',exact:true}).click();await page.getByLabel('Source code').click();await page.keyboard.press('Control+Home');await page.keyboard.press('ArrowDown');await page.keyboard.press('ArrowRight');
await expect(page.getByText('Line 2, Col 2')).toBeVisible();});
