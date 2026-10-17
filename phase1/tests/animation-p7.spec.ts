import {test,expect} from './fixtures';
/** CI-only full app. Not run locally: builders have no WASM toolchain. Local real-component checks live in test/animation-preview.tsx and animation-p7.test.ts. */
test('P7 animation export: GIF, APNG and real-time WebM from the render panel',async({page})=>{
 // Three real encodes (the WebM pass records in real time) never fit the 30s default budget; the download waits below already allow a minute each.
 test.setTimeout(180_000);
 await page.goto('/');await page.evaluate(async()=>{const {requestStudio}=await import('/src/store/appStore.ts');requestStudio('animation');});await page.getByTestId('animation-create-blank').click();
 // Open the render setup; the animated export buttons sit beside the PNG ones.
 await page.getByRole('button',{name:'Render…'}).click();
 await page.getByTestId('animation-export-gif').waitFor();
 // Shorten the work area so the real-time WebM pass stays quick.
 await page.evaluate(async()=>{const {animationSession}=await import('/src/lib/animation/session.ts');const {findComp}=await import('/src/lib/animation/model.ts');const s=animationSession();const doc=s.getState().doc!;const comp=findComp(doc)!;s.dispatch({type:'workarea.set',in:0,out:Math.round(comp.workArea.out/5)});});
 const download=async(testid:string)=>{const [d]=await Promise.all([page.waitForEvent('download',{timeout:60000}),page.getByTestId(testid).click()]);return d.suggestedFilename();};
 await expect(await download('animation-export-gif')).toMatch(/\.gif$/);
 await expect(page.getByTestId('animation-export-done')).toBeVisible();
 await expect(await download('animation-export-apng')).toMatch(/\.png$/);
 await expect(page.getByTestId('animation-export-done')).toBeVisible();
 // WebM records in real time and offers a cancel while it runs.
 const webmStart=page.getByTestId('animation-export-webm').click();
 await page.getByTestId('animation-export-cancel').waitFor({timeout:15000});
 const [d]=await Promise.all([page.waitForEvent('download',{timeout:60000}),webmStart]);
 await expect(d.suggestedFilename()).toMatch(/\.webm$/);
 await expect(page.getByTestId('animation-export-done')).toBeVisible();
});
