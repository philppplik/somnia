import {test,expect} from './fixtures';
test('arrow keys move focus inside the icon rail',async({page})=>{await page.goto('/');
 const rail=page.getByRole('toolbar',{name:'Sidebar panels'});await rail.getByRole('button').first().focus();
 await page.keyboard.press('ArrowDown');await expect(rail.getByRole('button',{name:'Layers panel'})).toBeFocused();
 await page.keyboard.press('End');await expect(rail.getByRole('button',{name:'Settings',exact:true})).toBeFocused();
 await page.keyboard.press('ArrowDown');await expect(rail.getByRole('button').first()).toBeFocused();});
