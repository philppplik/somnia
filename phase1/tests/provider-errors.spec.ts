import {test,expect} from './fixtures';

async function configure(page:import('@playwright/test').Page){
 await page.route('http://127.0.0.1:11434/api/show',r=>r.fulfill({json:{model_info:{architecture:'fixture'}}}));
 await page.goto('/');await page.getByRole('button',{name:'Open Somnia Agent'}).click();
 const panel=page.getByRole('complementary',{name:'Somnia Agent'});
 await panel.getByRole('button',{name:'Agent configuration',exact:true}).click();
 await panel.getByLabel('Model',{exact:true}).fill('fixture-local');
 await panel.getByRole('button',{name:'Use configuration',exact:true}).click();return panel;
}
test('partial provider failure remains visible and retry uses the retained prompt',async({page})=>{
 let calls=0;const prompts:string[]=[];
 await page.route('http://127.0.0.1:11434/api/chat',r=>{
  calls++;prompts.push(r.request().postDataJSON().messages.at(-1).content);
  return r.fulfill({contentType:'application/x-ndjson',body: calls===1
   ? JSON.stringify({message:{content:'This answer was interrupted.'}})+'\n'+JSON.stringify({error:'provider failed SECRET'})+'\n'
   : JSON.stringify({message:{content:'The retry finished successfully.'},done:true})+'\n'});
 });
 const panel=await configure(page);await panel.getByLabel('Message to Somnia Agent').fill('Keep my original request');await panel.getByRole('button',{name:'Send',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('incomplete');await expect(panel.getByText('This answer was interrupted.',{exact:true})).toBeVisible();
 await expect(panel.getByText('Keep my original request',{exact:true})).toBeVisible();await expect(panel.getByRole('alert')).not.toContainText('SECRET');expect(calls).toBe(1);
 await page.screenshot({path:'test-results/provider-partial-error.png'});
 await panel.getByRole('button',{name:'Retry',exact:true}).click();await expect(panel.getByText('The retry finished successfully.',{exact:true})).toBeVisible();expect(prompts).toEqual(['Keep my original request','Keep my original request']);
});
test('invalid key is a readable non-retrying error and preserves request',async({page})=>{
 let calls=0;await page.route('http://127.0.0.1:11434/api/chat',r=>{calls++;return r.fulfill({status:401,json:{error:'SECRET'}});});
 const panel=await configure(page);await panel.getByLabel('Message to Somnia Agent').fill('Do not lose this');await panel.getByRole('button',{name:'Send',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('API key');await expect(panel.getByText('Do not lose this',{exact:true})).toBeVisible();await expect(panel.getByRole('button',{name:'Retry',exact:true})).toHaveCount(0);expect(calls).toBe(1);
 await page.screenshot({path:'test-results/provider-auth-error.png'});
});
