import {test,expect} from './fixtures';
import {readFileSync} from 'node:fs';
const release=JSON.parse(readFileSync('./package.json','utf8')).somniaRelease as string;
const KEY='somnia.welcome.seen.v1';
test.beforeEach(async({page})=>{await page.addInitScript(()=>sessionStorage.setItem('somnia.welcome.test','1'));await page.route('https://api.github.com/**',r=>r.fulfill({json:[]}));});
const clear=async(page:import('@playwright/test').Page)=>{await page.addInitScript(()=>{if(!sessionStorage.getItem('somnia.welcome.cleared')){localStorage.removeItem('somnia.welcome.seen.v1');sessionStorage.setItem('somnia.welcome.cleared','1');}});};
test('first install: no welcome popup, version is recorded',async({page})=>{
 await clear(page);await page.goto('/');await expect(page.getByTestId('welcome-dialog')).toHaveCount(0);
 expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(release);});
test('after an update: shows once, with version, button and changelog link',async({page,context})=>{
 await page.addInitScript(([k])=>{if(!sessionStorage.getItem('somnia.welcome.cleared')){localStorage.setItem(k,'0.0.1');sessionStorage.setItem('somnia.welcome.cleared','1');}},[KEY]);
 await page.goto('/');const d=page.getByTestId('welcome-dialog');await expect(d).toBeVisible();
 await expect(d).toContainText('Welcome to');await expect(d).toContainText(`Somnia v${release}`);
 await expect(page.getByTestId('welcome-start')).toHaveText('Start designing');
 await expect(page.getByTestId('welcome-changelog')).toHaveText('View Changelog');
 expect(await d.evaluate(el=>getComputedStyle(el.querySelector('.welcome-title')!).fontFamily)).toContain('Momo Signature');
 await page.evaluate(()=>document.fonts.ready);
 expect(await page.evaluate(()=>document.fonts.check("40px 'Momo Signature'","Welcome to"))).toBe(true);
 expect(await page.evaluate(k=>localStorage.getItem(k),KEY)).toBe(release);
 const popup=context.waitForEvent('page');await page.getByTestId('welcome-changelog').click();const p=await popup;expect(p.url()).toContain(`/releases/tag/v${release}`);await p.close();
 await page.screenshot({path:'test-results/welcome-popup.png'});
 await page.getByTestId('welcome-start').click();await expect(d).toHaveCount(0);
 await page.reload();await expect(page.getByTestId('welcome-dialog')).toHaveCount(0);});
test('Escape closes it and it does not return for the same version',async({page})=>{
 await page.addInitScript(([k])=>{if(!sessionStorage.getItem('somnia.welcome.cleared')){localStorage.setItem(k,'0.0.1');sessionStorage.setItem('somnia.welcome.cleared','1');}},[KEY]);
 await page.goto('/');await expect(page.getByTestId('welcome-dialog')).toBeVisible();await page.keyboard.press('Escape');await expect(page.getByTestId('welcome-dialog')).toHaveCount(0);
 await page.reload();await expect(page.getByTestId('welcome-dialog')).toHaveCount(0);});
test('German catalogue is used when the language is German',async({page})=>{
 await page.addInitScript(([k])=>{if(!sessionStorage.getItem('somnia.welcome.cleared')){localStorage.setItem(k,'0.0.1');localStorage.setItem('somnia.locale.v1','de');sessionStorage.setItem('somnia.welcome.cleared','1');}},[KEY]);
 await page.goto('/');await expect(page.getByTestId('welcome-start')).toHaveText('Jetzt gestalten');await expect(page.getByTestId('welcome-dialog')).toContainText('Willkommen bei');});
