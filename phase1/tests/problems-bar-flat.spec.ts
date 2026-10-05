import {test,expect} from '@playwright/test';
test('status bar with the Problems toggle is flat: no box, shadow or fill; open Problems panel too',async({page})=>{
 await page.goto('/');
 const bar=page.getByTestId('status-bar');await expect(bar).toBeVisible();
 const flat=async(l:ReturnType<typeof page.locator>)=>l.evaluate(e=>{const c=getComputedStyle(e);return {bg:c.backgroundColor,shadow:c.boxShadow,radius:c.borderTopLeftRadius};});
 expect(await flat(bar)).toEqual({bg:'rgba(0, 0, 0, 0)',shadow:'none',radius:'0px'});
 await page.getByRole('button',{name:'Toggle problems'}).click();
 const panel=page.getByTestId('problems-panel');await expect(panel).toBeVisible();
 expect(await flat(panel)).toEqual({bg:'rgba(0, 0, 0, 0)',shadow:'none',radius:'0px'});
 await page.screenshot({path:'test-results/problems-flat.png'});
});
