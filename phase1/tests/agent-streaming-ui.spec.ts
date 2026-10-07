import {test,expect} from './fixtures';
import type {Page} from '@playwright/test';
// Exercise the actual panel with a deterministic AgentCore. No API account or inference.
async function setup(page:Page,mode:'complete'|'error'|'late'){
 await page.goto('/');
 await page.evaluate(async mode=>{
  const path='/src/lib/agent/core.ts';const {setAgentCore}=await import(/* @vite-ignore */ path);
  let turn=0;
  setAgentCore({run(_request:unknown,emit:(e:unknown)=>void){
   const n=++turn;let cancelled=false;const timers:ReturnType<typeof setTimeout>[]=[];
   const event=(ms:number,e:unknown)=>timers.push(setTimeout(()=>{if(!cancelled||mode==='late')emit(e);},ms));
   event(0,{type:'status',text:'Working'});event(30,{type:'text-delta',text:n===1?'First line\n':'New reply '});
   event(120,{type:'usage',outputTokens:2});
   if(mode==='complete'){(window as any).__resumeFixture=()=>{emit({type:'text-delta',text:'<b>literal text</b>'});emit({type:'done'});};}
   else event(200,{type:'text-delta',text:'<b>literal text</b>'});
   if(mode==='error')event(600,{type:'error',message:'Connection interrupted. Try again.',retryable:true});
   else if(mode!=='complete')event(600,{type:'done'});
   if(mode==='late'){event(650,{type:'error',message:'STALE ERROR'});event(700,{type:'text-delta',text:'STALE TOKEN'});}
   return {cancel(){cancelled=true;if(mode!=='late')timers.forEach(clearTimeout);}};
  },async applyProposal(){},async rejectProposal(){},async revertProposal(){},clear(){}});
 },mode);
 await page.getByRole('button',{name:'Open Somnia Agent'}).click();
 return page.getByRole('complementary',{name:'Somnia Agent'});
}
test('incremental literal text stays in one bubble with usage events and finishes cleanly',async({page})=>{
 const panel=await setup(page,'complete');await panel.getByLabel('Message to Somnia Agent').fill('Explain');await panel.getByRole('button',{name:'Send',exact:true}).click();
 await expect(panel.locator('.ag-answer')).toHaveText('First line\n');await expect(panel.locator('.ag-caret')).toBeVisible();await expect(panel.getByRole('button',{name:'Stop'})).toBeVisible();
 await page.evaluate(()=>(window as any).__resumeFixture());
 await expect(panel.locator('.ag-answer')).toHaveText('First line\n<b>literal text</b>');await expect(panel.locator('.ag-a')).toHaveCount(1);await expect(panel.locator('.ag-answer b')).toHaveCount(0);
 await page.screenshot({path:'tests/artifacts/streaming-ui-live.png'});
 await expect(panel.getByRole('button',{name:'Send',exact:true})).toBeVisible();await expect(panel.locator('.ag-incomplete')).toHaveCount(0);await expect(panel.locator('.ag-caret')).toHaveCount(0);
});
test('mid-stream error keeps partial answer and offers explicit retry',async({page})=>{
 const panel=await setup(page,'error');await panel.getByLabel('Message to Somnia Agent').fill('Explain');await panel.getByRole('button',{name:'Send',exact:true}).click();
 await expect(panel.getByRole('alert')).toContainText('Connection interrupted');await expect(panel.locator('.ag-answer')).toHaveText('First line\n<b>literal text</b>');await expect(panel.locator('.ag-incomplete')).toHaveText('Interrupted - partial response');await expect(panel.locator('.ag-caret')).toHaveCount(0);
 await page.screenshot({path:'tests/artifacts/streaming-ui-error.png'});await panel.getByRole('button',{name:'Retry',exact:true}).click();await expect(panel.locator('.ag-u')).toHaveCount(2);await expect(panel.getByRole('button',{name:'Retry'})).toBeDisabled();await expect(panel.getByRole('button',{name:'Stop'})).toBeVisible();
});
test('Stop and New chat isolate deliberately misbehaving late streams',async({page})=>{
 const panel=await setup(page,'late');await panel.getByLabel('Message to Somnia Agent').fill('Explain');await panel.getByRole('button',{name:'Send',exact:true}).click();await expect(panel.locator('.ag-answer')).toContainText('First line');
 await panel.getByRole('button',{name:'Stop'}).click();await expect(panel.locator('.ag-incomplete')).toHaveText('Stopped - partial response');await expect(panel.locator('.ag-stopped')).toBeVisible();await page.screenshot({path:'tests/artifacts/streaming-ui-stopped.png'});
 await panel.getByRole('button',{name:'New chat'}).click();await panel.getByLabel('Message to Somnia Agent').fill('New turn');await panel.getByRole('button',{name:'Send',exact:true}).click();
 await expect(panel.locator('.ag-answer')).toContainText('New reply');await page.waitForTimeout(850);await expect(panel.getByText('STALE ERROR')).toHaveCount(0);await expect(panel.getByText('STALE TOKEN',{exact:false})).toHaveCount(0);await expect(panel.locator('.ag-a')).toHaveCount(1);
});
