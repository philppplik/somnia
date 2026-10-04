import {test as base,expect} from '@playwright/test';
/** Playwright test with the sample project enabled (dev build only). Use `test.use({sample:false})` to see the real empty start. */
export const test=base.extend<{sample:boolean}>({
 sample:[true,{option:true}],
 page:async({page,sample},use)=>{await page.addInitScript(s=>{if(s&&!sessionStorage.getItem('somnia.nofixture'))localStorage.setItem('somnia.fixture','starter');else localStorage.removeItem('somnia.fixture');},sample);await use(page);}
});
export {expect};
