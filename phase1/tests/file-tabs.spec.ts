import {test,expect} from './fixtures';
test('files panel opens files in tabs, tabs switch and close',async({page})=>{
 await page.goto('/');await page.getByRole('button',{name:'Files panel'}).click();
 await page.getByRole('button',{name:'Open styles.css'}).click();
 await expect(page.getByRole('tab',{name:'styles.css'})).toHaveAttribute('aria-selected','true');
 await expect(page.getByRole('tab',{name:'index.html'})).toBeVisible();
 await page.getByRole('tab',{name:'index.html'}).click();
 await expect(page.getByRole('tab',{name:'index.html'})).toHaveAttribute('aria-selected','true');
 await page.getByRole('tab',{name:'styles.css'}).click({button:'right'});
 await page.getByRole('menuitem',{name:'Close tab'}).click();
 await expect(page.getByRole('tab',{name:'styles.css'})).toHaveCount(0);
});
test('the last open tab can be closed and its close button is always reachable',async({page})=>{
 await page.goto('/');
 const tab=page.getByRole('tab',{name:'index.html'});await expect(tab).toBeVisible();
 await page.getByRole('button',{name:'Close index.html'}).click();
 await expect(page.getByRole('tab',{name:'index.html'})).toHaveCount(0);
});
