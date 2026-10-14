import {test,expect} from '@playwright/test';
test.use({viewport:{width:1200,height:900}});
test.beforeEach(async({page})=>{
 await page.addInitScript(()=>{
  (window as unknown as {__batchWrites:{name:string;size:number}[]}).__batchWrites=[];
  (window as unknown as {showDirectoryPicker(o:object):Promise<unknown>}).showDirectoryPicker=async()=>({
   kind:'directory',name:'fake-export',
   async getFileHandle(name:string){return{async createWritable(){let size=0;return{
    async write(b:Blob){size=b.size??0;},
    async close(){(window as unknown as {__batchWrites:{name:string;size:number}[]}).__batchWrites.push({name,size});},
   };}};},
  });
 });
});
test('batch export writes one copy per developable photo into the picked directory',async({page})=>{
 await page.goto('/test/design-system/?view=photos-batch');
 await expect(page.getByTestId('photos-export-panel')).toBeVisible();
 await expect(page.getByTestId('photos-p-batch-png')).toHaveText('Export all as PNG (3)');
 await page.getByTestId('photos-p-batch-png').click();
 await expect(page.getByTestId('photos-p-batch-status')).toHaveText('Batch export: 3 saved, 0 skipped, 0 failed');
 const writes=await page.evaluate(()=>(window as unknown as {__batchWrites:{name:string;size:number}[]}).__batchWrites);
 expect(writes.map(w=>w.name)).toEqual(['batch-1-edited.png','batch-2-edited.png','batch-3-edited.png']);
 for(const w of writes)expect(w.size).toBeGreaterThan(0);
});
test('batch export renders in light and dark',async({page})=>{
 for(const theme of['light','dark']){
  await page.goto('/test/design-system/?view=photos-batch');
  await page.evaluate(t=>document.documentElement.setAttribute('data-theme',t),theme);
  await expect(page.getByTestId('photos-export-panel')).toBeVisible();
  await expect(page.getByTestId('photos-p-export-png')).toBeVisible();
  await page.waitForTimeout(400);
  await page.getByTestId('photos-p-export-png').screenshot({path:`test-results/ds-photos-batch-single-${theme}.png`});
  const batch=page.getByTestId('photos-p-batch-png');
  if(await batch.count()){
   await batch.click();
   await expect(page.getByTestId('photos-p-batch-status')).toHaveText('Batch export: 3 saved, 0 skipped, 0 failed');
  }
  await page.waitForTimeout(300);
  await page.screenshot({path:`test-results/ds-photos-batch-${theme}.png`,fullPage:true});
 }
});
