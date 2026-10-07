import {test,expect} from './fixtures';
async function open(page:import('@playwright/test').Page){await page.goto('/');await page.getByRole('button',{name:'Open Somnia Agent'}).click();const panel=page.getByRole('complementary',{name:'Somnia Agent'});await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();await panel.getByRole('combobox',{name:'Provider',exact:true}).selectOption('openrouter');return panel;}
async function consent(page:import('@playwright/test').Page){await page.getByRole('button',{name:'Cloud data consent',exact:true}).click();const d=page.getByRole('dialog',{name:'Cloud data consent'});await d.getByRole('checkbox').check();await d.getByRole('button',{name:'Allow cloud AI',exact:true}).click();}
test('failed auth is visible; verified rotation is transactional; delete needs no network',async({page})=>{
 let status=401,calls=0;await page.route('https://openrouter.ai/api/v1/key',r=>{calls++;return r.fulfill({status,json:status===200?{data:{label:'fixture'}}:{error:{message:'fixture-secret-must-not-leak'}}});});
 const panel=await open(page);await panel.getByLabel('API key',{exact:true}).fill('fixture-secret');
 await panel.getByRole('button',{name:'Test and save key'}).click();await expect(panel.getByRole('alert')).toContainText('Allow cloud AI');expect(calls).toBe(0);
 await consent(page);await panel.getByRole('button',{name:'Test and save key'}).click();await expect(panel.getByRole('alert')).toContainText('provider rejected');await expect(panel.getByText('fixture-secret-must-not-leak')).toHaveCount(0);
 await page.screenshot({path:'test-results/provider-auth-invalid.png'});
 status=200;await panel.getByRole('button',{name:'Test and save key'}).click();await expect(panel.locator('.ag-provider-auth').getByRole('status')).toContainText('Key verified and saved');await expect(panel.getByLabel('API key')).toHaveValue('');
 await page.screenshot({path:'test-results/provider-auth-verified.png'});
 await panel.getByLabel('API key').fill('fixture-replacement');status=401;await panel.getByRole('button',{name:'Test and rotate key'}).click();await expect(panel.getByRole('alert')).toContainText('provider rejected');
 await panel.getByLabel('API key').fill('');status=200;await panel.getByRole('button',{name:'Test saved key'}).click();await expect(panel.locator('.ag-provider-auth').getByRole('status')).toContainText('Key verified.');
 const before=calls;await panel.getByRole('button',{name:'Delete key',exact:true}).click();await expect(panel.locator('.ag-provider-auth').getByRole('status')).toContainText('Key deleted');expect(calls).toBe(before);
 await panel.getByRole('button',{name:'Test saved key'}).click();await expect(panel.getByRole('alert')).toContainText('provider rejected');expect(calls).toBe(before);
 const all=await page.evaluate(()=>JSON.stringify({...localStorage}));expect(all).not.toContain('fixture-secret');expect(all).not.toContain('fixture-replacement');
});
test('cancel returns to editable state without saving; provider selection disabled during test',async({page})=>{
 await page.route('https://openrouter.ai/api/v1/key',async r=>{await new Promise(resolve=>setTimeout(resolve,1000));await r.fulfill({json:{data:{}}});});
 const panel=await open(page);await consent(page);await panel.getByLabel('API key').fill('fixture-cancel');await panel.getByRole('button',{name:'Test and save key'}).click();
 await expect(panel.getByRole('combobox',{name:'Provider',exact:true})).toBeDisabled();await expect(panel.getByRole('button',{name:'Use configuration'})).toBeDisabled();await panel.getByRole('button',{name:'Cancel test'}).click();await expect(panel.getByRole('alert')).toContainText('cancelled');await expect(panel.getByRole('combobox',{name:'Provider',exact:true})).toBeEnabled();await page.waitForTimeout(1100);await expect(panel.getByLabel('API key')).toHaveValue('fixture-cancel');
});
test('locked desktop credential store is shown safely and replacement input is retained after a failed write',async({page})=>{
 await page.route('https://openrouter.ai/api/v1/key',r=>r.fulfill({json:{data:{}}}));
 const panel=await open(page);await consent(page);
 await page.evaluate(()=>{(globalThis as any).isTauri=true;(window as any).__TAURI_INTERNALS__={invoke:async()=>{throw 'OS credential store is locked or key is missing';}};});
 await panel.getByLabel('API key').fill('fixture-desktop-key');await panel.getByRole('button',{name:'Test and save key'}).click();await expect(panel.getByRole('alert')).toContainText('OS credential store');await expect(panel.getByText('fixture-secret-store-diagnostic')).toHaveCount(0);await expect(panel.getByLabel('API key')).toHaveValue('fixture-desktop-key');await page.screenshot({path:'test-results/provider-auth-locked.png'});
 await page.evaluate(()=>{(globalThis as any).isTauri=false;});
});
