import {test,expect} from './fixtures';
const open=async(page:import('@playwright/test').Page,title:string)=>{await page.getByRole('button',{name:'Tools',exact:true}).click();await page.getByRole('menuitem',{name:title}).click();};
test('host starts sharing, status pill and invites appear',async({page})=>{
 await page.goto('/');await open(page,'Share project...');
 await page.getByRole('button',{name:'Start sharing'}).click();
 await expect(page.getByTestId('host-live')).toBeVisible();
 await expect(page.getByTestId('invite-editor')).toBeVisible();await expect(page.getByTestId('invite-viewer')).toBeVisible();
 await expect(page.getByLabel('Can edit invite link')).not.toHaveValue(/code=[A-Za-z0-9_-]{9,}/);
 await page.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.getByTestId('collab-status')).toHaveText(/Sharing/);});
test('LAN option shows the encryption warning',async({page})=>{
 await page.goto('/');await open(page,'Share project...');await page.getByLabel('Allow people on my network').check();
 await page.getByRole('button',{name:'Start sharing'}).click();await expect(page.getByTestId('lan-warning')).toBeVisible();});
test('join flow validates the link and reports a refused code',async({page})=>{
 await page.goto('/');await open(page,'Join shared project...');
 const join=page.getByRole('button',{name:'Join',exact:true});await expect(join).toBeDisabled();
 await page.getByLabel('Invite link').fill('hello');await expect(page.getByTestId('link-invalid')).toBeVisible();await expect(join).toBeDisabled();
 await page.getByLabel('Invite link').fill('ws://127.0.0.1:48201/?code=wrongwrongwrongwrong');await expect(join).toBeEnabled();
 await join.click();await expect(page.getByTestId('join-error')).toBeVisible();});
test('stop sharing hides the pill',async({page})=>{
 await page.goto('/');await open(page,'Share project...');await page.getByRole('button',{name:'Start sharing'}).click();
 await page.getByRole('button',{name:'Stop sharing'}).click();await page.getByRole('button',{name:'Close',exact:true}).click();
 await expect(page.getByTestId('collab-status')).toHaveCount(0);});
