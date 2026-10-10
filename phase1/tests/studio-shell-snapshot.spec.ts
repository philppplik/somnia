import {test,expect} from './fixtures';
test.use({sample:false});
for(const context of ['empty','web','markdown','code-only'] as const){
 test(`Code shell baseline: ${context}`,async({page})=>{
  await page.goto('/');
  await page.evaluate(async context=>{
   const {patchState,connectEditorProject}=await import('/src/store/appStore.ts');
   if(context!=='empty'){
    const {EditorProject}=await import('/packages/editor-core/src/index.ts');
    const files=context==='web'?{'index.html':'<!doctype html><html><body><h1>Studio snapshot</h1></body></html>'}:context==='markdown'?{'notes.md':'# Studio snapshot\n\nLocal document.'}:{'data.json':'{"studio":"code"}'};
    connectEditorProject(new EditorProject(files),{name:'Snapshot project',alreadySaved:true});
   }
   patchState({notice:'',theme:'light',viewMode:context==='code-only'?'code':'design'});
  },context);
  await page.evaluate(()=>document.fonts.ready);
  await expect(page.locator('header').first()).toBeVisible();
  // TEMPORARY: 1400 (was 400) because the studio pill now lists nine studios inline in the header flow (~1300 px diff). Regenerate the baselines in CI and lower this again once CI can update snapshots.
  // The new Somnia logo mark changes ~270 header pixels versus the d91046f baselines (maxDiffPixels was 0).
  await expect(page).toHaveScreenshot(`studio-code-${context}.png`,{animations:'disabled',maxDiffPixels:1400});
 });
}
