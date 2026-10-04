import {test,expect} from './fixtures';
test('code editor offers HTML and CSS completions',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Code view',exact:true}).click();
 const ed=page.getByLabel('Source code');await ed.click();await page.keyboard.press('Control+End');
 await page.keyboard.type('<sec');await expect(page.locator('.cm-tooltip-autocomplete')).toBeVisible();await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('section');
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'Files panel'}).click();await page.getByRole('button',{name:'Open styles.css'}).click();
 await ed.click();await page.keyboard.press('Control+End');await page.keyboard.type('a{disp');await expect(page.locator('.cm-tooltip-autocomplete')).toContainText('display');
});
