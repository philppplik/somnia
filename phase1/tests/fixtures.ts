import {test as base,expect} from '@playwright/test';
import {readFileSync} from 'node:fs';
const release=JSON.parse(readFileSync('./package.json','utf8')).somniaRelease as string;
/** Playwright test with the sample project enabled (dev build only). Use `test.use({sample:false})` to see the real empty start. */
export const test=base.extend<{sample:boolean}>({
 sample:[true,{option:true}],
 page:async({page,sample},use)=>{await page.addInitScript(r=>{if(!sessionStorage.getItem('somnia.welcome.test')&&localStorage.getItem('somnia.welcome.seen.v1')===null)localStorage.setItem('somnia.welcome.seen.v1',r);},release);await page.addInitScript(s=>{if(s&&!sessionStorage.getItem('somnia.nofixture'))localStorage.setItem('somnia.fixture','starter');else localStorage.removeItem('somnia.fixture');},sample);await use(page);}
});
export {expect};
