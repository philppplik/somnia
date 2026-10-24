import {test,expect} from '@playwright/test';
test('Schedule dialog previews, gates auto-apply and rejects stale preview before saving',async({page})=>{
 await page.goto('/tests/schedule-fixture.html');
 const dialog=page.getByRole('dialog');await expect(dialog).toBeVisible();
 await expect(dialog.getByLabel('Auto-apply (opt-in)',{exact:true})).not.toBeChecked();await expect(dialog.getByLabel('Auto-apply (opt-in)',{exact:true})).toBeDisabled();
 await dialog.getByLabel('Name',{exact:true}).fill('Weekly check');await dialog.getByLabel('Timezone',{exact:true}).fill('Europe/Berlin');
 await expect(dialog.getByRole('button',{name:'Save schedule',exact:true})).toBeDisabled();
 await dialog.getByRole('button',{name:'Preview schedule',exact:true}).click();await expect(dialog.locator('time')).toHaveCount(3);await expect(dialog.getByText('Somnia must be open. No daemon or autostart is enabled.')).toBeVisible();
 await page.screenshot({path:'test-results/vibespace-schedule-default.png',fullPage:true});
 await dialog.getByLabel('Missed runs',{exact:true}).selectOption('catch_up');await expect(dialog.getByRole('button',{name:'Save schedule',exact:true})).toBeDisabled();
 await dialog.getByLabel('Maximum catch-up runs',{exact:true}).fill('4');await dialog.getByLabel('Consent level',{exact:true}).selectOption('autonomous_in_scope');await dialog.getByLabel('Auto-apply (opt-in)',{exact:true}).check();
 await expect(dialog.getByText(/Effect permissions still apply/)).toBeVisible();await dialog.getByRole('button',{name:'Preview schedule',exact:true}).click();
 await page.screenshot({path:'test-results/vibespace-schedule-opt-in.png',fullPage:true});
 await dialog.getByRole('button',{name:'Save schedule',exact:true}).click();
 await expect.poll(()=>page.evaluate(()=>(window as any).saved.length)).toBe(1);
 const s=await page.evaluate(()=>(window as any).saved[0]);expect(s.autoApply).toBe(true);expect(s.misfirePolicy).toEqual({kind:'catch_up',cap:4});expect(s.studioId).toBe('studio-fixture');
});
