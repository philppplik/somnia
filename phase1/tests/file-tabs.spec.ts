import {test,expect} from '@playwright/test';
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
